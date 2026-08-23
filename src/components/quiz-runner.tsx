"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { KindBadge } from "@/components/kind-badge";
import type { GradedItem, QuestionRecord, QuizRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function QuizRunner({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizRecord | null>(null);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [review, setReview] = useState<GradedItem[] | null>(null);
  const [score, setScore] = useState<{ score: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/quizzes/${quizId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Quiz not found");
        return;
      }
      setQuiz(json.quiz);
      setQuestions(json.questions || []);
    })();
  }, [quizId]);

  const current = questions[index];

  const regenerate = async () => {
    setRegenerating(true);
    const res = await fetch(`/api/quizzes/${quizId}/regenerate`, {
      method: "POST",
    });
    const json = await res.json();
    setRegenerating(false);
    if (!res.ok) {
      toast.error(json.error || "Could not regenerate quiz");
      return;
    }
    toast.success("Fresh questions from your current materials");
    router.push(`/quiz/${json.quiz.id}`);
  };

  const retryMissed = async () => {
    if (!quiz || !review) return;
    const missed = review.filter((r) => !r.correct);
    if (!missed.length) return;
    setRetrying(true);
    const res = await fetch(`/api/pages/${quiz.pageId}/quizzes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "manual",
        title: `${quiz.title} — retry missed`,
        questions: missed.map((m) => ({
          type: m.type,
          kind: m.kind,
          style: "theoretical",
          prompt: m.prompt,
          options: m.options,
          answer: m.answer,
          explanation: m.explanation || "",
        })),
      }),
    });
    const json = await res.json();
    setRetrying(false);
    if (!res.ok) {
      toast.error(json.error || "Could not build a retry quiz");
      return;
    }
    router.push(`/quiz/${json.quiz.id}`);
  };

  const submit = async () => {
    setBusy(true);
    const res = await fetch(`/api/quizzes/${quizId}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not grade");
      return;
    }
    setScore({ score: json.score, total: json.total });
    setReview(json.review);
  };

  useEffect(() => {
    if (review) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA") return;
      e.preventDefault();
      if (index < questions.length - 1) setIndex((i) => i + 1);
      else void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, index, questions.length]);

  if (error && !quiz) {
    return <p className="p-8 text-sm text-destructive">{error}</p>;
  }
  if (!quiz || !current) {
    return <div className="p-8 text-sm text-muted-foreground">Loading quiz…</div>;
  }

  if (review && score) {
    return (
      <div className="page-pad mx-auto w-full max-w-3xl">
        <p className="text-sm text-muted-foreground">{quiz.pageTitle}</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{quiz.title}</h1>
          <KindBadge mix={quiz.mix} />
        </div>
        <p className="mt-3 text-lg">
          {score.score} / {score.total} correct
        </p>
        <div className="mt-8 space-y-4">
          {review.map((item, i) => (
            <article
              key={item.id}
              className={cn(
                "rounded-xl border p-4",
                item.correct
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-destructive/40 bg-destructive/5",
              )}
            >
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <span>
                  Q{i + 1} · {item.kind} · {item.type}
                </span>
                <span>{item.correct ? "Correct" : "Wrong"}</span>
              </div>
              <PromptBody text={item.prompt} />
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">Your answer: </span>
                {item.given || "—"}
              </p>
              {!item.correct && (
                <p className="mt-1 text-sm">
                  <span className="text-muted-foreground">Expected: </span>
                  {item.answer}
                </p>
              )}
              {item.explanation && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.explanation}
                </p>
              )}
            </article>
          ))}
        </div>
        <div className="mt-8 flex gap-2">
          <Button
            onClick={() => {
              setReview(null);
              setScore(null);
              setIndex(0);
              setAnswers({});
            }}
          >
            Try again
          </Button>
          {review.some((r) => !r.correct) && (
            <Button
              variant="outline"
              onClick={() => void retryMissed()}
              disabled={retrying}
            >
              {retrying
                ? "Building…"
                : `Retry ${review.filter((r) => !r.correct).length} missed`}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => void regenerate()}
            disabled={regenerating}
            title="Write a brand-new set of questions from your current materials"
          >
            <RefreshCw
              className={cn("size-3.5", regenerating && "animate-spin")}
            />
            {regenerating ? "Regenerating…" : "New questions"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/p/${quiz.pageId}`}>Back to notes</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-pad mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <p className="text-sm text-muted-foreground">{quiz.pageTitle}</p>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{quiz.title}</h1>
        <KindBadge mix={quiz.mix} />
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-foreground"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>
      <p className="mt-2 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>
          Question {index + 1} of {questions.length} · {current.kind} ·{" "}
          {current.style || "theoretical"} · {current.type}
        </span>
        <span className="normal-case tracking-normal opacity-60">
          Press Enter ↵
        </span>
      </p>
      <div className="mt-6">
        <PromptBody text={current.prompt} />
      </div>
      <div className="mt-6">
        <AnswerInput
          question={current}
          value={answers[current.id] || ""}
          onChange={(value) =>
            setAnswers((prev) => ({ ...prev, [current.id]: value }))
          }
        />
      </div>
      <div className="mt-8 flex flex-wrap gap-2 pb-[env(safe-area-inset-bottom)]">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          Back
        </Button>
        {index < questions.length - 1 ? (
          <Button className="min-h-11" onClick={() => setIndex((i) => i + 1)}>
            Continue
          </Button>
        ) : (
          <Button className="min-h-11" onClick={() => void submit()} disabled={busy}>
            {busy ? "Grading…" : "Submit quiz"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PromptBody({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-3 text-[15px] leading-7">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const inner = part.replace(/^```[a-zA-Z0-9]*\n?/, "").replace(/```$/, "");
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm"
            >
              {inner}
            </pre>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {part}
          </p>
        );
      })}
    </div>
  );
}

function AnswerInput({
  question,
  value,
  onChange,
}: {
  question: QuestionRecord;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.type === "mcq" && question.options?.length) {
    return (
      <div className="space-y-2">
        {question.options.map((option) => (
          <label
            key={option}
            className={cn(
              "flex min-h-12 cursor-pointer items-start gap-2 rounded-lg border px-3 py-3 text-sm",
              value === option && "border-foreground bg-muted/60",
            )}
          >
            <input
              type="radio"
              name={question.id}
              checked={value === option}
              onChange={() => onChange(option)}
              className="mt-1"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }
  if (question.type === "code" || question.type === "short") {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={question.type === "code" ? 8 : 4}
        className={question.type === "code" ? "font-mono" : ""}
        placeholder="Your answer"
      />
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.type === "math" ? "Number, expression, or short proof" : "Answer"}
      className={question.type === "math" ? "font-mono" : ""}
    />
  );
}
