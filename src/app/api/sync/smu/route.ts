import { NextResponse } from "next/server";
import { reformatSmuNotes, smuNotesDir, syncSmuNotes } from "@/lib/smu-sync";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function GET() {
  return NextResponse.json({
    dir: smuNotesDir(),
    exists: true,
  });
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const reformat = url.searchParams.get("reformat") === "1";
    if (reformat) {
      const stats = await reformatSmuNotes({ ai: true });
      return NextResponse.json({ ok: true, action: "reformat", ...stats });
    }
    const stats = await syncSmuNotes();
    return NextResponse.json({ ok: true, action: "sync", ...stats, dir: smuNotesDir() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
