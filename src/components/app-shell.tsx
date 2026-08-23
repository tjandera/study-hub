"use client";

import { useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { ImportDialog } from "@/components/import-dialog";
import { InstallPrompt } from "@/components/install-prompt";
import { MobileNav } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { TabsBar } from "@/components/tabs-bar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-60 shrink-0 border-r @[48rem]/shell:block">
          <Sidebar onSearch={() => setCommandOpen(true)} />
        </aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[min(18rem,88vw)] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <Sidebar
              onSearch={() => {
                setMobileOpen(false);
                setCommandOpen(true);
              }}
              onClose={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <TabsBar onOpenSidebar={() => setMobileOpen(true)} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>
      <MobileNav onOpenMenu={() => setMobileOpen(true)} />
      <InstallPrompt />
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onImport={() => setImportOpen(true)}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
