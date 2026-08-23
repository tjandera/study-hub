"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type DumpResult = {
  folders: { id: string; title: string; noteCount: number; quizId?: string }[];
  moved: number;
  connections: number;
  quizzes: number;
  notes: number;
  files: number;
  model: string;
  usedAi: boolean;
  practices: string;
};

export function DumpPanel({
  pageId,
  onChanged,
}: {
  pageId: string;
  onChanged?: () => void;
}) {
  const [ai, setAi] = useState<boolean | null>(null);
  const [practices, setPractices] = useState("");
  const [last, setLast] = useState<DumpResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [quizzes, setQuizzes] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pages/${pageId}/dump`);
    if (!res.ok) return;
    const json = await res.json();
    setAi(Boolean(json.configured));
    setPractices(json.practices || "");
    setLast(json.last || null);
  }, [pageId]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const runDump = async (files?: FileList | File[]) => {
    if (busy) return;
    const list = files ? [...files] : [];
    if (!list.length && !pasteBody.trim()) {
      setBusy(true);
      const res = await fetch(`/api/pages/${pageId}/dump`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizzes }),
      });
      const json = await res.json();
      setBusy(false);
      if (!res.ok) {
        toast.error(json.error || "Could not organize notes");
        return;
      }
      setLast(json);
      toast.success(
        `Filed ${json.moved} notes into ${json.folders.length} topic folder${json.folders.length === 1 ? "" : "s"}`,
      );
      await load();
      onChanged?.();
      return;
    }

    const form = new FormData();
    form.set("quizzes", quizzes ? "1" : "0");
    form.set("organize", "1");
    for (const file of list) form.append("file", file);
    if (pasteBody.trim()) {
      form.set("pasteTitle", pasteTitle);
      form.set("pasteBody", pasteBody);
    }
    setBusy(true);
    const toastId = toast.loading("Dumping and organizing…");
    const res = await fetch(`/api/pages/${pageId}/dump`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Dump failed", { id: toastId });
      return;
    }
    setLast(json);
    setPasteTitle("");
    setPasteBody("");
    setPasteOpen(false);
    toast.success(
      json.folders?.length
        ? `Organized into ${json.folders.map((f: { title: string }) => f.title).join(", ")}`
        : "Dump saved",
      { id: toastId },
    );
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Dump</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Drop slides, notes, code, worksheets, or a textbook. Study Hub files
          them into topic folders, links related ideas, and can write practice
          quizzes.
        </p>
      </div>

      <div
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-3 py-6 text-center text-xs",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30",
          busy && "pointer-events-none opacity-60",
        )}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const list = e.dataTransfer?.files;
          if (list?.length) void runDump(list);
        }}
      >
        {busy ? (
          <Loader2 className="mb-2 size-5 animate-spin text-muted-foreground" />
        ) : (
          <Inbox className="mb-2 size-5 text-muted-foreground" />
        )}
        <p className="font-medium">
          {busy ? "Organizing…" : "Drop a knowledge dump"}
        </p>
        <p className="mt-1 text-muted-foreground">
          PDF, slides, Word, code, markdown, zip
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void runDump(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={quizzes}
          onChange={(e) => setQuizzes(e.target.checked)}
          className="size-3.5"
        />
        Generate practice quizzes
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => void runDump()}
          disabled={busy}
        >
          {busy ? "Working…" : "Organize notes"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPasteOpen((v) => !v)}
        >
          Paste text
        </Button>
      </div>

      {pasteOpen && (
        <div className="space-y-2">
          <Input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Note title"
          />
          <Textarea
            rows={6}
            value={pasteBody}
            onChange={(e) => setPasteBody(e.target.value)}
            placeholder="Paste notes, a worksheet, or a chapter…"
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={!pasteBody.trim() || busy}
            onClick={() => void runDump()}
          >
            Dump pasted notes
          </Button>
        </div>
      )}

      {ai === false && (
        <p className="text-xs text-muted-foreground">
          Add <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> in
          .env.local for topic clustering. Without it, files still extract and
          group by title overlap.
        </p>
      )}
      {ai === true && (
        <p className="text-xs text-muted-foreground">
          Gemini 3.5 Flash-Lite files the dump; Flash is only used for large
          mixed piles. Outlines go to the model, not whole textbooks.
        </p>
      )}

      {last && (
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Last dump
          </h4>
          <ul className="space-y-1">
            {last.folders.map((folder) => (
              <li key={folder.id} className="text-xs">
                <Link href={`/p/${folder.id}`} className="hover:underline">
                  {folder.title}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {folder.noteCount} notes
                  {folder.quizId ? " · quiz" : ""}
                </span>
                {folder.quizId && (
                  <>
                    {" "}
                    <Link
                      href={`/quiz/${folder.quizId}`}
                      className="text-muted-foreground hover:underline"
                    >
                      practice
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {last.connections} topic links · {last.model}
            {last.usedAi ? "" : " (local grouping)"}
          </p>
        </section>
      )}

      {practices && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Memory
          </h4>
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
            {practices
              .replace(/\*\*/g, "")
              .replace(/^\*\s+/gm, "• ")}
          </p>
        </section>
      )}
    </div>
  );
}
