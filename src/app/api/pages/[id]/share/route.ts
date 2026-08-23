import { NextResponse } from "next/server";
import { disableShare, enableShare } from "@/lib/pages";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await enableShare(id);
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(`/share/${token}`, request.url).toString();
  return NextResponse.json({ ok: true, token, url });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await disableShare(id);
  return NextResponse.json({ ok: true });
}
