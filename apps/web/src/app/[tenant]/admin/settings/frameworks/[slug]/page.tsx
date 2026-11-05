import { notFound } from "next/navigation";
import { FrameworkTracker } from "@/components/frameworks/FrameworkTracker";
import { getFramework } from "@/lib/frameworks";

export default async function FrameworkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const framework = getFramework(slug);
  if (!framework) notFound();
  return <FrameworkTracker key={slug} framework={framework} />;
}
