"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  deleteBlock,
  duplicateBlock,
  getTopBlockByIndex,
  insertBlockBelow,
  moveBlock,
  moveBlockToIndex,
  topBlockIndexAt,
} from "@/lib/pm-blocks";
import { cn } from "@/lib/utils";

type Hover = {
  top: number;
  height: number;
  index: number;
};

export function BlockHandle({
  editor,
  wrapRef,
}: {
  editor: Editor;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const locate = (clientX: number, clientY: number): Hover | null => {
      const pos = editor.view.posAtCoords({ left: clientX, top: clientY });
      if (!pos) return null;
      const index = topBlockIndexAt(editor.state, pos.pos);
      const ctx = getTopBlockByIndex(editor.state, index);
      if (!ctx) return null;
      const nodeDom = editor.view.nodeDOM(ctx.from);
      if (!(nodeDom instanceof HTMLElement)) return null;
      const wrapRect = wrap.getBoundingClientRect();
      const rect = nodeDom.getBoundingClientRect();
      return {
        top: rect.top - wrapRect.top,
        height: rect.height,
        index,
      };
    };

    const onMove = (event: MouseEvent) => {
      if (dragging || menu) return;
      setHover(locate(event.clientX, event.clientY));
    };

    const onLeave = (event: MouseEvent) => {
      if (dragging || menu) return;
      const related = event.relatedTarget as Node | null;
      if (related && wrap.contains(related)) return;
      setHover(null);
    };

    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", onLeave);
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mouseleave", onLeave);
    };
  }, [editor, wrapRef, dragging, menu]);

  if (!hover) return null;

  const focusBlock = (index: number) => {
    const ctx = getTopBlockByIndex(editor.state, index);
    if (!ctx) return;
    editor.chain().focus().setTextSelection(ctx.from + 1).run();
  };

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu(false);
    setDragging(true);
    let current = hover.index;
    const startY = event.clientY;
    let moved = false;

    const onMove = (e: PointerEvent) => {
      if (Math.abs(e.clientY - startY) > 4) moved = true;
      const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!pos) return;
      const target = topBlockIndexAt(editor.state, pos.pos);
      if (target === current) return;
      const ctx = getTopBlockByIndex(editor.state, current);
      if (!ctx) return;
      if (moveBlockToIndex(editor, ctx, target)) current = target;
      const wrap = wrapRef.current;
      const next = getTopBlockByIndex(editor.state, current);
      const nodeDom = next ? editor.view.nodeDOM(next.from) : null;
      if (wrap && nodeDom instanceof HTMLElement) {
        const wrapRect = wrap.getBoundingClientRect();
        const rect = nodeDom.getBoundingClientRect();
        setHover({
          top: rect.top - wrapRect.top,
          height: rect.height,
          index: current,
        });
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(false);
      if (!moved) setMenu(true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="block-handle"
      style={{ top: hover.top, height: Math.max(hover.height, 28) }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex flex-col items-center justify-center">
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Move block up"
          onClick={() => {
            focusBlock(hover.index);
            moveBlock(editor, -1);
          }}
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground",
            dragging && "cursor-grabbing",
          )}
          aria-label="Drag to reorder this block"
          onPointerDown={startDrag}
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Move block down"
          onClick={() => {
            focusBlock(hover.index);
            moveBlock(editor, 1);
          }}
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>
      {menu && (
        <div className="absolute left-7 top-1 z-30 w-44 overflow-hidden rounded-lg border bg-popover py-1 text-sm shadow-md">
          <MenuItem
            icon={ChevronUp}
            label="Move up"
            onClick={() => {
              focusBlock(hover.index);
              moveBlock(editor, -1);
              setMenu(false);
            }}
          />
          <MenuItem
            icon={ChevronDown}
            label="Move down"
            onClick={() => {
              focusBlock(hover.index);
              moveBlock(editor, 1);
              setMenu(false);
            }}
          />
          <MenuItem
            icon={Plus}
            label="Insert below"
            onClick={() => {
              focusBlock(hover.index);
              insertBlockBelow(editor);
              setMenu(false);
            }}
          />
          <MenuItem
            icon={Copy}
            label="Duplicate"
            onClick={() => {
              focusBlock(hover.index);
              duplicateBlock(editor);
              setMenu(false);
            }}
          />
          <MenuItem
            icon={Trash2}
            label="Delete"
            danger
            onClick={() => {
              focusBlock(hover.index);
              deleteBlock(editor);
              setMenu(false);
              setHover(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted",
        danger && "text-destructive",
      )}
      onClick={onClick}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
