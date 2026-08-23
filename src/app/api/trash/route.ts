import { NextResponse } from "next/server";
import { listTrash, purgeExpiredTrash } from "@/lib/pages";

export const runtime = "nodejs";

export async function GET() {
  await purgeExpiredTrash();
  const pages = await listTrash();
  return NextResponse.json({ pages });
}
