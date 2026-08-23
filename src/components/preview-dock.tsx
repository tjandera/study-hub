"use client";

import { X } from "lucide-react";
import { LectureViewer } from "@/components/lecture-viewer";
import { Button } from "@/components/ui/button";
import { isPreviewable, prettyFilename } from "@/lib/format";
import type { FileRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PreviewDock({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCloseAll,
  onSaveMarkdown,
}: {
  tabs: FileRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
  onSaveMarkdown?: (markdown: string) => void;
}) {
  const active = tabs.find((tab) => tab.id === activeId) || tabs[0];
  if (!active) return null;

  return (
    <div className="absolute inset-0 z-30 flex min-w-0 flex-col border-r bg-background @[48rem]/shell:static @[48rem]/shell:w-[min(52%,42rem)] @[48rem]/shell:min-w-[22rem]">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-1">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "group flex h-7 max-w-44 shrink-0 items-center rounded-md pl-2 pr-1 text-xs",
                tab.id === active.id
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              <button
                type="button"
                className="min-w-0 truncate py-1 text-left"
                onClick={() => onSelect(tab.id)}
              >
                {prettyFilename(tab.filename)}
              </button>
              <button
                type="button"
                className="ml-0.5 rounded p-1 hover:bg-black/10 dark:hover:bg-white/10"
                aria-label={`Close ${tab.filename}`}
                onClick={() => onClose(tab.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onCloseAll}
          aria-label="Close preview"
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {isPreviewable(active.mime, active.filename) ? (
          <LectureViewer
            key={active.id}
            fileId={active.id}
            filename={active.filename}
            mime={active.mime}
            onSaveMarkdown={onSaveMarkdown}
          />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            No in-app preview for this file type.{" "}
            <a className="underline" href={`/api/files/${active.id}`}>
              Download original
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
