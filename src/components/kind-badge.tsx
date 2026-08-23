"use client";

import { BookOpen, Code2, Sigma, Shuffle } from "lucide-react";
import { KIND_META, kindMetaFor } from "@/lib/kinds";
import type { MaterialKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const KIND_ICON: Record<
  MaterialKind,
  React.ComponentType<{ className?: string }>
> = {
  theory: BookOpen,
  math: Sigma,
  code: Code2,
};

export function KindIcon({
  kind,
  className,
}: {
  kind: MaterialKind;
  className?: string;
}) {
  const Icon = KIND_ICON[kind];
  return <Icon className={className} />;
}

/**
 * Category chip for a quiz. `mix` is the quiz's stored category — a
 * MaterialKind for a targeted quiz, or something like "mixed" otherwise.
 */
export function KindBadge({
  mix,
  className,
}: {
  mix: string | null | undefined;
  className?: string;
}) {
  const meta = kindMetaFor(mix);
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

  if (!meta) {
    return (
      <span
        className={cn(
          base,
          "bg-muted text-muted-foreground ring-border",
          className,
        )}
      >
        <Shuffle className="size-3" />
        {mix || "mixed"}
      </span>
    );
  }

  const Icon = KIND_ICON[meta.key];
  return (
    <span className={cn(base, meta.accent, className)}>
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

export { KIND_META };
