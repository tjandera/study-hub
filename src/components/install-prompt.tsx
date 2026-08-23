"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isIosDevice, isStandalone } from "@/components/install-guide";

export function InstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (window.sessionStorage.getItem("sh-install-dismissed")) return;
    const t = window.setTimeout(() => {
      if (isIosDevice()) setShow(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 @[48rem]/shell:bottom-4">
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border bg-background/95 px-3 py-2.5 text-sm shadow-lg backdrop-blur">
        <p className="min-w-0 flex-1 text-muted-foreground">
          On iPhone, open this site in Safari and use Share → Add to Home
          Screen.
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" asChild>
            <Link href="/install">Steps</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShow(false);
              window.sessionStorage.setItem("sh-install-dismissed", "1");
            }}
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
