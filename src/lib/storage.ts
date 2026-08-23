import "server-only";

import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { newId } from "@/lib/ids";

const localDir = () => path.join(process.cwd(), ".data", "blob");

function hasBlobStore() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function storeBytes(
  filename: string,
  bytes: Buffer,
  contentType: string,
) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const key = `${newId()}-${safe}`;

  if (hasBlobStore()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`study-hub/${key}`, bytes, {
      access: "private",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    return { url: blob.url, pathname: blob.pathname };
  }

  await mkdir(localDir(), { recursive: true });
  await writeFile(path.join(localDir(), key), bytes);
  return { url: `local://${key}`, pathname: key };
}

export async function readStoredFile(pathname: string, blobUrl: string) {
  if (blobUrl.startsWith("local://") || !hasBlobStore()) {
    return readFile(path.join(localDir(), pathname));
  }
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error("Could not read file");
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteStoredFile(pathname: string, blobUrl: string) {
  try {
    if (blobUrl.startsWith("local://") || !hasBlobStore()) {
      await unlink(path.join(localDir(), pathname));
      return;
    }
    const { del } = await import("@vercel/blob");
    await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch {
    // missing file is fine
  }
}
