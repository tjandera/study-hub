"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { relativeTime } from "@/lib/format";
import type { PageTreeNode } from "@/lib/types";

const RETENTION_DAYS = 30;

function daysLeft(deletedAt: string | null) {
  if (!deletedAt) return RETENTION_DAYS;
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed));
}

export default function TrashPage() {
  const { refresh } = useWorkspace();
  const [items, setItems] = useState<PageTreeNode[] | null>(null);

  const load = async () => {
    const res = await fetch("/api/trash");
    const json = await res.json();
    setItems(json.pages || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const restore = async (id: string) => {
    await fetch(`/api/pages/${id}/restore`, { method: "POST" });
    toast.success("Restored");
    await Promise.all([load(), refresh()]);
  };

  const purge = async (id: string) => {
    await fetch(`/api/pages/${id}/purge`, { method: "DELETE" });
    toast.success("Deleted forever");
    await load();
  };

  const emptyTrash = async () => {
    await fetch("/api/trash/empty", { method: "POST" });
    toast.success("Trash emptied");
    await load();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Trash</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Items are kept for {RETENTION_DAYS} days, then deleted
              automatically.
            </p>
          </div>
          {items && items.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Empty trash
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Empty trash?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes all {items.length} item
                    {items.length === 1 ? "" : "s"} in the trash, along with
                    any attached files. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void emptyTrash()}
                  >
                    Empty trash
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {items && items.length === 0 && (
          <p className="mt-10 text-sm text-muted-foreground">Trash is empty.</p>
        )}

        <ul className="mt-6 space-y-1">
          {(items || []).map((item) => {
            const left = daysLeft(item.deletedAt);
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm"
              >
                <span className="w-5 shrink-0 text-center">
                  {item.icon || "📄"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Deleted {relativeTime(item.deletedAt || item.updatedAt)} ·{" "}
                    {left === 0 ? "purging soon" : `purges in ${left}d`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void restore(item.id)}
                >
                  <RotateCcw className="size-3.5" /> Restore
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label="Delete forever">
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete forever?</AlertDialogTitle>
                      <AlertDialogDescription>
                        &quot;{item.title}&quot; and any pages or files inside
                        it will be permanently deleted. This can&apos;t be
                        undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => void purge(item.id)}
                      >
                        Delete forever
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
