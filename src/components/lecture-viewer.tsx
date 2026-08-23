"use client";

import { useEffect, useState } from "react";
import { Copy, FileText, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isLectureDeck, mediaKind } from "@/lib/format";

type LecturePayload = {
  kind: string;
  filename: string;
  fileUrl: string;
  previewUrl: string;
  markdown: string;
  slideCount?: number;
};

export function LectureViewer({
  fileId,
  filename,
  mime,
  onSaveMarkdown,
}: {
  fileId: string;
  filename: string;
  mime: string;
  onSaveMarkdown?: (markdown: string) => void;
}) {
  const [data, setData] = useState<LecturePayload | null>(null);
  const [mode, setMode] = useState<"original" | "notes">("original");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setMode("original");
    void fetch(`/api/files/${fileId}/lecture`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load lecture");
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const kind = data?.kind || mediaKind(mime, filename);
  const isDeck = isLectureDeck(mime, filename) || kind === "pdf";

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {error}{" "}
        <a className="ml-1 underline" href={`/api/files/${fileId}`}>
          Download original
        </a>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading preview…
      </div>
    );
  }

  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.fileUrl}
        alt={filename}
        className="h-full w-full object-contain p-4"
      />
    );
  }
  if (kind === "video") {
    return (
      <video src={data.fileUrl} controls className="h-full w-full bg-black" />
    );
  }
  if (kind === "audio") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <audio src={data.fileUrl} controls className="w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-50">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1">
        <Button
          size="sm"
          variant={mode === "original" ? "secondary" : "ghost"}
          className="h-7 text-xs"
          onClick={() => setMode("original")}
        >
          <Presentation className="size-3.5" /> Original
        </Button>
        <Button
          size="sm"
          variant={mode === "notes" ? "secondary" : "ghost"}
          className="h-7 text-xs"
          onClick={() => setMode("notes")}
        >
          <FileText className="size-3.5" /> Notes
        </Button>
        <span className="ml-auto truncate text-[11px] text-zinc-400">
          {isDeck
            ? "PDF preview of the original file"
            : "Document preview"}
        </span>
      </div>

      {mode === "notes" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(data.markdown || "");
                toast.success("Copied markdown");
              }}
            >
              <Copy className="size-3.5" /> Copy
            </Button>
            {onSaveMarkdown && data.markdown && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Replace this note with markdown from the file?",
                    )
                  ) {
                    return;
                  }
                  onSaveMarkdown(data.markdown);
                }}
              >
                Use as notes
              </Button>
            )}
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-sans text-sm leading-relaxed text-zinc-100">
            {data.markdown || "No extractable text."}
          </pre>
        </div>
      ) : (
        <iframe
          title={filename}
          src={data.previewUrl || data.fileUrl}
          className="min-h-0 flex-1 bg-white"
        />
      )}
    </div>
  );
}
