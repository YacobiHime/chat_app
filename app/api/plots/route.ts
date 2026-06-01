import { NextRequest, NextResponse } from "next/server";
import {
  getAllPlots,
  getPlotById,
  createPlot,
  updatePlot,
  deletePlot,
} from "@/lib/plots";
import type { Plot } from "@/lib/types";

// GET /api/plots - プロット一覧取得 or 単一取得
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      // 単一プロット取得
      const plot = await getPlotById(id);
      if (!plot) {
        return NextResponse.json({ error: "Plot not found" }, { status: 404 });
      }
      return NextResponse.json(plot);
    } else {
      // 全プロット取得
      const plots = await getAllPlots();
      return NextResponse.json(plots);
    }
  } catch (error) {
    console.error("GET /api/plots error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/plots - 新規プロット作成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // バリデーション
    if (!body.title || !body.description || !body.characters || body.characters.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: title, description, characters" },
        { status: 400 }
      );
    }

    // キャラクターバリデーション
    for (const char of body.characters) {
      if (!char.name || !char.avatar || !char.personality || !char.speechStyle || !char.background || !char.scenario || !char.firstMessage) {
        return NextResponse.json(
          { error: "Character missing required fields" },
          { status: 400 }
        );
      }
    }

    const newPlot = await createPlot({
      title: body.title,
      description: body.description,
      characters: body.characters,
      tokenProfile: body.tokenProfile,
    });

    return NextResponse.json(newPlot, { status: 201 });
  } catch (error) {
    console.error("POST /api/plots error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/plots - プロット更新
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const updatedPlot = await updatePlot(id, body);

    if (!updatedPlot) {
      return NextResponse.json({ error: "Plot not found" }, { status: 404 });
    }

    return NextResponse.json(updatedPlot);
  } catch (error) {
    console.error("PUT /api/plots error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/plots - プロット削除
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const success = await deletePlot(id);

    if (!success) {
      return NextResponse.json({ error: "Plot not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/plots error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
