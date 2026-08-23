import { NextResponse } from "next/server";
import { reformatSmuNotes } from "@/lib/smu-sync";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST() {
  const stats = await reformatSmuNotes({
    ai: true,
    currentTermOnly: true,
    aiLimit: 200,
    requireSlideLook: false,
  });
  return NextResponse.json({ ok: true, ...stats });
}
