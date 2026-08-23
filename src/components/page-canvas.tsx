"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  File as FileIcon,
  FileText,
  PanelRight,
  Paperclip,
  Pencil,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { NoteEditor } from "@/components/note-editor";
import { WeekPack } from "@/components/week-pack";
import { DocumentView } from "@/components/document-view";
import { ConnectionsRail } from "@/components/connections-rail";
import { PreviewDock } from "@/components/preview-dock";
import { PageActionsMenu } from "@/components/page-actions-menu";
import { useWorkspace } from "@/components/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ICONS, INBOX_ID } from "@/lib/constants";
import { formatBytes, isPreviewable, prettyFilename } from "@/lib/format";
import type { FileRecord, PageRecord, PageTreeNode } from "@/lib/types";
import { TEMPLATE_OPTIONS, type TemplateKey } from "@/lib/templates";
import { cn } from "@/lib/utils";

function guessMimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return "image/*";
  if (/\.(mp4|webm|mov)$/.test(lower)) return "video/*";
  if (/\.(mp3|wav|m4a)$/.test(lower)) return "audio/*";
  return "application/octet-stream";
}

export function PageCanvas({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { refresh, createPage } = useWorkspace();
  const [page, setPage] = useState<PageRecord | null>(null);
  const [crumbs, setCrumbs] = useState<PageTreeNode[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [previewTabs, setPreviewTabs] = useState<FileRecord[]>([]);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [showRail, setShowRail] = useState(true);
  const [mobileTools, setMobileTools] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "idle">("idle");
  const [tagDraft, setTagDraft] = useState("");
  const skipSave = useRef(true);
  const [docView, setDocView] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  const load = useCallback(async () => {
    const [pageRes, fileRes] = await Promise.all([
      fetch(`/api/pages/${pageId}`),
      fetch(`/api/files?pageId=${pageId}`),
    ]);
    if (pageRes.status === 404) {
      setPage(null);
      return;
    }
    const pageJson = await pageRes.json();
    setPage(pageJson.page);
    setCrumbs(pageJson.breadcrumbs || []);
    const title = String(pageJson.page?.title || "");
    setDocView(/digest|exam sheet|reading/i.test(title));
    const fileJson = await fileRes.json();
    setFiles(fileJson.files || []);
  }, [pageId]);

  useEffect(() => {
    skipSave.current = true;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const patch = async (body: Record<string, unknown>, silent = false) => {
    if (!silent) setSaveState("saving");
    const res = await fetch(`/api/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Save failed");
      setSaveState("idle");
      return;
    }
    setPage(json.page);
    if (!silent) {
      setSaveState("saved");
      await refresh();
    }
  };

  useEffect(() => {
    if (!page) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setSaveState("saving");
        await fetch(`/api/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentMd: page.contentMd }),
        });
        setSaveState("saved");
      })();
    }, 700);
    return () => clearTimeout(t);
  }, [page?.contentMd, pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (
    list: FileList | File[],
    opts?: { embedMedia?: boolean; formatMode?: "ai" | "quick" },
  ): Promise<FileRecord[]> => {
    const form = new FormData();
    form.set("pageId", pageId);
    if (opts?.embedMedia === false) form.set("embedMedia", "0");
    if (opts?.formatMode === "quick") form.set("formatMode", "quick");
    for (const file of [...list]) form.append("file", file);
    const toastId = toast.loading(
      opts?.formatMode === "quick" ? "Uploading…" : "Uploading and formatting…",
    );
    const res = await fetch("/api/files", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Upload failed", { id: toastId });
      return [];
    }
    const incoming = (json.files || []) as FileRecord[];
    setFiles((prev) =>
      [...incoming, ...prev].filter(
        (f, i, arr) => arr.findIndex((x) => x.id === f.id) === i,
      ),
    );
    const notes = (json.notes || []) as { title: string }[];
    const imports = (json.imports || []) as {
      filename: string;
      notes: number;
      files: number;
      pages: number;
    }[];
    const extracted = incoming.filter((f) => (f.extractedChars || 0) > 0).length;
    const parts: string[] = [];
    if (incoming.length) {
      parts.push(
        notes.length
          ? `Saved ${incoming.length} file${incoming.length === 1 ? "" : "s"} and formatted ${notes.map((n) => n.title).join(", ")}`
          : extracted
            ? `Saved ${incoming.length} file${incoming.length === 1 ? "" : "s"} (${extracted} with extracted text)`
            : `Saved ${incoming.length} file${incoming.length === 1 ? "" : "s"}`,
      );
    }
    for (const imp of imports) {
      parts.push(
        `Imported ${imp.filename}: ${imp.pages} pages, ${imp.notes} notes, ${imp.files} files`,
      );
    }
    if (!parts.length) parts.push("Nothing to upload");
    toast.success(parts.join(" · "), { id: toastId });
    const first = incoming[0];
    if (first && isPreviewable(first.mime, first.filename)) {
      openPreview(first);
    }
    await refresh();
    await load();
    return incoming;
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const list = event.dataTransfer?.files;
    if (list && list.length) await upload(list);
  };

  // Notes reference their source file with a plain markdown link
  // (`Source: [name](/api/files/id)`). Intercept clicks on those so they
  // open in the split-view pane — like viewing the original slides/PDF
  // right next to the note — instead of navigating the tab away.
  const handleContentClick = (event: React.MouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!href) return;
    const match = href.match(/^\/api\/files\/([^/?#]+)/);
    if (!match) return;
    event.preventDefault();
    const id = match[1];
    const known = files.find((f) => f.id === id);
    openPreview(
      known || {
        id,
        pageId,
        filename: link?.textContent?.trim() || "file",
        mime: guessMimeFromName(link?.textContent || ""),
        size: 0,
        createdAt: new Date().toISOString(),
      },
    );
  };

  const openPreview = (file: FileRecord) => {
    setPreviewTabs((prev) =>
      prev.some((tab) => tab.id === file.id) ? prev : [...prev, file],
    );
    setActivePreview(file.id);
    setShowRail(false);
  };

  const closePreview = (id: string) => {
    setPreviewTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== id);
      setActivePreview((current) => {
        if (current !== id) return current;
        return next[next.length - 1]?.id || null;
      });
      return next;
    });
  };

  const addTag = async () => {
    const name = tagDraft.trim();
    if (!name || !page) return;
    const tags = [...new Set([...page.tags, name])];
    setTagDraft("");
    await patch({ tags });
  };

  if (!page) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Page not found.
      </div>
    );
  }

  const headings = [...page.contentMd.matchAll(/^#{1,3}\s+(.+)$/gm)].map(
    (m) => m[1],
  );

  return (
    <div
      className="relative flex min-h-0 flex-1"
      onDragEnter={(e) => {
        if (!e.dataTransfer?.types.includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types.includes("Files")) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer?.types.includes("Files")) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-4 border-dashed border-primary bg-primary/10">
          <p className="rounded-lg bg-background px-4 py-2 text-sm font-medium shadow-lg">
            Drop to upload — zips import as pages, everything else attaches and
            formats
          </p>
        </div>
      )}
      {previewTabs.length > 0 && (
        <PreviewDock
          tabs={previewTabs}
          activeId={activePreview}
          onSelect={setActivePreview}
          onClose={closePreview}
          onCloseAll={() => {
            setPreviewTabs([]);
            setActivePreview(null);
          }}
          onSaveMarkdown={(markdown) => {
            const source = page.contentMd.match(/\n---\n[\s\S]*$/)?.[0] || "";
            setPage({
              ...page,
              contentMd: `${markdown.trim()}${source ? `\n${source.trim()}\n` : "\n"}`,
            });
            toast.success("Note replaced with lecture markdown");
          }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-1 border-b px-3">
          <div className="flex min-w-0 flex-1 items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="size-3 shrink-0" />}
                <Link
                  href={`/p/${c.id}`}
                  className="truncate hover:text-foreground"
                >
                  {c.icon} {c.title}
                </Link>
              </span>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : ""}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void patch({ favorite: !page.favorite })}
            aria-label="Favorite"
          >
            <Star
              className={cn(
                "size-4",
                page.favorite && "fill-amber-400 text-amber-500",
              )}
            />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="min-h-10 min-w-10 @[64rem]/shell:hidden"
            onClick={() => setMobileTools(true)}
            aria-label="Open tools"
          >
            <PanelRight />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="hidden @[64rem]/shell:inline-flex"
            onClick={() => setShowRail((v) => !v)}
            aria-label="Toggle details"
          >
            <PanelRight />
          </Button>
          {page.id !== INBOX_ID && (
            <PageActionsMenu page={page} onRefresh={load} />
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="page-pad mx-auto w-full max-w-3xl">
            <button
              type="button"
              className="mb-2 text-5xl leading-none"
              onClick={() => {
                const idx = ICONS.indexOf(page.icon as (typeof ICONS)[number]);
                const next = ICONS[(idx + 1) % ICONS.length];
                void patch({ icon: next });
              }}
              aria-label="Change icon"
            >
              {page.icon || "📄"}
            </button>
            <input
              value={page.title}
              onChange={(e) =>
                setPage({ ...page, title: e.target.value })
              }
              onBlur={() => void patch({ title: page.title })}
              className="w-full border-none bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50 @[48rem]/shell:text-4xl"
              placeholder="Untitled"
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {page.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() =>
                    void patch({
                      tags: page.tags.filter((t) => t !== tag),
                    })
                  }
                >
                  #{tag}
                </Badge>
              ))}
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addTag();
                  }
                }}
                placeholder="Add tag"
                className="h-7 w-28"
              />
              {page.type === "course" && (
                <select
                  className="h-7 rounded-md border bg-background px-2 text-xs"
                  defaultValue=""
                  onChange={async (e) => {
                    const template = e.target.value as TemplateKey;
                    if (!template) return;
                    const created = await createPage({
                      parentId: page.id,
                      template,
                    });
                    router.push(`/p/${created.id}`);
                  }}
                >
                  <option value="">Add from template</option>
                  {TEMPLATE_OPTIONS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-8">
              <WeekPack
                pageId={page.id}
                onUploaded={(list, opts) => upload(list, opts)}
              />
              <div className="mb-3 flex gap-2">
                <Button
                  size="sm"
                  variant={docView ? "outline" : "default"}
                  onClick={() => setDocView(false)}
                >
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant={docView ? "default" : "outline"}
                  onClick={() => setDocView(true)}
                >
                  <FileText className="size-3.5" /> Document
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const blob = new Blob([page.contentMd], {
                      type: "text/markdown",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${page.title}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download .md
                </Button>
              </div>
              <div data-page-id={page.id} onClickCapture={handleContentClick}>
                {docView ? (
                  <DocumentView pageId={page.id} markdown={page.contentMd} />
                ) : (
                  <NoteEditor
                    key={page.id}
                    pageId={page.id}
                    contentMd={page.contentMd}
                    onChange={(contentMd) => setPage({ ...page, contentMd })}
                    onUploadFiles={(list) => upload(list, { embedMedia: false })}
                  />
                )}
              </div>
            </div>

            <section className="mt-12 border-t pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">Files</h2>
                <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <Paperclip className="size-4" />
                  Attach
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) void upload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {files.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Drop PDFs or images onto the page, or attach them here.
                </p>
              )}
              <ul className="space-y-1">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <FileIcon className="size-4 text-muted-foreground" />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left"
                      onClick={() => {
                        if (isPreviewable(file.mime, file.filename)) openPreview(file);
                        else window.open(`/api/files/${file.id}`, "_blank");
                      }}
                    >
                      {prettyFilename(file.filename)}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                      {(file.extractedChars || 0) > 0
                        ? ` · ${file.extractedChars} chars`
                        : ""}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={async () => {
                        await fetch(`/api/files/${file.id}`, {
                          method: "DELETE",
                        });
                        setFiles((all) => all.filter((f) => f.id !== file.id));
                      }}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>

      {showRail && (
        <ConnectionsRail
          pageId={page.id}
          headings={headings}
          onPreviewFile={openPreview}
          onChanged={() => {
            void refresh();
            void load();
          }}
        />
      )}

      <Sheet open={mobileTools} onOpenChange={setMobileTools}>
        <SheetContent side="right" className="w-80 p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>Page tools</SheetTitle>
          </SheetHeader>
          <ConnectionsRail
            pageId={page.id}
            headings={headings}
            className="flex h-full w-full flex-col overflow-y-auto border-0 pt-10"
            onPreviewFile={(file) => {
              openPreview(file);
              setMobileTools(false);
            }}
            onChanged={() => {
              void refresh();
              void load();
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
