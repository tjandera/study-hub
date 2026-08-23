import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const pages = pgTable("pages", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  type: text("type").notNull().default("page"),
  title: text("title").notNull().default("Untitled"),
  icon: text("icon"),
  contentMd: text("content_md").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  favorite: boolean("favorite").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  shareEnabled: boolean("share_enabled").notNull().default(false),
  shareToken: text("share_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const pageLinks = pgTable("page_links", {
  id: text("id").primaryKey(),
  fromId: text("from_id").notNull(),
  toId: text("to_id").notNull(),
  raw: text("raw").notNull(),
});

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const pageTags = pgTable("page_tags", {
  pageId: text("page_id").notNull(),
  tagId: text("tag_id").notNull(),
});

export const files = pgTable("files", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  blobUrl: text("blob_url").notNull(),
  pathname: text("pathname").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const quizzes = pgTable("quizzes", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  title: text("title").notNull(),
  mix: text("mix").notNull().default("mixed"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id").notNull(),
  type: text("type").notNull(),
  kind: text("kind").notNull().default("theory"),
  prompt: text("prompt").notNull(),
  options: text("options"),
  answer: text("answer").notNull(),
  explanation: text("explanation"),
  sortOrder: integer("sort_order").notNull().default(0),
  style: text("style").notNull().default("theoretical"),
  source: text("source"),
});

export const ragChunks = pgTable("rag_chunks", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  source: text("source").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  embedding: text("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const aiCache = pgTable("ai_cache", {
  id: text("id").primaryKey(),
  cacheKey: text("cache_key").notNull(),
  pageId: text("page_id").notNull(),
  task: text("task").notNull(),
  embedding: text("embedding"),
  corpusHash: text("corpus_hash").notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const aiSessions = pgTable("ai_sessions", {
  pageId: text("page_id").primaryKey(),
  summaryMd: text("summary_md"),
  graphJson: text("graph_json"),
  corpusHash: text("corpus_hash"),
  model: text("model"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/** Workspace/page memory: compact filing practices reused on later dumps. */
export const aiMemory = pgTable("ai_memory", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  kind: text("kind").notNull(),
  content: text("content").notNull().default(""),
  embedding: text("embedding"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const concepts = pgTable("concepts", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  posX: integer("pos_x"),
  posY: integer("pos_y"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Hoverable study terms generated from lecture notes (token-efficient glossary). */
export const glossaryTerms = pgTable("glossary_terms", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  term: text("term").notNull(),
  definition: text("definition").notNull(),
  aliases: text("aliases"),
  sourceFileId: text("source_file_id"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const conceptLinks = pgTable("concept_links", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  fromTitle: text("from_title").notNull(),
  toTitle: text("to_title").notNull(),
  relation: text("relation").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const attempts = pgTable("attempts", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  answers: text("answers"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
