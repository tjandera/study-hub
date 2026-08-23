"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  Home,
  Inbox,
  Library,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Network,
  Plus,
  Search,
  Smartphone,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { useOpenInNewTab } from "@/components/tabs-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INBOX_ID } from "@/lib/constants";
import type { PageTreeNode } from "@/lib/types";
import { cn } from "@/lib/utils";

function findPath(
  nodes: PageTreeNode[],
  id: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.id === id) return [...trail, node.id];
    const child = findPath(node.children, id, [...trail, node.id]);
    if (child) return child;
  }
  return null;
}

function findNode(nodes: PageTreeNode[], id: string): PageTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child) return child;
  }
  return null;
}

function isDescendant(node: PageTreeNode, id: string): boolean {
  return node.children.some((c) => c.id === id || isDescendant(c, id));
}

type DropTarget = { id: string; position: "before" | "after" | "into" };

export function Sidebar({
  onSearch,
  onClose,
}: {
  onSearch: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, createPage, refresh } = useWorkspace();
  const tree = data?.tree || [];
  const activeId = pathname.startsWith("/p/") ? pathname.slice(3) : "";

  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const moveNode = async (dragged: string, target: DropTarget) => {
    if (dragged === target.id) return;
    const dragNode = findNode(tree, dragged);
    const targetNode = findNode(tree, target.id);
    if (!dragNode || !targetNode) return;
    if (target.id === dragged || isDescendant(dragNode, target.id)) return;

    let newParentId: string | null;
    let siblings: PageTreeNode[];
    if (target.position === "into") {
      newParentId = targetNode.id;
      siblings = [
        ...targetNode.children.filter((c) => c.id !== dragged),
        dragNode,
      ];
    } else {
      newParentId = targetNode.parentId;
      const pool =
        newParentId === null ? courses : findNode(tree, newParentId)?.children || [];
      siblings = pool.filter((c) => c.id !== dragged);
      const idx = siblings.findIndex((s) => s.id === target.id);
      siblings.splice(target.position === "before" ? idx : idx + 1, 0, dragNode);
    }

    const patch = (id: string, body: Record<string, unknown>) =>
      fetch(`/api/pages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const jobs: Promise<Response>[] = [];
    if (dragNode.parentId !== newParentId) {
      jobs.push(patch(dragged, { parentId: newParentId }));
    }
    siblings.forEach((s, i) => {
      if (s.sortOrder !== i) jobs.push(patch(s.id, { sortOrder: i }));
    });
    await Promise.all(jobs);
    if (newParentId) setOpenIds((s) => ({ ...s, [newParentId as string]: true }));
    await refresh();
  };

  useEffect(() => {
    const path = findPath(tree, activeId);
    if (!path) return;
    setOpenIds((prev) => {
      const next = { ...prev };
      path.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
  }, [activeId, tree]);

  const courses = tree.filter((n) => n.type === "course");
  const favorites = useMemo(() => {
    const out: PageTreeNode[] = [];
    const walk = (nodes: PageTreeNode[]) => {
      for (const n of nodes) {
        if (n.favorite) out.push(n);
        walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [tree]);
  const extraPages = tree.filter(
    (n) => n.type !== "course" && n.id !== INBOX_ID,
  );

  const go = (href: string) => {
    router.push(href);
    onClose?.();
  };

  const addChild = async (parentId: string | null, type: "page" | "course") => {
    const page = await createPage({
      parentId,
      type,
      title: type === "course" ? "New course" : "Untitled",
    });
    if (parentId) setOpenIds((s) => ({ ...s, [parentId]: true }));
    go(`/p/${page.id}`);
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="text-lg">🧠</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Study Hub</div>
          <div className="text-[11px] text-muted-foreground">Personal vault</div>
        </div>
      </div>
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent"
        >
          <Search className="size-4" />
          Search
          <span className="ml-auto hidden font-mono text-[10px] text-muted-foreground @[48rem]/shell:inline">
            ⌘K
          </span>
        </button>
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        <NavLink href="/" icon={Home} label="Home" active={pathname === "/"} onClick={onClose} />
        <NavLink
          href={`/p/${INBOX_ID}`}
          icon={Inbox}
          label="Inbox"
          active={activeId === INBOX_ID}
          onClick={onClose}
        />
        <NavLink
          href="/library"
          icon={Library}
          label="Library"
          active={pathname === "/library"}
          onClick={onClose}
        />
        <NavLink
          href="/practice"
          icon={ListChecks}
          label="Practice"
          active={pathname === "/practice" || pathname.startsWith("/quiz/")}
          onClick={onClose}
        />
        <NavLink
          href="/graph"
          icon={Network}
          label="Graph"
          active={pathname === "/graph"}
          onClick={onClose}
        />
        <NavLink
          href="/trash"
          icon={Trash2}
          label="Trash"
          active={pathname === "/trash"}
          onClick={onClose}
        />
        <NavLink
          href="/install"
          icon={Smartphone}
          label="On your phone"
          active={pathname === "/install"}
          onClick={onClose}
        />
      </nav>

      <div className="mt-4 flex-1 overflow-y-auto px-2 pb-6">
        {favorites.length > 0 && (
          <Section label="Favorites">
            {favorites.map((node) => (
              <TreeRow
                key={`fav-${node.id}`}
                node={{ ...node, children: [] }}
                depth={0}
                activeId={activeId}
                openIds={openIds}
                setOpenIds={setOpenIds}
                onNavigate={go}
                onAdd={addChild}
                onRefresh={refresh}
              />
            ))}
          </Section>
        )}

        <Section
          label="Courses"
          action={
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => void addChild(null, "course")}
              aria-label="New course"
            >
              <Plus />
            </Button>
          }
        >
          {courses.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No courses yet.
            </p>
          )}
          {courses.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              activeId={activeId}
              openIds={openIds}
              setOpenIds={setOpenIds}
              onNavigate={go}
              onAdd={addChild}
              onRefresh={refresh}
              draggable
              dragId={dragId}
              dropTarget={dropTarget}
              onDragStart={setDragId}
              onDragOverRow={setDropTarget}
              onDrop={(target) => {
                if (dragId) void moveNode(dragId, target);
                setDragId(null);
                setDropTarget(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
            />
          ))}
        </Section>

        {extraPages.length > 0 && (
          <Section label="Pages">
            {extraPages.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                activeId={activeId}
                openIds={openIds}
                setOpenIds={setOpenIds}
                onNavigate={go}
                onAdd={addChild}
                onRefresh={refresh}
              />
            ))}
          </Section>
        )}
      </div>
      <div className="border-t p-2 pb-10">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          <LogOut className="size-4" />
          Log out
        </button>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex h-6 items-center justify-between px-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-sidebar-accent",
        active && "bg-sidebar-accent font-medium",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

function TreeRow({
  node,
  depth,
  activeId,
  openIds,
  setOpenIds,
  onNavigate,
  onAdd,
  onRefresh,
  draggable = false,
  dragId = null,
  dropTarget = null,
  onDragStart,
  onDragOverRow,
  onDrop,
  onDragEnd,
}: {
  node: PageTreeNode;
  depth: number;
  activeId: string;
  openIds: Record<string, boolean>;
  setOpenIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onNavigate: (href: string) => void;
  onAdd: (parentId: string | null, type: "page" | "course") => Promise<void>;
  onRefresh: () => Promise<void>;
  draggable?: boolean;
  dragId?: string | null;
  dropTarget?: DropTarget | null;
  onDragStart?: (id: string) => void;
  onDragOverRow?: (target: DropTarget) => void;
  onDrop?: (target: DropTarget) => void;
  onDragEnd?: () => void;
}) {
  const open = openIds[node.id] ?? (depth === 0 && node.type === "course");
  const hasKids = node.children.length > 0;
  const isDragging = draggable && dragId === node.id;
  const isDropHere = draggable && dropTarget?.id === node.id;
  const openInNewTab = useOpenInNewTab();

  const remove = async () => {
    if (node.id === INBOX_ID) return;
    const res = await fetch(`/api/pages/${node.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      toast.error(json.error || "Could not delete");
      return;
    }
    await onRefresh();
    toast.success("Moved to trash — deleted forever in 30 days");
  };

  const toggleFavorite = async () => {
    await fetch(`/api/pages/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !node.favorite }),
    });
    await onRefresh();
  };

  return (
    <div>
      <div
        draggable={draggable && node.id !== INBOX_ID}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart?.(node.id);
        }}
        onDragOver={(e) => {
          if (!draggable || !dragId || dragId === node.id) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          const position: DropTarget["position"] =
            ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into";
          onDragOverRow?.({ id: node.id, position });
        }}
        onDrop={(e) => {
          if (!draggable || !dragId) return;
          e.preventDefault();
          e.stopPropagation();
          onDrop?.({ id: node.id, position: dropTarget?.position || "into" });
        }}
        onDragEnd={() => onDragEnd?.()}
        className={cn(
          "group relative flex h-8 items-center rounded-md pr-1 text-sm hover:bg-sidebar-accent",
          activeId === node.id && "bg-sidebar-accent font-medium",
          isDragging && "opacity-40",
          isDropHere &&
            dropTarget?.position === "into" &&
            "bg-primary/10 ring-1 ring-primary/40",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {isDropHere && dropTarget?.position === "before" && (
          <div className="absolute inset-x-1 top-0 h-0.5 rounded-full bg-primary" />
        )}
        {isDropHere && dropTarget?.position === "after" && (
          <div className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary" />
        )}
        <button
          type="button"
          className={cn(
            "mr-0.5 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10",
            !hasKids && "opacity-0 group-hover:opacity-40",
          )}
          onClick={() =>
            setOpenIds((s) => ({ ...s, [node.id]: !open }))
          }
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight
            className={cn("size-3.5 transition", open && "rotate-90")}
          />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              openInNewTab(`/p/${node.id}`)(e);
              return;
            }
            onNavigate(`/p/${node.id}`);
          }}
        >
          <span className="w-4 shrink-0 text-center text-sm">
            {node.icon || "📄"}
          </span>
          <span className="truncate">{node.title}</span>
        </button>
        <div className="hidden items-center group-hover:flex">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => void onAdd(node.id, "page")}
            aria-label="Add page"
          >
            <Plus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label="Page menu">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void toggleFavorite()}>
                <Star className="size-4" />
                {node.favorite ? "Unfavorite" : "Favorite"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onAdd(node.id, "page")}>
                <Plus className="size-4" />
                Add subpage
              </DropdownMenuItem>
              {node.id !== INBOX_ID && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {open &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            activeId={activeId}
            openIds={openIds}
            setOpenIds={setOpenIds}
            onNavigate={onNavigate}
            onAdd={onAdd}
            onRefresh={onRefresh}
            draggable={draggable}
            dragId={dragId}
            dropTarget={dropTarget}
            onDragStart={onDragStart}
            onDragOverRow={onDragOverRow}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}
    </div>
  );
}
