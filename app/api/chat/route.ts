import { NextRequest, NextResponse } from "next/server";
import { ollamaClient, OLLAMA_MODEL } from "@/lib/ollama";
import { getPlotById, getCharacterFromPlot } from "@/lib/plots";
import type { Message } from "@/lib/types";

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
`;

    // トークプロフィール（主人公設定）がある場合、追加情報として提供
    if (plot.tokenProfile) {
      systemPrompt += `

【ユーザー（主人公）の情報】
- 名前: ${plot.tokenProfile.name}
- 性格: ${plot.tokenProfile.personality}
- 背景: ${plot.tokenProfile.background}`;
      if (plot.tokenProfile.speechStyle) {
        systemPrompt += `
- 話し方: ${plot.tokenProfile.speechStyle}`;
      }
    }

    systemPrompt += `

上記の設定を厳守し、キャラクターとして一貫して振る舞ってください。
- キャラクターを絶対に破らないこと
- AIであることや、モデル名・開発元には一切言及しないこと
- 返答は自然な会話の長さ（長すぎない）にすること
- キャラの口調・一人称を必ず守ること
`.trim();

    const response = await ollamaClient.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    });

    // Server-Sent Events でフロントにストリーム返却
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;
            const text = delta?.content ?? "";
            const reasoning = delta?.reasoning ?? "";

            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
            if (reasoning) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
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
