import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/pages";

export const runtime = "nodejs";

export async function GET() {
  const data = await getWorkspace();
  return NextResponse.json(data);
}
