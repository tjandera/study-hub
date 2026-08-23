import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attempts, pages, questions, quizzes } from "@/db/schema";
import {
  generateKindQuiz,
  generateWeekPack,
  hasAiKey,
  regenerateMixedQuestions,
} from "@/lib/ai";
import { KIND_META, isMaterialKind } from "@/lib/kinds";
import { gatherWeekCorpus } from "@/lib/corpus";
import { reextractEmptyFiles } from "@/lib/files";
import { iso, newId } from "@/lib/ids";
import { ingestPageMaterials } from "@/lib/ingest";
import { createPage, listChildPages, updatePage } from "@/lib/pages";
import { fallbackPack } from "@/lib/quiz-fallback";
import { saveGraph } from "@/lib/graph";
import { indexPage } from "@/lib/rag";
import type {
  GradedItem,
  QuestionDraft,
  QuestionRecord,
  QuizRecord,
  MaterialKind,
  QuestionType,
} from "@/lib/types";

function parseOptions(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.map(String) : null;
  } catch {
    return null;
  }
}

function toQuestion(row: typeof questions.$inferSelect): QuestionRecord {
  return {
    id: row.id,
    quizId: row.quizId,
    type: row.type as QuestionType,
    kind: (row.kind as MaterialKind) || "theory",
    style: (row.style as QuestionDraft["style"]) || "theoretical",
    prompt: row.prompt,
    options: parseOptions(row.options),
    answer: row.answer,
    explanation: row.explanation || "",
    source: row.source || "",
    sortOrder: row.sortOrder,
  };
}

export async function listQuizzes(pageId?: string): Promise<QuizRecord[]> {
  const db = await getDb();
  const rows = pageId
    ? await db
        .select({
          id: quizzes.id,
          pageId: quizzes.pageId,
          title: quizzes.title,
          mix: quizzes.mix,
          createdAt: quizzes.createdAt,
          pageTitle: pages.title,
        })
        .from(quizzes)
        .innerJoin(pages, eq(pages.id, quizzes.pageId))
        .where(
          and(
            eq(quizzes.pageId, pageId),
            eq(quizzes.archived, false),
            eq(pages.archived, false),
          ),
        )
        .orderBy(desc(quizzes.createdAt))
    : await db
        .select({
          id: quizzes.id,
          pageId: quizzes.pageId,
          title: quizzes.title,
          mix: quizzes.mix,
          createdAt: quizzes.createdAt,
          pageTitle: pages.title,
        })
        .from(quizzes)
        .innerJoin(pages, eq(pages.id, quizzes.pageId))
        // A quiz whose page was deleted should not linger in Practice.
        .where(and(eq(quizzes.archived, false), eq(pages.archived, false)))
        .orderBy(desc(quizzes.createdAt));

  const out: QuizRecord[] = [];
  for (const row of rows) {
    const qs = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.quizId, row.id));
    const [last] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.quizId, row.id))
      .orderBy(desc(attempts.createdAt))
      .limit(1);
    out.push({
      id: row.id,
      pageId: row.pageId,
      pageTitle: row.pageTitle,
      title: row.title,
      mix: row.mix,
      createdAt: iso(row.createdAt),
      questionCount: qs.length,
      lastScore: last?.score ?? null,
      lastTotal: last?.total ?? null,
    });
  }
  return out;
}

export async function getQuiz(id: string, includeAnswers = false) {
  const db = await getDb();
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  if (!quiz || quiz.archived) return null;
  const [page] = await db
    .select({ title: pages.title })
    .from(pages)
    .where(eq(pages.id, quiz.pageId))
    .limit(1);
  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, id));
  qs.sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    quiz: {
      id: quiz.id,
      pageId: quiz.pageId,
      pageTitle: page?.title,
      title: quiz.title,
      mix: quiz.mix,
      createdAt: iso(quiz.createdAt),
      questionCount: qs.length,
    } satisfies QuizRecord,
    questions: qs.map((q) => {
      const full = toQuestion(q);
      if (includeAnswers) return full;
      const { answer: _a, explanation: _e, ...rest } = full;
      return { ...rest, answer: "", explanation: "" };
    }),
  };
}

export async function saveQuiz(input: {
  pageId: string;
  title: string;
  mix?: string;
  drafts: QuestionDraft[];
}) {
  const db = await getDb();
  const id = newId();
  const now = new Date();
  const mix =
    input.mix ||
    (input.drafts.some((d) => d.kind !== input.drafts[0]?.kind)
      ? "mixed"
      : input.drafts[0]?.kind || "mixed");
  await db.insert(quizzes).values({
    id,
    pageId: input.pageId,
    title: input.title,
    mix,
    createdAt: now,
  });
  let order = 0;
  for (const draft of input.drafts) {
    await db.insert(questions).values({
      id: newId(),
      quizId: id,
      type: draft.type,
      kind: draft.kind,
      prompt: draft.prompt,
      options: draft.options ? JSON.stringify(draft.options) : null,
      answer: draft.answer,
      explanation: draft.explanation || null,
      sortOrder: order,
      style: draft.style || "theoretical",
      source: draft.source || null,
    });
    order += 1;
  }
  return getQuiz(id, true);
}

// Soft delete — keeps attempts/history around and lets a mis-click be undone,
// instead of permanently destroying a quiz someone may have already scored.
export async function deleteQuiz(id: string) {
  const db = await getDb();
  await db.update(quizzes).set({ archived: true }).where(eq(quizzes.id, id));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function mathMatch(given: string, expected: string) {
  if (normalize(given) === normalize(expected)) return true;
  const num = (s: string) => {
    const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    return m ? Number(m[0]) : NaN;
  };
  const a = num(given);
  const b = num(expected);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
  }
  return false;
}

function codeMatch(given: string, expected: string) {
  const strip = (s: string) =>
    s
      .replace(/\/\/.*$/gm, "")
      .replace(/#.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  return strip(given) === strip(expected) || normalize(given) === normalize(expected);
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "is", "are", "and", "or", "that", "this",
  "it", "its", "for", "on", "with", "as", "by", "be", "was", "were", "from",
  "at", "which", "when", "you", "your", "their", "they", "can", "will",
]);

function contentWords(value: string) {
  return normalize(value)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

/**
 * Short answers are typed prose, so exact string equality marks almost every
 * correct answer wrong. Accept a response that carries essentially all the
 * content words of the key. Long keys are left strict: they are passages, not
 * answers, and loose matching there would pass anything.
 */
function shortMatch(given: string, expected: string) {
  if (normalize(given) === normalize(expected)) return true;
  const key = contentWords(expected);
  if (!key.length || key.length > 12) return false;
  const said = new Set(contentWords(given));
  const hits = key.filter((w) => said.has(w)).length;
  return hits / key.length >= 0.8;
}

function clozeMatch(given: string, expected: string) {
  const g = normalize(given);
  const e = normalize(expected);
  if (g === e) return true;
  return e.length >= 3 && g.includes(e);
}

export function gradeAnswer(
  type: QuestionType,
  given: string,
  expected: string,
) {
  if (!given.trim()) return false;
  if (type === "mcq") return normalize(given) === normalize(expected);
  if (type === "math") return mathMatch(given, expected);
  if (type === "code") return codeMatch(given, expected);
  if (type === "cloze") return clozeMatch(given, expected);
  return shortMatch(given, expected);
}

export async function submitAttempt(
  quizId: string,
  answers: Record<string, string>,
) {
  const loaded = await getQuiz(quizId, true);
  if (!loaded) throw new Error("Quiz not found");
  const review: GradedItem[] = loaded.questions.map((q) => {
    const given = answers[q.id] ?? "";
    return {
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      kind: q.kind,
      options: q.options || null,
      given,
      answer: q.answer,
      explanation: q.explanation || null,
      correct: gradeAnswer(q.type, given, q.answer),
    };
  });
  const score = review.filter((r) => r.correct).length;
  const db = await getDb();
  const id = newId();
  await db.insert(attempts).values({
    id,
    quizId,
    score,
    total: review.length,
    answers: JSON.stringify(answers),
    createdAt: new Date(),
  });
  return { attemptId: id, score, total: review.length, review };
}

async function packForPage(pageId: string) {
  const corpus = await gatherWeekCorpus(pageId);
  if (!corpus.combined.trim()) {
    throw new Error("Nothing to study yet. Add notes or upload files first.");
  }
  if (hasAiKey()) {
    try {
      return {
        corpus,
        pack: await generateWeekPack({
          pageId,
          title: corpus.title,
          counts: corpus.counts,
        }),
        usedAi: true,
        aiError: undefined as string | undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== "NO_KEY") {
        console.error("Gemini prepare failed, using local pack", error);
      }
      await indexPage(pageId);
      const local = fallbackPack({
        title: corpus.title,
        chunks: corpus.chunks,
        counts: corpus.counts,
      });
      return { corpus, pack: local, usedAi: false, aiError: message };
    }
  }
  await indexPage(pageId);
  const local = fallbackPack({
    title: corpus.title,
    chunks: corpus.chunks,
    counts: corpus.counts,
  });
  return { corpus, pack: local, usedAi: false };
}

export async function prepareWeek(pageId: string) {
  await reextractEmptyFiles(pageId);
  await ingestPageMaterials(pageId);
  const { corpus, pack, usedAi, aiError } = await packForPage(pageId);
  const digestTitle = `${corpus.title} digest`;
  const kids = await listChildPages(pageId);
  const existing = kids.find(
    (k) => k.title.toLowerCase() === digestTitle.toLowerCase(),
  );
  const md = pack.digestMd;
  let digestId = existing?.id;
  if (existing) {
    await updatePage(existing.id, { contentMd: md });
  } else {
    const created = await createPage({
      parentId: pageId,
      title: digestTitle,
      icon: "🧭",
      contentMd: md,
    });
    digestId = created.id;
  }
  if (pack.graph) await saveGraph(pageId, pack.graph);

  const quiz = await saveQuiz({
    pageId,
    title: `${corpus.title} practice`,
    mix: "mixed",
    drafts: pack.questions,
  });

  return {
    usedAi,
    model: pack.model,
    counts: corpus.counts,
    sources: corpus.chunks.length,
    digestId,
    quiz: quiz?.quiz,
    questionCount: quiz?.questions.length || 0,
    coverage: pack.questions.length,
    aiError,
  };
}

export async function generateQuizForPage(pageId: string) {
  await reextractEmptyFiles(pageId);
  const { corpus, pack } = await packForPage(pageId);
  return saveQuiz({
    pageId,
    title: `${corpus.title} quiz`,
    mix: "mixed",
    drafts: pack.questions,
  });
}

export async function generateKindQuizForPage(
  pageId: string,
  kind: MaterialKind,
  opts?: { avoid?: string[]; titleSuffix?: string },
) {
  await reextractEmptyFiles(pageId);
  await ingestPageMaterials(pageId);
  const corpus = await gatherWeekCorpus(pageId);
  if (!corpus.combined.trim()) {
    throw new Error("Nothing to study yet. Add notes or upload files first.");
  }
  const result = await generateKindQuiz({
    pageId,
    title: corpus.title,
    counts: corpus.counts,
    kind,
    avoid: opts?.avoid,
  });
  if (!result.questions.length) {
    throw new Error(
      `No ${KIND_META[kind].label.toLowerCase()} questions could be built from this page's materials yet.`,
    );
  }
  const saved = await saveQuiz({
    pageId,
    title: `${corpus.title} ${KIND_META[kind].label.toLowerCase()} quiz${opts?.titleSuffix || ""}`,
    mix: kind,
    drafts: result.questions,
  });
  return { ...saved, matched: result.matched, usedAi: result.usedAi };
}

/**
 * Build a fresh question set for an existing quiz from the page's current
 * materials, explicitly avoiding the questions it already asked. The old
 * quiz is archived rather than deleted so past attempts stay intact.
 */
export async function regenerateQuiz(quizId: string) {
  const existing = await getQuiz(quizId, true);
  if (!existing) throw new Error("Quiz not found");

  const pageId = existing.quiz.pageId;
  const avoid = existing.questions.map((q) => q.prompt);
  const mix = existing.quiz.mix;
  const baseTitle = existing.quiz.title.replace(/\s*\(v\d+\)$/, "");
  const version =
    Number(existing.quiz.title.match(/\(v(\d+)\)$/)?.[1] || 1) + 1;

  await reextractEmptyFiles(pageId);
  await ingestPageMaterials(pageId);
  const corpus = await gatherWeekCorpus(pageId);
  if (!corpus.combined.trim()) {
    throw new Error("Nothing to study yet. Add notes or upload files first.");
  }

  const questions = isMaterialKind(mix)
    ? (
        await generateKindQuiz({
          pageId,
          title: corpus.title,
          counts: corpus.counts,
          kind: mix,
          avoid,
        })
      ).questions
    : await regenerateMixedQuestions({
        pageId,
        title: corpus.title,
        counts: corpus.counts,
        avoid,
      });

  if (!questions.length) {
    throw new Error(
      "Could not build new questions — add more material, then try again.",
    );
  }

  const saved = await saveQuiz({
    pageId,
    title: `${baseTitle} (v${version})`,
    mix,
    drafts: questions,
  });
  const db = await getDb();
  await db
    .update(quizzes)
    .set({ archived: true })
    .where(eq(quizzes.id, quizId));
  return saved;
}

export { hasAiKey };

export async function createManualQuiz(
  pageId: string,
  title: string,
  drafts: QuestionDraft[],
) {
  if (!drafts.length) throw new Error("Add at least one question");
  return saveQuiz({ pageId, title: title || "Custom quiz", drafts });
}

export async function listAttempts(quizId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(attempts)
    .where(eq(attempts.quizId, quizId))
    .orderBy(desc(attempts.createdAt));
  return rows.map((row) => ({
    id: row.id,
    quizId: row.quizId,
    score: row.score,
    total: row.total,
    createdAt: iso(row.createdAt),
  }));
}
