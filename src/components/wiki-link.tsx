"use client";

import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useRouter } from "next/navigation";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";
import { useWorkspace } from "@/components/workspace-provider";

function WikiLinkView({ node, editor }: ReactNodeViewProps) {
  const router = useRouter();
  const { createPage, refresh } = useWorkspace();
  const title = String(node.attrs.title || "");
  const [definition, setDefinition] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const pageId =
    (editor?.options.element as HTMLElement | undefined)
      ?.closest("[data-page-id]")
      ?.getAttribute("data-page-id") || "";

  useEffect(() => {
    if (!pageId || !title) return;
    let cancelled = false;
    void fetch(
      `/api/pages/${pageId}/glossary?term=${encodeURIComponent(title)}`,
    )
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setDefinition(json.term?.definition || null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pageId, title]);

  useEffect(() => {
    const el = buttonRef.current;
    if (!el || !definition) return;
    const instance = tippy(el, {
      content: `<div class="glossary-tip"><strong>${title.replace(/"/g, "&quot;")}</strong><p>${definition.replace(/</g, "&lt;")}</p></div>`,
      allowHTML: true,
      interactive: true,
      maxWidth: 320,
      theme: "studyhub",
      delay: [120, 40],
    });
    return () => instance.destroy();
  }, [definition, title]);

  return (
    <NodeViewWrapper as="span" className="wiki-link-wrap">
      <button
        type="button"
        className="wiki-link"
        title={definition || undefined}
        ref={buttonRef}
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const res = await fetch(
            `/api/pages?title=${encodeURIComponent(title)}`,
          );
          const json = await res.json();
          if (json.page) {
            router.push(`/p/${json.page.id}`);
            return;
          }
          const page = await createPage({ title });
          await refresh();
          router.push(`/p/${page.id}`);
        }}
      >
        {title}
      </button>
    </NodeViewWrapper>
  );
}

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      title: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
        getAttrs: (el) => ({
          title: (el as HTMLElement).getAttribute("data-title") || "",
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": "",
        "data-title": HTMLAttributes.title,
      }),
      HTMLAttributes.title,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^[\]]+)\]\]$/,
        handler: ({ range, match, chain }) => {
          const title = match[1].split("|")[0].trim();
          chain()
            .deleteRange(range)
            .insertContent({ type: this.name, attrs: { title } })
            .run();
        },
      }),
    ];
  },
});
