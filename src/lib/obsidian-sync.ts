import "server-only";

import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { addFileFromBytes } from "@/lib/files";
import { mimeFromName } from "@/lib/format";
import { updatePage, upsertPage } from "@/lib/pages";

const SKIP_DIRS = new Set([".obsidian", ".trash", "node_modules", ".git"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const ROOT_ID = "obsidian-notes";
const ROOT_TITLE = "Obsidian Notes";
const HOME_NOTE_NAME = "SMU Home";

export function obsidianVaultDir() {
  return process.env.OBSIDIAN_VAULT_DIR || "/Users/matth/Documents/Obsidian Vault";
}

function indexPath() {
  return path.join(process.cwd(), ".data", "obsidian-sync.json");
}

type SyncIndex = {
  syncedAt: string;
  notes: Record<string, { pageId: string; mtime: number; size: number }>;
  images: Record<string, string>; // relPath -> fileId
};

async function loadIndex(): Promise<SyncIndex> {
  try {
    return JSON.parse(await readFile(indexPath(), "utf8")) as SyncIndex;
  } catch {
    return { syncedAt: "", notes: {}, images: {} };
  }
}

async function saveIndex(index: SyncIndex) {
  await mkdir(path.dirname(indexPath()), { recursive: true });
  await writeFile(indexPath(), JSON.stringify(index, null, 2));
}

function stableId(key: string) {
  return `obs-${createHash("sha1").update(key).digest("hex").slice(0, 16)}`;
}

type Entry = { rel: string; abs: string; name: string };

function listDir(absDir: string, relBase: string): Entry[] {
  let names: string[];
  try {
    names = readdirSync(absDir);
  } catch {
    return [];
  }
  return names
    .filter((n) => !SKIP_DIRS.has(n.toLowerCase()) && !n.startsWith("."))
    .map((name) => ({
      name,
      abs: path.join(absDir, name),
      rel: relBase ? `${relBase}/${name}` : name,
    }));
}

function walkMarkdown(absDir: string, relBase = ""): Entry[] {
  const out: Entry[] = [];
  for (const entry of listDir(absDir, relBase)) {
    const st = statSync(entry.abs);
    if (st.isDirectory()) {
      out.push(...walkMarkdown(entry.abs, entry.rel));
    } else if (entry.name.toLowerCase().endsWith(".md") && st.size > 0) {
      out.push(entry);
    }
  }
  return out;
}

function walkImages(absDir: string, relBase = ""): Entry[] {
  const out: Entry[] = [];
  for (const entry of listDir(absDir, relBase)) {
    const st = statSync(entry.abs);
    if (st.isDirectory()) {
      out.push(...walkImages(entry.abs, entry.rel));
    } else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      out.push(entry);
    }
  }
  return out;
}

function folderHasMarkdown(absDir: string): boolean {
  let names: string[];
  try {
    names = readdirSync(absDir);
  } catch {
    return false;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name.toLowerCase()) || name.startsWith(".")) continue;
    const abs = path.join(absDir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (folderHasMarkdown(abs)) return true;
    } else if (name.toLowerCase().endsWith(".md") && st.size > 0) {
      return true;
    }
  }
  return false;
}

const EMOJI_PREFIX = /^([\p{Extended_Pictographic}‍️]+)\s*/u;

function splitEmojiTitle(raw: string): { icon: string | null; title: string } {
  const match = raw.match(EMOJI_PREFIX);
  if (!match) return { icon: null, title: raw };
  const rest = raw.slice(match[0].length).trim();
  return { icon: match[1], title: rest || raw };
}

function basenameNoExt(name: string) {
  return name.replace(/\.md$/i, "");
}

/** Parses the vault's own "🏠 SMU Home.md" term tables into {termTitle -> [courseFolderName]}. */
function parseTerms(homeMd: string): { title: string; folders: string[] }[] {
  const sections = homeMd.split(/^##\s+/m).slice(1);
  const terms: { title: string; folders: string[] }[] = [];
  for (const section of sections) {
    const [headerLine, ...rest] = section.split("\n");
    if (!/semester/i.test(headerLine)) continue;
    const { title } = splitEmojiTitle(headerLine.trim());
    const body = rest.join("\n");
    const folders = new Set<string>();
    for (const m of body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      const target = m[1].split("/")[0].trim();
      if (target) folders.add(target);
    }
    terms.push({ title, folders: [...folders] });
  }
  return terms;
}

type PlanNode = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  type: "course" | "page";
};

type LeafNote = PlanNode & { relPath: string };

/** A convenience index used purely to resolve [[wikilinks]] / ![[embeds]] to what we're about to create. */
class VaultIndex {
  byRelPath = new Map<string, LeafNote>(); // relPath (no ext) -> planned note
  byBasename = new Map<string, LeafNote[]>();
  images = new Map<string, Entry>(); // relPath -> image entry
  imagesByBasename = new Map<string, Entry[]>();

  addNote(relPath: string, note: LeafNote) {
    const key = relPath.replace(/\.md$/i, "");
    this.byRelPath.set(key.toLowerCase(), note);
    const base = basenameNoExt(path.basename(relPath)).toLowerCase();
    const list = this.byBasename.get(base) || [];
    list.push(note);
    this.byBasename.set(base, list);
  }

  addImage(entry: Entry) {
    this.images.set(entry.rel.toLowerCase(), entry);
    const base = entry.name.toLowerCase();
    const list = this.imagesByBasename.get(base) || [];
    list.push(entry);
    this.imagesByBasename.set(base, list);
  }

  resolveNote(rawTarget: string, fromRelDir: string): LeafNote | null {
    const target = rawTarget.split("|")[0].trim();
    const noExt = target.replace(/\.md$/i, "");
    const direct = this.byRelPath.get(noExt.toLowerCase());
    if (direct) return direct;
    const base = basenameNoExt(path.basename(noExt)).toLowerCase();
    const candidates = this.byBasename.get(base);
    if (!candidates?.length) return null;
    if (candidates.length === 1) return candidates[0];
    const sameCourse = candidates.find((c) =>
      c.relPath.toLowerCase().startsWith(`${fromRelDir.split("/")[0].toLowerCase()}/`),
    );
    return sameCourse || candidates[0];
  }

  resolveImage(rawTarget: string, fromRelDir: string): Entry | null {
    const target = rawTarget.split("|")[0].trim().toLowerCase();
    const inFolder = this.images.get(`${fromRelDir}/${target}`.toLowerCase().replace(/^\//, ""));
    if (inFolder) return inFolder;
    const candidates = this.imagesByBasename.get(target);
    if (!candidates?.length) return null;
    if (candidates.length === 1) return candidates[0];
    const sameCourse = candidates.find((c) =>
      c.rel.toLowerCase().startsWith(`${fromRelDir.split("/")[0].toLowerCase()}/`),
    );
    return sameCourse || candidates[0];
  }
}

function stripFrontmatter(md: string) {
  return md.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function extractTags(md: string): { body: string; tags: string[] } {
  const lines = md.split("\n");
  const tags = new Set<string>();
  const kept = lines.filter((line) => {
    const m = line.match(/^\*?\s*tags?:\s*((?:#[\w-]+\s*)+)\*?\s*$/i);
    if (!m) return true;
    for (const t of m[1].matchAll(/#([\w-]+)/g)) tags.add(t[1]);
    return false;
  });
  return { body: kept.join("\n"), tags: [...tags] };
}

const CALLOUT_RE = /^> \[!(\w+)\][-+]?[ \t]*([^\n]*)\n((?:>.*(?:\n|$))*)/gm;

function convertCallouts(md: string) {
  return md.replace(CALLOUT_RE, (_match, kind: string, title: string, bodyBlock: string) => {
    const bodyLines = bodyBlock
      .split("\n")
      .filter((l, i, arr) => !(i === arr.length - 1 && l === ""))
      .map((l) => l.replace(/^>\s?/, ""));
    const allLines = title.trim() ? [`**${title.trim()}**`, ...bodyLines] : bodyLines;
    const text = allLines.join("\n").trim();
    const hasStructure =
      /\n\s*\n/.test(text) || /^\s*[-*]\s|^\s*\d+\.\s/m.test(text) || text.length > 220;
    if (!hasStructure) {
      return `> [!${kind.toLowerCase()}]\n> ${text.replace(/\n/g, " ")}\n\n`;
    }
    const quoted = allLines.map((l) => (l ? `> ${l}` : ">")).join("\n");
    return `> **${kind.toUpperCase()}**\n${quoted}\n\n`;
  });
}

// Note: `![[embed]]` must be converted before this runs — this regex has no
// way to tell a wikilink from the `[[...]]` tail of an image embed once the
// leading `!` is gone, so it would otherwise swallow embeds too.
function convertWikilinks(md: string, index: VaultIndex, fromRelDir: string) {
  const fences = md.split(/(```[\s\S]*?```)/g);
  return fences
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk; // inside a fenced code block, leave untouched
      return chunk.replace(/(?<!!)\[\[([^[\]]+)\]\]/g, (whole, raw: string) => {
        const alias = raw.includes("|") ? raw.split("|")[1].trim() : null;
        const resolved = index.resolveNote(raw, fromRelDir);
        if (!resolved) return alias || raw.split("/").pop() || whole;
        return `[[${resolved.title}]]`;
      });
    })
    .join("");
}

async function convertEmbeds(
  md: string,
  index: VaultIndex,
  fromRelDir: string,
  pageId: string,
  syncIndex: SyncIndex,
) {
  const matches = [...md.matchAll(/!\[\[([^[\]]+)\]\]/g)];
  let out = md;
  for (const m of matches) {
    const raw = m[1];
    const ext = path.extname(raw).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) {
      // No non-image embeds exist in this vault today; fall back to a plain
      // link rather than ever leaving broken `![[...]]` syntax on the page.
      out = out.replace(m[0], `[${raw}]`);
      continue;
    }
    const image = index.resolveImage(raw, fromRelDir);
    if (!image) {
      out = out.replace(m[0], `[${raw}]`);
      continue;
    }
    let fileId = syncIndex.images[image.rel];
    if (!fileId) {
      const bytes = await readFile(image.abs);
      const stored = await addFileFromBytes(pageId, image.name, bytes, mimeFromName(image.name));
      fileId = stored.id;
      syncIndex.images[image.rel] = fileId;
    }
    out = out.replace(m[0], `![](/api/files/${fileId})`);
  }
  return out;
}

export async function syncObsidianNotes() {
  const root = obsidianVaultDir();
  if (!existsSync(root)) throw new Error(`Obsidian vault not found: ${root}`);

  const syncIndex = await loadIndex();
  const stats = { pages: 0, updated: 0, skipped: 0, images: 0 };

  const mdEntries = walkMarkdown(root);
  const imageEntries = walkImages(root);

  const homeEntry = mdEntries.find(
    (e) => e.rel.indexOf("/") === -1 && basenameNoExt(e.name).includes(HOME_NOTE_NAME),
  );
  const homeRaw = homeEntry ? await readFile(homeEntry.abs, "utf8") : "";
  const terms = homeRaw ? parseTerms(homeRaw) : [];
  const courseToTerm = new Map<string, string>();
  for (const term of terms) {
    for (const folder of term.folders) courseToTerm.set(folder, term.title);
  }

  const topDirs = [
    ...new Set(mdEntries.filter((e) => e.rel.includes("/")).map((e) => e.rel.split("/")[0])),
  ];

  // ---- Build the vault index (relPath -> planned note) before any DB writes ----
  const index = new VaultIndex();
  for (const image of imageEntries) index.addImage(image);

  const leaves: LeafNote[] = [];
  const proxies: PlanNode[] = [];

  // Register the vault's own home note so links back to it (used as a
  // breadcrumb on every course's own Home page, e.g. `[[🏠 SMU Home]]`)
  // resolve to the imported root page instead of silently failing.
  if (homeEntry) {
    index.addNote(homeEntry.rel, {
      id: ROOT_ID,
      parentId: null,
      title: ROOT_TITLE,
      icon: "🗒️",
      type: "course",
      relPath: homeEntry.rel,
    });
  }

  const isHomeFile = (name: string) => /\bhome\b/i.test(basenameNoExt(name));

  function planFolder(absDir: string, relDir: string, parentId: string, skipName?: string) {
    for (const entry of listDir(absDir, relDir)) {
      const st = statSync(entry.abs);
      if (st.isDirectory()) {
        if (!folderHasMarkdown(entry.abs)) continue; // pure-asset folder (attachments/screenshots) — nothing to page
        const { icon, title } = splitEmojiTitle(entry.name);
        const proxyId = stableId(`folder:${entry.rel}`);
        proxies.push({ id: proxyId, parentId, title, icon: icon || "🗂️", type: "page" });
        planFolder(entry.abs, entry.rel, proxyId);
      } else if (entry.name.toLowerCase().endsWith(".md") && st.size > 0) {
        if (entry.name === skipName) continue;
        const { icon, title } = splitEmojiTitle(basenameNoExt(entry.name));
        const note: LeafNote = {
          id: stableId(`note:${entry.rel}`),
          parentId,
          title,
          icon: icon || "📝",
          type: "page",
          relPath: entry.rel,
        };
        leaves.push(note);
        index.addNote(entry.rel, note);
      }
    }
  }

  // Course folders (grouped under their term)
  const termIds = new Map<string, string>();
  for (const term of terms) {
    termIds.set(term.title, stableId(`term:${term.title}`));
  }

  for (const dir of topDirs) {
    const termTitle = courseToTerm.get(dir);
    const parentId = termTitle ? termIds.get(termTitle)! : ROOT_ID;
    const absDir = path.join(root, dir);
    const { icon, title } = splitEmojiTitle(dir);
    const courseId = stableId(`course:${dir}`);

    const homeFile = listDir(absDir, dir).find(
      (e) => statSync(e.abs).isFile() && isHomeFile(e.name),
    );
    const coursePlanNode: LeafNote = {
      id: courseId,
      parentId,
      title,
      icon: icon || "📘",
      type: "page",
      relPath: homeFile ? homeFile.rel : "",
    };
    leaves.push(coursePlanNode);
    if (homeFile) index.addNote(homeFile.rel, coursePlanNode);

    planFolder(absDir, dir, courseId, homeFile?.name);
  }

  // Root-level loose files (not inside any top-level folder, excluding the home note itself)
  for (const entry of mdEntries) {
    if (entry.rel.includes("/")) continue;
    if (homeEntry && entry.rel === homeEntry.rel) continue;
    const { icon, title } = splitEmojiTitle(basenameNoExt(entry.name));
    const note: LeafNote = {
      id: stableId(`note:${entry.rel}`),
      parentId: ROOT_ID,
      title,
      icon: icon || "📝",
      type: "page",
      relPath: entry.rel,
    };
    leaves.push(note);
    index.addNote(entry.rel, note);
  }

  // ---- Disambiguate leaf note titles that repeat across the vault ----
  // (e.g. every course has its own "Concepts/My Class Notes.md" — the
  // immediate parent folder name alone ("My Notes") is identical across
  // all of them, so disambiguate by the top-level course folder instead.)
  const titleCounts = new Map<string, number>();
  for (const leaf of leaves) titleCounts.set(leaf.title, (titleCounts.get(leaf.title) || 0) + 1);
  for (const leaf of leaves) {
    if ((titleCounts.get(leaf.title) || 0) > 1 && leaf.relPath.includes("/")) {
      const courseFolder = splitEmojiTitle(leaf.relPath.split("/")[0]).title;
      leaf.title = `${leaf.title} (${courseFolder})`;
    }
  }
  const finalCounts = new Map<string, number>();
  for (const leaf of leaves) {
    const n = (finalCounts.get(leaf.title) || 0) + 1;
    finalCounts.set(leaf.title, n);
    if (n > 1) leaf.title = `${leaf.title} ${n}`;
  }

  // ---- Phase 1: ensure every page row exists (metadata only, never clobbers existing content) ----
  const rootNode: PlanNode = { id: ROOT_ID, parentId: null, title: ROOT_TITLE, icon: "🗒️", type: "course" };
  await upsertPage({ ...rootNode, contentMd: "", overwriteContent: false });
  for (const term of terms) {
    await upsertPage({
      id: termIds.get(term.title)!,
      parentId: ROOT_ID,
      title: term.title,
      icon: "📅",
      type: "page",
      contentMd: `# ${term.title}\n`,
      overwriteContent: true,
    });
  }
  for (const proxy of proxies) {
    await upsertPage({
      id: proxy.id,
      parentId: proxy.parentId,
      title: proxy.title,
      icon: proxy.icon,
      type: proxy.type,
      contentMd: `# ${proxy.title}\n`,
      overwriteContent: true,
    });
  }
  for (const leaf of leaves) {
    await upsertPage({
      id: leaf.id,
      parentId: leaf.parentId,
      title: leaf.title,
      icon: leaf.icon,
      type: leaf.type,
      contentMd: "",
      overwriteContent: false,
    });
  }
  stats.pages = 1 + terms.length + proxies.length + leaves.length;

  // ---- Phase 2: convert + write real content, now that every title exists for link resolution ----
  for (const leaf of leaves) {
    if (!leaf.relPath) continue;
    const abs = path.join(root, leaf.relPath);
    const st = statSync(abs);
    const prev = syncIndex.notes[leaf.relPath];
    if (prev && prev.mtime === st.mtimeMs && prev.size === st.size) {
      stats.skipped += 1;
      continue;
    }

    const raw = await readFile(abs, "utf8");
    const fromRelDir = leaf.relPath.split("/").slice(0, -1).join("/");
    let body = stripFrontmatter(raw);
    const { body: withoutTags, tags } = extractTags(body);
    body = withoutTags;
    body = convertCallouts(body);
    const beforeImages = Object.keys(syncIndex.images).length;
    body = await convertEmbeds(body, index, fromRelDir, leaf.id, syncIndex);
    stats.images += Object.keys(syncIndex.images).length - beforeImages;
    body = convertWikilinks(body, index, fromRelDir);

    await upsertPage({
      id: leaf.id,
      parentId: leaf.parentId,
      title: leaf.title,
      icon: leaf.icon,
      type: leaf.type,
      contentMd: body.trim() + "\n",
      overwriteContent: true,
    });
    if (tags.length) await updatePage(leaf.id, { tags });

    syncIndex.notes[leaf.relPath] = { pageId: leaf.id, mtime: st.mtimeMs, size: st.size };
    stats.updated += 1;
  }

  syncIndex.syncedAt = new Date().toISOString();
  await saveIndex(syncIndex);
  return stats;
}
