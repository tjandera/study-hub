import type { MaterialKind } from "@/lib/types";

export type KindMeta = {
  key: MaterialKind;
  label: string;
  emoji: string;
  blurb: string;
  /** Tailwind classes for the badge/logo chip. */
  accent: string;
};

export const KIND_META: Record<MaterialKind, KindMeta> = {
  theory: {
    key: "theory",
    label: "Theory",
    emoji: "🧠",
    blurb: "Understanding and recall — definitions, distinctions, why it matters",
    accent:
      "bg-violet-500/10 text-violet-600 ring-violet-500/30 dark:text-violet-300",
  },
  math: {
    key: "math",
    label: "Math",
    emoji: "➗",
    blurb: "Equations and applying the right formula to solve a problem",
    accent:
      "bg-sky-500/10 text-sky-600 ring-sky-500/30 dark:text-sky-300",
  },
  code: {
    key: "code",
    label: "Code",
    emoji: "💻",
    blurb: "Concepts behind the code plus writing, tracing, and debugging it",
    accent:
      "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300",
  },
};

export const KIND_ORDER: MaterialKind[] = ["theory", "math", "code"];

export function isMaterialKind(value: string): value is MaterialKind {
  return value === "theory" || value === "math" || value === "code";
}

/**
 * A quiz's `mix` column holds either a MaterialKind or a free-form label
 * ("mixed"). Returns metadata only when it is a real category.
 */
export function kindMetaFor(mix: string | null | undefined): KindMeta | null {
  if (!mix) return null;
  const key = mix.toLowerCase();
  return isMaterialKind(key) ? KIND_META[key] : null;
}
