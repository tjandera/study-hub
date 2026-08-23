import { NextResponse } from "next/server";
import { readPptxMedia } from "@/lib/extract";
import { readFileBytes } from "@/lib/files";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const mediaPath = url.searchParams.get("path") || "";
  const packed = await readFileBytes(id);
  if (!packed?.bytes) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const media = await readPptxMedia(Buffer.from(packed.bytes), mediaPath);
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(media.bytes), {
    headers: {
      "Content-Type": media.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(media.filename)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
