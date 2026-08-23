export type TemplateKey = "blank" | "lecture" | "reading" | "exam" | "week";

export const TEMPLATES: Record<
  TemplateKey,
  { title: string; icon: string; content: string }
> = {
  blank: {
    title: "Untitled",
    icon: "📄",
    content: "",
  },
  lecture: {
    title: "Lecture",
    icon: "📝",
    content: `## Learning outcomes

- 

## Notes



## Examples



## Questions for tutorial

- 
`,
  },
  reading: {
    title: "Reading",
    icon: "📗",
    content: `## Claim



## Evidence



## Critique



## Keep
`,
  },
  week: {
    title: "Week",
    icon: "📦",
    content: `Drop this week's slides, problem sets, and code on the page, then hit **Prepare this week**.

Study Hub will sort theory / math / code and build a practice quiz.

## Notes

`,
  },
  exam: {
    title: "Exam sheet",
    icon: "🎯",
    content: `## Must know

- 

## Likely questions

- 

## Traps

- 

## Formulas / definitions
`,
  },
};

export const TEMPLATE_OPTIONS: { key: TemplateKey; label: string }[] = [
  { key: "blank", label: "Empty page" },
  { key: "lecture", label: "Lecture notes" },
  { key: "reading", label: "Reading notes" },
  { key: "exam", label: "Exam sheet" },
  { key: "week", label: "Week pack" },
];
