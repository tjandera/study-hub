# Study Hub

Private second brain for one semester: Notion-shaped pages, Obsidian-style `[[wikilinks]]`, a file library, and quizzes from a week's materials.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Default password is `study` (set `SITE_PASSWORD` in `.env.local`).

Local data lives in `.data/` (Postgres-compatible PGlite + uploaded files). It is gitignored.

## Deploy (open anywhere)

1. Push to GitHub and import the repo on Vercel.
2. Create a Neon database. Set `DATABASE_URL`.
3. Create a Vercel Blob store. Set `BLOB_READ_WRITE_TOKEN`.
4. Set `SITE_PASSWORD` and a long `SESSION_SECRET`.
5. Optional: `GEMINI_API_KEY` for Gemini-written quizzes (https://aistudio.google.com/apikey). Default model is `gemini-3.5-flash-lite`.

The whole site is password-gated and `noindex`.

## Use it

- **Sidebar** — courses, nested pages, Inbox, Library, and a workspace-wide idea Graph tab
- **Editor** — `/` commands, `[[wikilinks]]`, tags, templates on a course page; click a note's Outline (or a Document-view table of contents) to jump straight to a heading
- **Split view** — click a file, or a note's `Source:` link, to study a PDF/slide deck beside your notes without leaving the page
- **Drag & drop** — drop files anywhere on a page: a `.zip` unpacks into pages/notes, everything else attaches and gets formatted
- **⌘K** — search, create, import a zip of messy lecture folders, export a markdown vault
- **Week pack** — upload a week's slides, problem sets, and code; Prepare sorts theory / math / code and builds a practice quiz. Toggle "Quick convert (no AI)" to skip Gemini and use deterministic, code-based Markdown conversion instead (reads Word's own heading/list styles), or paste Markdown you already have straight in
- **Quizzes** — "Generate quiz" mixes theory and situational questions; "Theory quiz" builds MCQ-only definitions/distinctions; "Situational quiz" builds harder, applied scenario questions. After grading, "Retry N missed" spins up a focused quiz from just what you got wrong
- **Practice** — sit generated or hand-written quizzes (MCQ, short answer, cloze, math, code); anything scored under 70% last time surfaces in "Needs review"

Optional: set `GEMINI_API_KEY` in `.env.local`. The app uses Gemini 3.5 Flash-Lite by default and routes heavier math/code weeks to Flash. Digests are stored as Markdown and rendered as a Word-style document. Quizzes cover theoretical and situational questions until the week's chunks are covered.

## Stack

Next.js (App Router), Tailwind, shadcn/ui, Tiptap, Drizzle, PGlite locally / Neon in production, Vercel Blob in production.
