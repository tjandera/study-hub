import { NextResponse } from "next/server";
import { hasAiKey } from "@/lib/ai";
import { MODELS } from "@/lib/gemini";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    configured: hasAiKey(),
    provider: "gemini",
    defaultModel: MODELS.lite,
    flashModel: MODELS.flash,
    reason: "GEMINI_API_KEY is the configured key; dump/chat use Flash-Lite, heavier quizzes use Flash.",
  });
}
