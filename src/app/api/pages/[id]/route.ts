import { NextResponse } from "next/server";
import { archivePage, breadcrumbs, getPage, updatePage } from "@/lib/pages";
import type { PageType } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const crumbs = await breadcrumbs(id);
  return NextResponse.json({ page, breadcrumbs: crumbs });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    title?: string;
    icon?: string | null;
    contentMd?: string;
    parentId?: string | null;
    type?: PageType;
    favorite?: boolean;
    sortOrder?: number;
    tags?: string[];
  };
  try {
    const page = await updatePage(id, body);
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ page });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await archivePage(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
