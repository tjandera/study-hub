import "server-only";

import { z } from "zod";
import { generateJson, hasAiKey, MODELS, routeModel } from "@/lib/gemini";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";

export { hasAiKey };

const TranslateSchema = z.object({
  title: z.string().min(1),
  contentMd: z.string(),
});

export async function translatePage(input: {
  title: string;
  contentMd: string;
  targetLang: LanguageCode;
}): Promise<{ title: string; contentMd: string }> {
  if (!hasAiKey()) throw new Error("NO_KEY");
  const label = LANGUAGES.find((l) => l.code === input.targetLang)?.label || input.targetLang;
  const model =
    MODELS[
      routeModel({
        chars: input.contentMd.length,
        math: 0,
        code: 0,
        task: "other",
      })
    ];

  const raw = await generateJson({
    model,
    maxTokens: 8_192,
    system: `You are a precise translator for a student's study notes.
Translate the given title and markdown body into ${label}.
Preserve markdown structure exactly: headings, lists, tables, blockquotes,
and image/file links. Keep [[wiki link]] syntax intact — translate only the
visible text inside the brackets. Do NOT translate text inside \`\`\` fenced
code blocks or inline \`code\` — leave code exactly as written. Do not add
commentary or notes of your own. Output JSON: { "title": string, "contentMd": string }.`,
    user: `TITLE:\n${input.title}\n\nBODY:\n${input.contentMd}`,
  });
  return TranslateSchema.parse(raw);
}
