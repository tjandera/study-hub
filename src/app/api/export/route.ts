import { NextResponse } from "next/server";
import { exportZip } from "@/lib/import-export";

export const runtime = "nodejs";

export async function GET() {
  const buffer = await exportZip();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="study-hub.zip"',
    },
  });
}
