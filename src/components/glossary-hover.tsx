"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import tippy, { type Instance } from "tippy.js";
import "tippy.js/dist/tippy.css";

export type ClientTerm = {
  term: string;
  definition: string;
  aliases: string[];
};

export function useGlossaryTerms(pageId: string) {
  const [terms, setTerms] = useState<ClientTerm[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/pages/${pageId}/glossary`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setTerms(json.terms || []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  return terms;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap glossary terms in HTML (longest match first; skip code/links). */
export function wrapGlossaryHtml(html: string, terms: ClientTerm[]) {
  if (!terms.length || !html) return html;
  const names = [
    ...new Set(
      terms.flatMap((t) => [t.term, ...(t.aliases || [])]).filter(Boolean),
    ),
  ].sort((a, b) => b.length - a.length);
  if (!names.length) return html;

  const pattern = new RegExp(
    `\\b(${names.map(escapeRegExp).join("|")})\\b`,
    "gi",
  );
  const parts = html.split(/(<[^>]+>)/g);
  return parts
    .map((part) => {
      if (!part || part.startsWith("<")) return part;
      return part.replace(pattern, (match) => {
        const hit = terms.find(
          (t) =>
            t.term.toLowerCase() === match.toLowerCase() ||
            t.aliases.some((a) => a.toLowerCase() === match.toLowerCase()),
        );
        if (!hit) return match;
        return `<span class="glossary-term" data-glossary-term="${escapeAttr(hit.term)}" tabindex="0">${match}</span>`;
      });
    })
    .join("");
}

function escapeAttr(value: string) {
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function GlossaryHoverLayer({
  rootRef,
  terms,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  terms: ClientTerm[];
}) {
  const byTerm = useRef(new Map<string, ClientTerm>());
  const instances = useRef<Instance[]>([]);

  useEffect(() => {
    const map = new Map<string, ClientTerm>();
    for (const term of terms) {
      map.set(term.term.toLowerCase(), term);
      for (const alias of term.aliases || []) {
        map.set(alias.toLowerCase(), term);
      }
    }
    byTerm.current = map;
  }, [terms]);

  const bind = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    instances.current.forEach((i) => i.destroy());
    instances.current = [];
    const nodes = root.querySelectorAll<HTMLElement>("[data-glossary-term], .wiki-link");
    nodes.forEach((el) => {
      const key = (
        el.getAttribute("data-glossary-term") ||
        el.getAttribute("data-title") ||
        el.textContent ||
        ""
      )
        .trim()
        .toLowerCase();
      const hit = byTerm.current.get(key);
      if (!hit) return;
      const instance = tippy(el, {
        content: `<div class="glossary-tip"><strong>${escapeAttr(hit.term)}</strong><p>${escapeAttr(hit.definition)}</p></div>`,
        allowHTML: true,
        interactive: true,
        maxWidth: 320,
        theme: "studyhub",
        delay: [120, 40],
      });
      instances.current.push(instance);
    });
  }, [rootRef]);

  useEffect(() => {
    bind();
    const root = rootRef.current;
    if (!root) return;
    const observer = new MutationObserver(() => bind());
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      instances.current.forEach((i) => i.destroy());
      instances.current = [];
    };
  }, [bind, rootRef, terms]);

  return null;
}
