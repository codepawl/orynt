import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { metaData } from "app/config";
import { fetchPaper, fetchReproductions } from "app/lib/papers";
import { PaperDetail } from "./PaperDetail";
import { ReproductionList } from "./ReproductionList";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const paper = await fetchPaper(id);
  if (!paper) return { title: "Paper not found" };

  const statusLabel =
    paper.verification_status === "verified" ? "Verified"
    : paper.verification_status === "disputed" ? "Disputed"
    : paper.verification_status === "partially_reproduced" ? "Partially Reproduced"
    : "Unverified";

  return {
    title: `${paper.title} — ${statusLabel}`,
    description: paper.abstract?.slice(0, 160) || `Reproduction reports for ${paper.title}`,
    alternates: { canonical: `${metaData.baseUrl}papers/${id}` },
    openGraph: {
      title: `${paper.title} — ${statusLabel} | CodePawl`,
      description: paper.abstract?.slice(0, 160) || `Reproduction reports for ${paper.title}`,
      url: `${metaData.baseUrl}papers/${id}`,
      siteName: metaData.name,
      type: "article",
    },
  };
}

export default async function PaperPage({ params }: Props) {
  const { id } = await params;
  const [paper, reproductions] = await Promise.all([
    fetchPaper(id),
    fetchReproductions(id),
  ]);

  if (!paper) notFound();

  return (
    <div className="max-w-4xl mx-auto w-full">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ScholarlyArticle",
            name: paper.title,
            author: paper.authors.split(",").map((a) => ({
              "@type": "Person",
              name: a.trim(),
            })),
            url: paper.arxiv_url || `${metaData.baseUrl}papers/${id}`,
            description: paper.abstract,
          }),
        }}
      />
      <PaperDetail paper={paper} reproductionCount={reproductions.length} />
      <ReproductionList reproductions={reproductions} paperId={paper.id} />
    </div>
  );
}
