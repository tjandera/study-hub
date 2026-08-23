"use client";

import { useEffect, useRef, useState } from "react";
import {
  GlossaryHoverLayer,
  useGlossaryTerms,
  wrapGlossaryHtml,
} from "@/components/glossary-hover";
import { markdownToHtml } from "@/lib/markdown";

export function DocumentView({
  markdown,
  pageId,
}: {
  markdown: string;
  pageId?: string;
}) {
  const [html, setHtml] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const terms = useGlossaryTerms(pageId || "");

  useEffect(() => {
    let cancelled = false;
    void markdownToHtml(markdown).then((value) => {
      if (cancelled) return;
      setHtml(pageId ? wrapGlossaryHtml(value, terms) : value);
    });
    return () => {
      cancelled = true;
    };
  }, [markdown, pageId, terms]);

  const headings = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) =>
    m[1].replace(/\[\[|\]\]/g, ""),
  );

  const goToHeading = (index: number) => {
    const target = bodyRef.current?.querySelectorAll("h1, h2, h3")[index];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <article className="doc-sheet">
      {headings.length > 1 && (
        <nav className="doc-toc">
          <p className="doc-toc-title">Contents</p>
          <ol>
            {headings.map((h, i) => (
              <li key={`${h}-${i}`}>
                <button
                  type="button"
                  className="doc-toc-link"
                  onClick={() => goToHeading(i)}
                >
                  {h}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div
        ref={bodyRef}
        className="doc-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {pageId ? <GlossaryHoverLayer rootRef={bodyRef} terms={terms} /> : null}
    </article>
  );
}
