"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatBytes, relativeTime } from "@/lib/format";
import type { FileRecord } from "@/lib/types";

export default function LibraryPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    void fetch("/api/files")
      .then((r) => r.json())
      .then((json) => setFiles(json.files || []));
  }, []);

  const filtered = files.filter((f) =>
    f.filename.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad mx-auto max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every file attached to a page, in one place.
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by filename"
          className="mt-6 h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
        />
        <ul className="mt-6 divide-y rounded-xl border">
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No files yet. Attach a PDF on any page.
            </li>
          )}
          {filtered.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-2 px-4 py-3 @[48rem]/shell:flex-nowrap @[48rem]/shell:gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{file.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {file.pageTitle} · {formatBytes(file.size)} ·{" "}
                  {relativeTime(file.createdAt)}
                </div>
              </div>
              <Link
                href={`/p/${file.pageId}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Open page
              </Link>
              <a
                href={`/api/files/${file.id}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
