"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KindBadge } from "@/components/kind-badge";
import { relativeTime } from "@/lib/format";
import type { QuizRecord } from "@/lib/types";

function scorePct(quiz: QuizRecord) {
  if (!quiz.lastTotal) return null;
  return Math.round(((quiz.lastScore || 0) / quiz.lastTotal) * 100);
}

export default function PracticePage() {
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);

  useEffect(() => {
    void fetch("/api/quizzes")
      .then((r) => r.json())
      .then((json) => setQuizzes(json.quizzes || []));
  }, []);

  const needsReview = quizzes
    .filter((q) => {
      const pct = scorePct(q);
      return pct !== null && pct < 70;
    })
    .sort((a, b) => (scorePct(a) ?? 0) - (scorePct(b) ?? 0));
  const needsReviewIds = new Set(needsReview.map((q) => q.id));
  const rest = quizzes.filter((q) => !needsReviewIds.has(q.id));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Practice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quizzes generated from a week pack, or ones you wrote yourself.
        </p>

        {needsReview.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-medium text-amber-600 dark:text-amber-400">
              Needs review — under 70% last time
            </h2>
            <ul className="divide-y rounded-xl border border-amber-500/30 bg-amber-500/5">
              {needsReview.map((quiz) => (
                <QuizRow key={quiz.id} quiz={quiz} />
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          {needsReview.length > 0 && (
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Everything else
            </h2>
          )}
          <ul className="divide-y rounded-xl border">
            {quizzes.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                No quizzes yet. Open a week page, upload materials, and hit
                Prepare this week.
              </li>
            )}
            {rest.map((quiz) => (
              <QuizRow key={quiz.id} quiz={quiz} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function QuizRow({ quiz }: { quiz: QuizRecord }) {
  const pct = scorePct(quiz);
  return (
    <li>
      <Link
        href={`/quiz/${quiz.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{quiz.title}</span>
            <KindBadge mix={quiz.mix} className="shrink-0" />
          </div>
          <div className="text-xs text-muted-foreground">
            {quiz.pageTitle} · {quiz.questionCount} questions
            {quiz.lastTotal
              ? ` · last ${quiz.lastScore}/${quiz.lastTotal} (${pct}%)`
              : ""}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {relativeTime(quiz.createdAt)}
        </span>
      </Link>
    </li>
  );
}
