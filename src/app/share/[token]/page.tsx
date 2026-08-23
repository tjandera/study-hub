import { notFound } from "next/navigation";
import { getPageByShareToken } from "@/lib/pages";
import { DocumentView } from "@/components/document-view";

export const runtime = "nodejs";

export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const page = await getPageByShareToken(token);
  if (!page) notFound();

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background px-6 py-3 text-sm text-muted-foreground">
        🧠 Study Hub · Shared page — view only
      </header>
      <div className="px-4 py-10">
        <div className="mb-4 mx-auto max-w-3xl text-2xl">
          <span className="mr-2">{page.icon || "📄"}</span>
          <span className="font-bold tracking-tight">{page.title}</span>
        </div>
        <DocumentView markdown={page.contentMd} />
      </div>
    </div>
  );
}
