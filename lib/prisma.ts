import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // Prisma 7 では adapter を渡す必要があるかもしれません
    // ローカル開発ではデフォルト設定で問題ありません
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
