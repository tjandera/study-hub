import { NextResponse } from "next/server";
import { searchAll } from "@/lib/pages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  const hits = await searchAll(q);
  return NextResponse.json({ hits });
}
