import { NextResponse } from "next/server";
import { createPage, findPageByTitle, listTitleMatches } from "@/lib/pages";
import type { PageType } from "@/lib/types";
import type { TemplateKey } from "@/lib/templates";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title");
  const q = searchParams.get("q");
  if (title) {
    const page = await findPageByTitle(title);
    return NextResponse.json({ page });
  }
  const pages = await listTitleMatches(q || "", 12);
  return NextResponse.json({ pages });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    parentId?: string | null;
    type?: PageType;
    title?: string;
    icon?: string | null;
    template?: TemplateKey;
    contentMd?: string;
  };
  const page = await createPage(body);
  return NextResponse.json({ page });
}
