import type { MaterialKind, QuestionDraft } from "@/lib/types";
import type { CorpusChunk } from "@/lib/corpus";
import { outlineToMarkdown } from "@/lib/corpus";
import { graphFromText } from "@/lib/graph";

function take<T>(arr: T[], n: number) {
  return arr.slice(0, n);
}

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function fallbackPack(input: {
  title: string;
  chunks: CorpusChunk[];
  counts: Record<MaterialKind, number>;
  count?: number;
}) {
  const questions: QuestionDraft[] = [];
  const theory: string[] = [];
  const math: string[] = [];
  const code: string[] = [];

  for (const chunk of input.chunks) {
    const headings = [...chunk.text.matchAll(/^#{1,3}\s+(.+)$/gm)].map(
      (m) => m[1].trim(),
    );
    const bucket =
      chunk.kind === "math" ? math : chunk.kind === "code" ? code : theory;
    headings.forEach((h) => {
      if (h.length > 3 && h.length < 80) bucket.push(`${h} (${chunk.source})`);
    });

    const defs = [
      ...chunk.text.matchAll(
        /\*\*([^*]{3,60})\*\*\s+(?:is|are|means)\s+([^\n.]{8,160})/gi,
      ),
    ];
    for (const def of defs) {
      questions.push({
        type: "cloze",
        kind: chunk.kind,
        style: "theoretical",
        source: chunk.source,
        prompt: `Fill in: ${def[1]} is ______`,
        answer: def[2].trim(),
        explanation: `From ${chunk.source}.`,
      });
    }

    // Blank out an identifier from a real snippet: unlike "explain this
    // code", it has one right answer that can actually be graded.
    const fences = [...chunk.text.matchAll(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g)];
    for (const fence of take(fences, 3)) {
      const snippet = fence[1].trim().slice(0, 500);
      if (snippet.length < 20) continue;
      const ident = snippet.match(
        /\b(?:def|function|class|fn)\s+([A-Za-z_][A-Za-z0-9_]*)/,
      );
      if (!ident) continue;
      questions.push({
        type: "cloze",
        kind: "code",
        style: "situational",
        source: chunk.source,
        prompt: `In this snippet, what is the name of the definition on the highlighted line?\n\n\`\`\`\n${snippet.replace(ident[1], "______")}\n\`\`\``,
        answer: ident[1],
        explanation: `Defined in ${chunk.source}.`,
      });
    }

    const eqs = [
      ...chunk.text.matchAll(/([A-Za-z][A-Za-z0-9_\\]*)\s*=\s*([^\n]{3,80})/g),
    ];
    for (const eq of take(eqs, 2)) {
      questions.push({
        type: "math",
        kind: "math",
        style: "theoretical",
        source: chunk.source,
        prompt: `From the notes, what is ${eq[1]} equal to?`,
        answer: eq[2].trim(),
        explanation: `From ${chunk.source}.`,
      });
    }

    // Cloze the most distinctive term out of a paragraph. Open-ended
    // "explain this passage" prompts are deliberately not generated here:
    // their only possible answer key is the passage itself, which exact
    // match grading can never accept.
    const paras = chunk.text
      .split(/\n{2,}/)
      .map((p) => p.replace(/^#{1,6}\s+/gm, "").trim())
      .filter((p) => p.length > 40 && !p.startsWith("```"));
    for (const para of take(paras, 2)) {
      const term =
        para.match(/\*\*([^*]{3,40})\*\*/)?.[1] ||
        para.match(/\b([A-Z][a-z]{3,}(?:\s[A-Z][a-z]{3,})+)\b/)?.[1];
      if (!term) continue;
      const blanked = para.slice(0, 320).replace(term, "______");
      if (!blanked.includes("______")) continue;
      questions.push({
        type: "cloze",
        kind: chunk.kind,
        style: "theoretical",
        source: chunk.source,
        prompt: `Fill in the blank:\n\n${blanked}`,
        answer: term,
        explanation: `From ${chunk.source}.`,
      });
    }

    if (headings[0]) {
      const distractors = shuffle(
        headings.filter((h) => h !== headings[0]),
      ).slice(0, 3);
      if (distractors.length === 3) {
        const options = shuffle([headings[0], ...distractors]);
        questions.push({
          type: "mcq",
          kind: chunk.kind,
          style: "theoretical",
          source: chunk.source,
          prompt: `Which topic is discussed in ${chunk.source}?`,
          options,
          answer: headings[0],
          explanation: `${chunk.source} opens with this heading.`,
        });
      } else {
        questions.push({
          type: "cloze",
          kind: chunk.kind,
          style: "theoretical",
          source: chunk.source,
          prompt: `Name the section of ${chunk.source} that opens with: "${headings[0].slice(0, 60)}"`,
          answer: headings[0],
          explanation: `From ${chunk.source}.`,
        });
      }
    }
  }

  const unique = new Map<string, QuestionDraft>();
  for (const q of questions) {
    const key = q.prompt.slice(0, 120);
    if (!unique.has(key)) unique.set(key, q);
  }
  const picked = take([...unique.values()], 80);
  if (!picked.length) {
    picked.push({
      type: "short",
      kind: "theory",
      style: "theoretical",
      prompt: `What is the main idea of ${input.title}?`,
      answer: "Add more notes or files, then generate again.",
      explanation: "Need more source text to build a real quiz.",
    });
  }

  const summary = `Sorted ${input.chunks.length} sources from ${input.title}: ${input.counts.theory} theory, ${input.counts.math} math, ${input.counts.code} code.`;
  const digestMd = outlineToMarkdown(input.title, {
    summary,
    theory: take(theory, 16),
    math: take(math, 16),
    code: take(code, 16),
  });
  return {
    summary,
    theory: take(theory, 16),
    math: take(math, 16),
    code: take(code, 16),
    questions: picked,
    digestMd,
    graph: graphFromText(digestMd),
    model: "local",
  };
}
