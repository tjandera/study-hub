"use client";

import { useEffect, useMemo, useState } from "react";
import { Home } from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useWorkspace } from "@/components/workspace-provider";
import type { PageTreeNode } from "@/lib/types";

function collectDescendants(node: PageTreeNode, out: Set<string>) {
  for (const child of node.children) {
    out.add(child.id);
    collectDescendants(child, out);
  }
}

function findNode(nodes: PageTreeNode[], id: string): PageTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

export function MoveToDialog({
  page,
  open,
  onOpenChange,
  onMoved,
}: {
  page: { id: string; parentId: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
}) {
  const { data, refresh } = useWorkspace();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PageTreeNode[]>([]);

  const blocked = useMemo(() => {
    const set = new Set<string>([page.id]);
    const node = findNode(data?.tree || [], page.id);
    if (node) collectDescendants(node, set);
    return set;
  }, [data?.tree, page.id]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/pages?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      setHits((json.pages || []).filter((p: PageTreeNode) => !blocked.has(p.id)));
    }, 150);
    return () => clearTimeout(t);
  }, [query, open, blocked]);

  const moveTo = async (parentId: string | null) => {
    if (parentId === page.parentId) {
      onOpenChange(false);
      return;
    }
    const res = await fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId }),
    });
    if (!res.ok) {
      toast.error("Could not move page");
      return;
    }
    onOpenChange(false);
    await Promise.all([refresh(), onMoved()]);
    toast.success("Moved");
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Move to"
      description="Choose a new location for this page"
    >
      <CommandInput
        placeholder="Search pages…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matching pages</CommandEmpty>
        <CommandGroup heading="Move to">
          {page.parentId !== null && (
            <CommandItem onSelect={() => void moveTo(null)}>
              <Home /> Top level
            </CommandItem>
          )}
          {hits.map((hit) => (
            <CommandItem key={hit.id} onSelect={() => void moveTo(hit.id)}>
              <span className="w-4 shrink-0 text-center">{hit.icon || "📄"}</span>
              <span className="truncate">{hit.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
