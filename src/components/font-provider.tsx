"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const FONT_OPTIONS = [
  { key: "default", label: "Default" },
  { key: "serif", label: "Serif" },
  { key: "mono", label: "Mono" },
] as const;

export type FontKey = (typeof FONT_OPTIONS)[number]["key"];

const STORAGE_KEY = "studyhub.font.v1";

type FontContextValue = {
  font: FontKey;
  setFont: (font: FontKey) => void;
};

const FontContext = createContext<FontContextValue | null>(null);

function isFontKey(value: string | null): value is FontKey {
  return FONT_OPTIONS.some((f) => f.key === value);
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [font, setFontState] = useState<FontKey>("default");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isFontKey(stored)) setFontState(stored);
  }, []);

  useEffect(() => {
    if (font === "default") {
      document.documentElement.removeAttribute("data-font");
    } else {
      document.documentElement.setAttribute("data-font", font);
    }
    window.localStorage.setItem(STORAGE_KEY, font);
  }, [font]);

  return (
    <FontContext.Provider value={{ font, setFont: setFontState }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error("useFont must be used within FontProvider");
  return ctx;
}
