import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { files } from "@/db/schema";
import { BUDGET, clip } from "@/lib/ai-budget";
import { generateJson, generateText, hasAiKey, MODELS } from "@/lib/gemini";
import { connectFromMarkdown } from "@/lib/graph";
import { loadPractices, sanitizeCorpus } from "@/lib/ai-memory";
import { cleanStudyMarkdown, decodeNoteTitle } from "@/lib/clean-notes";
import { isCodeFilename } from "@/lib/extract";
import { STUDY_HUB_FORMAT_GUIDE } from "@/lib/format-guide";
import { mediaKind, mediaMarkdown } from "@/lib/format";
import { replaceGlossaryTerms } from "@/lib/glossary";
import {
  createPage,
  getPage,
  listChildPages,
  listSubtreeIds,
  updatePage,
} from "@/lib/pages";

export function noteTitleFromFilename(filename: string) {
  return decodeNoteTitle(filename) || "Uploaded notes";
}

/** Token-efficient default: lite for typical decks; flash only for long corpora. */
export function noteFormatModel(chars: number) {
  return chars > 28_000 ? MODELS.flash : MODELS.lite;
}

function unwrapMarkdown(text: string) {
  return `${text
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()}\n`;
}

const CODE_LANG: Record<string, string> = {
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  cs: "csharp",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
};

function codeLanguage(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return CODE_LANG[ext] || ext;
}

export function heuristicMarkdown(title: string, text: string, filename = "") {
  const trimmed = text.trim();
  if (!trimmed) {
    return `# ${title}\n\n_No extractable text was found in this file._\n`;
  }
  if (isCodeFilename(filename) && !trimmed.startsWith("```")) {
    return `# ${title}\n\n\`\`\`${codeLanguage(filename)}\n${trimmed}\n\`\`\`\n`;
  }
  if (/^#\s/m.test(trimmed)) {
    const body = trimmed.startsWith("#") ? `${trimmed}\n` : `# ${title}\n\n${trimmed}\n`;
    return cleanStudyMarkdown(body, title);
  }
  return cleanStudyMarkdown(`# ${title}\n\n${trimmed}\n`, title);
}

export type FormattedNotes = {
  markdown: string;
  terms: { term: string; definition: string; aliases?: string[] }[];
  model: string | null;
};

export async function formatNotesMarkdown(
  title: string,
  extracted: string,
  formatMode: "ai" | "quick" = "ai",
  filename = "",
): Promise<string> {
  const result = await formatNotesWithGlossary(title, extracted, formatMode, filename);
  return result.markdown;
}

/**
 * One Gemini call → clean study Markdown + glossary terms.
 * Model: gemini-3.5-flash-lite for typical decks (cheapest accurate tier);
 * gemini-3.7-flash only when the extract is long.
 */
export async function formatNotesWithGlossary(
  title: string,
  extracted: string,
  formatMode: "ai" | "quick" = "ai",
  filename = "",
): Promise<FormattedNotes> {
  const fallback = heuristicMarkdown(title, extracted, filename);
  if (
    formatMode === "quick" ||
    !hasAiKey() ||
    extracted.trim().length < 40 ||
    isCodeFilename(filename)
  ) {
    return { markdown: fallback, terms: [], model: null };
  }
  const model = noteFormatModel(extracted.length);
  try {
    const practices = await loadPractices("workspace");
    const json = (await generateJson({
      model,
      maxTokens: BUDGET.textOut.format + BUDGET.textOut.glossary,
      system: `You convert lecture slides/PDFs/docs into a clean study pack.
Return JSON only:
{
  "markdown": "GitHub-flavored Markdown study notes",
  "terms": [{"term":"...","definition":"...","aliases":["..."]}]
}
Rules for markdown:
- Keep every fact from the source. Do not invent.
- Turn slide decks into a readable document (not one heading per tiny bullet).
${STUDY_HUB_FORMAT_GUIDE}
Rules for terms (max ${BUDGET.glossaryTerms}):
- Only course-relevant definitions a student would hover to understand.
- Short definitions (1–2 sentences), grounded in the source.
- Prefer nouns/phrases over full sentences as terms.${practices ? `\nFiling practices:\n${practices}` : ""}`,
      user: `Title: ${title}\nFilename: ${filename}\n\nEXTRACTED TEXT:\n${clip(sanitizeCorpus(extracted), BUDGET.noteFormatIn)}`,
    })) as {
      markdown?: string;
      terms?: { term?: string; definition?: string; aliases?: string[] }[];
    };
    const rawMd = unwrapMarkdown(String(json.markdown || ""));
    const markdown =
      rawMd.replace(/\s/g, "").length < 40
        ? fallback
        : cleanStudyMarkdown(
            rawMd.startsWith("#") ? rawMd : `# ${title}\n\n${rawMd}`,
            title,
          );
    const terms = normalizeTerms(json.terms).slice(0, BUDGET.glossaryTerms);
    // If the combined JSON call skipped terms, do a cheap terms-only pass.
    if (!terms.length && markdown.replace(/\s/g, "").length > 80) {
      const extra = await extractGlossaryTerms(title, markdown, model);
      return { markdown, terms: extra, model };
    }
    return { markdown, terms, model };
  } catch {
    try {
      const practices = await loadPractices("workspace");
      const md = await generateText({
        model,
        maxTokens: BUDGET.textOut.format,
        system: `You convert extracted lecture slides, PDFs, Word docs, and notes into a clean GitHub-flavored Markdown study document.
Keep every fact from the source. Do not invent.
Turn slide decks into a readable document (not one heading per tiny bullet if you can group them).

${STUDY_HUB_FORMAT_GUIDE}

Return markdown only — no wrapping fences.${practices ? `\nFollow these filing practices:\n${practices}` : ""}`,
        user: `Title: ${title}\n\nEXTRACTED TEXT:\n${clip(sanitizeCorpus(extracted), BUDGET.noteFormatIn)}`,
      });
      const out = unwrapMarkdown(md);
      if (out.replace(/\s/g, "").length < 40) {
        return { markdown: fallback, terms: [], model };
      }
      const titled = out.startsWith("#") ? out : `# ${title}\n\n${out}`;
      const markdown = cleanStudyMarkdown(titled, title);
      const terms = await extractGlossaryTerms(title, markdown, model);
      return { markdown, terms, model };
    } catch {
      return { markdown: fallback, terms: [], model: null };
    }
  }
}

function normalizeTerms(raw: unknown) {
  if (!Array.isArray(raw)) return [] as {
    term: string;
    definition: string;
    aliases: string[];
  }[];
  return raw
    .map((t) => {
      const row = t as {
        term?: string;
        definition?: string;
        aliases?: string[];
      };
      return {
        term: String(row.term || "").trim(),
        definition: String(row.definition || "").trim(),
        aliases: Array.isArray(row.aliases)
          ? row.aliases.map(String).filter(Boolean)
          : [],
      };
    })
    .filter((t) => t.term && t.definition && t.term.length < 80);
}

async function extractGlossaryTerms(
  title: string,
  markdown: string,
  model: string,
) {
  try {
    const json = (await generateJson({
      model: MODELS.lite,
      maxTokens: BUDGET.textOut.glossary,
      system: `Extract up to ${BUDGET.glossaryTerms} study glossary terms from the notes.
Return JSON: {"terms":[{"term":"...","definition":"...","aliases":["..."]}]}
Only include terms a student would hover to understand. Short definitions (1–2 sentences). Grounded in the notes — do not invent.
Put common abbreviations in aliases (e.g. term "Business Process Management", aliases ["BPM"]).`,
      user: `Title: ${title}\n\nNOTES:\n${clip(markdown, 6_000)}`,
    })) as { terms?: unknown };
    return normalizeTerms(json.terms).slice(0, BUDGET.glossaryTerms);
  } catch {
    return [];
  }
}

export async function ingestUploadedFile(input: {
  pageId: string;
  file: { id: string; filename: string; mime: string };
  extractedText: string;
  embedMedia?: boolean;
  formatMode?: "ai" | "quick";
}) {
  const kind = mediaKind(input.file.mime, input.file.filename);
  if (kind === "image" || kind === "video" || kind === "audio") {
    const snippet = mediaMarkdown(input.file);
    if (input.embedMedia) {
      const page = await getPage(input.pageId);
      if (page) {
        const next = page.contentMd.trim()
          ? `${page.contentMd.trim()}\n\n${snippet}\n`
          : `${snippet}\n`;
        await updatePage(input.pageId, { contentMd: next });
        await connectFromMarkdown(input.pageId, next);
      }
    }
    return { kind: "media" as const, markdown: snippet, noteId: input.pageId };
  }

  const title = noteTitleFromFilename(input.file.filename);
  const sourceLine = `Source: [${input.file.filename}](/api/files/${input.file.id})`;
  const alreadyMarkdown = /\.(md|markdown)$/i.test(input.file.filename);
  const formatted = await formatNotesWithGlossary(
    title,
    input.extractedText || `_Attached file with no extractable text._`,
    alreadyMarkdown ? "quick" : input.formatMode || "ai",
    input.file.filename,
  );
  const withSource = `${formatted.markdown.trim()}\n\n---\n${sourceLine}\n`;
  const kids = await listChildPages(input.pageId);
  const existing = kids.find((k) => k.title.toLowerCase() === title.toLowerCase());
  let noteId: string;
  if (existing) {
    const current = await getPage(existing.id);
    const rawSlides = (current?.contentMd.match(/^## Slide \d+/gm) || []).length;
    if (current && current.contentMd.length > 400 && rawSlides < 5) {
      noteId = existing.id;
    } else {
      await updatePage(existing.id, { contentMd: withSource });
      noteId = existing.id;
    }
  } else {
    const created = await createPage({
      parentId: input.pageId,
      title,
      icon: "📝",
      contentMd: withSource,
    });
    noteId = created.id;
  }
  if (formatted.terms.length) {
    await replaceGlossaryTerms(noteId, formatted.terms, {
      sourceFileId: input.file.id,
      model: formatted.model || undefined,
    });
  }
  await connectFromMarkdown(input.pageId, withSource);
  await connectFromMarkdown(noteId, withSource);
  return {
    kind: "note" as const,
    noteId,
    title,
    terms: formatted.terms.length,
    model: formatted.model,
  };
}

export async function ingestPageMaterials(
  pageId: string,
  formatMode: "ai" | "quick" = "ai",
) {
  const ids = await listSubtreeIds(pageId);
  const db = await getDb();
  const rows = ids.length
    ? await db.select().from(files).where(inArray(files.pageId, ids))
    : [];
  const seen = new Set<string>();
  const created: { noteId: string; title: string }[] = [];
  for (const row of rows) {
    if (seen.has(row.filename.toLowerCase())) continue;
    seen.add(row.filename.toLowerCase());
    const kind = mediaKind(row.mime, row.filename);
    if (kind === "image" || kind === "video" || kind === "audio") continue;
    const result = await ingestUploadedFile({
      pageId,
      file: { id: row.id, filename: row.filename, mime: row.mime },
      extractedText: row.extractedText || "",
      formatMode,
    });
    if (result.kind === "note" && result.noteId && result.title) {
      created.push({ noteId: result.noteId, title: result.title });
    }
  }
  return created;
}
