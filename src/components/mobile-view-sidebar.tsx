"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { InstallGuide } from "@/components/install-guide";
import { cn } from "@/lib/utils";

export type DeviceId = "iphone" | "android" | "ipad" | "desktop";

const DEVICES: {
  id: DeviceId;
  label: string;
  hint: string;
  width: number;
  height: number;
  icon: typeof Smartphone;
}[] = [
  { id: "iphone", label: "iPhone", hint: "390 × 844", width: 390, height: 844, icon: Smartphone },
  { id: "android", label: "Pixel", hint: "360 × 800", width: 360, height: 800, icon: Smartphone },
  { id: "ipad", label: "iPad", hint: "768 × 1024", width: 768, height: 1024, icon: Tablet },
  { id: "desktop", label: "Desktop", hint: "Full width preview", width: 1024, height: 720, icon: Monitor },
];

export function deviceSpec(id: DeviceId) {
  return DEVICES.find((d) => d.id === id) || DEVICES[0];
}

export function MobileViewSidebar({
  device,
  onChange,
  className,
}: {
  device: DeviceId;
  onChange: (id: DeviceId) => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "h-full w-80 shrink-0 overflow-y-auto border-l bg-background p-4 text-sm",
        className,
      )}
    >
      <h2 className="text-sm font-semibold">Mobile view</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick a device to preview how Study Hub looks on your phone. The preview
        on the left is live.
      </p>

      <div className="mt-4 space-y-1">
        {DEVICES.map((item) => {
          const Icon = item.icon;
          const active = device === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
                active
                  ? "border-foreground bg-muted"
                  : "border-transparent hover:bg-muted/60",
              )}
              aria-pressed={active}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {item.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 border-t pt-4">
        <InstallGuide compact />
      </div>
    </aside>
  );
}
