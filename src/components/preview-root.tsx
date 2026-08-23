"use client";

import { createContext, useContext } from "react";

export const PreviewRootContext = createContext<HTMLElement | null>(null);

export function usePreviewRoot() {
  return useContext(PreviewRootContext);
}
