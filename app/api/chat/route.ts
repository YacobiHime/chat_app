import { NextRequest, NextResponse } from "next/server";
import { ollamaClient, OLLAMA_MODEL } from "@/lib/ollama";
import { getPlotById, getCharacterFromPlot } from "@/lib/plots";
import { bingSearch } from "@/lib/bing-search";

const THINK_START = "<think>";
const THINK_END = "</think>";

/**
 * ストリームチャンクから <think> タグを解析し、
 * reasoning / text を分けてSSEイベントとして流すジェネレーター。
 */
async function* parseThinkingStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: AsyncIterable<any>,
  controller?: ReadableStreamDefaultController,
  encoder?: TextEncoder
): AsyncGenerator<
  | { type: "reasoning" | "text"; content: string }
  | { type: "tool_call"; tool: string; query: string }
  | { type: "done" }
> {
  let buffer = "";
  let inThinking = false;

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;

    const nativeReasoning = (delta as { reasoning?: string | null }).reasoning;
    if (nativeReasoning) {
      yield { type: "reasoning", content: nativeReasoning };
    }

    const raw = delta?.content ?? "";
    if (!raw) continue;

    buffer += raw;

    // テキストベースのツール呼び出しを検出
    const webSearchPattern = /call:web_search\{query:<\|"?\|>([^<]+)<\|"?\|>\}<tool_call\|>/;
    const blueskySearchPattern = /call:bluesky_search\{query:<\|"?\|>([^<]+)<\|"?\|>\}<tool_call\|>/;

    const webSearchMatch = buffer.match(webSearchPattern);
    const blueskySearchMatch = buffer.match(blueskySearchPattern);
    const toolCallMatch = webSearchMatch || blueskySearchMatch; // ✅ バグ修正

    if (toolCallMatch) {
      const tool = webSearchMatch ? "web_search" : "bluesky_search";

      // ツール呼び出し前のテキストを流す
      const beforeToolCall = buffer.substring(0, toolCallMatch.index);
      if (beforeToolCall) {
        yield { type: "text", content: beforeToolCall };
      }

      const query = toolCallMatch[1].trim();
      yield { type: "tool_call", tool, query };

      // ツール呼び出し以降のバッファをリセット
      buffer = buffer.substring(toolCallMatch.index! + toolCallMatch[0].length);
      continue;
    }

    // <think> タグをパースしながらバッファを消費
    while (true) {
      if (!inThinking) {
        const startIdx = buffer.indexOf(THINK_START);

        if (startIdx === -1) {
          const safeLen = Math.max(0, buffer.length - (THINK_START.length - 1));
          if (safeLen > 0) {
            yield { type: "text", content: buffer.slice(0, safeLen) };
            buffer = buffer.slice(safeLen);
          }
          break;
        }

        if (startIdx > 0) {
          yield { type: "text", content: buffer.slice(0, startIdx) };
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
            yield { type: "reasoning", content: buffer.slice(0, safeLen) };
            buffer = buffer.slice(safeLen);
          }
          break;
        }

        if (endIdx > 0) {
          yield { type: "reasoning", content: buffer.slice(0, endIdx) };
        }
        buffer = buffer.slice(endIdx + THINK_END.length);
        inThinking = false;
      }
    }
  }

  if (buffer.length > 0) {
    yield { type: inThinking ? "reasoning" : "text", content: buffer };
  }

  yield { type: "done" };
}

/**
 * Bluesky で投稿を検索
 */
async function searchBluesky(
  query: string,
  controller?: ReadableStreamDefaultController,
  encoder?: TextEncoder
): Promise<Array<{ url: string; title: string; snippet: string }>> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodedQuery}&limit=5`
    );

    if (!response.ok) {
      console.error("Bluesky search failed:", response.status);
      return [];
    }

    const data = await response.json();
    const results: Array<{ url: string; title: string; snippet: string }> = [];

    if (data.posts && Array.isArray(data.posts)) {
      for (const post of data.posts) {
        const author =
          post.author?.displayName || post.author?.handle || "Bluesky User";
        const text = post.record?.text || "";
        const postUrl = post.uri
          ?.replace("at://", "https://bsky.app/profile/")
          ?.replace("/app.bsky.feed.post/", "/post/");

        if (postUrl && text) {
          if (controller && encoder) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ search_url: postUrl, url_status: "fetching" })}\n\n`
              )
            );
            await new Promise((resolve) => setTimeout(resolve, 100));
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  search_url: postUrl,
                  url_status: "done",
                  url_title: `${author} (@${post.author?.handle})`,
                })}\n\n`
              )
            );
          }

          results.push({
            url: postUrl,
            title: `${author} (@${post.author?.handle})`,
            snippet: text,
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Bluesky error:", error);
    return [];
  }
}

/**
 * Playwright + Bing で Web 検索を実行し、
 * URL 訪問イベントを SSE で流しながら結果を返す
 */
async function performWebSearch(
  query: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<{ results: Array<{ url: string; title: string; snippet: string }>; urls: string[] }> {
  const urls: string[] = [];

  // ---- Bing 検索（Playwright） ----
  const results = await bingSearch(query, 5);

  // URL 訪問イベントを SSE で流す（UI 表示用）
  for (const r of results) {
    urls.push(r.url);
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ search_url: r.url, url_status: "fetching" })}\n\n`
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 80));
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

    // システムプロンプトを構築
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

1. web_search - Bing によるWeb検索（高品質）
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
`.trim();

    const messagesWithSystem = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const response = await ollamaClient.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: messagesWithSystem,
      stream: true,
      num_predict: 2048,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messagesForContinuation = [...messagesWithSystem];

          for await (const event of parseThinkingStream(response, controller, encoder)) {
            if (event.type === "done") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              break;
            } else if (event.type === "tool_call") {
              const isWebSearch = event.tool === "web_search";
              const toolName = isWebSearch ? "Web検索（Bing）" : "Bluesky検索";

              // 検索中ステータスを送信
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    searchStatus: { stage: "thinking", query: event.query, tool: toolName },
                  })}\n\n`
                )
              );
              await new Promise((resolve) => setTimeout(resolve, 500));

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    searchStatus: { stage: "searching", query: event.query, tool: toolName },
                  })}\n\n`
                )
              );

              let results: Array<{ url: string; title: string; snippet: string }>;

              if (isWebSearch) {
                const webResult = await performWebSearch(event.query, controller, encoder);
                results = webResult.results;
              } else {
                results = await searchBluesky(event.query, controller, encoder);
              }

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ searchStatus: { stage: "processing" } })}\n\n`
                )
              );
              await new Promise((resolve) => setTimeout(resolve, 200));

              // 検索結果を送信
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    searchStatus: { stage: "done" },
                    searchResults: results,
                  })}\n\n`
                )
              );

              // 検索結果をメッセージに追加して会話を継続
              const formattedResults = results
                .map(
                  (r, i) =>
                    `${i + 1}. タイトル: ${r.title}\n   URL: ${r.url}\n   内容: ${r.snippet?.substring(0, 300)}${r.snippet && r.snippet.length > 300 ? "..." : ""}`
                )
                .join("\n\n");

              messagesForContinuation.push({
                role: "system",
                content: `${toolName}クエリ: ${event.query}\n\n検索結果:\n${formattedResults || "(見つかりませんでした)"}\n\nこの検索結果を元に、キャラクターとして自然な会話の形で答えてください。`,
              });

              // 続きのレスポンスを取得
              const followUp = await ollamaClient.chat.completions.create({
                model: OLLAMA_MODEL,
                messages: messagesForContinuation,
                stream: true,
                num_predict: 2048,
              });

              for await (const followUpEvent of parseThinkingStream(followUp, controller, encoder)) {
                if (followUpEvent.type === "done") {
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  controller.close();
                  return;
                } else if (followUpEvent.type === "tool_call") {
                  // 二重ツール呼び出しは無視
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ text: "(検索は一度のみ行います)" })}\n\n`
                    )
                  );
                } else {
                  const payload =
                    followUpEvent.type === "reasoning"
                      ? { reasoning: followUpEvent.content }
                      : { text: followUpEvent.content };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                }
              }
              break;
            } else {
              const payload =
                event.type === "reasoning"
                  ? { reasoning: event.content }
                  : { text: event.content };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            }
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
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