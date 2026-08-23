"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { markdownToHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function StudyChat({ pageId }: { pageId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await fetch(`/api/pages/${pageId}/chat`);
    const json = await res.json();
    setMessages(json.messages || []);
  };

  useEffect(() => {
    void load();
  }, [pageId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setMessages((all) => [...all, { id: "local-user", role: "user", content: text }]);
    const res = await fetch(`/api/pages/${pageId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Chat failed");
      await load();
      return;
    }
    setSources(json.sources || []);
    await load();
  };

  return (
    <div className="flex h-full min-h-80 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Ask your notes</h3>
          <p className="text-xs text-muted-foreground">
            Gemini answers only from this page’s materials.
          </p>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={async () => {
            await fetch(`/api/pages/${pageId}/chat`, { method: "DELETE" });
            setMessages([]);
            setSources([]);
          }}
          aria-label="Clear chat"
        >
          <Trash2 />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm">
        {messages.length === 0 && (
          <p className="text-muted-foreground">
            Ask a question about the slides, digest, or anything you uploaded here.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "rounded-xl px-3 py-2",
              msg.role === "user"
                ? "ml-6 whitespace-pre-wrap bg-primary text-primary-foreground"
                : "chat-md mr-6 bg-background",
            )}
          >
            {msg.role === "assistant" ? (
              <AssistantBody text={msg.content} />
            ) : (
              msg.content
            )}
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
        <div ref={bottom} />
      </div>
      {sources.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Sources: {sources.slice(0, 4).join(" · ")}
        </p>
      )}
      <div className="mt-2 flex items-end gap-2">
        <Textarea
          rows={2}
          value={draft}
          placeholder="What is business–IT alignment?"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button size="icon" onClick={() => void send()} disabled={busy || !draft.trim()}>
          <Send />
        </Button>
      </div>
    </div>
  );
}

function AssistantBody({ text }: { text: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let cancelled = false;
    void markdownToHtml(text).then((value) => {
      if (!cancelled) setHtml(value);
    });
    return () => {
      cancelled = true;
    };
  }, [text]);
  if (!html) return <div className="whitespace-pre-wrap">{text}</div>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
