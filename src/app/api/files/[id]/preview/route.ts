import { NextResponse } from "next/server";
import { ensurePreviewPdf } from "@/lib/preview-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const preview = await ensurePreviewPdf(id);
    return new NextResponse(new Uint8Array(preview.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(preview.filename)}"`,
        "Cache-Control": "private, max-age=300",
        "X-Preview-Converter": preview.converter,
        "X-Preview-Cached": preview.cached ? "1" : "0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
