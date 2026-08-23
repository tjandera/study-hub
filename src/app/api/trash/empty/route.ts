import { NextResponse } from "next/server";
import { listTrash, purgePage } from "@/lib/pages";

export const runtime = "nodejs";

export async function POST() {
  const trashed = await listTrash();
  for (const page of trashed) {
    // A subtree purge removes its own children too — skip any id that a
    // prior iteration in this loop already deleted.
    await purgePage(page.id).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, count: trashed.length });
}
