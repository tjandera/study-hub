import { NextResponse } from "next/server";
import { getConnections } from "@/lib/connections";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const connections = await getConnections(id);
  if (!connections) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(connections);
}
