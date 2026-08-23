import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { chatMessages } from "@/db/schema";
import { BUDGET, clip } from "@/lib/ai-budget";
import { generateText, hasAiKey, MODELS, routeModel } from "@/lib/gemini";
import { reextractEmptyFiles } from "@/lib/files";
import { newId, iso } from "@/lib/ids";
import { getPage } from "@/lib/pages";
import { formatChunks, indexPage, loadChunks, retrieve } from "@/lib/rag";

export type ChatMessage = {
  id: string;
  pageId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export async function listChat(pageId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.pageId, pageId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(40);
  return rows
    .map((row) => ({
      id: row.id,
      pageId: row.pageId,
      role: row.role as "user" | "assistant",
      content: row.content,
      createdAt: iso(row.createdAt),
    }))
    .reverse();
}

async function saveMessage(
  pageId: string,
  role: "user" | "assistant",
  content: string,
) {
  const db = await getDb();
  const id = newId();
  const now = new Date();
  await db.insert(chatMessages).values({
    id,
    pageId,
    role,
    content,
    createdAt: now,
  });
  return {
    id,
    pageId,
    role,
    content,
    createdAt: iso(now),
  } satisfies ChatMessage;
}

export async function clearChat(pageId: string) {
  const db = await getDb();
  await db.delete(chatMessages).where(eq(chatMessages.pageId, pageId));
}

export async function sendChat(pageId: string, message: string) {
  const text = message.trim();
  if (!text) throw new Error("Message required");
  const page = await getPage(pageId);
  if (!page) throw new Error("Page not found");

  const userMsg = await saveMessage(pageId, "user", text);

  if (!hasAiKey()) {
    const reply =
      "Add GEMINI_API_KEY to `.env.local` (not `.env.example`) and restart the app to chat against your notes.";
    const assistant = await saveMessage(pageId, "assistant", reply);
    return { user: userMsg, assistant, sources: [] as string[] };
  }

  let chunks = await loadChunks(pageId);
  if (!chunks.length) {
    await reextractEmptyFiles(pageId);
    const indexed = await indexPage(pageId);
    chunks = indexed.indexed;
  }
  const hits = chunks.length
    ? await retrieve(pageId, text, BUDGET.chatChunks)
    : [];
  const history = (await listChat(pageId))
    .filter((m) => m.id !== userMsg.id)
    .slice(-BUDGET.chatHistoryMsgs)
    .map((m) => ({
      role: (m.role === "user" ? "user" : "model") as "user" | "model",
      text: clip(m.content, BUDGET.chatHistoryChars),
    }));

  const model =
    MODELS[
      routeModel({
        chars: hits.reduce((n, h) => n + h.text.length, 0) + page.contentMd.length,
        math: 0,
        code: 0,
        task: "chat",
      })
    ];

  const reply = await generateText({
    model,
    maxTokens: BUDGET.textOut.chat,
    system: `You are a personal study tutor for this student's notes.
Synthesize an answer from the provided materials.
Cite sources by their human-readable source names in parentheses, never internal ids.
If the notes discuss the topic even without a textbook definition, explain it from what is there.
Only say you cannot answer if the materials are unrelated. Use markdown.`,
    history,
    user: `Question: ${text}

PAGE: ${page.title}
${clip(page.contentMd, BUDGET.chatPage)}

RETRIEVED CHUNKS:
${hits.length ? formatChunks(hits, BUDGET.chatChunk * BUDGET.chatChunks) : "(no indexed materials yet)"}`,
  });

  const assistant = await saveMessage(pageId, "assistant", reply);
  return {
    user: userMsg,
    assistant,
    sources: [...new Set(hits.map((h) => h.source))],
  };
}
