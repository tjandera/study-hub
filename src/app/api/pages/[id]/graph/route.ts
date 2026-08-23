import { NextResponse } from "next/server";
import {
  addGraphNode,
  loadGraph,
  removeGraphNode,
  updateGraphPositions,
} from "@/lib/graph";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const graph = await loadGraph(id);
  return NextResponse.json({ graph });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    positions?: { title: string; x: number; y: number }[];
    add?: { title: string; summary?: string; x?: number; y?: number };
    remove?: string;
  };
  try {
    if (body.add?.title) {
      const graph = await addGraphNode(id, body.add);
      return NextResponse.json({ graph });
    }
    if (body.remove) {
      const graph = await removeGraphNode(id, body.remove);
      return NextResponse.json({ graph });
    }
    if (body.positions?.length) {
      const graph = await updateGraphPositions(id, body.positions);
      return NextResponse.json({ graph });
    }
    const graph = await loadGraph(id);
    return NextResponse.json({ graph });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Graph update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
