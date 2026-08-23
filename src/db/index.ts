import "server-only";

import { mkdir } from "fs/promises";
import path from "path";
import * as schema from "@/db/schema";
import { MIGRATE_SQL, SCHEMA_SQL } from "@/db/sql";
import { ensureSeed } from "@/lib/seed";

type AppDb = Awaited<ReturnType<typeof createDb>>;

declare global {
  var __studyHubDb: Promise<AppDb> | undefined;
  var __studyHubSchemaVersion: number | undefined;
}

async function createDb() {
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    const statements = [...SCHEMA_SQL.split(";"), ...MIGRATE_SQL.split(";")]
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await sql.query(statement);
    }
    return drizzle(sql, { schema });
  }

  const dataDir = path.join(process.cwd(), ".data", "pglite");
  await mkdir(dataDir, { recursive: true });
  const { drizzle } = await import("drizzle-orm/pglite");
  const db = drizzle({ connection: { dataDir }, schema });
  await db.$client.exec(SCHEMA_SQL);
  await db.$client.exec(MIGRATE_SQL);
  return db;
}

export async function getDb() {
  if (!globalThis.__studyHubDb) {
    globalThis.__studyHubDb = createDb().then(async (db) => {
      await ensureSeed(db as never);
      return db;
    });
  }
  const db = await globalThis.__studyHubDb;
  if (globalThis.__studyHubSchemaVersion !== 7) {
    globalThis.__studyHubSchemaVersion = 7;
    const client = (db as { $client?: { exec?: (sql: string) => Promise<unknown> } })
      .$client;
    if (client?.exec) {
      try {
        await client.exec(SCHEMA_SQL);
        await client.exec(MIGRATE_SQL);
      } catch {
        // columns / tables may already exist
      }
    }
  }
  return db;
}

export type { AppDb };
