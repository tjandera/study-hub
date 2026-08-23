"use client";

import { useEffect, useState } from "react";
import {
  MobileViewSidebar,
  deviceSpec,
  type DeviceId,
} from "@/components/mobile-view-sidebar";
import { InstallGuide } from "@/components/install-guide";

const STORAGE = "sh-device-frame";

export default function InstallPage() {
  const [device, setDevice] = useState<DeviceId>("iphone");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const stored = window.localStorage.getItem(STORAGE);
      if (
        stored === "iphone" ||
        stored === "android" ||
        stored === "ipad" ||
        stored === "desktop"
      ) {
        setDevice(stored);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE, device);
  }, [device, ready]);

  const spec = deviceSpec(device);
  const framed = device !== "desktop";

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="page-pad shrink-0 border-b @[48rem]/shell:hidden">
          <h1 className="text-2xl font-semibold tracking-tight">
            Use Study Hub as an app
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add it to your iPhone Home Screen after you deploy. Open this page
            on a wider screen to preview phone layouts.
          </p>
          <div className="mt-6">
            <InstallGuide />
          </div>
        </div>

        <div className="hidden min-h-0 flex-1 flex-col @[48rem]/shell:flex">
          <div className="shrink-0 border-b px-4 py-3">
            <h1 className="text-lg font-semibold tracking-tight">
              Mobile view
            </h1>
            <p className="text-xs text-muted-foreground">
              Live preview — click around inside the frame. Use the panel on
              the right to switch devices or install on your phone.
            </p>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-neutral-950 p-4">
            <div
              className="overflow-hidden border border-neutral-700 bg-background shadow-2xl"
              style={{
                width: framed ? spec.width : "min(100%, 56rem)",
                height: framed
                  ? `min(${spec.height}px, calc(100% - 0.5rem))`
                  : "100%",
                maxHeight: "100%",
                borderRadius: framed ? (device === "ipad" ? 18 : 40) : 12,
              }}
            >
              <iframe
                title={`${spec.label} preview`}
                src="/"
                className="h-full w-full border-0 bg-background"
              />
            </div>
          </div>
        </div>
      </div>

      <MobileViewSidebar
        device={device}
        onChange={setDevice}
        className="hidden @[48rem]/shell:block"
      />
    </div>
  );
}
