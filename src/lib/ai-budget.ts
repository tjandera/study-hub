/** Character budgets for Gemini calls. ~4 chars ≈ 1 token. */

export const BUDGET = {
  noteFormatIn: 10_000,
  dumpOutlineItem: 420,
  dumpClusterIn: 7_000,
  dumpMemory: 1_200,
  digestChunks: 8_000,
  digestSession: 1_800,
  chatPage: 1_600,
  chatHistoryMsgs: 6,
  chatHistoryChars: 600,
  chatChunk: 500,
  chatChunks: 4,
  quizChunk: 700,
  quizGroups: 2,
  quizGroupSize: 3,
  corpusChunk: 8_000,
  jsonOut: {
    dump: 2_048,
    format: 4_096,
    quiz: 5_120,
    digest: 6_144,
    chat: 2_048,
    memory: 768,
  },
  textOut: {
    format: 4_096,
    chat: 2_048,
    memory: 768,
    glossary: 2_560,
  },
  /** Max glossary terms to extract per note (keeps JSON cheap). */
  glossaryTerms: 14,
} as const;

export function clip(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function extractOutline(text: string) {
  const headings = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)]
    .map((m) => m[1].replace(/\[\[|\]\]/g, "").trim())
    .filter((h) => h.length > 1 && h.length < 80 && !/^slide\s+\d+/i.test(h))
    .slice(0, 8);
  const excerpt = text
    .replace(/^#.+\n/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { headings, excerpt: clip(excerpt, 360) };
}

export function looksRawSlides(text: string) {
  return (text.match(/^## Slide \d+/gm) || []).length >= 5;
}
