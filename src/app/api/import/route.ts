import { NextResponse } from "next/server";
import { importZip } from "@/lib/import-export";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const courseId = String(form.get("courseId") || "") || undefined;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Zip file required" }, { status: 400 });
  }
  try {
    const buffer = await file.arrayBuffer();
    const result = await importZip(buffer, courseId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Zip import failed", error);
    const message =
      error instanceof Error ? error.message : "Could not read that zip file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
