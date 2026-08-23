import { eq } from "drizzle-orm";
import { pages } from "@/db/schema";
import { INBOX_ID } from "@/lib/constants";

const GETTING_STARTED_ID = "getting-started";
const WELCOME_ID = "welcome";
const HOW_NOTES_ID = "how-to-take-notes";
const HOW_LINKS_ID = "how-to-link-pages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureSeed(db: any) {
  const existing = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.id, INBOX_ID))
    .limit(1);
  if (existing.length) return;

  const now = new Date();
  const row = (
    id: string,
    parentId: string | null,
    type: "course" | "page",
    title: string,
    icon: string,
    contentMd: string,
    sortOrder: number,
  ) => ({
    id,
    parentId,
    type,
    title,
    icon,
    contentMd,
    sortOrder,
    archived: false,
    favorite: id === WELCOME_ID,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(pages).values([
    row(
      INBOX_ID,
      null,
      "page",
      "Inbox",
      "📥",
      `Quick capture lands here. File things into a course when you have a minute.

Try a wikilink: [[Welcome]]
`,
      0,
    ),
    row(
      GETTING_STARTED_ID,
      null,
      "course",
      "Getting Started",
      "📘",
      `This is a **course** — a top-level page with children, like a Notion workspace section.

- Write notes on the right.
- Link them with [[Welcome]].
- Drop PDFs onto a page for split-view study.
`,
      1,
    ),
    row(
      WELCOME_ID,
      GETTING_STARTED_ID,
      "page",
      "Welcome",
      "👋",
      `# Welcome to Study Hub

This is your second brain for the semester. Everything is a **page**.

## What to do first

1. Make a course for each module (\`New course\` in the sidebar).
2. Add a page per week or topic.
3. Drop lecture PDFs onto the page — split view keeps the slide next to your notes.
4. Link ideas with [[How to link pages]].
5. For a week of class: use the **Week pack** template, dump slides + problem sets + code, then **Prepare this week**.

Import a zip of messy folders from the command palette (\`Cmd+K\` → Import).
`,
      0,
    ),
    row(
      HOW_NOTES_ID,
      GETTING_STARTED_ID,
      "page",
      "How to take notes",
      "📝",
      `# How to take notes

Type \`/\` for headings, lists, and quotes.

Use templates when you create a page:

- **Lecture** — outcomes, notes, examples, tutorial questions
- **Reading** — claim, evidence, critique
- **Exam sheet** — must-know, likely questions, traps

Keep notes short. Link out to [[Welcome]] instead of duplicating.
`,
      1,
    ),
    row(
      HOW_LINKS_ID,
      GETTING_STARTED_ID,
      "page",
      "How to link pages",
      "🔗",
      `# How to link pages

Write [[Welcome]] and it becomes a pill. Unresolved titles stay as text until a page with that name exists — same idea as Obsidian.

Click a link to jump. Backlinks show on the right of every page.
`,
      2,
    ),
  ]);
}
