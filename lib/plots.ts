import { prisma } from "./prisma";
import type { Plot, PlotCharacter, TokenProfile } from "./types";

// 全プロット取得
export async function getAllPlots(): Promise<Plot[]> {
  const plots = await prisma.plot.findMany({
    include: {
      characters: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return plots.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    characters: p.characters.map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      personality: c.personality,
      speechStyle: c.speechStyle,
      background: c.background,
      scenario: c.scenario,
      firstMessage: c.firstMessage,
    })),
    tokenProfile: p.tokenProfile as unknown as TokenProfile | undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

// IDでプロット取得
export async function getPlotById(id: string): Promise<Plot | undefined> {
  const plot = await prisma.plot.findUnique({
    where: { id },
    include: {
      characters: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!plot) return undefined;

  return {
    id: plot.id,
    title: plot.title,
    description: plot.description,
    characters: plot.characters.map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      personality: c.personality,
      speechStyle: c.speechStyle,
      background: c.background,
      scenario: c.scenario,
      firstMessage: c.firstMessage,
    })),
    tokenProfile: plot.tokenProfile as unknown as TokenProfile | undefined,
    createdAt: plot.createdAt.toISOString(),
    updatedAt: plot.updatedAt.toISOString(),
  };
}

// 新規プロット作成
export async function createPlot(
  plot: Omit<Plot, "id" | "createdAt" | "updatedAt">
): Promise<Plot> {
  const { characters, tokenProfile, ...plotData } = plot;

  const newPlot = await prisma.plot.create({
    data: {
      ...plotData,
      tokenProfile: tokenProfile ? JSON.parse(JSON.stringify(tokenProfile)) : undefined,
      characters: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        create: characters.map(({ id, ...rest }) => rest),
      },
    },
  });

  const result = await getPlotById(newPlot.id);
  return result!;
}

// プロット更新
export async function updatePlot(
  id: string,
  updates: Partial<Omit<Plot, "id" | "createdAt" | "updatedAt">>
): Promise<Plot | undefined> {
  const { characters, tokenProfile, ...plotData } = updates;

  // キャラクター更新がある場合は、まず既存のキャラクターを削除して再作成
  if (characters) {
    await prisma.character.deleteMany({
      where: { plotId: id },
    });
  }

  await prisma.plot.update({
    where: { id },
    data: {
      ...plotData,
      ...(tokenProfile !== undefined && { tokenProfile: JSON.parse(JSON.stringify(tokenProfile)) }),
      ...(characters && {
        characters: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          create: characters.map(({ id, ...rest }) => rest),
        },
      }),
    },
  });

  const result = await getPlotById(id);
  return result;
}

// プロット削除
export async function deletePlot(id: string): Promise<boolean> {
  try {
    await prisma.plot.delete({
      where: { id },
    });
    return true;
  } catch {
    return false;
  }
}

// プロット内のキャラクター取得
export async function getCharacterFromPlot(
  plotId: string,
  characterId: string
): Promise<PlotCharacter | undefined> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character || character.plotId !== plotId) return undefined;

  return {
    id: character.id,
    name: character.name,
    avatar: character.avatar,
    personality: character.personality,
    speechStyle: character.speechStyle,
    background: character.background,
    scenario: character.scenario,
    firstMessage: character.firstMessage,
  };
}

// プロット内にキャラクター追加
export async function addCharacterToPlot(
  plotId: string,
  character: Omit<PlotCharacter, "id">
): Promise<Plot | undefined> {
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
  });

  if (!plot) return undefined;

  await prisma.character.create({
    data: {
      ...character,
      plotId,
    },
  });

  return getPlotById(plotId);
}

// プロット内のキャラクター更新
export async function updateCharacterInPlot(
  plotId: string,
  characterId: string,
  updates: Partial<Omit<PlotCharacter, "id">>
): Promise<Plot | undefined> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character || character.plotId !== plotId) return undefined;

  await prisma.character.update({
    where: { id: characterId },
    data: updates,
  });

  return getPlotById(plotId);
}

// プロット内のキャラクター削除
export async function deleteCharacterFromPlot(
  plotId: string,
  characterId: string
): Promise<Plot | undefined> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character || character.plotId !== plotId) return undefined;

  await prisma.character.delete({
    where: { id: characterId },
  });

  return getPlotById(plotId);
}
