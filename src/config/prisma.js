import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { env } from "./env.js";

if (!env.databaseUrl) throw new Error("DATABASE_URL must be configured");

// ONE adapter/client shared by the entire process. Do not instantiate in repositories.
const adapter = new PrismaBetterSqlite3({ url: env.databaseUrl });
export const prisma = new PrismaClient({ adapter });

export async function connectDatabase() {
  await prisma.$connect();
  const result = await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  if (String(result[0]?.journal_mode).toLowerCase() !== "wal") {
    throw new Error("Unable to enable SQLite WAL journal mode");
  }
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
  // IMPORTANT: verify adapter timestampFormat matches the existing DB's DateTime format.
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
