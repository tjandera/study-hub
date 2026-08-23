import "server-only";

import { generateText, hasAiKey, MODELS } from "@/lib/gemini";
import { sanitizeCorpus } from "@/lib/ai-memory";
import { gatherWeekCorpus } from "@/lib/corpus";
import { loadGraph } from "@/lib/graph";
import { createPage, getPage, listChildPages, listSubtreeIds, listPagesByIds } from "@/lib/pages";
import { formatChunks, retrieve } from "@/lib/rag";
import { parseWikiTitles } from "@/lib/wiki";

export type WorksheetTopic = {
  title: string;
  source: "graph" | "page" | "heading";
};

export async function listWorksheetTopics(pageId: string): Promise<WorksheetTopic[]> {
  const page = await getPage(pageId);
  if (!page) return [];
  const [graph, children, ids] = await Promise.all([
    loadGraph(pageId),
    listChildPages(pageId),
    listSubtreeIds(pageId),
  ]);
  const subtree = await listPagesByIds(ids);
  const seen = new Set<string>();
  const out: WorksheetTopic[] = [];
  const add = (title: string, source: WorksheetTopic["source"]) => {
    const clean = title.trim().replace(/\[\[|\]\]/g, "");
    const key = clean.toLowerCase();
    if (!key || key.length < 3 || key.length > 72 || seen.has(key)) return;
    if (/^slide\s+\d+/i.test(clean)) return;
    if (/\.(pdf|pptx?|docx?|xlsx?|html?)$/i.test(clean)) return;
    if (/%20|[a-f0-9]{20,}/i.test(clean)) return;
    if (/^(week|project|cheatsheet|cheasheet|info|extra)\b/i.test(clean) && clean.length < 12) {
      return;
    }
    seen.add(key);
    out.push({ title: clean, source });
  };
  for (const node of graph.nodes) add(node.title, "graph");
  for (const child of children) add(child.title, "page");
  for (const p of subtree.slice(0, 120)) {
    add(p.title, "page");
    for (const heading of p.contentMd.matchAll(/^#{1,3}\s+(.+)$/gm)) {
      const title = heading[1].replace(/\[\[|\]\]/g, "").trim();
      if (title && !/^slide\s+\d+/i.test(title)) add(title, "heading");
    }
    for (const wiki of parseWikiTitles(p.contentMd)) add(wiki, "graph");
  }
  return out.slice(0, 80);
}

export async function generateWorksheet(input: {
  pageId: string;
  topics: string[];
  includeAnswers?: boolean;
}) {
  const page = await getPage(input.pageId);
  if (!page) throw new Error("Page not found");
  const topics = [...new Set(input.topics.map((t) => t.trim()).filter(Boolean))].slice(
    0,
    12,
  );
  if (!topics.length) throw new Error("Pick at least one topic");

  const corpus = await gatherWeekCorpus(input.pageId);
  const snippets: string[] = [];
  for (const topic of topics) {
    const hits = await retrieve(input.pageId, topic, 4);
    if (hits.length) snippets.push(`### ${topic}\n${formatChunks(hits)}`);
  }
  if (!snippets.length && corpus.combined) {
    snippets.push(sanitizeCorpus(corpus.combined).slice(0, 18_000));
  }

  const title = `Worksheet · ${topics.slice(0, 3).join(", ")}`;
  let markdown: string;

  if (hasAiKey() && snippets.join("").length > 80) {
    markdown = await generateText({
      model: MODELS.lite,
      system: `You write a clean exam-style worksheet in GitHub-flavored Markdown for a university student.
Use ONLY the supplied notes. Do not invent facts or citations.
Structure:
# title
A one-line instruction.
## Warm-up
3-5 short questions.
## Core
6-10 mixed questions (short answer, applied scenario, and if the notes have code/SQL/math, include those).
Number every question.
${input.includeAnswers ? "## Answer key\nBrief answers keyed to question numbers." : "Do NOT include an answer key."}
Keep the page readable: headings, lists, fenced code. No preamble.`,
      user: `Course page: ${page.title}
Topics: ${topics.join("; ")}

NOTES:
${snippets.join("\n\n").slice(0, 24_000)}`,
    });
    markdown = markdown
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (!markdown.startsWith("#")) markdown = `# ${title}\n\n${markdown}`;
  } else {
    markdown = fallbackWorksheet(title, topics, snippets.join("\n"));
  }

  const created = await createPage({
    parentId: input.pageId,
    title,
    icon: "🧾",
    contentMd: markdown.endsWith("\n") ? markdown : `${markdown}\n`,
  });
  return { page: created, markdown };
}

function fallbackWorksheet(title: string, topics: string[], notes: string) {
  const paras = notes
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s+/gm, "").trim())
    .filter((p) => p.length > 40)
    .slice(0, 8);
  const lines = [
    `# ${title}`,
    "",
    `Practice these topics: ${topics.join(", ")}. Write answers in your own words before checking notes.`,
    "",
    "## Warm-up",
    "",
  ];
  topics.forEach((topic, i) => {
    lines.push(`${i + 1}. In one or two sentences, what is **${topic}**?`);
  });
  lines.push("", "## Core", "");
  paras.forEach((para, i) => {
    lines.push(
      `${topics.length + i + 1}. Using this excerpt, explain the idea and give one situation where you would apply it.\n\n> ${para.slice(0, 280).replace(/\n/g, " ")}`,
      "",
    );
  });
  return `${lines.join("\n")}\n`;
}
