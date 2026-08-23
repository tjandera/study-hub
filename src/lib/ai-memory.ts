import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiCache, aiMemory, aiSessions } from "@/db/schema";
import { BUDGET, clip } from "@/lib/ai-budget";
import { cosine, embedText, fingerprint, generateText, hasAiKey, MODELS } from "@/lib/gemini";
import { newId } from "@/lib/ids";
import type { QuestionDraft } from "@/lib/types";

export const WORKSPACE_SCOPE = "workspace";
export const PRACTICE_KIND = "practice";
export const LAST_DUMP_KIND = "last_dump";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SIMILARITY = 0.93;

export type CachedPack = {
  summary: string;
  theory: string[];
  math: string[];
  code: string[];
  questions: QuestionDraft[];
  digestMd: string;
  graph: { nodes: { title: string; summary: string }[]; links: { from: string; to: string; relation: string }[] };
  model: string;
};

function parseVec(raw: string | null) {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

export function sanitizeCorpus(text: string) {
  return text
    .replace(/ignore (all|previous|above) instructions/gi, "[ignored]")
    .replace(/<\/?system>/gi, "")
    .slice(0, 80_000);
}

export function groundedQuestions(
  questions: QuestionDraft[],
  allowedSources: string[],
) {
  const fallbackSource = allowedSources[0] || "";
  return questions
    .filter((q) => q.prompt.trim() && q.answer.trim())
    .map((q) => ({
      ...q,
      source: q.source?.trim() || fallbackSource,
    }));
}

export async function readCache(input: {
  pageId: string;
  task: string;
  corpusHash: string;
  query: string;
}): Promise<CachedPack | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(aiCache)
    .where(
      and(eq(aiCache.pageId, input.pageId), eq(aiCache.task, input.task)),
    )
    .orderBy(desc(aiCache.createdAt))
    .limit(12);
  const now = Date.now();
  const queryVec = await embedText(input.query, "SEMANTIC_SIMILARITY");
  for (const row of rows) {
    if (row.corpusHash !== input.corpusHash) continue;
    if (now - new Date(row.createdAt).getTime() > CACHE_TTL_MS) continue;
    const exact = fingerprint([input.task, input.corpusHash, input.query]);
    if (row.cacheKey === exact) {
      return JSON.parse(row.payload) as CachedPack;
    }
    const sim = cosine(queryVec, parseVec(row.embedding));
    if (sim >= SIMILARITY) return JSON.parse(row.payload) as CachedPack;
  }
  return null;
}

export async function writeCache(input: {
  pageId: string;
  task: string;
  corpusHash: string;
  query: string;
  payload: CachedPack;
}) {
  const db = await getDb();
  const embedding = await embedText(input.query, "SEMANTIC_SIMILARITY");
  await db.insert(aiCache).values({
    id: newId(),
    cacheKey: fingerprint([input.task, input.corpusHash, input.query]),
    pageId: input.pageId,
    task: input.task,
    embedding: JSON.stringify(embedding),
    corpusHash: input.corpusHash,
    payload: JSON.stringify(input.payload),
    createdAt: new Date(),
  });
}

export async function loadSession(pageId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiSessions)
    .where(eq(aiSessions.pageId, pageId))
    .limit(1);
  return row || null;
}

export async function saveSession(input: {
  pageId: string;
  summaryMd: string;
  graphJson: string;
  corpusHash: string;
  model: string;
}) {
  const db = await getDb();
  const existing = await loadSession(input.pageId);
  const now = new Date();
  if (existing) {
    await db
      .update(aiSessions)
      .set({
        summaryMd: input.summaryMd,
        graphJson: input.graphJson,
        corpusHash: input.corpusHash,
        model: input.model,
        updatedAt: now,
      })
      .where(eq(aiSessions.pageId, input.pageId));
    return;
  }
  await db.insert(aiSessions).values({
    pageId: input.pageId,
    summaryMd: input.summaryMd,
    graphJson: input.graphJson,
    corpusHash: input.corpusHash,
    model: input.model,
    updatedAt: now,
  });
}

function memoryId(scope: string, kind: string) {
  return `${scope}:${kind}`.slice(0, 64);
}

export async function loadMemory(scope: string, kind: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiMemory)
    .where(and(eq(aiMemory.scope, scope), eq(aiMemory.kind, kind)))
    .limit(1);
  return row?.content || "";
}

export async function saveMemory(scope: string, kind: string, content: string) {
  const db = await getDb();
  const id = memoryId(scope, kind);
  const now = new Date();
  const [existing] = await db
    .select({ id: aiMemory.id })
    .from(aiMemory)
    .where(eq(aiMemory.id, id))
    .limit(1);
  if (existing) {
    await db
      .update(aiMemory)
      .set({ content, updatedAt: now })
      .where(eq(aiMemory.id, id));
    return;
  }
  await db.insert(aiMemory).values({
    id,
    scope,
    kind,
    content,
    updatedAt: now,
  });
}

export async function loadPractices(pageId: string) {
  const [workspace, page] = await Promise.all([
    loadMemory(WORKSPACE_SCOPE, PRACTICE_KIND),
    loadMemory(pageId, PRACTICE_KIND),
  ]);
  return clip(workspace || page, BUDGET.dumpMemory);
}

export async function rememberPractices(
  pageId: string,
  observation: string,
) {
  const previous = await loadPractices(pageId);
  const raw = clip(
    [previous, observation.trim()].filter(Boolean).join("\n"),
    BUDGET.dumpMemory * 2,
  );
  if (!raw) return previous;

  let next = raw;
  if (hasAiKey() && observation.trim()) {
    try {
      next = await generateText({
        model: MODELS.lite,
        maxTokens: BUDGET.textOut.memory,
        system: `Compress note-filing practices into <= 8 short bullets. Keep folder-naming patterns, when to merge vs split topics, heading style, and wiki-link habits. Folder names are human-readable page titles, never kebab-case slugs. No preamble.`,
        user: clip(raw, 2_000),
      });
      next = clip(next.replace(/^```[\s\S]*?```/g, "").trim(), BUDGET.dumpMemory);
    } catch {
      next = clip(raw, BUDGET.dumpMemory);
    }
  } else {
    next = clip(raw, BUDGET.dumpMemory);
  }

  await saveMemory(WORKSPACE_SCOPE, PRACTICE_KIND, next);
  await saveMemory(pageId, PRACTICE_KIND, clip(observation, 600));
  return next;
}
