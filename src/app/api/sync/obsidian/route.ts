import { NextResponse } from "next/server";
import { obsidianVaultDir, syncObsidianNotes } from "@/lib/obsidian-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({
    dir: obsidianVaultDir(),
    exists: true,
  });
}

export async function POST() {
  try {
    const stats = await syncObsidianNotes();
    return NextResponse.json({ ok: true, ...stats, dir: obsidianVaultDir() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
