import { NextRequest, NextResponse } from "next/server";
import { ollamaClient, OLLAMA_MODEL } from "@/lib/ollama";
import { getPlotById, getCharacterFromPlot } from "@/lib/plots";
import { searxngSearch } from "@/lib/searxng"; // ← Playwright 版から差し替え

const THINK_START = "<think>";
const THINK_END = "</think>";

// ============================================================
//  モデル固有の生トークンをテキスト・reasoning から除去する
//  例: to { thought: "..." } <|thought|>  /  <channel|>  など
// ============================================================

function sanitizeContent(text: string): string {
  return text
    // to { thought: "..." } <|thought|> ブロック全体を除去
    .replace(/to\s*\{\s*thought:\s*"[\s\S]*?"\s*\}\s*<\|thought\|>/g, "")
    // 残留する <|...|> 系トークンを除去
    .replace(/<\|[^|]*\|>/g, "")
    // <channel|> 等の亜種トークンを除去
    .replace(/<[a-z_]+\|>/g, "")
    .trimStart();
}

// ============================================================
//  ストリームパーサー
//  <think> タグ / ツール呼び出し構文を検出しながら SSE を流す
// ============================================================

async function* parseThinkingStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: AsyncIterable<any>
): AsyncGenerator<
  | { type: "reasoning" | "text"; content: string }
  | { type: "tool_call"; tool: string; query: string }
  | { type: "done" }
> {
  let buffer = "";
  let inThinking = false;

  // モデル固有のツール呼び出し構文（複数パターンに対応）
  // パターン1: call:web_search{query:<|"|>クエリ<|"|>}
  // パターン2: call:web_search{query: "クエリ"}  ← 通常クォート・スペースあり
  const TOOL_QUERY_RE = String.raw`(?:<\|"?\|>|")([\s\S]+?)(?:<\|"?\|>|")`;
  const WEB_SEARCH_RE = new RegExp(
    String.raw`call:web_search\{query:\s*` + TOOL_QUERY_RE + String.raw`\}(?:<tool_call\|>)?`
  );
  const BLUESKY_RE = new RegExp(
    String.raw`call:bluesky_search\{query:\s*` + TOOL_QUERY_RE + String.raw`\}(?:<tool_call\|>)?`
  );

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;

    // モデルがネイティブ reasoning フィールドを持つ場合（例: QwQ）
    const nativeReasoning = (delta as { reasoning?: string | null }).reasoning;
    if (nativeReasoning) {
      yield { type: "reasoning", content: sanitizeContent(nativeReasoning) };
    }

    const raw = delta?.content ?? "";
    if (!raw) continue;

    buffer += raw;

    // ---- ツール呼び出し検出 ----------------------------------------
    const webMatch = buffer.match(WEB_SEARCH_RE);
    const bskyMatch = buffer.match(BLUESKY_RE);
    // どちらかにマッチした方を使う（両方同時には来ない想定）
    const toolMatch = webMatch ?? bskyMatch;

    // バッファに call: が含まれているが正規表現にまだマッチしない場合をデバッグ
    if (!toolMatch && buffer.includes("call:")) {
      console.log("[parseThinkingStream] call: を検出したがまだマッチなし, buffer(先頭200):", JSON.stringify(buffer.slice(0, 200)));
    }

    if (toolMatch) {
      const tool = webMatch ? "web_search" : "bluesky_search";
      const matchIndex = toolMatch.index!;

      // ツール呼び出し前のテキストを流す
      if (matchIndex > 0) {
        yield { type: "text", content: sanitizeContent(buffer.slice(0, matchIndex)) };
      }

      yield { type: "tool_call", tool, query: toolMatch[1].trim() };

      // ツール呼び出しより後のテキストをバッファに残す（モデルが続けて返答を出した場合）
      const after = buffer.slice(matchIndex + toolMatch[0].length).trimStart();
      buffer = after;
      continue;
    }

    // ---- <think> タグのパース ----------------------------------------
    while (true) {
      if (!inThinking) {
        const startIdx = buffer.indexOf(THINK_START);

        if (startIdx === -1) {
          // ツール呼び出しの先頭（"call:"）がバッファに含まれている場合は、
          // そこより前だけをフラッシュし、"call:" 以降はバッファに保持する。
          // こうしないと safeLen の計算で "ca" などが先に流れてしまい、
          // 後続チャンクで "ll:web_search..." になって正規表現がマッチしなくなる。
          const toolPrefixIdx = buffer.indexOf("call:");
          let holdFrom: number;
          if (toolPrefixIdx >= 0) {
            // "call:" の手前までは安全にフラッシュできる
            holdFrom = toolPrefixIdx;
            if (holdFrom === 0) {
              // バッファ全体がツール呼び出し候補 → 何もフラッシュしない
              break;
            }
          } else {
            // <think> が来る可能性を残してバッファの末尾を保持
            holdFrom = Math.max(0, buffer.length - (THINK_START.length - 1));
          }
          if (holdFrom > 0) {
            yield { type: "text", content: sanitizeContent(buffer.slice(0, holdFrom)) };
            buffer = buffer.slice(holdFrom);
          }
          break;
        }

        if (startIdx > 0) {
          yield { type: "text", content: sanitizeContent(buffer.slice(0, startIdx)) };
          buffer = buffer.slice(startIdx);
        }

        if (buffer.length >= THINK_START.length) {
          buffer = buffer.slice(THINK_START.length);
          inThinking = true;
        } else {
          break;
        }
      } else {
        const endIdx = buffer.indexOf(THINK_END);

        if (endIdx === -1) {
          const safeLen = Math.max(0, buffer.length - (THINK_END.length - 1));
          if (safeLen > 0) {
            yield { type: "reasoning", content: sanitizeContent(buffer.slice(0, safeLen)) };
            buffer = buffer.slice(safeLen);
          }
          break;
        }

        if (endIdx > 0) {
          yield { type: "reasoning", content: sanitizeContent(buffer.slice(0, endIdx)) };
        }
        buffer = buffer.slice(endIdx + THINK_END.length);
        inThinking = false;
      }
    }
  }

  // バッファ残りを吐き出す
  if (buffer.length > 0) {
    // ストリーム終了時に改めてツール呼び出し正規表現を試みる
    const finalWebMatch = buffer.match(WEB_SEARCH_RE);
    const finalBskyMatch = buffer.match(BLUESKY_RE);
    const finalToolMatch = finalWebMatch ?? finalBskyMatch;

    if (finalToolMatch) {
      const tool = finalWebMatch ? "web_search" : "bluesky_search";
      const matchIndex = finalToolMatch.index!;
      if (matchIndex > 0) {
        yield { type: "text", content: sanitizeContent(buffer.slice(0, matchIndex)) };
      }
      yield { type: "tool_call", tool, query: finalToolMatch[1].trim() };
      const after = buffer.slice(matchIndex + finalToolMatch[0].length).trimStart();
      if (after) {
        yield { type: "text", content: sanitizeContent(after) };
      }
    } else {
      if (buffer.includes("call:")) {
        console.warn(
          "[parseThinkingStream] ストリーム終了時にツール呼び出しの可能性がある未処理バッファが残っています。\n" +
          "  buffer:", JSON.stringify(buffer.slice(0, 300))
        );
      }
      yield { type: inThinking ? "reasoning" : "text", content: sanitizeContent(buffer) };
    }
  }

  yield { type: "done" };
}

// ============================================================
//  Bluesky 検索（公開 API、認証不要）
// ============================================================

async function searchBluesky(
  query: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<Array<{ url: string; title: string; snippet: string }>> {
  try {
    const res = await fetch(
      `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=5`,
      { signal: AbortSignal.timeout(8_000) }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const results: Array<{ url: string; title: string; snippet: string }> = [];

    if (!Array.isArray(data.posts)) return [];

    for (const post of data.posts) {
      const author =
        post.author?.displayName || post.author?.handle || "Bluesky User";
      const text: string = post.record?.text || "";
      const postUrl: string = post.uri
        ?.replace("at://", "https://bsky.app/profile/")
        ?.replace("/app.bsky.feed.post/", "/post/");

      if (!postUrl || !text) continue;

      // URL 訪問イベントを SSE へ
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ search_url: postUrl, url_status: "fetching" })}\n\n`
        )
      );
      await new Promise((r) => setTimeout(r, 80));
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            search_url: postUrl,
            url_status: "done",
            url_title: `${author} (@${post.author?.handle})`,
          })}\n\n`
        )
      );

      results.push({
        url: postUrl,
        title: `${author} (@${post.author?.handle})`,
        snippet: text,
      });
    }

    return results;
  } catch (error) {
    console.error("Bluesky search error:", error);
    return [];
  }
}

// ============================================================
//  Web 検索（SearXNG）
//  Playwright を完全廃止 → シンプルな fetch に
// ============================================================

async function performWebSearch(
  query: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<{ results: Array<{ url: string; title: string; snippet: string }>; urls: string[] }> {
  console.log(`[performWebSearch] 検索開始 query="${query}"`);
  const results = await searxngSearch(query, 5);
  console.log(`[performWebSearch] searxngSearch 完了 結果数=${results.length} query="${query}"`);

  if (results.length === 0) {
    console.warn(`[performWebSearch] 検索結果が 0 件 query="${query}" — SearXNG が起動しているか、SEARXNG_URL 環境変数を確認してください`);
  }

  const urls: string[] = [];

  for (const r of results) {
    urls.push(r.url);
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ search_url: r.url, url_status: "fetching" })}\n\n`
      )
    );
    await new Promise((res) => setTimeout(res, 80));
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({
          search_url: r.url,
          url_status: "done",
          url_title: r.title,
        })}\n\n`
      )
    );
  }

  return { results, urls };
}

// ============================================================
//  SSE ヘルパー
// ============================================================

function sseJson(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  payload: unknown
) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
  );
}

// ============================================================
//  POST /api/chat
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const { plotId, characterId, messages } = await req.json();

    if (!plotId || !characterId || !messages) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const plot = await getPlotById(plotId);
    if (!plot) {
      return NextResponse.json({ error: "Plot not found" }, { status: 404 });
    }

    const character = await getCharacterFromPlot(plotId, characterId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // ---- システムプロンプト構築 ----
    let systemPrompt = `あなたは「${character.name}」というキャラクターです。

【性格】
${character.personality}

【口調・話し方】
${character.speechStyle}

【背景・設定】
${character.background}

【現在のシチュエーション】
${character.scenario}

【検索機能】
あなたは以下のツールを使って検索ができます。

1. web_search - Web検索（SearXNG）
   call:web_search{query:<|"|>検索したい言葉<|"|>}<tool_call|>

2. bluesky_search - Blueskyでの投稿検索
   call:bluesky_search{query:<|"|>検索したい言葉<|"|>}<tool_call|>

必要に応じて使い分けてください。検索結果を元に、キャラクターとして自然な会話の形で答えてください。
`;

    if (plot.tokenProfile) {
      systemPrompt += `\n\n【ユーザー（主人公）の情報】
- 名前: ${plot.tokenProfile.name}
- 性格: ${plot.tokenProfile.personality}
- 背景: ${plot.tokenProfile.background}`;
      if (plot.tokenProfile.speechStyle) {
        systemPrompt += `\n- 話し方: ${plot.tokenProfile.speechStyle}`;
      }
    }

    systemPrompt += `\n\n上記の設定を厳守し、キャラクターとして一貫して振る舞ってください。
- キャラクターを絶対に破らないこと
- AIであることや、モデル名・開発元には一切言及しないこと
- 返答は自然な会話の長さ（長すぎない）にすること
- キャラの口調・一人称を必ず守ること
- 思考プロセス（thinking）は必要最小限に留め、簡潔にまとめること
`.trim();

    const messagesWithSystem = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const response = await ollamaClient.chat.completions.create(
      {
        model: OLLAMA_MODEL,
        messages: messagesWithSystem,
        stream: true,
        // @ts-expect-error: Ollama 固有のパラメータ
        num_predict: 2048,
        // @ts-expect-error: Ollama 固有のパラメータ
        repeat_penalty: 1.15,
      },
      { signal: req.signal }
    );

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messagesForContinuation = [...messagesWithSystem];
          let streamEnded = false;

          for await (const event of parseThinkingStream(response)) {
            if (streamEnded) break;

            if (event.type === "done") {
              // 通常終了
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              streamEnded = true;
              break;
            }

            if (event.type === "tool_call") {
              const isWebSearch = event.tool === "web_search";
              const toolName = isWebSearch ? "Web検索（SearXNG）" : "Bluesky検索";
              console.log(`[API/chat] ツール呼び出しイベント受信 tool=${event.tool} query="${event.query.slice(0, 80)}"`);

              // 検索ステータスを送信
              sseJson(controller, encoder, {
                searchStatus: { stage: "thinking", query: event.query, tool: toolName },
              });
              await new Promise((r) => setTimeout(r, 300));

              sseJson(controller, encoder, {
                searchStatus: { stage: "searching", query: event.query, tool: toolName },
              });

              // 実際の検索実行
              let results: Array<{ url: string; title: string; snippet: string }>;
              if (isWebSearch) {
                const webResult = await performWebSearch(event.query, controller, encoder);
                results = webResult.results;
              } else {
                results = await searchBluesky(event.query, controller, encoder);
              }

              sseJson(controller, encoder, {
                searchStatus: { stage: "processing" },
              });
              await new Promise((r) => setTimeout(r, 200));

              sseJson(controller, encoder, {
                searchStatus: { stage: "done" },
                searchResults: results,
              });

              // 検索結果をコンテキストに追加して続きを生成
              const formattedResults = results.length > 0
                ? results
                    .map(
                      (r, i) =>
                        `${i + 1}. タイトル: ${r.title}\n   URL: ${r.url}\n   内容: ${r.snippet.substring(0, 300)}${r.snippet.length > 300 ? "..." : ""}`
                    )
                    .join("\n\n")
                : "(検索結果が見つかりませんでした)";

              messagesForContinuation.push({
                role: "system",
                content: `${toolName}クエリ: ${event.query}\n\n検索結果:\n${formattedResults}\n\n上記の検索結果を元に、キャラクターとして自然な会話の形で**日本語で**簡潔に答えてください。返答は3〜5文程度にまとめること。余計な思考や前置きは不要です。`,
              });

              // 続きの返答を生成（ツール呼び出しは 1 回のみ）
              const followUp = await ollamaClient.chat.completions.create(
                {
                  model: OLLAMA_MODEL,
                  messages: messagesForContinuation,
                  stream: true,
                  // @ts-expect-error: Ollama 固有のパラメータ
                  num_predict: 512,
                  // @ts-expect-error: Ollama 固有のパラメータ
                  repeat_penalty: 1.15,
                },
                { signal: req.signal }
              );

              for await (const followUpEvent of parseThinkingStream(followUp)) {
                if (streamEnded) break;

                if (followUpEvent.type === "done") {
                  if (!streamEnded) {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                    streamEnded = true;
                  }
                  return;
                }

                if (followUpEvent.type === "tool_call") {
                  continue;
                }

                if (!streamEnded) {
                  const payload =
                    followUpEvent.type === "reasoning"
                      ? { reasoning: followUpEvent.content }
                      : { text: followUpEvent.content };
                  sseJson(controller, encoder, payload);
                }
              }

              // フォローアップが done を返さず終了した場合の安全網
              if (!streamEnded) {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                streamEnded = true;
              }
              return;
            }

            // 通常の text / reasoning イベント
            const payload =
              event.type === "reasoning"
                ? { reasoning: event.content }
                : { text: event.content };
            sseJson(controller, encoder, payload);
          }
        } catch (error) {
          // クライアントが切断した場合（停止ボタン）は静かに終了
          if (
            error instanceof Error &&
            (error.name === "AbortError" || error.message.includes("aborted"))
          ) {
            console.log("[API/chat] クライアントによりストリームが中断されました");
            streamEnded = true;
            try { controller.close(); } catch { /* already closed */ }
            return;
          }
          // コントローラー既に閉じている場合は無視
          if (
            error instanceof Error &&
            (error.message.includes("Controller is already closed") || (error as NodeJS.ErrnoException).code === "ERR_INVALID_STATE")
          ) {
            return;
          }
          console.error("Stream error:", error);
          try { controller.error(error); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}