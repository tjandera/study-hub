"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PageRecord, WorkspacePayload } from "@/lib/types";
import type { TemplateKey } from "@/lib/templates";
import type { PageType } from "@/lib/types";

type WorkspaceContextValue = {
  data: WorkspacePayload | null;
  loading: boolean;
  refresh: () => Promise<void>;
  createPage: (input: {
    parentId?: string | null;
    type?: PageType;
    title?: string;
    template?: TemplateKey;
    contentMd?: string;
  }) => Promise<PageRecord>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/workspace");
    if (!res.ok) return;
    setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createPage = useCallback(
    async (input: {
      parentId?: string | null;
      type?: PageType;
      title?: string;
      template?: TemplateKey;
      contentMd?: string;
    }) => {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      await refresh();
      return json.page as PageRecord;
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ data, loading, refresh, createPage }),
    [data, loading, refresh, createPage],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within provider");
  return ctx;
}
