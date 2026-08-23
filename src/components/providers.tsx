"use client";

import { ThemeProvider } from "next-themes";
import { DevicePreview } from "@/components/device-preview";
import { FontProvider } from "@/components/font-provider";
import { PwaRegister } from "@/components/pwa-register";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <FontProvider>
        <TooltipProvider delayDuration={200}>
          <DevicePreview>
            {children}
            <Toaster />
          </DevicePreview>
          <PwaRegister />
        </TooltipProvider>
      </FontProvider>
    </ThemeProvider>
  );
}
