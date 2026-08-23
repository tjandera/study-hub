import { NextResponse } from "next/server";
import { formatNotesWithGlossary } from "@/lib/ingest";
import {
  listGlossaryForPage,
  lookupGlossaryTerm,
  replaceGlossaryTerms,
} from "@/lib/glossary";
import { getPage, updatePage } from "@/lib/pages";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const term = url.searchParams.get("term");
  if (term) {
    const hit = await lookupGlossaryTerm(id, term);
    return NextResponse.json({ term: hit });
  }
  const terms = await listGlossaryForPage(id);
  return NextResponse.json({ terms });
}

/** Regenerate glossary (+ optional note polish) from the page's current markdown. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const rewrite = Boolean(body?.rewrite);
  const source = (page.contentMd || "").replace(/\n---\n[\s\S]*$/, "");
  const formatted = await formatNotesWithGlossary(
    page.title,
    source || page.title,
    "ai",
    `${page.title}.md`,
  );
  if (rewrite && formatted.markdown.trim()) {
    const tail = page.contentMd.match(/\n---\n[\s\S]*$/)?.[0] || "";
    await updatePage(id, {
      contentMd: `${formatted.markdown.trim()}${tail ? `\n${tail.trim()}\n` : "\n"}`,
    });
  }
  const terms = await replaceGlossaryTerms(id, formatted.terms, {
    model: formatted.model || undefined,
  });
  return NextResponse.json({
    ok: true,
    terms: terms.length,
    model: formatted.model,
    rewritten: rewrite,
  });
}
