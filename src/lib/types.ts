export type PageType = "course" | "page";

export type PageRecord = {
  id: string;
  parentId: string | null;
  type: PageType;
  title: string;
  icon: string | null;
  contentMd: string;
  sortOrder: number;
  archived: boolean;
  favorite: boolean;
  deletedAt: string | null;
  shareEnabled: boolean;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

export type PageTreeNode = Omit<PageRecord, "contentMd" | "tags"> & {
  children: PageTreeNode[];
};

export type FileRecord = {
  id: string;
  pageId: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
  pageTitle?: string;
  extractedChars?: number;
  noteId?: string;
};

export type GlossaryTermRecord = {
  id: string;
  pageId: string;
  term: string;
  definition: string;
  aliases: string[];
  sourceFileId: string | null;
  model: string | null;
  createdAt: string;
};

export type Backlink = {
  id: string;
  title: string;
  icon: string | null;
};

export type SearchHit = {
  id: string;
  title: string;
  kind: "page" | "file";
  snippet?: string;
  pageId?: string;
  icon?: string | null;
};

export type WorkspacePayload = {
  tree: PageTreeNode[];
  recents: PageTreeNode[];
  inboxId: string;
};

export type QuestionType = "mcq" | "short" | "cloze" | "math" | "code";
export type MaterialKind = "theory" | "math" | "code";
export type QuestionStyle = "theoretical" | "situational";

export type QuestionDraft = {
  type: QuestionType;
  kind: MaterialKind;
  style?: QuestionStyle;
  prompt: string;
  options?: string[] | null;
  answer: string;
  explanation?: string;
  source?: string;
};

export type QuestionRecord = QuestionDraft & {
  id: string;
  quizId: string;
  sortOrder: number;
};

export type QuizRecord = {
  id: string;
  pageId: string;
  pageTitle?: string;
  title: string;
  mix: string;
  createdAt: string;
  questionCount?: number;
  lastScore?: number | null;
  lastTotal?: number | null;
};

export type QuizAttempt = {
  id: string;
  quizId: string;
  score: number;
  total: number;
  createdAt: string;
};

export type GradedItem = {
  id: string;
  prompt: string;
  type: QuestionType;
  kind: MaterialKind;
  options: string[] | null;
  given: string;
  answer: string;
  explanation: string | null;
  correct: boolean;
};
