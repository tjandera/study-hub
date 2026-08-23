"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BookOpen,
  Download,
  FilePlus,
  Home,
  Inbox,
  Library,
  ListChecks,
  Moon,
  Network,
  RefreshCcw,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace-provider";
import type { SearchHit } from "@/lib/types";

export function CommandPalette({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: () => void;
}) {
  const router = useRouter();
  const { createPage, data, refresh } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setHits(json.hits || []);
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search notes, files, commands…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim() && (
          <CommandGroup heading="Results">
            {hits.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                No matching notes
              </div>
            ) : (
              hits.map((hit) => (
                <CommandItem
                  key={`${hit.kind}-${hit.id}`}
                  onSelect={() =>
                    go(hit.kind === "file" ? `/p/${hit.pageId}` : `/p/${hit.id}`)
                  }
                >
                  <span className="truncate">
                    {hit.icon ? `${hit.icon} ` : ""}
                    {hit.title}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {hit.kind}
                  </span>
                </CommandItem>
              ))
            )}
          </CommandGroup>
        )}
        <CommandGroup heading="Create">
          <CommandItem
            onSelect={async () => {
              const page = await createPage({ title: "Untitled" });
              go(`/p/${page.id}`);
            }}
          >
            <FilePlus /> New page
          </CommandItem>
          <CommandItem
            onSelect={async () => {
              const page = await createPage({
                type: "course",
                title: "New course",
                template: "blank",
              });
              go(`/p/${page.id}`);
            }}
          >
            <BookOpen /> New course
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go">
          <CommandItem onSelect={() => go("/")}>
            <Home /> Home
          </CommandItem>
          <CommandItem onSelect={() => go(`/p/${data?.inboxId || "inbox"}`)}>
            <Inbox /> Inbox
          </CommandItem>
          <CommandItem onSelect={() => go("/library")}>
            <Library /> Library
          </CommandItem>
          <CommandItem onSelect={() => go("/practice")}>
            <ListChecks /> Practice
          </CommandItem>
          <CommandItem onSelect={() => go("/graph")}>
            <Network /> Idea graph
          </CommandItem>
          <CommandItem onSelect={() => go("/p/smu")}>
            <BookOpen /> SMU vault
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Workspace">
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              onImport();
            }}
          >
            <Upload /> Import zip
          </CommandItem>
          <CommandItem
            onSelect={async () => {
              onOpenChange(false);
              const id = toast.loading("Syncing SMU notes from Documents/SMU…");
              const res = await fetch("/api/sync/smu", { method: "POST" });
              const json = await res.json();
              if (!res.ok) {
                toast.error(json.error || "Sync failed", { id });
                return;
              }
              await refresh();
              toast.success(
                `SMU synced · ${json.notes} notes, ${json.files} files, ${json.skipped} unchanged`,
                { id },
              );
              router.push("/p/smu");
            }}
          >
            <RefreshCcw /> Sync SMU notes
          </CommandItem>
          <CommandItem
            onSelect={async () => {
              onOpenChange(false);
              const id = toast.loading("Syncing notes from your Obsidian vault…");
              const res = await fetch("/api/sync/obsidian", { method: "POST" });
              const json = await res.json();
              if (!res.ok) {
                toast.error(json.error || "Sync failed", { id });
                return;
              }
              await refresh();
              toast.success(
                `Obsidian synced · ${json.updated} notes updated, ${json.skipped} unchanged, ${json.images} images`,
                { id },
              );
              router.push("/p/obsidian-notes");
            }}
          >
            <RefreshCcw /> Sync Obsidian notes
          </CommandItem>
          <CommandItem
            onSelect={async () => {
              onOpenChange(false);
              const id = toast.loading(
                "Reformatting SMU notes for studying… this can take a few minutes",
              );
              const res = await fetch("/api/sync/smu?reformat=1", { method: "POST" });
              const json = await res.json();
              if (!res.ok) {
                toast.error(json.error || "Reformat failed", { id });
                return;
              }
              await refresh();
              toast.success(
                `Reformatted ${json.cleaned} notes` +
                  (json.polished ? ` · ${json.polished} AI-polished` : ""),
                { id },
              );
              router.push("/p/smu-y2t1");
            }}
          >
            <Sparkles /> Reformat SMU notes
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              window.location.href = "/api/export";
            }}
          >
            <Download /> Export vault
          </CommandItem>
          <CommandItem
            onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun /> : <Moon />} Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
