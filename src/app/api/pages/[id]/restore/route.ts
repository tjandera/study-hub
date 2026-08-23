import { NextResponse } from "next/server";
import { restorePage } from "@/lib/pages";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await restorePage(id);
  return NextResponse.json({ ok: true });
}
