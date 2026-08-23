"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Menu, Plus, X } from "lucide-react";
import { useTabs } from "@/components/tabs-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { INBOX_ID } from "@/lib/constants";
import type { PageTreeNode } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATIC_LABELS: { test: (href: string) => boolean; title: string }[] = [
  { test: (h) => h === "/", title: "Home" },
  { test: (h) => h === `/p/${INBOX_ID}`, title: "Inbox" },
  { test: (h) => h === "/library", title: "Library" },
  { test: (h) => h === "/practice", title: "Practice" },
  { test: (h) => h.startsWith("/quiz/"), title: "Quiz" },
  { test: (h) => h === "/graph", title: "Idea graph" },
  { test: (h) => h === "/trash", title: "Trash" },
  { test: (h) => h === "/install", title: "On your phone" },
];

function flatten(nodes: PageTreeNode[], out: Map<string, PageTreeNode>) {
  for (const node of nodes) {
    out.set(node.id, node);
    flatten(node.children, out);
  }
}

function tabLabel(href: string, byId: Map<string, PageTreeNode>) {
  const pageMatch = href.match(/^\/p\/([^/?#]+)/);
  if (pageMatch) {
    const node = byId.get(pageMatch[1]);
    if (node) return { title: node.title || "Untitled", icon: node.icon || "📄" };
    return { title: "Untitled", icon: "📄" };
  }
  const known = STATIC_LABELS.find((l) => l.test(href));
  return { title: known?.title || "Study Hub", icon: null as string | null };
}

export function TabsBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { tabs, activeTabId, switchTab, closeTab, openTab, goBack, goForward, canGoBack, canGoForward } =
    useTabs();
  const { data } = useWorkspace();

  const byId = useMemo(() => {
    const map = new Map<string, PageTreeNode>();
    flatten(data?.tree || [], map);
    return map;
  }, [data?.tree]);

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b bg-background px-1.5 @[48rem]/shell:h-11">
      <Button
        size="icon-sm"
        variant="ghost"
        className="min-h-10 min-w-10 @[48rem]/shell:hidden"
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
      >
        <Menu />
      </Button>
      <div className="flex items-center gap-0.5 border-r pr-1.5">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!canGoBack}
          onClick={goBack}
          aria-label="Back"
        >
          <ChevronLeft />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!canGoForward}
          onClick={goForward}
          aria-label="Forward"
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <TabChip
            key={tab.id}
            active={tab.id === activeTabId}
            label={tabLabel(tab.history[tab.historyIndex], byId)}
            onSelect={() => switchTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            closable={tabs.length > 1}
          />
        ))}
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => openTab("/")}
        aria-label="New tab"
      >
        <Plus />
      </Button>
    </div>
  );
}

function TabChip({
  active,
  label,
  onSelect,
  onClose,
  closable,
}: {
  active: boolean;
  label: { title: string; icon: string | null };
  onSelect: () => void;
  onClose: () => void;
  closable: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex h-8 max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-md pr-1 pl-2 text-sm",
        active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
      >
        {label.icon && <span className="shrink-0 text-sm">{label.icon}</span>}
        <span className="min-w-0 truncate">{label.title}</span>
      </button>
      {closable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="shrink-0 rounded p-1.5 hover:bg-black/10 dark:hover:bg-white/10"
          aria-label="Close tab"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
