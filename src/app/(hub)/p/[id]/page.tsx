"use client";

import { useParams } from "next/navigation";
import { PageCanvas } from "@/components/page-canvas";

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  return <PageCanvas pageId={id} />;
}
