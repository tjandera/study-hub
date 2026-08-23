"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Share, Smartphone, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isStandalone() {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const ios =
    "standalone" in navigator &&
    Boolean((navigator as { standalone?: boolean }).standalone);
  return media || ios;
}

export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallGuide({ compact = false }: { compact?: boolean }) {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setStandalone(isStandalone());
      setIos(isIosDevice());
    }, 0);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (standalone || installed) {
    return (
      <div className="rounded-xl border bg-muted/30 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Check className="size-4" />
          Running as an app
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Study Hub is on your Home Screen and opens full-screen, without Safari
          chrome.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Smartphone className="size-4" />
          Add to iPhone Home Screen
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {ios
            ? "You're on an iPhone. These steps only work in Safari — not Chrome or Instagram/Twitter in-app browsers."
            : "After you deploy (HTTPS), open the live URL in Safari on your iPhone — not Chrome."}
        </p>
      </div>

      <ol className="space-y-3 text-sm">
        <Step n={1}>
          Open your deployed Study Hub link in <strong>Safari</strong>.
        </Step>
        <Step n={2}>
          Tap the <Share className="mx-0.5 inline size-3.5 align-text-bottom" />{" "}
          <strong>Share</strong> button (square with an arrow) in the toolbar
          — usually at the bottom of the screen.
        </Step>
        <Step n={3}>
          Scroll the sheet and tap{" "}
          <SquarePlus className="mx-0.5 inline size-3.5 align-text-bottom" />{" "}
          <strong>Add to Home Screen</strong>. If you do not see it, tap{" "}
          <em>Edit Actions</em> and enable it.
        </Step>
        <Step n={4}>
          Keep the name <strong>Study Hub</strong>, then tap{" "}
          <Plus className="mx-0.5 inline size-3.5 align-text-bottom" />{" "}
          <strong>Add</strong> in the top right.
        </Step>
        <Step n={5}>
          Go to your Home Screen and tap the <strong>SH</strong> icon. It
          launches as its own app — notes, dump, quizzes, and the rest work
          the same as in the browser.
        </Step>
      </ol>

      {!compact && (
        <p className="text-xs text-muted-foreground">
          iOS only offers this from Safari, and only on a real HTTPS site (or
          localhost while developing). Bookmarking is not the same as Add to
          Home Screen.
        </p>
      )}

      <div className="border-t pt-4">
        <h3 className="text-sm font-medium">Android</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          In Chrome, open the menu (⋮) and tap <strong>Install app</strong> /
          <strong> Add to Home screen</strong>.
        </p>
        {deferred && (
          <Button
            className="mt-2"
            size="sm"
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice.outcome === "accepted") setInstalled(true);
            }}
          >
            Install on this device
          </Button>
        )}
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">
        {n}
      </span>
      <span className="min-w-0 leading-snug text-muted-foreground">
        {children}
      </span>
    </li>
  );
}
