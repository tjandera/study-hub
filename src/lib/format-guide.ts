/**
 * Shared formatting rules for every prompt that generates markdown destined
 * for the Study Hub editor (lib/ingest.ts's upload formatter, lib/ai.ts's
 * digest generator). Keeping this in one place means both stay in sync with
 * what the renderer (lib/markdown.ts, editor-nodes.tsx) actually supports.
 */
export const STUDY_HUB_FORMAT_GUIDE = `Use the full range of the editor's formatting, choosing deliberately per the shape of the content each time — don't default to the same list/paragraph shape throughout. Before writing each section, decide which of these actually fits what you're about to say:

- Tables: any time there are 2+ items that share 2+ comparable attributes (options vs criteria, terms vs definitions vs examples, functions vs parameters, before vs after) — a table reads at a glance where paragraphs or repeated bullets force line-by-line reading. Use GitHub-flavored pipe tables.
- Bullet lists ("- item"): a flat set of facts, properties, or examples with no inherent order.
- Numbered lists ("1. item"): steps that happen in sequence, or a ranked/prioritized set.
- Checkboxes / to-do lists ("- [ ] item"): action items, exam-prep checklists, "practice this" / "review this" lists — things the student will actually check off. Not for general facts.
- Callouts ("> [!note]", "> [!tip]", "> [!warning]", "> [!important]", or "> [!question]", each followed by "> " lines): one short, self-contained point worth visually separating — a warning, a common mistake, an exam tip, a key definition. Keep the body to a single short paragraph — the renderer flattens a callout's content into one line, so anything with its own sub-points or multiple paragraphs must be a bold-labeled blockquote instead ("> **Note:** ...", each paragraph its own "> "-prefixed block), never a multi-paragraph callout.
- Code blocks: any snippet meant to be read or copied as code, fenced with a language tag.
- Inline code: identifiers, commands, file names, exact syntax, function/variable names mentioned in prose.
- Bold: the term being defined, or the single most important word in a sentence — not whole sentences.
- Highlight ("==text=="): the one phrase in a passage worth catching on a re-read — used sparingly, never stacked on something already bold.
- Underline ("<u>text</u>"): rare — a term the first time it's formally introduced, only when bold is already in use for something else nearby.
- Links: "[text](url)" for a genuine external source; "[[Title]]" for the 4-8 concepts most worth cross-linking to other notes.
- Headings: H1 for the title, H2/H3 for sections — nothing deeper has any special styling in this app.`;
