export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  type TEXT NOT NULL DEFAULT 'page',
  title TEXT NOT NULL DEFAULT 'Untitled',
  icon TEXT,
  content_md TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS pages_parent_idx ON pages(parent_id);
CREATE INDEX IF NOT EXISTS pages_updated_idx ON pages(updated_at);

CREATE TABLE IF NOT EXISTS page_links (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  raw TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS page_links_from_idx ON page_links(from_id);
CREATE INDEX IF NOT EXISTS page_links_to_idx ON page_links(to_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS page_tags (
  page_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (page_id, tag_id)
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  blob_url TEXT NOT NULL,
  pathname TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS files_page_idx ON files(page_id);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  title TEXT NOT NULL,
  mix TEXT NOT NULL DEFAULT 'mixed',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  type TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'theory',
  prompt TEXT NOT NULL,
  options TEXT,
  answer TEXT NOT NULL,
  explanation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  style TEXT NOT NULL DEFAULT 'theoretical',
  source TEXT
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rag_chunks_page_idx ON rag_chunks(page_id);

CREATE TABLE IF NOT EXISTS ai_cache (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL,
  page_id TEXT NOT NULL,
  task TEXT NOT NULL,
  embedding TEXT,
  corpus_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_cache_page_idx ON ai_cache(page_id);

CREATE TABLE IF NOT EXISTS ai_sessions (
  page_id TEXT PRIMARY KEY,
  summary_md TEXT,
  graph_json TEXT,
  corpus_hash TEXT,
  model TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_memory (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  embedding TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_memory_scope_idx ON ai_memory(scope);

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  pos_x INTEGER,
  pos_y INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  aliases TEXT,
  source_file_id TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS glossary_terms_page_idx ON glossary_terms(page_id);
CREATE INDEX IF NOT EXISTS glossary_terms_term_idx ON glossary_terms(term);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_page_idx ON chat_messages(page_id);

CREATE TABLE IF NOT EXISTS concept_links (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  from_title TEXT NOT NULL,
  to_title TEXT NOT NULL,
  relation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  answers TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
`;

export const MIGRATE_SQL = `
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS mix TEXT NOT NULL DEFAULT 'mixed';
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'theory';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS style TEXT NOT NULL DEFAULT 'theoretical';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS pos_x INTEGER;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS pos_y INTEGER;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pages_share_token_idx ON pages(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS pages_deleted_idx ON pages(deleted_at);
CREATE TABLE IF NOT EXISTS glossary_terms (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  aliases TEXT,
  source_file_id TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS glossary_terms_page_idx ON glossary_terms(page_id);
CREATE INDEX IF NOT EXISTS glossary_terms_term_idx ON glossary_terms(term);
`;
