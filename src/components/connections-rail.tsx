"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  FileStack,
  GitBranch,
  Inbox,
  ListTree,
  MessageSquare,
  Network,
} from "lucide-react";
import { DumpPanel } from "@/components/dump-panel";
import { IdeaGraph } from "@/components/idea-graph";
import { StudyChat } from "@/components/study-chat";
import { WorksheetPanel } from "@/components/worksheet-panel";
import { formatBytes, isPreviewable, prettyFilename } from "@/lib/format";
import type { FileRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type Connections = {
  graph: {
    nodes: { title: string; summary: string }[];
    links: { from: string; to: string; relation: string }[];
  };
  parentGraph: {
    nodes: { title: string; summary: string }[];
    links: { from: string; to: string; relation: string }[];
  };
  backlinks: { id: string; title: string; icon: string | null }[];
  children: { id: string; title: string; icon: string | null }[];
  wiki: string[];
  wikiPages: { id: string; title: string; icon: string | null }[];
};

type RailTab =
  | "files"
  | "connections"
  | "graph"
  | "outline"
  | "chat"
  | "dump"
  | "worksheet";

const TABS: { key: RailTab; icon: typeof GitBranch; label: string }[] = [
  { key: "files", icon: FileStack, label: "Files" },
  { key: "connections", icon: GitBranch, label: "Links" },
  { key: "graph", icon: Network, label: "Graph" },
  { key: "outline", icon: ListTree, label: "Outline" },
  { key: "chat", icon: MessageSquare, label: "Chat" },
  { key: "dump", icon: Inbox, label: "Dump" },
  { key: "worksheet", icon: ClipboardList, label: "Sheet" },
];

export function ConnectionsRail({
  pageId,
  headings,
  onChanged,
  onPreviewFile,
  className,
}: {
  pageId: string;
  headings: string[];
  onChanged?: () => void;
  onPreviewFile?: (file: FileRecord) => void;
  className?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<RailTab>("files");
  const [data, setData] = useState<Connections | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pages/${pageId}/connections`);
    if (!res.ok) return;
    setData(await res.json());
  }, [pageId]);

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/files?pageId=${pageId}&deep=1`);
    if (!res.ok) return;
    const json = await res.json();
    setFiles(json.files || []);
  }, [pageId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
      void loadFiles();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load, loadFiles]);

  const openOrCreate = async (title: string) => {
    const res = await fetch(`/api/pages?title=${encodeURIComponent(title)}`);
    const json = await res.json();
    if (json.page) {
      router.push(`/p/${json.page.id}`);
      return;
    }
    const created = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: pageId, title }),
    }).then((r) => r.json());
    if (created.page) router.push(`/p/${created.page.id}`);
  };

  const nodes = [
    ...(data?.graph.nodes || []),
    ...(data?.parentGraph.nodes || []),
  ].filter(
    (node, i, all) =>
      all.findIndex((n) => n.title.toLowerCase() === node.title.toLowerCase()) === i,
  );

  const groups = useMemo(() => {
    const map = new Map<string, { pageId: string; title: string; files: FileRecord[] }>();
    for (const file of files) {
      const key = file.pageId;
      const existing = map.get(key);
      if (existing) existing.files.push(file);
      else {
        map.set(key, {
          pageId: key,
          title: file.pageTitle || "Files",
          files: [file],
        });
      }
    }
    return [...map.values()];
  }, [files]);

  const openFile = (file: FileRecord) => {
    if (isPreviewable(file.mime, file.filename) && onPreviewFile) {
      onPreviewFile(file);
      return;
    }
    window.open(`/api/files/${file.id}`, "_blank");
  };

  return (
    <aside
      className={cn(
        "hidden w-80 shrink-0 overflow-y-auto border-l bg-background p-4 text-sm @[64rem]/shell:block",
        className,
      )}
    >
      <div className="mb-4 grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex min-h-9 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1 text-[10px]",
              tab === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "files" && (
        <div className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Folder files
          </h3>
          {groups.length === 0 ? (
            <p className="text-muted-foreground">
              No PDFs or decks in this folder yet.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.pageId}>
                <Link
                  href={`/p/${group.pageId}`}
                  className="mb-1 block truncate text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  {group.title}
                </Link>
                <ul className="space-y-0.5">
                  {group.files.map((file) => (
                    <li key={file.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted"
                        onClick={() => openFile(file)}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {prettyFilename(file.filename)}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatBytes(file.size)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}

      {tab === "graph" && <IdeaGraph pageId={pageId} compact />}

      {tab === "outline" && (
        <>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            On this page
          </h3>
          {headings.length === 0 ? (
            <p className="text-muted-foreground">No headings yet.</p>
          ) : (
            <ul className="space-y-1">
              {headings.map((h, i) => (
                <li key={`${h}-${i}`}>
                  <button
                    type="button"
                    className="w-full truncate text-left text-muted-foreground hover:text-foreground hover:underline"
                    onClick={() => {
                      const container = document.querySelector(
                        ".note-prose, .doc-body",
                      );
                      const target =
                        container?.querySelectorAll("h1, h2, h3")[i];
                      target?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                  >
                    {h}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "chat" && <StudyChat pageId={pageId} />}

      {tab === "dump" && (
        <DumpPanel
          pageId={pageId}
          onChanged={() => {
            void load();
            onChanged?.();
          }}
        />
      )}

      {tab === "worksheet" && <WorksheetPanel pageId={pageId} />}

      {tab === "connections" && (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ideas
            </h3>
            {nodes.length === 0 ? (
              <p className="text-muted-foreground">
                Upload a deck or notes and connections appear here automatically.
              </p>
            ) : (
              <ul className="space-y-1">
                {nodes.slice(0, 24).map((node) => (
                  <li key={node.title}>
                    <button
                      type="button"
                      className="w-full truncate text-left hover:underline"
                      onClick={() => void openOrCreate(node.title)}
                    >
                      [[{node.title}]]
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Linked notes
            </h3>
            {(data?.wikiPages.length || 0) === 0 && (data?.wiki.length || 0) === 0 ? (
              <p className="text-muted-foreground">No [[wikilinks]] yet.</p>
            ) : (
              <ul className="space-y-1">
                {(data?.wikiPages || []).map((p) => (
                  <li key={p.id}>
                    <Link href={`/p/${p.id}`} className="hover:underline">
                      {p.icon} {p.title}
                    </Link>
                  </li>
                ))}
                {(data?.wiki || [])
                  .filter(
                    (title) =>
                      !(data?.wikiPages || []).some(
                        (p) => p.title.toLowerCase() === title.toLowerCase(),
                      ),
                  )
                  .map((title) => (
                    <li key={title}>
                      <button
                        type="button"
                        className="text-muted-foreground hover:underline"
                        onClick={() => void openOrCreate(title)}
                      >
                        Create [[{title}]]
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Child notes
            </h3>
            {(data?.children.length || 0) === 0 ? (
              <p className="text-muted-foreground">None yet — uploads become notes here.</p>
            ) : (
              <ul className="space-y-1">
                {(data?.children || []).map((p) => (
                  <li key={p.id}>
                    <Link href={`/p/${p.id}`} className="hover:underline">
                      {p.icon} {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Linked from
            </h3>
            {(data?.backlinks.length || 0) === 0 ? (
              <p className="text-muted-foreground">No backlinks.</p>
            ) : (
              <ul className="space-y-1">
                {(data?.backlinks || []).map((b) => (
                  <li key={b.id}>
                    <Link href={`/p/${b.id}`} className="hover:underline">
                      {b.icon} {b.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
