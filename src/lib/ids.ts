import { nanoid } from "nanoid";

export function newId() {
  return nanoid(12);
}

export function iso(value: Date | string) {
  return typeof value === "string" ? value : value.toISOString();
}

export function sanitizeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "untitled";
}
