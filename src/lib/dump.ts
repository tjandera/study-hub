import "server-only";

import { z } from "zod";
import { generateCompactQuiz, hasAiKey } from "@/lib/ai";
import { BUDGET, clip, extractOutline, looksRawSlides } from "@/lib/ai-budget";
import {
  loadMemory,
  loadPractices,
  LAST_DUMP_KIND,
  rememberPractices,
  saveMemory,
} from "@/lib/ai-memory";
import { classifyText, gatherWeekCorpus } from "@/lib/corpus";
import { INBOX_ID } from "@/lib/constants";
import { addFile, reextractEmptyFiles } from "@/lib/files";
import { generateJson, MODELS, routeModel } from "@/lib/gemini";
import { connectTopics, injectWikiLinks } from "@/lib/graph";
import { importZip } from "@/lib/import-export";
import {
  formatNotesMarkdown,
  ingestPageMaterials,
  ingestUploadedFile,
  noteTitleFromFilename,
} from "@/lib/ingest";
import { mediaKind } from "@/lib/format";
import {
  createPage,
  getPage,
  listChildPages,
  listPagesByIds,
  listSubtreeIds,
  updatePage,
} from "@/lib/pages";
import { saveQuiz } from "@/lib/quizzes";
import type { MaterialKind } from "@/lib/types";

export type DumpFolderResult = {
  id: string;
  title: string;
  noteCount: number;
  quizId?: string;
};

export type DumpResult = {
  folders: DumpFolderResult[];
  moved: number;
  connections: number;
  quizzes: number;
  notes: number;
  files: number;
  model: string;
  usedAi: boolean;
  practices: string;
};

type DumpItem = {
  id: string;
  title: string;
  kind: MaterialKind;
  headings: string[];
  excerpt: string;
  chars: number;
};

const FolderPlanSchema = z.object({
  folders: z
    .array(
      z.object({
        title: z.string().min(1),
        icon: z.string().optional().default("🗂️"),
        summary: z.string().optional().default(""),
        itemIds: z.array(z.coerce.string()),
        quiz: z.boolean().optional().default(true),
      }),
    )
    .max(12),
});

function isZipFile(file: File) {
  return (
    /\.zip$/i.test(file.name) ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

function clusterKeyTokens(item: DumpItem) {
  return new Set(
    [item.title, ...item.headings]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3 && !STOP.has(t)),
  );
}

const STOP = new Set([
  "week",
  "notes",
  "slide",
  "slides",
  "chapter",
  "lecture",
  "intro",
  "introduction",
  "untitled",
  "the",
  "and",
  "for",
  "with",
  "from",
]);

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit += 1;
  return hit / (a.size + b.size - hit);
}

function folderTitle(group: DumpItem[]) {
  const counts = new Map<string, number>();
  for (const item of group) {
    for (const heading of item.headings.slice(0, 2)) {
      const key = heading.trim();
      if (key.length < 3 || key.length > 48) continue;
      counts.set(key, (counts.get(key) || 0) + 2);
    }
    const words = item.title
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()));
    const stub = words.slice(0, 3).join(" ");
    if (stub) counts.set(stub, (counts.get(stub) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] || group[0]?.title || "Notes";
}

function localCluster(items: DumpItem[]): z.infer<typeof FolderPlanSchema>["folders"] {
  if (!items.length) return [];
  const n = items.length;
  const parent = [...Array(n).keys()];
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };
  const tokens = items.map(clusterKeyTokens);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (jaccard(tokens[i], tokens[j]) >= 0.22) union(i, j);
    }
  }
  const buckets = new Map<number, DumpItem[]>();
  items.forEach((item, i) => {
    const p = find(i);
    const list = buckets.get(p) || [];
    list.push(item);
    buckets.set(p, list);
  });
  let folders = [...buckets.values()].map((group) => ({
    title: folderTitle(group),
    icon: "🗂️",
    summary: group.map((g) => g.title).slice(0, 4).join(", "),
    itemIds: group.map((g) => g.id),
    quiz: group.reduce((s, g) => s + g.chars, 0) > 400,
  }));
  if (folders.length > 12) {
    const sorted = [...folders].sort((a, b) => b.itemIds.length - a.itemIds.length);
    const keep = sorted.slice(0, 11);
    const rest = sorted.slice(11);
    keep.push({
      title: "Other notes",
      icon: "📎",
      summary: "Remaining dumped material",
      itemIds: rest.flatMap((f) => f.itemIds),
      quiz: false,
    });
    folders = keep;
  }
  return folders;
}

async function collectItems(pageId: string): Promise<{
  items: DumpItem[];
  existingFolders: { id: string; title: string }[];
}> {
  const kids = await listChildPages(pageId);
  const rows = await listPagesByIds(kids.map((k) => k.id));
  const items: DumpItem[] = [];
  const existingFolders: { id: string; title: string }[] = [];
  for (const row of rows) {
    if (/\bdigest$/i.test(row.title) || row.id === INBOX_ID) continue;
    const grandchildren = await listChildPages(row.id);
    if (grandchildren.length > 0) {
      existingFolders.push({ id: row.id, title: row.title });
      continue;
    }
    const text = row.contentMd || "";
    if (text.trim().length < 20) continue;
    const outline = extractOutline(text);
    items.push({
      id: row.id,
      title: row.title,
      kind: classifyText(text, row.title),
      headings: outline.headings,
      excerpt: outline.excerpt,
      chars: text.length,
    });
  }
  return { items, existingFolders };
}

function outlinePayload(items: DumpItem[]) {
  return clip(
    items
      .map(
        (item) =>
          `- id=${item.id} | ${item.title} [${item.kind}]\n  headings: ${item.headings.join(" · ") || "(none)"}\n  ${item.excerpt}`,
      )
      .join("\n"),
    BUDGET.dumpClusterIn,
  );
}

async function planFolders(input: {
  pageTitle: string;
  items: DumpItem[];
  existingFolders: { id: string; title: string }[];
  practices: string;
}): Promise<{
  folders: z.infer<typeof FolderPlanSchema>["folders"];
  model: string;
  usedAi: boolean;
}> {
  const fallback = localCluster(input.items);
  const canReuse = input.existingFolders.length > 0;
  if (!hasAiKey() || (input.items.length < 2 && !canReuse)) {
    return { folders: fallback, model: hasAiKey() ? MODELS.lite : "local", usedAi: false };
  }

  const model =
    MODELS[
      routeModel({
        chars: outlinePayload(input.items).length,
        math: input.items.filter((i) => i.kind === "math").length,
        code: input.items.filter((i) => i.kind === "code").length,
        task: "dump",
      })
    ];

  try {
    const raw = await generateJson({
      model,
      maxTokens: BUDGET.jsonOut.dump,
      system: `File dumped study materials into topic folders.
Use ONLY the outlines. Group by subject, not file type.
Prefer 3-8 folders. Each item id appears in exactly one folder.
Reuse an existing folder title when it matches a topic (ignore case and punctuation).
Folder titles must be human-readable page names like "Linear Algebra", never kebab-case slugs.
JSON: { "folders": [{ "title", "icon", "summary", "itemIds": [], "quiz": true }] }.`,
      user: `Parent page: ${input.pageTitle}
Existing folders: ${input.existingFolders.map((f) => f.title).join(", ") || "(none)"}
${input.practices ? `Practices:\n${input.practices}\n` : ""}
ITEMS:
${outlinePayload(input.items)}`,
    });
    const parsed = FolderPlanSchema.parse(raw);
    const allowed = new Set(input.items.map((i) => i.id));
    const byTitle = new Map(input.items.map((i) => [i.title.toLowerCase(), i.id]));
    const assigned = new Set<string>();
    const resolve = (token: string) => {
      if (allowed.has(token)) return token;
      return byTitle.get(token.toLowerCase()) || "";
    };
    const folders = parsed.folders
      .map((folder) => {
        const itemIds = folder.itemIds
          .map(resolve)
          .filter((id) => id && allowed.has(id) && !assigned.has(id));
        itemIds.forEach((id) => assigned.add(id));
        return {
          ...folder,
          title: folder.title.trim().slice(0, 80) || "Notes",
          icon: folderIcon(folder.icon),
          itemIds,
        };
      })
      .filter((folder) => folder.itemIds.length > 0);
    const leftover = input.items.filter((i) => !assigned.has(i.id));
    if (leftover.length) {
      const extras = localCluster(leftover);
      folders.push(...extras);
    }
    return {
      folders: folders.length ? folders : fallback,
      model,
      usedAi: folders.length > 0,
    };
  } catch (error) {
    console.error("Dump clustering failed", error);
    return { folders: fallback, model, usedAi: false };
  }
}

function titleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function folderIcon(raw: string | undefined) {
  const trimmed = (raw || "").trim();
  if (trimmed && /\p{Extended_Pictographic}/u.test(trimmed)) {
    return trimmed.slice(0, 8);
  }
  const key = trimmed.toLowerCase();
  if (key.includes("math") || key.includes("algebra") || key.includes("calc")) return "➗";
  if (key.includes("code") || key.includes("program")) return "💻";
  if (key.includes("theory") || key.includes("concept")) return "🧠";
  return "🗂️";
}

async function ensureFolder(
  parentId: string,
  title: string,
  icon: string,
  existingFolders: { id: string; title: string }[],
) {
  const key = titleKey(title);
  const match = existingFolders.find((f) => titleKey(f.title) === key);
  if (match) return match.id;
  const kids = await listChildPages(parentId);
  const reuse = kids.find((k) => titleKey(k.title) === key);
  if (reuse) return reuse.id;
  const created = await createPage({
    parentId,
    title,
    icon: folderIcon(icon),
    contentMd: `# ${title}\n`,
  });
  existingFolders.push({ id: created.id, title });
  return created.id;
}

async function polishNote(pageId: string) {
  const page = await getPage(pageId);
  if (!page) return;
  if (page.contentMd.length < 80) return;
  if (!looksRawSlides(page.contentMd) && page.contentMd.split("\n").length > 12) {
    return;
  }
  const cleaned = await formatNotesMarkdown(
    page.title,
    page.contentMd,
    "ai",
    `${page.title}.md`,
  );
  if (cleaned.trim().length < 40) return;
  await updatePage(pageId, { contentMd: cleaned });
}

async function writeFolderIndex(
  folderId: string,
  title: string,
  summary: string,
  noteTitles: string[],
) {
  const links = noteTitles.map((name) => `- [[${name}]]`).join("\n");
  const md = injectWikiLinks(
    `# ${title}

${summary || "Dumped notes grouped by topic."}

## Notes
${links || "- (empty)"}
`,
    noteTitles,
  );
  await updatePage(folderId, { contentMd: md });
}

export async function ingestDumpFiles(pageId: string, incoming: File[]) {
  const zips = incoming.filter(isZipFile);
  const regular = incoming.filter((f) => !isZipFile(f));
  let files = 0;
  let notes = 0;

  for (const zip of zips) {
    try {
      const result = await importZip(await zip.arrayBuffer(), pageId);
      files += result.files;
      notes += result.notes;
    } catch (error) {
      console.error("Dump zip failed", error);
    }
  }

  const results = await Promise.all(
    regular.map(async (item) => {
      const record = await addFile(pageId, item);
      const kind = mediaKind(record.mime, record.filename);
      if (["image", "video", "audio"].includes(kind)) {
        return { note: false };
      }
      const ingested = await ingestUploadedFile({
        pageId,
        file: record,
        extractedText: record.extractedText,
        formatMode: "quick",
      });
      return { note: ingested.kind === "note" };
    }),
  );
  files += regular.length;
  notes += results.filter((r) => r.note).length;
  return { files, notes };
}

export async function dumpPaste(pageId: string, title: string, body: string) {
  const name = title.trim() || noteTitleFromFilename("pasted-notes.md");
  const md = body.trim().startsWith("#")
    ? body.trim()
    : `# ${name}\n\n${body.trim()}\n`;
  const created = await createPage({
    parentId: pageId,
    title: name,
    icon: "📝",
    contentMd: md,
  });
  return created;
}

export async function organizeDump(
  pageId: string,
  opts: { quizzes?: boolean } = {},
): Promise<DumpResult> {
  const page = await getPage(pageId);
  if (!page) throw new Error("Page not found");

  await reextractEmptyFiles(pageId);
  await ingestPageMaterials(pageId, "quick");

  const practices = await loadPractices(pageId);
  const { items, existingFolders } = await collectItems(pageId);
  if (!items.length) {
    throw new Error("Nothing to dump yet. Drop files or paste notes first.");
  }

  const plan = await planFolders({
    pageTitle: page.title,
    items,
    existingFolders,
    practices,
  });

  const byId = new Map(items.map((i) => [i.id, i]));
  const subtree = new Set(await listSubtreeIds(pageId));
  let moved = 0;
  const folderResults: DumpFolderResult[] = [];

  for (const folder of plan.folders) {
    const noteIds = folder.itemIds.filter((id) => byId.has(id) && subtree.has(id));
    if (!noteIds.length) continue;

    const sole = noteIds.length === 1 ? byId.get(noteIds[0]) : null;
    const skipWrap =
      folder.title.toLowerCase() === page.title.toLowerCase() ||
      Boolean(sole && sole.title.toLowerCase() === folder.title.toLowerCase());

    let folderId = pageId;
    if (!skipWrap) {
      folderId = await ensureFolder(
        pageId,
        folder.title,
        folder.icon,
        existingFolders,
      );
    }

    for (const noteId of noteIds) {
      if (noteId === folderId || noteId === pageId) continue;
      const descendants = await listSubtreeIds(noteId);
      if (descendants.includes(folderId)) continue;
      await updatePage(noteId, { parentId: folderId });
      moved += 1;
      await polishNote(noteId);
    }

    const notes = (await listPagesByIds(noteIds)).filter((n) => !n.archived);
    if (folderId !== pageId) {
      await writeFolderIndex(
        folderId,
        folder.title,
        folder.summary,
        notes.map((n) => n.title),
      );
      const siblingTitles = notes.map((n) => n.title);
      for (const note of notes) {
        const next = injectWikiLinks(note.contentMd || "", siblingTitles);
        if (next !== note.contentMd) {
          await updatePage(note.id, { contentMd: next });
        }
      }
    }

    let quizId: string | undefined;
    if (opts.quizzes !== false && folder.quiz && folderResults.length < 4) {
      try {
        const corpus = await gatherWeekCorpus(folderId);
        if (corpus.combined.trim().length > 200) {
          const questions = await generateCompactQuiz({
            pageId: folderId,
            title: folder.title,
            counts: corpus.counts,
          });
          if (questions.length) {
            const saved = await saveQuiz({
              pageId: folderId,
              title: `${folder.title} practice`,
              mix: "mixed",
              drafts: questions,
            });
            quizId = saved?.quiz.id;
          }
        }
      } catch (error) {
        console.error("Dump quiz failed", error);
      }
    }

    folderResults.push({
      id: folderId,
      title: skipWrap && folderId === pageId ? page.title : folder.title,
      noteCount: noteIds.length,
      quizId,
    });
  }

  const graph = await connectTopics(pageId);
  const observation = folderResults
    .map((f) => `- ${f.title} (${f.noteCount} notes)`)
    .join("\n");
  const stored = await rememberPractices(
    pageId,
    `Dump on "${page.title}":\n${observation}`,
  );

  const result: DumpResult = {
    folders: folderResults,
    moved,
    connections: graph.links,
    quizzes: folderResults.filter((f) => f.quizId).length,
    notes: items.length,
    files: 0,
    model: plan.model,
    usedAi: plan.usedAi,
    practices: stored,
  };
  await saveMemory(pageId, LAST_DUMP_KIND, JSON.stringify(result));
  return result;
}

export async function lastDump(pageId: string): Promise<DumpResult | null> {
  const raw = await loadMemory(pageId, LAST_DUMP_KIND);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DumpResult;
  } catch {
    return null;
  }
}

export async function dumpStatus(pageId: string) {
  const [practices, last] = await Promise.all([
    loadPractices(pageId),
    lastDump(pageId),
  ]);
  return {
    configured: hasAiKey(),
    practices,
    last,
    model: MODELS.lite,
  };
}
