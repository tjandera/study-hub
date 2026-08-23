"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { newId } from "@/lib/ids";

const STORAGE_KEY = "studyhub.tabs.v1";

export type Tab = {
  id: string;
  history: string[];
  historyIndex: number;
};

type StoredState = { tabs: Tab[]; activeTabId: string };

type TabsContextValue = {
  tabs: Tab[];
  activeTabId: string;
  openTab: (href: string) => void;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function makeTab(href: string): Tab {
  return { id: newId(), history: [href], historyIndex: 0 };
}

function seedState(href: string): StoredState {
  const tab = makeTab(href);
  return { tabs: [tab], activeTabId: tab.id };
}

function loadStored(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (
      Array.isArray(parsed?.tabs) &&
      parsed.tabs.length > 0 &&
      parsed.tabs.some((t) => t.id === parsed.activeTabId)
    ) {
      return parsed;
    }
  } catch {
    // corrupt storage — fall through to a fresh seed
  }
  return null;
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Seeded deterministically from the current path so the first client
  // render matches SSR (no hydration mismatch); the real persisted tab set
  // (if any) is swapped in after mount, same pattern as ThemeToggle.
  const [state, setState] = useState<StoredState>(() => seedState(pathname || "/"));
  const suppressRef = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const stored = loadStored();
    if (stored) setState(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Single source of truth for navigation history: every pathname change
  // either came from a tab-switch/back/forward/close (suppressed) or from
  // ordinary navigation (a sidebar Link, wiki-link, command palette, browser
  // back/forward) — in which case it's recorded into the active tab. This
  // means normal `<Link>`/`router.push` call sites need no changes at all.
  useEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    const href = pathname || "/";
    setState((prev) => {
      const tabs = prev.tabs.map((t) => {
        if (t.id !== prev.activeTabId) return t;
        if (t.history[t.historyIndex] === href) return t;
        const history = [...t.history.slice(0, t.historyIndex + 1), href];
        return { ...t, history, historyIndex: history.length - 1 };
      });
      return { ...prev, tabs };
    });
  }, [pathname]);

  const openTab = useCallback(
    (href: string) => {
      const tab = makeTab(href);
      suppressRef.current = true;
      setState((prev) => ({ tabs: [...prev.tabs, tab], activeTabId: tab.id }));
      router.push(href);
    },
    [router],
  );

  const switchTab = useCallback(
    (id: string) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab || id === state.activeTabId) return;
      suppressRef.current = true;
      setState((prev) => ({ ...prev, activeTabId: id }));
      router.push(tab.history[tab.historyIndex]);
    },
    [state.tabs, state.activeTabId, router],
  );

  const closeTab = useCallback(
    (id: string) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const remaining = state.tabs.filter((t) => t.id !== id);
      if (id !== state.activeTabId) {
        setState((prev) => ({ ...prev, tabs: remaining }));
        return;
      }
      const neighbor = remaining[idx] || remaining[idx - 1] || makeTab("/");
      suppressRef.current = true;
      setState({
        tabs: remaining.length ? remaining : [neighbor],
        activeTabId: neighbor.id,
      });
      router.push(neighbor.history[neighbor.historyIndex]);
    },
    [state.tabs, state.activeTabId, router],
  );

  const activeTab = useMemo(
    () => state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0],
    [state.tabs, state.activeTabId],
  );

  const goBack = useCallback(() => {
    if (!activeTab || activeTab.historyIndex <= 0) return;
    const historyIndex = activeTab.historyIndex - 1;
    suppressRef.current = true;
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === activeTab.id ? { ...t, historyIndex } : t,
      ),
    }));
    router.push(activeTab.history[historyIndex]);
  }, [activeTab, router]);

  const goForward = useCallback(() => {
    if (!activeTab || activeTab.historyIndex >= activeTab.history.length - 1) return;
    const historyIndex = activeTab.historyIndex + 1;
    suppressRef.current = true;
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === activeTab.id ? { ...t, historyIndex } : t,
      ),
    }));
    router.push(activeTab.history[historyIndex]);
  }, [activeTab, router]);

  const value = useMemo<TabsContextValue>(
    () => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      openTab,
      switchTab,
      closeTab,
      goBack,
      goForward,
      canGoBack: Boolean(activeTab && activeTab.historyIndex > 0),
      canGoForward: Boolean(
        activeTab && activeTab.historyIndex < activeTab.history.length - 1,
      ),
    }),
    [state.tabs, state.activeTabId, openTab, switchTab, closeTab, goBack, goForward, activeTab],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs must be used within TabsProvider");
  return ctx;
}

/** Cmd/Ctrl-click a link to open it in a new tab instead of navigating in place. */
export function useOpenInNewTab() {
  const { openTab } = useTabs();
  return useCallback(
    (href: string) =>
      (event: React.MouseEvent) => {
        if (!event.metaKey && !event.ctrlKey) return;
        event.preventDefault();
        openTab(href);
      },
    [openTab],
  );
}
