"use client";

import { useEffect, useRef, useState } from "react";
import { PreviewRootContext } from "@/components/preview-root";

export function DevicePreview({ children }: { children: React.ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setRoot(shellRef.current), 0);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="h-dvh overflow-hidden">
      <PreviewRootContext.Provider value={root}>
        <div
          ref={shellRef}
          className="@container/shell relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
        >
          {children}
        </div>
      </PreviewRootContext.Provider>
    </div>
  );
}
