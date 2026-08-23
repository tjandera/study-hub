"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";

function VideoView({ node }: ReactNodeViewProps) {
  const src = String(node.attrs.src || "");
  return (
    <NodeViewWrapper className="media-block">
      <video src={src} controls className="w-full rounded-lg bg-black" />
    </NodeViewWrapper>
  );
}

function AudioView({ node }: ReactNodeViewProps) {
  const src = String(node.attrs.src || "");
  const title = String(node.attrs.title || "Audio");
  return (
    <NodeViewWrapper className="media-block">
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      <audio src={src} controls className="w-full" />
    </NodeViewWrapper>
  );
}

function CalloutView({ node }: ReactNodeViewProps) {
  const kind = String(node.attrs.kind || "note");
  return (
    <NodeViewWrapper>
      <aside className={`callout callout-${kind}`} data-kind={kind}>
        <div className="callout-label">{kind}</div>
        <NodeViewContent />
      </aside>
    </NodeViewWrapper>
  );
}

export const VideoBlock = Node.create({
  name: "videoBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: "" }, title: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "video[data-media-video]",
        getAttrs: (el) => ({
          src: (el as HTMLElement).getAttribute("src") || "",
          title: (el as HTMLElement).getAttribute("title") || "",
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, { "data-media-video": "", controls: "true" }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VideoView);
  },
});

export const AudioBlock = Node.create({
  name: "audioBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: "" }, title: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "audio[data-media-audio]",
        getAttrs: (el) => ({
          src: (el as HTMLElement).getAttribute("src") || "",
          title: (el as HTMLElement).getAttribute("title") || "",
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "audio",
      mergeAttributes(HTMLAttributes, { "data-media-audio": "", controls: "true" }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AudioView);
  },
});

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { kind: { default: "note" } };
  },
  parseHTML() {
    return [
      {
        tag: "aside[data-callout]",
        getAttrs: (el) => ({
          kind: (el as HTMLElement).getAttribute("data-kind") || "note",
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-callout": "",
        "data-kind": HTMLAttributes.kind,
      }),
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
