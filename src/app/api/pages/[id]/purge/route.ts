import { NextResponse } from "next/server";
import { purgePage } from "@/lib/pages";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await purgePage(id);
  return NextResponse.json({ ok: true });
}
