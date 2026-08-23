import "server-only";

import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { glossaryTerms } from "@/db/schema";
import { iso, newId } from "@/lib/ids";
import { listSubtreeIds } from "@/lib/pages";

export type GlossaryTerm = {
  id: string;
  pageId: string;
  term: string;
  definition: string;
  aliases: string[];
  sourceFileId: string | null;
  model: string | null;
  createdAt: string;
};

function parseAliases(raw: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(String).filter(Boolean)
      : [];
  } catch {
    return raw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function toTerm(row: typeof glossaryTerms.$inferSelect): GlossaryTerm {
  return {
    id: row.id,
    pageId: row.pageId,
    term: row.term,
    definition: row.definition,
    aliases: parseAliases(row.aliases),
    sourceFileId: row.sourceFileId,
    model: row.model,
    createdAt: iso(row.createdAt),
  };
}

export async function replaceGlossaryTerms(
  pageId: string,
  terms: { term: string; definition: string; aliases?: string[] }[],
  opts?: { sourceFileId?: string; model?: string },
) {
  const db = await getDb();
  await db.delete(glossaryTerms).where(eq(glossaryTerms.pageId, pageId));
  const now = new Date();
  const saved: GlossaryTerm[] = [];
  const seen = new Set<string>();
  for (const item of terms) {
    const term = item.term.trim();
    const definition = item.definition.trim();
    if (!term || !definition) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const id = newId();
    const aliases = (item.aliases || [])
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 6);
    await db.insert(glossaryTerms).values({
      id,
      pageId,
      term,
      definition: definition.slice(0, 800),
      aliases: aliases.length ? JSON.stringify(aliases) : null,
      sourceFileId: opts?.sourceFileId || null,
      model: opts?.model || null,
      createdAt: now,
    });
    saved.push({
      id,
      pageId,
      term,
      definition: definition.slice(0, 800),
      aliases,
      sourceFileId: opts?.sourceFileId || null,
      model: opts?.model || null,
      createdAt: iso(now),
    });
  }
  return saved;
}

export async function listGlossaryForPage(pageId: string) {
  const ids = await listSubtreeIds(pageId);
  // Also include parent page terms when viewing a child note
  const { getPage } = await import("@/lib/pages");
  const page = await getPage(pageId);
  if (page?.parentId && !ids.includes(page.parentId)) ids.push(page.parentId);
  if (page?.parentId) {
    const parent = await getPage(page.parentId);
    if (parent?.parentId && !ids.includes(parent.parentId)) {
      ids.push(parent.parentId);
    }
  }
  const db = await getDb();
  if (!ids.length) return [] as GlossaryTerm[];
  const rows = await db
    .select()
    .from(glossaryTerms)
    .where(inArray(glossaryTerms.pageId, ids.slice(0, 80)));
  // Prefer terms from the current page when duplicates exist
  const byKey = new Map<string, GlossaryTerm>();
  for (const row of rows) {
    const term = toTerm(row);
    const key = term.term.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || term.pageId === pageId) byKey.set(key, term);
  }
  return [...byKey.values()].sort((a, b) => a.term.localeCompare(b.term));
}

export async function lookupGlossaryTerm(pageId: string, term: string) {
  const needle = term.trim();
  if (!needle) return null;
  const all = await listGlossaryForPage(pageId);
  const lower = needle.toLowerCase();
  return (
    all.find((t) => t.term.toLowerCase() === lower) ||
    all.find((t) => t.aliases.some((a) => a.toLowerCase() === lower)) ||
    all.find((t) => t.term.toLowerCase().includes(lower)) ||
    null
  );
}

export async function searchGlossary(pageId: string, query: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(glossaryTerms)
    .where(
      and(
        eq(glossaryTerms.pageId, pageId),
        or(
          ilike(glossaryTerms.term, `%${query}%`),
          ilike(glossaryTerms.definition, `%${query}%`),
        ),
      ),
    )
    .limit(24);
  return rows.map(toTerm);
}
