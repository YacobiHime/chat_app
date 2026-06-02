import { NextRequest, NextResponse } from "next/server";
import { ollamaClient, OLLAMA_MODEL } from "@/lib/ollama";
import { getPlotById, getCharacterFromPlot } from "@/lib/plots";

const THINK_START = "";
const THINK_END = "";

/**
 * URLからページタイトルを取得する
 */
async function fetchPageTitle(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ストリームチャンクから  タグを解析し、
 * reasoning / text を分けてSSEイベントとして流すジェネレーター。
 */
async function* parseThinkingStream(
  response: AsyncIterable<{
    choices: Array<{
      delta: {
        content?: string | null;
        reasoning?: string | null;
        [key: string]: unknown;
      };
    }>;
  }>,
  controller?: ReadableStreamDefaultController,
  encoder?: TextEncoder
): AsyncGenerator<
  | { type: "reasoning" | "text"; content: string }
  | { type: "tool_call"; query: string }
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

    // テキストベースのツール呼び出しを検出（優先チェック）
    const toolCallPattern = /call:web_search\{query:<\|"?\|>([^<]+)<\|"?\|>\}<tool_call\|>/;
    const toolCallMatch = buffer.match(toolCallPattern);

    if (toolCallMatch) {
      // ツール呼び出し前のテキストを流す
      const beforeToolCall = buffer.substring(0, toolCallMatch.index);
      if (beforeToolCall) {
        yield { type: "text", content: beforeToolCall };
      }

      // ツール呼び出しを検出
      const query = toolCallMatch[1].trim();
      yield { type: "tool_call", query };

      // ツール呼び出し後のバッファをリセット
      buffer = buffer.substring(toolCallMatch.index + toolCallMatch[0].length);

      // 続きのストリーミング
      continue;
    }

    //  タグをパースしながらバッファを消費
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
 * Web検索を実行し、URL訪問イベントを送信しながら結果を返す
 */
async function performWebSearch(
  query: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<{ results: Array<{ url: string; title: string; snippet: string }>; urls: string[] }> {
  // DuckDuckGo Instant Answer API
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json`;

  try {
    const response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();
    const results: Array<{ url: string; title: string; snippet: string }> = [];
    const urls: string[] = [];

    // メインのAbstractを処理
    if (data.Abstract && data.AbstractURL) {
      urls.push(data.AbstractURL);

      // URL訪問イベントを送信（フェッチ開始）
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        search_url: data.AbstractURL,
        url_status: "fetching"
      })}\n\n`));

      const title = await fetchPageTitle(data.AbstractURL);

      // URL訪問イベントを送信（フェッチ完了）
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        search_url: data.AbstractURL,
        url_status: "done",
        url_title: title
      })}\n\n`));

      results.push({
        url: data.AbstractURL,
        title: title || data.Heading || "Result",
        snippet: data.Abstract
      });
    }

    // RelatedTopicsを処理
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics) {
        if (topic.FirstURL && topic.Text) {
          // 既存のURLはスキップ
          if (urls.includes(topic.FirstURL)) continue;

          urls.push(topic.FirstURL);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            search_url: topic.FirstURL,
            url_status: "fetching"
          })}\n\n`));

          const title = await fetchPageTitle(topic.FirstURL);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            search_url: topic.FirstURL,
            url_status: "done",
            url_title: title
          })}\n\n`));

          results.push({
            url: topic.FirstURL,
            title: title || topic.Text.substring(0, 50),
            snippet: topic.Text
          });
        }

        // ネストされたTopics
        if (topic.Topics && Array.isArray(topic.Topics)) {
          for (const subTopic of topic.Topics) {
            if (subTopic.FirstURL && subTopic.Text) {
              if (urls.includes(subTopic.FirstURL)) continue;

              urls.push(subTopic.FirstURL);

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                search_url: subTopic.FirstURL,
                url_status: "fetching"
              })}\n\n`));

              const title = await fetchPageTitle(subTopic.FirstURL);

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                search_url: subTopic.FirstURL,
                url_status: "done",
                url_title: title
              })}\n\n`));

              results.push({
                url: subTopic.FirstURL,
                title: title || subTopic.Text.substring(0, 50),
                snippet: subTopic.Text
              });
            }
          }
        }
      }
    }

    return { results, urls };
  } catch (error) {
    console.error("Web search error:", error);
    return { results: [], urls: [] };
  }
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

【Web検索機能】
あなたはweb_searchツールを使ってインターネット検索ができます。
検索が必要な場合は以下の形式でツールを呼び出してください：
call:web_search{query:<|"|>検索したい言葉<|"|>}<tool_call|>

ツールを呼ぶと、自動的に検索が行われ、結果が表示されます。
その結果を元に、キャラクターとして自然な会話の形で答えてください。
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
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let messagesForContinuation = [...messagesWithSystem];
          let toolCallProcessed = false;

          for await (const event of parseThinkingStream(response, controller, encoder)) {
            if (event.type === "done") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } else if (event.type === "tool_call") {
              // ツール呼び出しを検出したら検索を実行
              toolCallProcessed = true;

              // 検索中ステータスを送信
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                searchStatus: { stage: "thinking", query: event.query }
              })}\n\n`));

              await new Promise(resolve => setTimeout(resolve, 800));

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                searchStatus: { stage: "searching", query: event.query }
              })}\n\n`));

              // Web検索実行（URL訪問イベントを送信しながら）
              const { results } = await performWebSearch(event.query, controller, encoder);

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                searchStatus: { stage: "processing" }
              })}\n\n`));

              await new Promise(resolve => setTimeout(resolve, 300));

              // 検索結果を送信
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                searchStatus: { stage: "done" },
                searchResults: results
              })}\n\n`));

              // 検索結果をメッセージに追加して会話を継続
              messagesForContinuation.push({
                role: "system",
                content: `検索クエリ: ${event.query}\n検索結果: ${JSON.stringify(results)}\n\nこの検索結果を元に、キャラクターとして自然な会話の形で答えてください。`
              });

              // 続きのレスポンスを取得
              const followUp = await ollamaClient.chat.completions.create({
                model: OLLAMA_MODEL,
                messages: messagesForContinuation,
                stream: true,
              });

              // 再帰的にストリーミング
              for await (const followUpEvent of parseThinkingStream(followUp, controller, encoder)) {
                if (followUpEvent.type === "done") {
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  controller.close();
                  break;
                } else if (followUpEvent.type === "tool_call") {
                  // 二重ツール呼び出しは無視
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    text: "(検索は一度のみ行います)"
                  })}\n\n`));
                } else {
                  const payload = followUpEvent.type === "reasoning"
                    ? { reasoning: followUpEvent.content }
                    : { text: followUpEvent.content };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                }
              }
              break;
            } else {
              // 通常のテキスト/推論
              const payload = event.type === "reasoning"
                ? { reasoning: event.content }
                : { text: event.content };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            }
          }

          if (!toolCallProcessed) {
            controller.close();
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
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
