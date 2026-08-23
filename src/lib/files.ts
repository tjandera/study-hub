import "server-only";

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { files } from "@/db/schema";
import { extractFileText } from "@/lib/extract";
import { iso, newId } from "@/lib/ids";
import { getPage, listSubtreeIds } from "@/lib/pages";
import {
  deleteStoredFile,
  readStoredFile,
  storeBytes,
} from "@/lib/storage";
import type { FileRecord } from "@/lib/types";

export async function addFileFromBytes(
  pageId: string,
  filename: string,
  bytes: Buffer,
  mime: string,
  existingId?: string,
): Promise<FileRecord & { extractedText: string }> {
  const page = await getPage(pageId);
  if (!page) throw new Error("Page not found");
  const extractedRaw =
    bytes.length > 12_000_000 ? "" : await extractFileText(mime, bytes, filename);
  const extracted = extractedRaw.replace(/\u0000/g, "").slice(0, 80_000);
  const db = await getDb();
  const now = new Date();
  if (existingId) {
    const existing = await getFileRow(existingId);
    if (existing) {
      const stored =
        existing.size === bytes.length
          ? { url: existing.blobUrl, pathname: existing.pathname }
          : await storeBytes(filename, bytes, mime);
      await db
        .update(files)
        .set({
          pageId,
          blobUrl: stored.url,
          pathname: stored.pathname,
          filename,
          mime,
          size: bytes.length,
          extractedText: extracted || existing.extractedText,
        })
        .where(eq(files.id, existingId));
      return {
        id: existingId,
        pageId,
        filename,
        mime,
        size: bytes.length,
        createdAt: iso(existing.createdAt),
        extractedChars: (extracted || existing.extractedText || "").length,
        extractedText: extracted || existing.extractedText || "",
      };
    }
  }
  const stored = await storeBytes(filename, bytes, mime);
  const id = existingId || newId();
  await db.insert(files).values({
    id,
    pageId,
    blobUrl: stored.url,
    pathname: stored.pathname,
    filename,
    mime,
    size: bytes.length,
    extractedText: extracted || null,
    createdAt: now,
  });
  return {
    id,
    pageId,
    filename,
    mime,
    size: bytes.length,
    createdAt: iso(now),
    extractedChars: extracted.length,
    extractedText: extracted,
  };
}

export async function addFile(pageId: string, file: File): Promise<FileRecord & { extractedText: string }> {
  const page = await getPage(pageId);
  if (!page) throw new Error("Page not found");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const stored = await storeBytes(file.name, bytes, mime);
  const extracted = await extractFileText(mime, bytes, file.name);
  const db = await getDb();
  const id = newId();
  const now = new Date();
  await db.insert(files).values({
    id,
    pageId,
    blobUrl: stored.url,
    pathname: stored.pathname,
    filename: file.name,
    mime,
    size: bytes.length,
    extractedText: extracted || null,
    createdAt: now,
  });
  return {
    id,
    pageId,
    filename: file.name,
    mime,
    size: bytes.length,
    createdAt: iso(now),
    extractedChars: extracted.length,
    extractedText: extracted,
  };
}

export async function reextractEmptyFiles(pageId: string) {
  const ids = await listSubtreeIds(pageId);
  const db = await getDb();
  const rows = ids.length
    ? await db.select().from(files).where(inArray(files.pageId, ids))
    : [];
  let updated = 0;
  for (const row of rows) {
    if ((row.extractedText || "").trim().length > 80) continue;
    const bytes = await readStoredFile(row.pathname, row.blobUrl);
    if (!bytes) continue;
    const text = await extractFileText(row.mime, Buffer.from(bytes), row.filename);
    if (!text.trim()) continue;
    await db
      .update(files)
      .set({ extractedText: text })
      .where(eq(files.id, row.id));
    updated += 1;
  }
  return updated;
}

export async function getFileRow(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  return row || null;
}

export async function readFileBytes(id: string) {
  const row = await getFileRow(id);
  if (!row) return null;
  const bytes = await readStoredFile(row.pathname, row.blobUrl);
  return { row, bytes };
}

export async function removeFile(id: string) {
  const row = await getFileRow(id);
  if (!row) return false;
  await deleteStoredFile(row.pathname, row.blobUrl);
  const db = await getDb();
  await db.delete(files).where(eq(files.id, id));
  return true;
}

/** Deletes every file (row + underlying blob) attached to a page. */
export async function removeFilesForPage(pageId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: files.id, pathname: files.pathname, blobUrl: files.blobUrl })
    .from(files)
    .where(eq(files.pageId, pageId));
  for (const row of rows) {
    await deleteStoredFile(row.pathname, row.blobUrl);
  }
  if (rows.length) {
    await db.delete(files).where(eq(files.pageId, pageId));
  }
}
