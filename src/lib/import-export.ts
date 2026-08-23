import "server-only";

import JSZip from "jszip";
import { INBOX_ID } from "@/lib/constants";
import { addFile } from "@/lib/files";
import { createPage, getPage, getWorkspace, listFiles } from "@/lib/pages";
import { sanitizeFilename } from "@/lib/ids";
import type { PageTreeNode } from "@/lib/types";

const SKIP = /(^|\/)(__MACOSX|\.DS_Store)(\/|$)/;

function isMarkdown(name: string) {
  return /\.(md|markdown|txt)$/i.test(name);
}

function isNoteWorthy(name: string) {
  return /\.(pdf|png|jpe?g|gif|webp|pptx|ppt|docx|doc|md|markdown|txt)$/i.test(
    name,
  );
}

export async function importZip(buffer: ArrayBuffer, rootCourseId?: string) {
  const zip = await JSZip.loadAsync(buffer);
  const created: { notes: number; files: number; pages: number } = {
    notes: 0,
    files: 0,
    pages: 0,
  };
  const folderPages = new Map<string, string>();
  const defaultParent = rootCourseId || INBOX_ID;

  const dirs = new Set<string>();
  const entries: { path: string; file: JSZip.JSZipObject }[] = [];

  zip.forEach((relativePath, file) => {
    if (SKIP.test(relativePath)) return;
    const path = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!path) return;
    if (file.dir) {
      dirs.add(path.replace(/\/+$/, ""));
      return;
    }
    const parent = path.split("/").slice(0, -1).join("/");
    if (parent) dirs.add(parent);
    entries.push({ path, file });
  });

  const sortedDirs = [...dirs].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );

  for (const dir of sortedDirs) {
    const parts = dir.split("/").filter(Boolean);
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parentId = parentPath
      ? folderPages.get(parentPath) || defaultParent
      : defaultParent;
    const isTop = parts.length === 1 && !rootCourseId && parentId === INBOX_ID;
    const page = await createPage({
      parentId: isTop ? null : parentId === INBOX_ID && parts.length === 1 ? null : parentId,
      type: isTop || (!parentPath && !rootCourseId) ? "course" : "page",
      title: name,
      icon: isTop ? "📘" : "🗂️",
      contentMd: "",
    });
    folderPages.set(dir, page.id);
    created.pages += 1;
  }

  for (const entry of entries) {
    if (!isNoteWorthy(entry.path)) continue;
    const parts = entry.path.split("/");
    const filename = parts.pop() || "file";
    const dir = parts.join("/");
    const parentId = dir ? folderPages.get(dir) || defaultParent : defaultParent;

    if (isMarkdown(filename)) {
      const text = await entry.file.async("string");
      const title = filename.replace(/\.(md|markdown|txt)$/i, "");
      await createPage({
        parentId,
        title,
        icon: "📝",
        contentMd: text,
      });
      created.notes += 1;
      continue;
    }

    const bytes = await entry.file.async("uint8array");
    const mime = guessMime(filename);
    const blob = new File([Buffer.from(bytes)], filename, { type: mime });
    await addFile(parentId, blob);
    created.files += 1;
  }

  return created;
}

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export async function exportZip() {
  const zip = new JSZip();
  const { tree } = await getWorkspace();
  const used = new Set<string>();

  const walk = async (nodes: PageTreeNode[], folder: JSZip, names: Set<string>) => {
    for (const node of nodes) {
      const base = uniqueName(names, pathJoin(node.title));
      const page = await getPage(node.id);
      const pageFiles = await listFiles(node.id);
      const hasKids = node.children.length > 0 || pageFiles.length > 0;
      const dir = hasKids ? folder.folder(base) : folder;
      if (!dir) continue;
      const body = page?.contentMd || `# ${node.title}\n`;
      dir.file(hasKids ? "index.md" : `${base}.md`, body);
      for (const file of pageFiles) {
        const { readFileBytes } = await import("@/lib/files");
        const packed = await readFileBytes(file.id);
        if (!packed) continue;
        dir.file(sanitizeFilename(file.filename), packed.bytes);
      }
      if (node.children.length) await walk(node.children, dir, new Set());
    }
  };

  await walk(tree, zip, used);
  return zip.generateAsync({ type: "nodebuffer" });
}

function pathJoin(title: string) {
  return sanitizeFilename(title);
}

function uniqueName(used: Set<string>, name: string) {
  let candidate = name;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${name} ${i}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}


