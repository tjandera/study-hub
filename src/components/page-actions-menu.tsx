"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  CopyPlus,
  FolderInput,
  Languages,
  MoreHorizontal,
  Share2,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { MoveToDialog } from "@/components/move-to-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { FONT_OPTIONS, useFont, type FontKey } from "@/components/font-provider";
import { useTabs } from "@/components/tabs-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import type { PageRecord } from "@/lib/types";

export function PageActionsMenu({
  page,
  onRefresh,
}: {
  page: PageRecord;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const { createPage, refresh } = useWorkspace();
  const { openTab } = useTabs();
  const { font, setFont } = useFont();
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const copyContent = async () => {
    await navigator.clipboard.writeText(page.contentMd);
    toast.success("Copied page content");
  };

  const duplicate = async () => {
    const created = await createPage({
      parentId: page.parentId,
      type: page.type,
      title: `${page.title} (copy)`,
      contentMd: page.contentMd,
    });
    toast.success("Duplicated");
    openTab(`/p/${created.id}`);
  };

  const translate = async (lang: LanguageCode) => {
    const label = LANGUAGES.find((l) => l.code === lang)?.label || lang;
    const toastId = toast.loading(`Translating into ${label}…`);
    const res = await fetch(`/api/pages/${page.id}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Translation failed", { id: toastId });
      return;
    }
    toast.success(`Translated into a new ${label} page`, { id: toastId });
    await refresh();
    openTab(`/p/${json.page.id}`);
  };

  const moveToTrash = async () => {
    const res = await fetch(`/api/pages/${page.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete");
      return;
    }
    toast.success("Moved to trash — deleted forever in 30 days");
    await refresh();
    router.push("/");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Page menu">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Type className="size-4" /> Font
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={font}
                  onValueChange={(value) => setFont(value as FontKey)}
                >
                  {FONT_OPTIONS.map((opt) => (
                    <DropdownMenuRadioItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => void copyContent()}>
            <Copy className="size-4" /> Copy page content
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void duplicate()}>
            <CopyPlus className="size-4" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoveOpen(true)}>
            <FolderInput className="size-4" /> Move to
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShareOpen(true)}>
            <Share2 className="size-4" /> Share
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages className="size-4" /> Translate
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => void translate(lang.code)}
                  >
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void moveToTrash()}>
            <Trash2 className="size-4" /> Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveToDialog
        page={{ id: page.id, parentId: page.parentId }}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onMoved={onRefresh}
      />
      <ShareDialog
        page={page}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onChanged={onRefresh}
      />
    </>
  );
}
