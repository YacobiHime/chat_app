import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  // 既存のJSONデータを読み込む
  const plotsPath = path.join(process.cwd(), "data", "plots.json");

  let plotsData: any[] = [];
  if (fs.existsSync(plotsPath)) {
    const data = fs.readFileSync(plotsPath, "utf-8");
    plotsData = JSON.parse(data);
  }

  console.log(`Found ${plotsData.length} plots in JSON file`);

  // データベースにプロットを作成
  for (const plotData of plotsData) {
    const { characters, tokenProfile, ...plotInfo } = plotData;

    const plot = await prisma.plot.upsert({
      where: { id: plotData.id },
      update: {
        title: plotInfo.title,
        description: plotInfo.description,
        tokenProfile,
      },
      create: {
        id: plotData.id,
        title: plotInfo.title,
        description: plotInfo.description,
        tokenProfile,
      },
    });

    console.log(`Created/updated plot: ${plot.title}`);

    // キャラクターを作成
    for (const charData of characters) {
      await prisma.character.upsert({
        where: { id: charData.id },
        update: {
          name: charData.name,
          avatar: charData.avatar,
          personality: charData.personality,
          speechStyle: charData.speechStyle,
          background: charData.background,
          scenario: charData.scenario,
          firstMessage: charData.firstMessage,
        },
        create: {
          id: charData.id,
          plotId: plot.id,
          name: charData.name,
          avatar: charData.avatar,
          personality: charData.personality,
          speechStyle: charData.speechStyle,
          background: charData.background,
          scenario: charData.scenario,
          firstMessage: charData.firstMessage,
        },
      });

      console.log(`  Created/updated character: ${charData.name}`);
    }
  }

  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
