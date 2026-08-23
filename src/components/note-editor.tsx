"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import Typography from "@tiptap/extension-typography";
import { TableKit } from "@tiptap/extension-table";
import Youtube from "@tiptap/extension-youtube";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  CheckSquare,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Link2,
  Table,
  ImageIcon,
  Video,
  AudioLines,
  Paperclip,
  CirclePlay,
  SquareCode,
  Info,
  ChevronUp,
  ChevronDown,
  Rows3,
  Columns3,
  Trash2,
} from "lucide-react";
import { WikiLink } from "@/components/wiki-link";
import { AudioBlock, Callout, VideoBlock } from "@/components/editor-nodes";
import { BlockHandle } from "@/components/block-handle";
import { jsonToMarkdown, markdownToHtml } from "@/lib/markdown";
import { mediaKind } from "@/lib/format";
import { moveBlock } from "@/lib/pm-blocks";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FileRecord } from "@/lib/types";

type SlashItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  run: (editor: Editor) => void;
};

function insertCallout(editor: Editor, kind: string) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "callout",
      attrs: { kind },
      content: [{ type: "paragraph" }],
    })
    .run();
}

const SLASH_ITEMS: SlashItem[] = [
  {
    key: "h1",
    label: "Heading 1",
    icon: Heading1,
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    key: "h2",
    label: "Heading 2",
    icon: Heading2,
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: "h3",
    label: "Heading 3",
    icon: Heading3,
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    key: "bullet",
    label: "Bulleted list",
    icon: List,
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: "ordered",
    label: "Numbered list",
    icon: ListOrdered,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: "task",
    label: "To-do list",
    icon: CheckSquare,
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    key: "quote",
    label: "Quote",
    icon: Quote,
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: "callout",
    label: "Callout",
    icon: Info,
    run: (e) => insertCallout(e, "note"),
  },
  {
    key: "code",
    label: "Code block",
    icon: SquareCode,
    run: (e) => {
      const language = window.prompt("Language (optional)", "") || "";
      e.chain().focus().toggleCodeBlock({ language }).run();
    },
  },
  {
    key: "table",
    label: "Table",
    icon: Table,
    run: (e) =>
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    key: "image",
    label: "Image",
    icon: ImageIcon,
    run: () => document.getElementById("note-media-image")?.click(),
  },
  {
    key: "video",
    label: "Video",
    icon: Video,
    run: () => document.getElementById("note-media-video")?.click(),
  },
  {
    key: "audio",
    label: "Audio",
    icon: AudioLines,
    run: () => document.getElementById("note-media-audio")?.click(),
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: CirclePlay,
    run: (e) => {
      const src = window.prompt("YouTube URL");
      if (src) e.chain().focus().setYoutubeVideo({ src }).run();
    },
  },
  {
    key: "file",
    label: "File",
    icon: Paperclip,
    run: () => document.getElementById("note-media-file")?.click(),
  },
  {
    key: "hr",
    label: "Divider",
    icon: Minus,
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    key: "up",
    label: "Move block up",
    icon: ChevronUp,
    run: (e) => {
      moveBlock(e, -1);
    },
  },
  {
    key: "down",
    label: "Move block down",
    icon: ChevronDown,
    run: (e) => {
      moveBlock(e, 1);
    },
  },
];

function insertUploaded(editor: Editor, files: FileRecord[]) {
  for (const file of files) {
    const src = `/api/files/${file.id}`;
    const kind = mediaKind(file.mime, file.filename);
    if (kind === "image") {
      editor.chain().focus().setImage({ src, alt: file.filename }).run();
    } else if (kind === "video") {
      editor.chain().focus().insertContent({ type: "videoBlock", attrs: { src, title: file.filename } }).run();
    } else if (kind === "audio") {
      editor.chain().focus().insertContent({ type: "audioBlock", attrs: { src, title: file.filename } }).run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "paragraph",
          content: [
            {
              type: "text",
              text: file.filename,
              marks: [{ type: "link", attrs: { href: src } }],
            },
          ],
        })
        .run();
    }
  }
}

export function NoteEditor({
  pageId,
  contentMd,
  onChange,
  onUploadFiles,
}: {
  pageId: string;
  contentMd: string;
  onChange: (markdown: string) => void;
  onUploadFiles?: (files: FileList | File[]) => Promise<FileRecord[] | void>;
}) {
  const [slash, setSlash] = useState<{ query: string; index: number } | null>(
    null,
  );
  const loadedFor = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({
        placeholder: "Type '/' for commands, or [[ to link a page…",
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false }),
      Typography,
      TableKit.configure({ table: { resizable: true } }),
      Youtube.configure({ controls: true, nocookie: true, modestBranding: true }),
      VideoBlock,
      AudioBlock,
      Callout,
      WikiLink,
    ],
    editorProps: {
      attributes: {
        class: "note-prose",
      },
      handleKeyDown: (_view, event) => {
        const inst = editorRef.current;
        if (!inst) return false;
        const mod = event.metaKey || event.ctrlKey;
        const move =
          event.altKey || (mod && event.shiftKey);
        if (move && event.key === "ArrowUp") {
          event.preventDefault();
          moveBlock(inst, -1);
          return true;
        }
        if (move && event.key === "ArrowDown") {
          event.preventDefault();
          moveBlock(inst, 1);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length && onUploadFiles) {
          void onUploadFiles(files).then((saved) => {
            if (saved?.length && editorRef.current) insertUploaded(editorRef.current, saved);
          });
          return true;
        }
        const text = event.clipboardData?.getData("text/plain") || "";
        if (/youtu(\.be|be\.com)/i.test(text) && editorRef.current) {
          editorRef.current.chain().focus().setYoutubeVideo({ src: text.trim() }).run();
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length && onUploadFiles) {
          event.preventDefault();
          void onUploadFiles(files).then((saved) => {
            if (saved?.length && editorRef.current) insertUploaded(editorRef.current, saved);
          });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(jsonToMarkdown(instance.getJSON()));
      const { $from } = instance.state.selection;
      const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
      const match = text.match(/(?:^|\s)\/([^\s]*)$/);
      setSlash(match ? { query: match[1].toLowerCase(), index: 0 } : null);
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    if (loadedFor.current === pageId) return;
    loadedFor.current = pageId;
    let cancelled = false;
    void markdownToHtml(contentMd).then((html) => {
      if (cancelled || !editor) return;
      editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
    });
    return () => {
      cancelled = true;
    };
  }, [contentMd, editor, pageId]);

  const filtered = useMemo(() => {
    if (!slash) return [];
    return SLASH_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(slash.query) || item.key.includes(slash.query),
    );
  }, [slash]);

  const applySlash = (item: SlashItem) => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
    const match = text.match(/(?:^|\s)(\/[^\s]*)$/);
    if (match) {
      const from = editor.state.selection.from - match[1].length;
      editor.chain().focus().deleteRange({ from, to: editor.state.selection.from }).run();
    }
    item.run(editor);
    setSlash(null);
  };

  const pickFiles = async (list: FileList | null) => {
    if (!list || !onUploadFiles || !editor) return;
    const saved = await onUploadFiles(list);
    if (saved?.length) insertUploaded(editor, saved);
  };

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", prev || "https://");
    if (href === null) return;
    if (!href) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href }).run();
  };

  if (!editor) {
    return <div className="min-h-48 animate-pulse rounded-lg bg-muted/50" />;
  }

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 mb-3 bg-background/95 pb-1 backdrop-blur">
      <div className="flex flex-wrap gap-0.5">
        <Tool label="Heading 1" hint="Large page title" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 /></Tool>
        <Tool label="Heading 2" hint="Section heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
        <Tool label="Heading 3" hint="Sub-section heading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 /></Tool>
        <Tool label="Bold" hint="Emphasize text (Cmd+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></Tool>
        <Tool label="Italic" hint="Emphasize text (Cmd+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></Tool>
        <Tool label="Underline" hint="Underline the selection" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon /></Tool>
        <Tool label="Strikethrough" hint="Mark text as removed" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough /></Tool>
        <Tool label="Highlight" hint="Mark a passage to review" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter /></Tool>
        <Tool label="Inline code" hint="Code inside a sentence" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code /></Tool>
        <Tool label="Link" hint="Turn the selection into a URL" active={editor.isActive("link")} onClick={setLink}><Link2 /></Tool>
        <Tool label="Bulleted list" hint="Unordered list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></Tool>
        <Tool label="Numbered list" hint="Ordered steps" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></Tool>
        <Tool label="To-do list" hint="Checkboxes you can tick" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><CheckSquare /></Tool>
        <Tool label="Quote" hint="Pull-quote or cited line" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote /></Tool>
        <Tool label="Callout" hint="A highlighted note or tip" onClick={() => insertCallout(editor, "note")}><Info /></Tool>
        <Tool label="Code block" hint="Multiline snippet with a language" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><SquareCode /></Tool>
        <Tool label="Table" hint="Insert a 3×3 table" active={editor.isActive("table")} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table /></Tool>
        <Tool label="Image" hint="Upload a picture into the note" onClick={() => document.getElementById("note-media-image")?.click()}><ImageIcon /></Tool>
        <Tool label="Video" hint="Upload a video file" onClick={() => document.getElementById("note-media-video")?.click()}><Video /></Tool>
        <Tool label="Audio" hint="Upload an audio clip" onClick={() => document.getElementById("note-media-audio")?.click()}><AudioLines /></Tool>
        <Tool label="YouTube" hint="Embed a YouTube URL" onClick={() => {
          const src = window.prompt("YouTube URL");
          if (src) editor.chain().focus().setYoutubeVideo({ src }).run();
        }}><CirclePlay /></Tool>
        <Tool label="Attach file" hint="Link any file in the note" onClick={() => document.getElementById("note-media-file")?.click()}><Paperclip /></Tool>
        <Tool label="Move block up" hint="⌥↑ or drag the grip on the left" onClick={() => moveBlock(editor, -1)}><ChevronUp /></Tool>
        <Tool label="Move block down" hint="⌥↓ or drag the grip on the left" onClick={() => moveBlock(editor, 1)}><ChevronDown /></Tool>
      </div>
      {editor.isActive("table") && (
        <div className="mb-3 flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/40 px-1 py-1">
          <span className="px-1.5 text-[11px] font-medium text-muted-foreground">Table</span>
          <Tool label="Add column" hint="Insert a column to the right" onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 /></Tool>
          <Tool label="Delete column" hint="Remove the current column" onClick={() => editor.chain().focus().deleteColumn().run()}><Minus /></Tool>
          <Tool label="Add row" hint="Insert a row below" onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 /></Tool>
          <Tool label="Delete row" hint="Remove the current row" onClick={() => editor.chain().focus().deleteRow().run()}><Minus /></Tool>
          <Tool label="Header row" hint="Toggle the first row as a header" onClick={() => editor.chain().focus().toggleHeaderRow().run()}><Heading3 /></Tool>
          <Tool label="Delete table" hint="Remove the whole table" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 /></Tool>
        </div>
      )}
      </div>
      <input id="note-media-image" type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }} />
      <input id="note-media-video" type="file" accept="video/*" multiple className="hidden" onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }} />
      <input id="note-media-audio" type="file" accept="audio/*" multiple className="hidden" onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }} />
      <input id="note-media-file" type="file" multiple className="hidden" onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }} />
      <div ref={wrapRef} className="editor-blocks relative">
        <BlockHandle editor={editor} wrapRef={wrapRef} />
        <EditorContent editor={editor} />
      </div>
      {slash && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
          {filtered.map((item, i) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                i === slash.index && "bg-muted",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                applySlash(item);
              }}
            >
              <item.icon className="size-4 text-muted-foreground" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Tool({
  children,
  onClick,
  active,
  label,
  hint,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className={cn(active && "bg-muted")}
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        <span className="font-medium">{label}</span>
        {hint ? <span className="text-background/70"> · {hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
