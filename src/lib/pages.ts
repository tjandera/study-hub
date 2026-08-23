import "server-only";

import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiCache,
  aiSessions,
  attempts,
  chatMessages,
  concepts,
  conceptLinks,
  files,
  pageLinks,
  pageTags,
  pages,
  questions,
  quizzes,
  ragChunks,
  tags,
} from "@/db/schema";
import { INBOX_ID } from "@/lib/constants";
import { iso, newId } from "@/lib/ids";
import { TEMPLATES, type TemplateKey } from "@/lib/templates";
import type {
  Backlink,
  FileRecord,
  PageRecord,
  PageTreeNode,
  PageType,
  SearchHit,
  WorkspacePayload,
} from "@/lib/types";
import { parseWikiTitles } from "@/lib/wiki";

type PageRow = typeof pages.$inferSelect;

function toTreeNode(row: PageRow): PageTreeNode {
  return {
    id: row.id,
    parentId: row.parentId,
    type: (row.type as PageType) || "page",
    title: row.title,
    icon: row.icon,
    sortOrder: row.sortOrder,
    archived: row.archived,
    favorite: row.favorite,
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
    shareEnabled: row.shareEnabled,
    shareToken: row.shareToken,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    children: [],
  };
}

async function tagsFor(pageId: string) {
  const db = await getDb();
  const rows = await db
    .select({ name: tags.name })
    .from(pageTags)
    .innerJoin(tags, eq(pageTags.tagId, tags.id))
    .where(eq(pageTags.pageId, pageId));
  return rows.map((r) => r.name);
}

function toRecord(row: PageRow, tagNames: string[]): PageRecord {
  return {
    ...toTreeNode(row),
    contentMd: row.contentMd,
    tags: tagNames,
  };
}

function buildTree(rows: PageRow[]): PageTreeNode[] {
  const map = new Map<string, PageTreeNode>();
  for (const row of rows) map.set(row.id, toTreeNode(row));
  const roots: PageTreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: PageTreeNode[]) => {
    nodes.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
    );
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

export async function getWorkspace(): Promise<WorkspacePayload> {
  const db = await getDb();
  const rows = await db.select().from(pages).where(eq(pages.archived, false));
  const tree = buildTree(rows);
  const recents = [...rows]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 12)
    .map(toTreeNode);
  return { tree, recents, inboxId: INBOX_ID };
}

export async function getPage(id: string): Promise<PageRecord | null> {
  const db = await getDb();
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!row || row.archived) return null;
  return toRecord(row, await tagsFor(id));
}

export async function findPageByTitle(title: string, excludeId?: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.archived, false), ilike(pages.title, title)))
    .orderBy(desc(pages.updatedAt));
  const match = rows.find(
    (r) =>
      r.title.toLowerCase() === title.toLowerCase() && r.id !== excludeId,
  );
  return match ? toTreeNode(match) : null;
}

export async function listTitleMatches(query: string, limit = 8) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(pages)
    .where(
      query
        ? and(eq(pages.archived, false), ilike(pages.title, `%${query}%`))
        : eq(pages.archived, false),
    )
    .orderBy(desc(pages.updatedAt))
    .limit(limit);
  return rows.map(toTreeNode);
}

async function nextSort(parentId: string | null) {
  const db = await getDb();
  const rows = await db
    .select({ sortOrder: pages.sortOrder })
    .from(pages)
    .where(parentId === null ? isNull(pages.parentId) : eq(pages.parentId, parentId));
  return rows.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;
}

export async function upsertPage(input: {
  id: string;
  parentId?: string | null;
  type?: PageType;
  title: string;
  icon?: string | null;
  contentMd?: string;
  favorite?: boolean;
  sortOrder?: number;
  overwriteContent?: boolean;
}) {
  const db = await getDb();
  const [row] = await db.select().from(pages).where(eq(pages.id, input.id)).limit(1);
  const now = new Date();
  if (row) {
    const contentMd =
      input.overwriteContent && input.contentMd !== undefined
        ? input.contentMd
        : row.contentMd;
    await db
      .update(pages)
      .set({
        parentId: input.parentId ?? row.parentId,
        type: input.type || row.type,
        title: input.title.trim() || row.title,
        icon: input.icon ?? row.icon,
        contentMd,
        favorite: input.favorite ?? row.favorite,
        sortOrder: input.sortOrder ?? row.sortOrder,
        archived: false,
        deletedAt: null,
        updatedAt: now,
      })
      .where(eq(pages.id, input.id));
    if (input.overwriteContent && input.contentMd !== undefined) {
      await rebuildLinks(input.id, input.contentMd);
    }
    return getPage(input.id);
  }
  const created = {
    id: input.id,
    parentId: input.parentId ?? null,
    type: input.type || "page",
    title: input.title.trim() || "Untitled",
    icon: input.icon ?? "📄",
    contentMd: input.contentMd ?? "",
    sortOrder: input.sortOrder ?? (await nextSort(input.parentId ?? null)),
    archived: false,
    favorite: Boolean(input.favorite),
    deletedAt: null,
    shareEnabled: false,
    shareToken: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(pages).values(created);
  if (created.contentMd) await rebuildLinks(input.id, created.contentMd);
  return toRecord(created, []);
}

export async function createPage(input: {
  parentId?: string | null;
  type?: PageType;
  title?: string;
  icon?: string | null;
  template?: TemplateKey;
  contentMd?: string;
}) {
  const db = await getDb();
  const template = TEMPLATES[input.template || "blank"];
  const now = new Date();
  const parentId = input.parentId ?? null;
  const id = newId();
  const row = {
    id,
    parentId,
    type: input.type || "page",
    title: input.title?.trim() || template.title,
    icon: input.icon ?? template.icon,
    contentMd: input.contentMd ?? template.content,
    sortOrder: await nextSort(parentId),
    archived: false,
    favorite: false,
    deletedAt: null,
    shareEnabled: false,
    shareToken: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(pages).values(row);
  if (row.contentMd) await rebuildLinks(id, row.contentMd);
  return toRecord(row, []);
}

export async function updatePage(
  id: string,
  patch: {
    title?: string;
    icon?: string | null;
    contentMd?: string;
    parentId?: string | null;
    type?: PageType;
    favorite?: boolean;
    sortOrder?: number;
    tags?: string[];
  },
) {
  const db = await getDb();
  const current = await getPage(id);
  if (!current) return null;
  if (id === INBOX_ID && patch.parentId) {
    delete patch.parentId;
  }

  const updates: Partial<PageRow> = { updatedAt: new Date() };
  if (patch.title !== undefined) updates.title = patch.title.trim() || "Untitled";
  if (patch.icon !== undefined) updates.icon = patch.icon;
  if (patch.contentMd !== undefined) updates.contentMd = patch.contentMd;
  if (patch.parentId !== undefined) updates.parentId = patch.parentId;
  if (patch.type !== undefined) updates.type = patch.type;
  if (patch.favorite !== undefined) updates.favorite = patch.favorite;
  if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder;

  await db.update(pages).set(updates).where(eq(pages.id, id));
  if (patch.contentMd !== undefined) await rebuildLinks(id, patch.contentMd);
  if (patch.tags) await setTags(id, patch.tags);
  return getPage(id);
}

export async function listSubtreeIds(id: string) {
  const db = await getDb();
  const all = await db.select({ id: pages.id, parentId: pages.parentId }).from(pages);
  const children = new Map<string, string[]>();
  for (const row of all) {
    if (!row.parentId) continue;
    const list = children.get(row.parentId) || [];
    list.push(row.id);
    children.set(row.parentId, list);
  }
  const out: string[] = [];
  const walk = (current: string) => {
    out.push(current);
    for (const child of children.get(current) || []) walk(child);
  };
  walk(id);
  return out;
}

export const TRASH_RETENTION_DAYS = 30;

export async function archivePage(id: string) {
  if (id === INBOX_ID) throw new Error("Inbox cannot be deleted");
  const db = await getDb();
  const ids = await listSubtreeIds(id);
  const now = new Date();
  for (const pageId of ids) {
    await db
      .update(pages)
      .set({ archived: true, deletedAt: now, updatedAt: now })
      .where(eq(pages.id, pageId));
  }
}

export async function restorePage(id: string) {
  const db = await getDb();
  const ids = await listSubtreeIds(id);
  const now = new Date();
  for (const pageId of ids) {
    await db
      .update(pages)
      .set({ archived: false, deletedAt: null, updatedAt: now })
      .where(eq(pages.id, pageId));
  }
}

/** Hard-deletes a trashed page (and its subtree) and every row that references it. */
export async function purgePage(id: string) {
  const db = await getDb();
  const ids = await listSubtreeIds(id);
  if (!ids.length) return;
  const { removeFilesForPage } = await import("@/lib/files");
  for (const pageId of ids) {
    await removeFilesForPage(pageId);
    await db.delete(pageLinks).where(eq(pageLinks.fromId, pageId));
    await db.delete(pageLinks).where(eq(pageLinks.toId, pageId));
    await db.delete(pageTags).where(eq(pageTags.pageId, pageId));
    const quizRows = await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.pageId, pageId));
    for (const quiz of quizRows) {
      await db.delete(questions).where(eq(questions.quizId, quiz.id));
      await db.delete(attempts).where(eq(attempts.quizId, quiz.id));
    }
    await db.delete(quizzes).where(eq(quizzes.pageId, pageId));
    await db.delete(ragChunks).where(eq(ragChunks.pageId, pageId));
    await db.delete(aiCache).where(eq(aiCache.pageId, pageId));
    await db.delete(aiSessions).where(eq(aiSessions.pageId, pageId));
    await db.delete(concepts).where(eq(concepts.pageId, pageId));
    await db.delete(conceptLinks).where(eq(conceptLinks.pageId, pageId));
    await db.delete(chatMessages).where(eq(chatMessages.pageId, pageId));
  }
  for (const pageId of ids) {
    await db.delete(pages).where(eq(pages.id, pageId));
  }
}

export async function listTrash(): Promise<PageTreeNode[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(pages)
    .where(eq(pages.archived, true))
    .orderBy(desc(pages.updatedAt));
  return rows.map(toTreeNode);
}

/** Permanently removes anything that's been in the trash longer than the retention window. */
export async function purgeExpiredTrash() {
  const db = await getDb();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: pages.id, deletedAt: pages.deletedAt })
    .from(pages)
    .where(eq(pages.archived, true));
  const expired = rows.filter((r) => r.deletedAt && r.deletedAt < cutoff);
  for (const row of expired) {
    // Purging cascades a whole subtree — skip ids already removed by an
    // ancestor's purge earlier in this loop.
    const [still] = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, row.id)).limit(1);
    if (still) await purgePage(row.id);
  }
  return expired.length;
}

export async function enableShare(id: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!row || row.archived) return null;
  const token = row.shareToken || newId();
  await db
    .update(pages)
    .set({ shareEnabled: true, shareToken: token })
    .where(eq(pages.id, id));
  return token;
}

export async function disableShare(id: string) {
  const db = await getDb();
  await db.update(pages).set({ shareEnabled: false }).where(eq(pages.id, id));
}

export async function getPageByShareToken(token: string): Promise<PageRecord | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.shareToken, token), eq(pages.shareEnabled, true), eq(pages.archived, false)))
    .limit(1);
  if (!row) return null;
  return toRecord(row, await tagsFor(row.id));
}

async function rebuildLinks(fromId: string, markdown: string) {
  const db = await getDb();
  await db.delete(pageLinks).where(eq(pageLinks.fromId, fromId));
  const titles = parseWikiTitles(markdown);
  for (const title of titles) {
    const target = await findPageByTitle(title, fromId);
    if (!target) continue;
    await db.insert(pageLinks).values({
      id: newId(),
      fromId,
      toId: target.id,
      raw: title,
    });
  }
}

export async function getBacklinks(id: string): Promise<Backlink[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: pages.id,
      title: pages.title,
      icon: pages.icon,
    })
    .from(pageLinks)
    .innerJoin(pages, eq(pages.id, pageLinks.fromId))
    .where(and(eq(pageLinks.toId, id), eq(pages.archived, false)));
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

async function setTags(pageId: string, names: string[]) {
  const db = await getDb();
  await db.delete(pageTags).where(eq(pageTags.pageId, pageId));
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  for (const name of unique) {
    const [existing] = await db
      .select()
      .from(tags)
      .where(eq(tags.name, name.toLowerCase()))
      .limit(1);
    const tagId = existing?.id || newId();
    if (!existing) {
      await db.insert(tags).values({ id: tagId, name: name.toLowerCase() });
    }
    await db.insert(pageTags).values({ pageId, tagId });
  }
}

export async function breadcrumbs(id: string) {
  const db = await getDb();
  const all = await db.select().from(pages);
  const byId = new Map(all.map((r) => [r.id, r]));
  const trail: PageTreeNode[] = [];
  let current = byId.get(id);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    trail.unshift(toTreeNode(current));
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return trail;
}

export async function searchAll(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const db = await getDb();
  const pattern = `%${q}%`;
  const pageRows = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.archived, false),
        or(ilike(pages.title, pattern), ilike(pages.contentMd, pattern)),
      ),
    )
    .limit(20);

  const fileRows = await db
    .select({
      id: files.id,
      filename: files.filename,
      pageId: files.pageId,
      extractedText: files.extractedText,
      pageTitle: pages.title,
      icon: pages.icon,
    })
    .from(files)
    .innerJoin(pages, eq(pages.id, files.pageId))
    .where(
      and(
        eq(pages.archived, false),
        or(ilike(files.filename, pattern), ilike(files.extractedText, pattern)),
      ),
    )
    .limit(20);

  const hits: SearchHit[] = [
    ...pageRows.map((p) => ({
      id: p.id,
      title: p.title,
      kind: "page" as const,
      icon: p.icon,
      snippet: snippet(p.contentMd, q),
    })),
    ...fileRows.map((f) => ({
      id: f.id,
      title: f.filename,
      kind: "file" as const,
      pageId: f.pageId,
      icon: f.icon,
      snippet: snippet(f.extractedText || f.pageTitle, q),
    })),
  ];
  return hits.slice(0, 30);
}

function snippet(text: string, q: string) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, 140);
  const start = Math.max(0, idx - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + 160).replace(/\s+/g, " ");
}

export async function listPagesByIds(ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db.select().from(pages).where(inArray(pages.id, ids));
  return rows.filter((row) => !row.archived);
}

export async function listChildPages(parentId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.parentId, parentId), eq(pages.archived, false)));
  return rows.map((row) => toTreeNode(row));
}

export async function listFiles(pageId?: string): Promise<FileRecord[]> {
  const db = await getDb();
  const rows = pageId
    ? await db
        .select({
          id: files.id,
          pageId: files.pageId,
          filename: files.filename,
          mime: files.mime,
          size: files.size,
          createdAt: files.createdAt,
          extractedText: files.extractedText,
          pageTitle: pages.title,
        })
        .from(files)
        .innerJoin(pages, eq(pages.id, files.pageId))
        .where(and(eq(files.pageId, pageId), eq(pages.archived, false)))
        .orderBy(desc(files.createdAt))
    : await db
        .select({
          id: files.id,
          pageId: files.pageId,
          filename: files.filename,
          mime: files.mime,
          size: files.size,
          createdAt: files.createdAt,
          extractedText: files.extractedText,
          pageTitle: pages.title,
        })
        .from(files)
        .innerJoin(pages, eq(pages.id, files.pageId))
        .where(eq(pages.archived, false))
        .orderBy(desc(files.createdAt));

  return rows.map((r) => ({
    id: r.id,
    pageId: r.pageId,
    filename: r.filename,
    mime: r.mime,
    size: r.size,
    createdAt: iso(r.createdAt),
    pageTitle: r.pageTitle,
    extractedChars: r.extractedText?.length || 0,
  }));
}

export async function listSubtreeFiles(pageId: string): Promise<FileRecord[]> {
  const page = await getPage(pageId);
  const ids = new Set(await listSubtreeIds(pageId));
  if (page?.parentId) ids.add(page.parentId);
  if (!ids.size) return [];
  const db = await getDb();
  const rows = await db
    .select({
      id: files.id,
      pageId: files.pageId,
      filename: files.filename,
      mime: files.mime,
      size: files.size,
      createdAt: files.createdAt,
      extractedText: files.extractedText,
      pageTitle: pages.title,
    })
    .from(files)
    .innerJoin(pages, eq(pages.id, files.pageId))
    .where(and(inArray(files.pageId, [...ids]), eq(pages.archived, false)))
    .orderBy(desc(files.createdAt));

  return rows.slice(0, 200).map((r) => ({
    id: r.id,
    pageId: r.pageId,
    filename: r.filename,
    mime: r.mime,
    size: r.size,
    createdAt: iso(r.createdAt),
    pageTitle: r.pageTitle,
    extractedChars: r.extractedText?.length || 0,
  }));
}

export { INBOX_ID };
