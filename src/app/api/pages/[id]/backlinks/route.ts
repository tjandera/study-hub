import { NextResponse } from "next/server";
import { getBacklinks } from "@/lib/pages";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const backlinks = await getBacklinks(id);
  return NextResponse.json({ backlinks });
}
