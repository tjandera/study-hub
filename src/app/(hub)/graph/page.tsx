"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IdeaGraph } from "@/components/idea-graph";
import { useWorkspace } from "@/components/workspace-provider";
import { INBOX_ID } from "@/lib/constants";
import type { PageTreeNode } from "@/lib/types";

function flatten(nodes: PageTreeNode[], depth = 0): { node: PageTreeNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flatten(node.children, depth + 1),
  ]);
}

function GraphPageInner() {
  const params = useSearchParams();
  const { data, loading } = useWorkspace();
  const tree = data?.tree || [];
  const rows = useMemo(() => flatten(tree), [tree]);
  const [pageId, setPageId] = useState<string | null>(null);

  useEffect(() => {
    if (pageId) return;
    const fromQuery = params.get("page");
    if (fromQuery) {
      setPageId(fromQuery);
      return;
    }
    const firstCourse = tree.find((n) => n.type === "course");
    if (firstCourse) setPageId(firstCourse.id);
    else if (tree.length) setPageId(INBOX_ID);
  }, [params, tree, pageId]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Idea graph</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every concept and connection from a course or page, in one map.
            </p>
          </div>
          <select
            className="h-9 min-w-48 rounded-md border bg-background px-2 text-sm"
            value={pageId || ""}
            onChange={(e) => setPageId(e.target.value)}
          >
            <option value={INBOX_ID}>📥 Inbox</option>
            {rows.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {"— ".repeat(depth)}
                {node.icon || "📄"} {node.title}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6">
          {loading && (
            <div className="h-96 animate-pulse rounded-xl bg-muted" />
          )}
          {!loading && pageId && <IdeaGraph pageId={pageId} />}
        </div>
      </div>
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense>
      <GraphPageInner />
    </Suspense>
  );
}
