"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace-provider";
import { KindBadge, KindIcon } from "@/components/kind-badge";
import { KIND_META, KIND_ORDER } from "@/lib/kinds";
import type { MaterialKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QuestionDraft, QuestionType, QuizRecord } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function WeekPack({
  pageId,
  onUploaded,
}: {
  pageId: string;
  onUploaded: (
    files: FileList | File[],
    opts?: { formatMode?: "ai" | "quick" },
  ) => Promise<unknown> | void;
}) {
  const router = useRouter();
  const { createPage } = useWorkspace();
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState<
    "prepare" | "generate" | MaterialKind | null
  >(null);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [builder, setBuilder] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [quickConvert, setQuickConvert] = useState(false);

  const load = async () => {
    const [q, status] = await Promise.all([
      fetch(`/api/pages/${pageId}/quizzes`).then((r) => r.json()),
      fetch("/api/ai/status").then((r) => r.json()),
    ]);
    setQuizzes(q.quizzes || []);
    setAi(Boolean(status.configured));
  };

  useEffect(() => {
    void load();
  }, [pageId]);

  const prepare = async () => {
    setBusy("prepare");
    const res = await fetch(`/api/pages/${pageId}/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast.error(json.error || "Prepare failed");
      return;
    }
    toast.success(
      json.usedAi
        ? `Covered ${json.sources} sources with ${json.questionCount} questions (${json.model || "gemini"})`
        : json.aiError
          ? `Built ${json.questionCount} local questions (Gemini: ${String(json.aiError).slice(0, 80)})`
          : `Built ${json.questionCount} questions from your files.`,
    );
    await load();
    if (json.quiz?.id) router.push(`/quiz/${json.quiz.id}`);
  };

  const generate = async () => {
    setBusy("generate");
    const res = await fetch(`/api/pages/${pageId}/quizzes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "generate" }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast.error(json.error || "Could not generate quiz");
      return;
    }
    toast.success("Quiz ready");
    await load();
    if (json.quiz?.id) router.push(`/quiz/${json.quiz.id}`);
  };

  const generateKind = async (kind: MaterialKind) => {
    setBusy(kind);
    const res = await fetch(`/api/pages/${pageId}/quizzes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: kind }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast.error(json.error || "Could not generate quiz");
      return;
    }
    const meta = KIND_META[kind];
    toast.success(
      json.matched === 0
        ? `${meta.label} quiz ready — no ${meta.label.toLowerCase()} material detected, so questions were drawn from the rest of the page.`
        : `${meta.label} quiz ready — ${meta.blurb.toLowerCase()}`,
    );
    await load();
    if (json.quiz?.id) router.push(`/quiz/${json.quiz.id}`);
  };

  const regenerate = async (quizId: string) => {
    setRegenId(quizId);
    const res = await fetch(`/api/quizzes/${quizId}/regenerate`, {
      method: "POST",
    });
    const json = await res.json();
    setRegenId(null);
    if (!res.ok) {
      toast.error(json.error || "Could not regenerate quiz");
      return;
    }
    toast.success("Fresh questions from your current materials");
    await load();
    if (json.quiz?.id) router.push(`/quiz/${json.quiz.id}`);
  };

  return (
    <section className="mb-8 rounded-2xl border bg-muted/20 p-4 @[48rem]/shell:mb-10 @[48rem]/shell:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Week pack & quizzes</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Dump this week’s slides, problem sets, and code. Prepare indexes them
            (RAG), links ideas, and writes enough theoretical + situational
            questions to cover the material.
          </p>
          {!ai && (
            <p className="mt-2 text-xs text-muted-foreground">
              Gemini is not loaded. Put{" "}
              <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> in
              <code className="rounded bg-muted px-1">.env.local</code> (not
              .env.example) and restart — cheapest model is gemini-3.5-flash-lite.
            </p>
          )}
          {ai && (
            <p className="mt-2 text-xs text-muted-foreground">
              Gemini is on. Uploaded slides, PDFs, and docs are extracted, turned
              into Markdown notes, then used for quizzes and chat.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border bg-background px-2.5 text-sm">
            Upload week files
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files)
                  void onUploaded(e.target.files, {
                    formatMode: quickConvert ? "quick" : "ai",
                  });
                e.target.value = "";
              }}
            />
          </label>
          <label className="inline-flex h-8 items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={quickConvert}
              onChange={(e) => setQuickConvert(e.target.checked)}
              className="size-3.5"
            />
            Quick convert (no AI)
          </label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPasteOpen(true)}
          >
            Paste markdown
          </Button>
          <Button
            size="sm"
            onClick={() => void prepare()}
            disabled={busy !== null}
          >
            {busy === "prepare" ? "Preparing…" : "Prepare this week"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void generate()}
            disabled={busy !== null}
          >
            {busy === "generate" ? "Generating…" : "Generate quiz"}
          </Button>
          {KIND_ORDER.map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant="outline"
              onClick={() => void generateKind(kind)}
              disabled={busy !== null}
              title={KIND_META[kind].blurb}
            >
              <KindIcon kind={kind} className="size-3.5" />
              {busy === kind ? "Generating…" : KIND_META[kind].label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setBuilder(true)}>
            Write a quiz
          </Button>
        </div>
      </div>

      {quizzes.length > 0 && (
        <ul className="mt-4 divide-y rounded-xl border bg-background">
          {quizzes.map((quiz) => (
            <li
              key={quiz.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{quiz.title}</span>
                  <KindBadge mix={quiz.mix} className="shrink-0" />
                </div>
                <div className="text-xs text-muted-foreground">
                  {quiz.questionCount} questions ·{" "}
                  {relativeTime(quiz.createdAt)}
                  {quiz.lastTotal
                    ? ` · last ${quiz.lastScore}/${quiz.lastTotal}`
                    : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void regenerate(quiz.id)}
                disabled={regenId !== null}
                title="Write a new set of questions from your current materials"
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    regenId === quiz.id && "animate-spin",
                  )}
                />
                {regenId === quiz.id ? "Regenerating…" : "Regenerate"}
              </Button>
              <Button size="sm" asChild>
                <Link href={`/quiz/${quiz.id}`}>Practice</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ManualBuilder
        open={builder}
        onOpenChange={setBuilder}
        pageId={pageId}
        onCreated={async (id) => {
          await load();
          router.push(`/quiz/${id}`);
        }}
      />

      <PasteMarkdown
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onCreate={async (title, contentMd) => {
          const page = await createPage({
            parentId: pageId,
            title: title || "Untitled",
            contentMd,
          });
          setPasteOpen(false);
          router.push(`/p/${page.id}`);
        }}
      />
    </section>
  );
}

function PasteMarkdown({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string, contentMd: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paste markdown</DialogTitle>
          <DialogDescription>
            Already have notes as Markdown? Paste them straight in — saved
            as-is, no AI formatting, no upload round-trip.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
        />
        <Textarea
          rows={12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"# Heading\n\nYour markdown here…"}
          className="font-mono text-sm"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!body.trim() || busy}
            onClick={async () => {
              setBusy(true);
              await onCreate(title.trim(), body);
              setBusy(false);
              setTitle("");
              setBody("");
            }}
          >
            {busy ? "Creating…" : "Create note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyQuestion(): QuestionDraft {
  return {
    type: "mcq",
    kind: "theory",
    prompt: "",
    options: ["", "", "", ""],
    answer: "",
    explanation: "",
  };
}

function ManualBuilder({
  open,
  onOpenChange,
  pageId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("Custom quiz");
  const [items, setItems] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const drafts = items
      .map((item) => ({
        ...item,
        options: item.type === "mcq" ? item.options?.filter(Boolean) : null,
      }))
      .filter((item) => item.prompt.trim() && item.answer.trim());
    setBusy(true);
    const res = await fetch(`/api/pages/${pageId}/quizzes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual", title, questions: drafts }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Could not save quiz");
      return;
    }
    onOpenChange(false);
    onCreated(json.quiz.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Write a quiz</DialogTitle>
          <DialogDescription>
            MCQ, short answer, cloze, math, or code. Mix them in one quiz.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quiz title"
        />
        <div className="space-y-4">
          {items.map((item, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex gap-2">
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={item.type}
                  onChange={(e) => {
                    const type = e.target.value as QuestionType;
                    setItems((all) =>
                      all.map((q, idx) =>
                        idx === i
                          ? {
                              ...q,
                              type,
                              options: type === "mcq" ? q.options || ["", "", "", ""] : null,
                            }
                          : q,
                      ),
                    );
                  }}
                >
                  <option value="mcq">Multiple choice</option>
                  <option value="short">Short answer</option>
                  <option value="cloze">Fill in the blank</option>
                  <option value="math">Math</option>
                  <option value="code">Coding</option>
                </select>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={item.kind}
                  onChange={(e) =>
                    setItems((all) =>
                      all.map((q, idx) =>
                        idx === i ? { ...q, kind: e.target.value as QuestionDraft["kind"] } : q,
                      ),
                    )
                  }
                >
                  <option value="theory">Theory</option>
                  <option value="math">Math</option>
                  <option value="code">Code</option>
                </select>
              </div>
              <Textarea
                rows={3}
                placeholder="Question"
                value={item.prompt}
                onChange={(e) =>
                  setItems((all) =>
                    all.map((q, idx) =>
                      idx === i ? { ...q, prompt: e.target.value } : q,
                    ),
                  )
                }
              />
              {item.type === "mcq" &&
                (item.options || ["", "", "", ""]).map((opt, oi) => (
                  <Input
                    key={oi}
                    value={opt}
                    placeholder={`Option ${oi + 1}`}
                    onChange={(e) =>
                      setItems((all) =>
                        all.map((q, idx) => {
                          if (idx !== i) return q;
                          const options = [...(q.options || ["", "", "", ""])];
                          options[oi] = e.target.value;
                          return { ...q, options };
                        }),
                      )
                    }
                  />
                ))}
              <Input
                placeholder="Correct answer"
                value={item.answer}
                onChange={(e) =>
                  setItems((all) =>
                    all.map((q, idx) =>
                      idx === i ? { ...q, answer: e.target.value } : q,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setItems((all) => [...all, emptyQuestion()])}
        >
          Add question
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save quiz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
