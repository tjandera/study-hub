"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DocumentView } from "@/components/document-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Topic = { title: string; source: string };

export function WorksheetPanel({ pageId }: { pageId: string }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [answers, setAnswers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ id: string; title: string; markdown: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/pages/${pageId}/worksheet`);
    if (!res.ok) return;
    const json = await res.json();
    setTopics(json.topics || []);
  }, [pageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (title: string) => {
    setPicked((all) =>
      all.includes(title) ? all.filter((t) => t !== title) : [...all, title].slice(0, 12),
    );
  };

  const generate = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    const res = await fetch(`/api/pages/${pageId}/worksheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topics: picked, includeAnswers: answers }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Could not generate worksheet");
      return;
    }
    setPreview({
      id: json.page.id,
      title: json.page.title,
      markdown: json.markdown,
    });
    toast.success("Worksheet ready");
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Worksheet</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick topics from this page’s notes. Gemini writes a practice sheet in Markdown.
        </p>
      </div>

      {topics.length === 0 ? (
        <p className="text-muted-foreground">
          Add notes or sync SMU materials first — topics show up here automatically.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {topics.map((topic) => {
            const on = picked.includes(topic.title);
            return (
              <li key={`${topic.source}-${topic.title}`}>
                <button
                  type="button"
                  onClick={() => toggle(topic.title)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted",
                    on && "bg-muted font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "size-3.5 rounded-sm border",
                      on ? "border-foreground bg-foreground" : "border-muted-foreground/40",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{topic.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={answers}
          onChange={(e) => setAnswers(e.target.checked)}
        />
        Include an answer key
      </label>

      <Button size="sm" className="w-full" onClick={() => void generate()} disabled={busy || !picked.length}>
        {busy ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Writing…
          </>
        ) : (
          <>
            <ClipboardList className="size-3.5" /> Generate worksheet
          </>
        )}
      </Button>

      {preview && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium">{preview.title}</p>
            <Button size="xs" variant="outline" asChild>
              <Link href={`/p/${preview.id}`}>Open</Link>
            </Button>
          </div>
          <div className="max-h-[28rem] overflow-y-auto rounded-lg border bg-background p-2">
            <DocumentView markdown={preview.markdown} />
          </div>
        </div>
      )}
    </div>
  );
}
