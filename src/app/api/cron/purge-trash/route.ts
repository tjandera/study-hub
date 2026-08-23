import { NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/lib/pages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const purged = await purgeExpiredTrash();
  return NextResponse.json({ ok: true, purged });
}
