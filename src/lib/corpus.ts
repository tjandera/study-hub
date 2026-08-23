import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { files } from "@/db/schema";
import { isCodeFilename, isMathFilename } from "@/lib/extract";
import {
  getPage,
  listPagesByIds,
  listSubtreeIds,
} from "@/lib/pages";
import type { MaterialKind } from "@/lib/types";

export type CorpusChunk = {
  source: string;
  kind: MaterialKind;
  text: string;
};

export type WeekCorpus = {
  pageId: string;
  title: string;
  chunks: CorpusChunk[];
  combined: string;
  counts: Record<MaterialKind, number>;
};

export function classifyText(text: string, filename = ""): MaterialKind {
  if (isCodeFilename(filename)) return "code";
  if (isMathFilename(filename)) return "math";
  const sample = text.slice(0, 4000);
  // Every counter needs the /g flag: without it String.match returns a single
  // match array (length 1) and the >= 3 threshold can never be reached.
  const fences = (sample.match(/```/g) || []).length;
  const codeHits =
    fences * 2 +
    (
      sample.match(
        /\b(?:def|function|class|import|return|public static|console\.log|let mut|fn)\b|=>|;\s*$/gm,
      ) || []
    ).length;
  const mathHits = (
    sample.match(
      /\\frac|\\sum|\\int|∫|∑|√|≤|≥|\bdx\b|theorem|lemma|prove that|= *\d|x\^2|matrix/gi,
    ) || []
  ).length;
  if (codeHits >= 3 && codeHits >= mathHits) return "code";
  if (mathHits >= 3) return "math";
  return "theory";
}

export async function gatherWeekCorpus(pageId: string): Promise<WeekCorpus> {
  const root = await getPage(pageId);
  if (!root) throw new Error("Page not found");
  const ids = await listSubtreeIds(pageId);
  const pageRows = await listPagesByIds(ids);
  const db = await getDb();
  const fileRows = ids.length
    ? await db.select().from(files).where(inArray(files.pageId, ids))
    : [];

  const chunks: CorpusChunk[] = [];
  for (const page of pageRows) {
    if (/\bdigest$/i.test(page.title)) continue;
    const text = page.contentMd?.trim();
    if (!text) continue;
    chunks.push({
      source: `Note: ${page.title}`,
      kind: classifyText(text, page.title),
      text: text.slice(0, 8_000),
    });
  }
  for (const file of fileRows) {
    const text = file.extractedText?.trim();
    if (!text) continue;
    const stem = file.filename
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase();
    if (
      pageRows.some(
        (page) =>
          page.title.toLowerCase() === stem && (page.contentMd || "").length > 200,
      )
    ) {
      continue;
    }
    chunks.push({
      source: `File: ${file.filename}`,
      kind: classifyText(text, file.filename),
      text: text.slice(0, 8_000),
    });
  }

  const counts: Record<MaterialKind, number> = {
    theory: 0,
    math: 0,
    code: 0,
  };
  for (const chunk of chunks) counts[chunk.kind] += 1;

  const combined = chunks
    .map(
      (chunk) =>
        `### ${chunk.source} [${chunk.kind}]\n${chunk.text}`,
    )
    .join("\n\n")
    .slice(0, 24_000);

  return { pageId, title: root.title, chunks, combined, counts };
}

export function outlineToMarkdown(
  title: string,
  outline: {
    summary: string;
    theory: string[];
    math: string[];
    code: string[];
  },
) {
  const list = (items: string[]) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : "- None found";
  return `# ${title} digest

${outline.summary}

## Theory
${list(outline.theory)}

## Math
${list(outline.math)}

## Code
${list(outline.code)}
`;
}
