"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PageRecord } from "@/lib/types";

export function ShareDialog({
  page,
  open,
  onOpenChange,
  onChanged,
}: {
  page: PageRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setUrl(
      page.shareEnabled && page.shareToken
        ? `${window.location.origin}/share/${page.shareToken}`
        : null,
    );
  }, [open, page.shareEnabled, page.shareToken]);

  const enable = async () => {
    setBusy(true);
    const res = await fetch(`/api/pages/${page.id}/share`, { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not enable sharing");
      return;
    }
    setUrl(json.url);
    await onChanged();
  };

  const disable = async () => {
    setBusy(true);
    await fetch(`/api/pages/${page.id}/share`, { method: "DELETE" });
    setBusy(false);
    setUrl(null);
    await onChanged();
    toast.success("Link sharing turned off");
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share “{page.title}”</DialogTitle>
          <DialogDescription>
            Anyone with the link can view a read-only copy of this page —
            they don&apos;t need a Study Hub account or the site password.
          </DialogDescription>
        </DialogHeader>
        {url ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 flex-1 rounded-md border bg-muted px-2 text-xs"
              />
              <Button size="icon-sm" variant="outline" onClick={() => void copy()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void disable()}
            >
              Turn off link sharing
            </Button>
          </div>
        ) : (
          <Button disabled={busy} onClick={() => void enable()}>
            Create share link
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
