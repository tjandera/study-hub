"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { refresh, data } = useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);

  const courses = (data?.tree || []).filter((n) => n.type === "course");

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (courseId) form.set("courseId", courseId);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      await refresh();
      toast.success(
        `Imported ${json.notes} notes, ${json.files} files, ${json.pages} folders`,
      );
      onOpenChange(false);
      setFile(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a zip</DialogTitle>
          <DialogDescription>
            Folders become pages. Markdown becomes notes. PDFs and images attach
            to the folder they came from. Leftovers can go to Inbox.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">
              Parent course (optional)
            </span>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">New courses from top-level folders</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={!file || busy}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
