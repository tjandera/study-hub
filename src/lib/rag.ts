import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ragChunks } from "@/db/schema";
import { clip } from "@/lib/ai-budget";
import { gatherWeekCorpus, type CorpusChunk } from "@/lib/corpus";
import { cosine, embedText, fingerprint } from "@/lib/gemini";
import { newId } from "@/lib/ids";
import type { MaterialKind } from "@/lib/types";

export type RagChunk = {
  id: string;
  pageId: string;
  source: string;
  kind: MaterialKind;
  text: string;
  embedding: number[];
};

function splitText(text: string) {
  const blocks = text.split(/\n(?=#{1,3}\s)/g);
  const out: string[] = [];
  for (const block of blocks) {
    if (block.length <= 900) {
      if (block.trim()) out.push(block.trim());
      continue;
    }
    const paras = block.split(/\n{2,}/);
    let buf = "";
    for (const para of paras) {
      if ((buf + "\n\n" + para).length > 900) {
        if (buf.trim()) out.push(buf.trim());
        buf = para;
      } else {
        buf = buf ? `${buf}\n\n${para}` : para;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.filter((c) => c.length > 20);
}

export function corpusHash(chunks: CorpusChunk[]) {
  return fingerprint(chunks.map((c) => `${c.source}\n${c.text}`));
}

export async function indexPage(pageId: string) {
  const corpus = await gatherWeekCorpus(pageId);
  const db = await getDb();
  await db.delete(ragChunks).where(eq(ragChunks.pageId, pageId));
  const indexed: RagChunk[] = [];
  const now = new Date();
  for (const chunk of corpus.chunks) {
    const pieces = splitText(chunk.text);
    const usable = pieces.length ? pieces : [chunk.text.slice(0, 900)].filter(Boolean);
    for (const piece of usable) {
      const embedding = await embedText(piece, "RETRIEVAL_DOCUMENT");
      const id = newId();
      await db.insert(ragChunks).values({
        id,
        pageId,
        source: chunk.source,
        kind: chunk.kind,
        text: piece,
        embedding: JSON.stringify(embedding),
        createdAt: now,
      });
      indexed.push({
        id,
        pageId,
        source: chunk.source,
        kind: chunk.kind,
        text: piece,
        embedding,
      });
    }
  }
  return { corpus, indexed, hash: corpusHash(corpus.chunks) };
}

export async function loadChunks(pageId: string): Promise<RagChunk[]> {
  const db = await getDb();
  const rows = await db.select().from(ragChunks).where(eq(ragChunks.pageId, pageId));
  return rows.map((row) => ({
    id: row.id,
    pageId: row.pageId,
    source: row.source,
    kind: row.kind as MaterialKind,
    text: row.text,
    embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : [],
  }));
}

export async function retrieve(
  pageId: string,
  query: string,
  k = 6,
): Promise<RagChunk[]> {
  const chunks = await loadChunks(pageId);
  if (!chunks.length) return [];
  const q = await embedText(query, "RETRIEVAL_QUERY");
  return [...chunks]
    .map((c) => ({ c, score: cosine(q, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c);
}

/**
 * `budget` is a total character allowance for the chunk text, shared evenly
 * across the chunks so one long chunk cannot crowd out the rest.
 */
export function formatChunks(chunks: RagChunk[], budget?: number) {
  const perChunk =
    budget && chunks.length
      ? Math.max(200, Math.floor(budget / chunks.length))
      : undefined;
  return chunks
    .map((c) => {
      const text = perChunk ? clip(c.text, perChunk) : c.text;
      return `<chunk source="${c.source}" kind="${c.kind}">\n${text}\n</chunk>`;
    })
    .join("\n\n");
}
