import "server-only";

import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { addFileFromBytes } from "@/lib/files";
import { mimeFromName } from "@/lib/format";
import { cleanStudyMarkdown, decodeNoteTitle, looksLikeSlides } from "@/lib/clean-notes";
import { hasAiKey } from "@/lib/gemini";
import { formatNotesWithGlossary, heuristicMarkdown, noteTitleFromFilename } from "@/lib/ingest";
import { replaceGlossaryTerms } from "@/lib/glossary";
import { listPagesByIds, listSubtreeIds, updatePage, upsertPage } from "@/lib/pages";
import { connectFromMarkdown } from "@/lib/graph";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".next",
  "dist",
  "build",
  ".venv",
  "venv",
  "coverage",
  ".cache",
  "__macosx",
]);

const SKIP_EXTS = new Set([
  ".zip",
  ".mov",
  ".mp4",
  ".hex",
  ".bkp",
  ".map",
  ".env",
  ".ds_store",
  ".pyc",
  ".class",
]);

const SKIP_NAMES = new Set([
  "package.json",
  "package-lock.json",
  ".ds_store",
  ".env",
]);

const BINARY_EXTS = new Set([
  ".pdf",
  ".pptx",
  ".ppt",
  ".docx",
  ".doc",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ipynb",
]);

const TEXT_EXTS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".sql",
  ".py",
  ".html",
  ".htm",
  ".drawio",
  ".ipynb",
]);

type IndexFile = {
  root: string;
  syncedAt: string;
  folders: Record<string, string>;
  files: Record<
    string,
    { pageId: string; fileId?: string; noteId: string; mtime: number; size: number }
  >;
};

const SEMESTERS = [
  {
    dir: "SMU Course Sem 1 - 27",
    id: "smu-y2t1",
    title: "Year 2 · Term 1",
    subtitle: "Current semester",
    icon: "⭐",
    sortOrder: 0,
    current: true,
  },
  {
    dir: "SMU Course Sem 2 - 26",
    id: "smu-y1t2",
    title: "Year 1 · Term 2",
    subtitle: "AY2025/26",
    icon: "🌿",
    sortOrder: 1,
    current: false,
  },
  {
    dir: "SMU Course Sem 1 - 25",
    id: "smu-y1t1",
    title: "Year 1 · Term 1",
    subtitle: "AY2024/25",
    icon: "🌱",
    sortOrder: 2,
    current: false,
  },
] as const;

function indexPath() {
  return path.join(process.cwd(), ".data", "smu-sync.json");
}

function smuId(rel: string) {
  if (!rel) return "smu";
  return `smu-${createHash("sha1").update(rel).digest("hex").slice(0, 14)}`;
}

function niceTitle(name: string) {
  return name.replace(/\s+/g, " ").replace(/\/+$/, "").trim() || "Untitled";
}

function folderIcon(name: string) {
  const n = name.toLowerCase();
  if (/recess/.test(n)) return "🌴";
  if (/week|w0?\d/.test(n)) return "📦";
  if (/exam|mock|pass paper|final|mid/.test(n)) return "🎯";
  if (/project/.test(n)) return "🧩";
  if (/book/.test(n)) return "📗";
  if (/extra|exercise|lab/.test(n)) return "✏️";
  if (/syllabus|info|outline|course information/.test(n)) return "📋";
  if (/cheat/.test(n)) return "📝";
  return "🗂️";
}

/** Canonical term structure: Weeks 1–7 → Recess → Weeks 8–14 + exam/project. */
const COURSE_SCAFFOLD: {
  folder: string;
  title: string;
  icon: string;
  sortOrder: number;
  aliases: string[];
}[] = [
  {
    folder: "course information",
    title: "Course information",
    icon: "📋",
    sortOrder: 5,
    aliases: ["course information", "course info", "syllabus", "info"],
  },
  ...Array.from({ length: 7 }, (_, i) => ({
    folder: `week ${i + 1}`,
    title: `Week ${i + 1}`,
    icon: "📦",
    sortOrder: (i + 1) * 10,
    aliases: [`week ${i + 1}`, `week${i + 1}`, `w${i + 1}`, `w0${i + 1}`],
  })),
  {
    folder: "recess week",
    title: "Recess Week",
    icon: "🌴",
    sortOrder: 75,
    aliases: ["recess week", "recess", "recess week gap"],
  },
  ...Array.from({ length: 7 }, (_, i) => ({
    folder: `week ${i + 8}`,
    title: `Week ${i + 8}`,
    icon: "📦",
    sortOrder: (i + 8) * 10,
    aliases: [`week ${i + 8}`, `week${i + 8}`, `w${i + 8}`, `w0${i + 8}`],
  })),
  {
    folder: "midterm",
    title: "Midterm",
    icon: "🎯",
    sortOrder: 200,
    aliases: ["midterm", "midterms", "mid-term"],
  },
  {
    folder: "finals prep",
    title: "Finals prep",
    icon: "🎯",
    sortOrder: 210,
    aliases: ["finals prep", "finals", "final exam", "finals preparation"],
  },
  {
    folder: "project",
    title: "Project",
    icon: "🧩",
    sortOrder: 220,
    aliases: ["project", "projects"],
  },
  {
    folder: "cheatsheet",
    title: "Cheatsheet",
    icon: "📝",
    sortOrder: 230,
    aliases: ["cheatsheet", "cheasheet", "cheat sheet", "cheat-sheet"],
  },
];

function scaffoldMatch(name: string) {
  const lower = name.toLowerCase().trim();
  return COURSE_SCAFFOLD.find(
    (item) =>
      item.aliases.includes(lower) ||
      item.folder === lower ||
      item.title.toLowerCase() === lower,
  );
}

async function ensureCourseScaffold(
  courseId: string,
  courseRel: string,
  index: IndexFile,
) {
  let created = 0;
  for (const item of COURSE_SCAFFOLD) {
    const existingRel = Object.keys(index.folders).find((rel) => {
      if (!rel.startsWith(`${courseRel}/`)) return false;
      const leaf = rel.slice(courseRel.length + 1);
      if (leaf.includes("/")) return false;
      return Boolean(scaffoldMatch(leaf)?.folder === item.folder);
    });
    const folderRel = existingRel || `${courseRel}/${item.folder}`;
    const id = existingRel ? index.folders[existingRel] : smuId(folderRel);
    await upsertPage({
      id,
      parentId: courseId,
      type: "page",
      title: item.title,
      icon: item.icon,
      sortOrder: item.sortOrder,
      overwriteContent: false,
      contentMd: `# ${item.title}\n\n${
        item.folder === "recess week"
          ? "Recess week — catch up, revise, or rest before Weeks 8–14.\n"
          : item.folder.startsWith("week ")
            ? `Materials for ${item.title}. Drop lecture files into the matching folder in Documents/SMU, then sync.\n`
            : `${item.title} materials for this course.\n`
      }`,
    });
    index.folders[folderRel] = id;
    created += 1;
  }

  const courseTitle = niceTitle(courseRel.split("/").pop() || "Course");
  const outline = [
    `# ${courseTitle}`,
    "",
    `Materials synced from \`${courseRel}\`.`,
    "",
    "Term structure (matches your SMU calendar):",
    "",
    "- Weeks 1–7",
    "- Recess Week",
    "- Weeks 8–14",
    "- Midterm · Finals prep · Project · Cheatsheet",
    "",
    "Drop files into the matching folder in Documents/SMU, then run **Sync SMU notes**.",
    "",
  ].join("\n");
  await upsertPage({
    id: courseId,
    title: courseTitle,
    icon: "📘",
    overwriteContent: true,
    contentMd: outline,
  });

  return created;
}

function shouldSkipFile(name: string) {
  const lower = name.toLowerCase();
  if (SKIP_NAMES.has(lower)) return true;
  if (lower.startsWith("~$") || lower.startsWith(".")) return true;
  const ext = path.extname(lower);
  if (SKIP_EXTS.has(ext)) return true;
  if (!BINARY_EXTS.has(ext) && !TEXT_EXTS.has(ext)) return true;
  return false;
}

function walkFiles(absDir: string, relBase = ""): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = [];
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
    const abs = path.join(absDir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walkFiles(abs, rel));
      continue;
    }
    if (!entry.isFile()) continue;
    if (shouldSkipFile(entry.name)) continue;
    out.push({ rel, abs });
  }
  return out;
}

async function loadIndex(): Promise<IndexFile> {
  try {
    return JSON.parse(await readFile(indexPath(), "utf8")) as IndexFile;
  } catch {
    return { root: "", syncedAt: "", folders: {}, files: {} };
  }
}

async function saveIndex(index: IndexFile) {
  await mkdir(path.dirname(indexPath()), { recursive: true });
  await writeFile(indexPath(), JSON.stringify(index, null, 2));
}

function parentDirs(rel: string) {
  const parts = rel.split("/").filter(Boolean);
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

export function smuNotesDir() {
  return process.env.SMU_NOTES_DIR || "/Users/matth/Documents/SMU";
}

export async function syncSmuNotes() {
  const root = smuNotesDir();
  if (!existsSync(root)) {
    throw new Error(`SMU folder not found: ${root}`);
  }

  const index = await loadIndex();
  index.root = root;

  const stats = {
    folders: 0,
    notes: 0,
    files: 0,
    updated: 0,
    skipped: 0,
    currentTerm: "Year 2 · Term 1",
  };

  const smu = await upsertPage({
    id: "smu",
    parentId: null,
    type: "course",
    title: "SMU",
    icon: "🎓",
    favorite: true,
    sortOrder: 0,
    overwriteContent: false,
    contentMd: `# SMU

Your private coursework vault. Synced from the SMU folder on this machine.

Use **Sync SMU notes** any time you add files to \`Documents/SMU\`.
`,
  });
  if (!smu) throw new Error("Could not create SMU page");
  index.folders[""] = smu.id;
  stats.folders += 1;

  const courseIndex: {
    semester: string;
    current: boolean;
    courses: { title: string; id: string }[];
  }[] = [];

  for (const sem of SEMESTERS) {
    const semAbs = path.join(root, sem.dir);
    if (!existsSync(semAbs)) continue;

    await upsertPage({
      id: sem.id,
      parentId: smu.id,
      type: "page",
      title: sem.title,
      icon: sem.icon,
      favorite: sem.current,
      sortOrder: sem.sortOrder,
      overwriteContent: false,
      contentMd: `# ${sem.title}

${sem.subtitle}${sem.current ? " — this is the term you are in now." : ""}

Drop new week files into the matching course folder in \`Documents/SMU\`, then sync.
`,
    });
    index.folders[sem.dir] = sem.id;
    stats.folders += 1;

    const courses: { title: string; id: string }[] = [];
    const courseDirs = readdirSync(semAbs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const course of courseDirs) {
      const courseRel = `${sem.dir}/${course.name}`;
      const courseId = smuId(courseRel);
      const title = niceTitle(course.name);
      await upsertPage({
        id: courseId,
        parentId: sem.id,
        type: "page",
        title,
        icon: "📘",
        favorite: sem.current,
        overwriteContent: false,
        contentMd: `# ${title}

Materials synced from \`${courseRel}\`.
`,
      });
      index.folders[courseRel] = courseId;
      stats.folders += 1;
      courses.push({ title, id: courseId });

      const walked = walkFiles(path.join(semAbs, course.name), courseRel);
      console.log(`SMU sync ${title}: ${walked.length} files`);
      const neededDirs = new Set<string>();
      for (const item of walked) {
        for (const dir of parentDirs(item.rel)) {
          if (dir !== sem.dir && dir !== courseRel) neededDirs.add(dir);
        }
      }
      const sortedDirs = [...neededDirs].sort(
        (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
      );
      for (const dir of sortedDirs) {
        const parts = dir.split("/");
        const name = parts[parts.length - 1];
        const parentRel = parts.slice(0, -1).join("/");
        const parentId = index.folders[parentRel] || courseId;
        const id = smuId(dir);
        const scaffold = scaffoldMatch(name);
        await upsertPage({
          id,
          parentId,
          type: "page",
          title: scaffold?.title || niceTitle(name),
          icon: scaffold?.icon || folderIcon(name),
          sortOrder: scaffold?.sortOrder,
          overwriteContent: false,
          contentMd: `# ${scaffold?.title || niceTitle(name)}\n`,
        });
        index.folders[dir] = id;
        stats.folders += 1;
      }

      stats.folders += await ensureCourseScaffold(courseId, courseRel, index);

      for (const item of walked) {
        try {
          const result = await importOne(item.abs, item.rel, index);
          if (result === "skip") stats.skipped += 1;
          else if (result === "update") stats.updated += 1;
          else if (result === "file") {
            stats.files += 1;
            stats.notes += 1;
          } else {
            stats.notes += 1;
          }
        } catch (error) {
          console.error("SMU skip", item.rel, error);
          stats.skipped += 1;
        }
      }
      await saveIndex(index);
    }
    courseIndex.push({ semester: sem.title, current: sem.current, courses });
  }

  const indexMd = buildIndexMarkdown(courseIndex);
  await upsertPage({
    id: "smu",
    parentId: null,
    type: "course",
    title: "SMU",
    icon: "🎓",
    favorite: true,
    sortOrder: 0,
    overwriteContent: true,
    contentMd: indexMd,
  });
  await connectFromMarkdown("smu", indexMd);

  index.syncedAt = new Date().toISOString();
  await saveIndex(index);
  return stats;
}

async function importOne(abs: string, rel: string, index: IndexFile) {
  const filename = path.basename(abs);
  const ext = path.extname(filename).toLowerCase();
  const parentRel = rel.split("/").slice(0, -1).join("/");
  const parentId = index.folders[parentRel];
  if (!parentId) return "skip" as const;

  let st;
  try {
    st = statSync(abs);
  } catch {
    return "skip" as const;
  }
  const prev = index.files[rel];
  if (prev && prev.mtime === st.mtimeMs && prev.size === st.size) {
    return "skip";
  }

  const title = decodeNoteTitle(noteTitleFromFilename(filename));
  const noteId = smuId(rel);
  const isBinary = BINARY_EXTS.has(ext);
  const tooBig = st.size > 80_000_000;

  let body = "";
  let fileId: string | undefined = prev?.fileId;

  if (tooBig) {
    body = `# ${title}\n\n_Large file kept on disk:_\n\n\`${abs}\`\n`;
  } else if (isBinary) {
    const bytes = Buffer.from(await readFile(abs));
    const stored = await addFileFromBytes(
      parentId,
      filename,
      bytes,
      mimeFromName(filename),
      prev?.fileId,
    );
    fileId = stored.id;
    const extracted = stored.extractedText || "";
    body = extracted.trim()
      ? heuristicMarkdown(title, extracted, filename)
      : `# ${title}\n\nOriginal file is attached (no text extracted — often a scan or a large deck).\n`;
    body += `\n\n---\nSource: [${filename}](/api/files/${stored.id})\n`;
  } else {
    const text = await readFile(abs, "utf8").catch(() => "");
    body = heuristicMarkdown(title, text, filename);
    body += `\n\n---\n_Synced from_ \`${rel}\`\n`;
  }
  body = cleanStudyMarkdown(body, title);

  await upsertPage({
    id: noteId,
    parentId,
    type: "page",
    title,
    icon: isBinary ? "📎" : "📝",
    contentMd: body,
    overwriteContent: true,
  });

  index.files[rel] = {
    pageId: parentId,
    fileId,
    noteId,
    mtime: st.mtimeMs,
    size: st.size,
  };
  return prev ? "update" : isBinary ? "file" : "note";
}

function buildIndexMarkdown(
  terms: { semester: string; current: boolean; courses: { title: string; id: string }[] }[],
) {
  const lines = [
    "# SMU",
    "",
    "Private coursework vault. Everything here is synced from your `Documents/SMU` folder — not uploaded through the browser.",
    "",
    "When you add week files later, run **Sync SMU notes** (command palette or the SMU page). Unchanged files are skipped; new and edited files are pulled in.",
    "",
  ];
  for (const term of terms) {
    lines.push(`## ${term.semester}${term.current ? " · current" : ""}`);
    lines.push("");
    if (!term.courses.length) {
      lines.push("_No courses in this folder yet._");
      lines.push("");
      continue;
    }
    for (const course of term.courses) {
      lines.push(`- [[${course.title}]]`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function reformatSmuNotes(input?: {
  ai?: boolean;
  currentTermOnly?: boolean;
  /** Override the default 24-call cap on AI polishing. */
  aiLimit?: number;
  /** Default true (matches historical behaviour): only AI-polish notes that
   * still look like a raw slide dump. Set false to polish every substantial
   * note in scope, not just obvious slide junk. */
  requireSlideLook?: boolean;
}) {
  const rootId = input?.currentTermOnly ? "smu-y2t1" : "smu";
  const ids = await listSubtreeIds(rootId);
  const rows = await listPagesByIds(ids);
  const y2ids = new Set(await listSubtreeIds("smu-y2t1"));
  const requireSlideLook = input?.requireSlideLook ?? true;
  let cleaned = 0;
  let polished = 0;
  let renamed = 0;
  let termsSaved = 0;
  let aiLeft = input?.ai === false ? 0 : (input?.aiLimit ?? 24);

  for (const row of rows) {
    if (row.id === "smu" || row.id.startsWith("smu-y")) continue;
    const title = decodeNoteTitle(row.title);
    const body = row.contentMd || "";
    const stub =
      body.replace(/^#\s.+\n*/m, "").replace(/\n---\n[\s\S]*$/, "").trim().length < 40;
    if (stub) {
      if (title !== row.title) {
        await updatePage(row.id, { title });
        renamed += 1;
      }
      continue;
    }
    let md = cleanStudyMarkdown(body, title);
    const sourceTail = body.match(/\n---\n[\s\S]*$/)?.[0] || "";
    const canAi =
      aiLeft > 0 &&
      y2ids.has(row.id) &&
      (!requireSlideLook || looksLikeSlides(body)) &&
      body.length > 400 &&
      hasAiKey();
    if (canAi) {
      try {
        const formatted = await formatNotesWithGlossary(title, md, "ai");
        md = formatted.markdown;
        polished += 1;
        aiLeft -= 1;
        if (formatted.terms.length) {
          await replaceGlossaryTerms(row.id, formatted.terms, {
            model: formatted.model || undefined,
          });
          termsSaved += formatted.terms.length;
        }
      } catch (error) {
        console.error("AI polish failed", row.id, error);
      }
    }
    if (sourceTail && !/\/api\/files\//.test(md)) {
      md = `${md.trimEnd()}\n${sourceTail}`;
    }
    if (md !== row.contentMd || title !== row.title) {
      await updatePage(row.id, { title, contentMd: md });
      cleaned += 1;
    }
  }
  return { cleaned, polished, renamed, termsSaved, scanned: rows.length };
}
