"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  LayoutGrid,
  RotateCcw,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { INBOX_ID } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import {
  blockLabel,
  moveBlock,
  readHomeLayout,
  writeHomeLayout,
  type HomeBlockId,
  type HomeLayout,
} from "@/lib/home-layout";
import type { PageTreeNode } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { data, loading, createPage } = useWorkspace();
  const router = useRouter();
  const courses = (data?.tree || []).filter((n) => n.type === "course");
  const recents = data?.recents || [];
  const favorites = flattenFavorites(data?.tree || []);

  const [layout, setLayout] = useState<HomeLayout | null>(null);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<HomeBlockId | null>(null);
  const [over, setOver] = useState<HomeBlockId | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setLayout(readHomeLayout()), 0);
    return () => window.clearTimeout(t);
  }, []);

  const order = layout?.order || ["welcome", "courses", "recent"];

  const updateOrder = (next: HomeBlockId[]) => {
    const layoutNext = { order: next };
    setLayout(layoutNext);
    writeHomeLayout(layoutNext);
  };

  const blocks: Record<HomeBlockId, ReactNode> = {
    welcome: (
      <WelcomeBlock
        onNewCourse={async () => {
          const page = await createPage({
            type: "course",
            title: "New course",
          });
          router.push(`/p/${page.id}`);
        }}
        onNewPage={async () => {
          const page = await createPage({ title: "Untitled" });
          router.push(`/p/${page.id}`);
        }}
      />
    ),
    courses: (
      <CoursesBlock loading={loading} courses={courses} favorites={favorites} />
    ),
    recent: <RecentBlock recents={recents} />,
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Study Hub
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={editing ? "default" : "outline"}
              onClick={() => setEditing((v) => !v)}
            >
              <LayoutGrid className="size-3.5" />
              {editing ? "Done" : "Edit layout"}
            </Button>
            {editing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  updateOrder(["welcome", "courses", "recent"]);
                }}
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {editing && (
          <p className="mt-3 text-xs text-muted-foreground">
            Drag blocks by the handle to rearrange your homepage. Order is
            saved on this device.
          </p>
        )}

        <div className="mt-6 grid gap-4">
          {order.map((id, index) => (
            <HomeBlock
              key={id}
              id={id}
              editing={editing}
              dragging={dragging === id}
              over={over === id && dragging !== id}
              canMoveUp={index > 0}
              canMoveDown={index < order.length - 1}
              onMoveUp={() => {
                const prev = order[index - 1];
                if (prev) updateOrder(moveBlock(order, id, prev));
              }}
              onMoveDown={() => {
                const next = order[index + 1];
                if (!next) return;
                updateOrder(moveBlock(order, next, id));
              }}
              onDragStart={() => setDragging(id)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={() => setOver(id)}
              onDrop={() => {
                if (dragging) updateOrder(moveBlock(order, dragging, id));
                setDragging(null);
                setOver(null);
              }}
            >
              {blocks[id]}
            </HomeBlock>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeBlock({
  id,
  editing,
  dragging,
  over,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  children,
}: {
  id: HomeBlockId;
  editing: boolean;
  dragging: boolean;
  over: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card/40",
        editing && "border-dashed",
        dragging && "opacity-50",
        over && "border-foreground ring-2 ring-foreground/20",
      )}
      onDragOver={
        editing
          ? (e) => {
              e.preventDefault();
              onDragOver();
            }
          : undefined
      }
      onDrop={
        editing
          ? (e) => {
              e.preventDefault();
              onDrop();
            }
          : undefined
      }
    >
      {editing && (
        <div className="flex items-center gap-2 border-b border-dashed px-3 py-2 text-xs text-muted-foreground">
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            className="inline-flex cursor-grab items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted active:cursor-grabbing"
            aria-label={`Drag ${blockLabel(id)}`}
          >
            <GripVertical className="size-3.5" />
            Drag
          </button>
          <span className="min-w-0 flex-1 font-medium text-foreground">
            {blockLabel(id)}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            aria-label={`Move ${blockLabel(id)} up`}
          >
            <ChevronUp />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            aria-label={`Move ${blockLabel(id)} down`}
          >
            <ChevronDown />
          </Button>
        </div>
      )}
      <div className="p-4 @[48rem]/shell:p-5">{children}</div>
    </section>
  );
}

function WelcomeBlock({
  onNewCourse,
  onNewPage,
}: {
  onNewCourse: () => void;
  onNewPage: () => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground">Shortcuts</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => void onNewCourse()}>New course</Button>
        <Button variant="outline" onClick={() => void onNewPage()}>
          New page
        </Button>
        <Button variant="ghost" asChild>
          <Link href={`/p/${INBOX_ID}`}>Open Inbox</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/practice">Practice</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/install">On your phone</Link>
        </Button>
      </div>
    </div>
  );
}

function CoursesBlock({
  loading,
  courses,
  favorites,
}: {
  loading: boolean;
  courses: PageTreeNode[];
  favorites: PageTreeNode[];
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Courses</h2>
      {loading && <div className="h-20 animate-pulse rounded-xl bg-muted" />}
      {!loading && courses.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Create a course per module, then drop your lecture files onto a week
          page.
        </p>
      )}
      <div className="grid gap-3 @[36rem]/shell:grid-cols-2 @[56rem]/shell:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
      {favorites.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Favorites
          </h3>
          <div className="grid gap-2 @[36rem]/shell:grid-cols-2">
            {favorites.map((page) => (
              <Link
                key={page.id}
                href={`/p/${page.id}`}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span>{page.icon || "📄"}</span>
                <span className="truncate font-medium">{page.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecentBlock({ recents }: { recents: PageTreeNode[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent</h2>
      {recents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent pages yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-background">
          {recents.map((page) => (
            <li key={page.id}>
              <Link
                href={`/p/${page.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="text-lg">{page.icon || "📄"}</span>
                <span className="flex-1 truncate">{page.title}</span>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(page.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: PageTreeNode }) {
  const count = countPages(course);
  return (
    <Link
      href={`/p/${course.id}`}
      className="rounded-xl border bg-background p-4 transition hover:bg-muted/40"
    >
      <div className="text-2xl">{course.icon || "📘"}</div>
      <div className="mt-2 font-medium">{course.title}</div>
      <div className="text-xs text-muted-foreground">
        {count} {count === 1 ? "page" : "pages"}
      </div>
    </Link>
  );
}

function countPages(node: PageTreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countPages(child), 0);
}

function flattenFavorites(nodes: PageTreeNode[]) {
  const out: PageTreeNode[] = [];
  const walk = (list: PageTreeNode[]) => {
    for (const node of list) {
      if (node.favorite) out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
