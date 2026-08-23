"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, ListChecks, Menu, Network } from "lucide-react";
import { INBOX_ID } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  {
    href: `/p/${INBOX_ID}`,
    label: "Inbox",
    icon: Inbox,
    match: (p: string) => p === `/p/${INBOX_ID}`,
  },
  {
    href: "/practice",
    label: "Practice",
    icon: ListChecks,
    match: (p: string) => p === "/practice" || p.startsWith("/quiz/"),
  },
  {
    href: "/graph",
    label: "Graph",
    icon: Network,
    match: (p: string) => p === "/graph",
  },
] as const;

export function MobileNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      className="grid shrink-0 grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur @[48rem]/shell:hidden"
      aria-label="Primary"
    >
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px]",
              active ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
      >
        <Menu className="size-5" />
        More
      </button>
    </nav>
  );
}
