import type { Metadata } from "next";
import Link from "next/link";
import { metaData } from "app/config";
import { fetchPapers } from "app/lib/papers";
import { PaperList } from "./PaperList";

export const metadata: Metadata = {
  title: "Papers — Reproduce & Verify",
  description: "Community-driven reproduction reports for AI/ML research papers.",
  alternates: { canonical: `${metaData.baseUrl}papers` },
  openGraph: {
    title: "Papers — Reproduce & Verify | CodePawl",
    description: "Community-driven reproduction reports for AI/ML research papers.",
    url: `${metaData.baseUrl}papers`,
    siteName: metaData.name,
    locale: "en_US",
    type: "website",
  },
};

interface Props {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    status?: string;
    tag?: string;
  }>;
}

export default async function PapersPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const sort = params.sort || "newest";
  const status = params.status;
  const tag = params.tag;

  const data = await fetchPapers(page, sort, status, tag);

  const tabs = [
    { label: "All", value: undefined },
    { label: "Verified", value: "verified" },
    { label: "Disputed", value: "disputed" },
    { label: "Unverified", value: "unverified" },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
          Papers
        </h1>
        <Link
          href="/papers/submit"
          className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-80 transition-opacity no-underline"
        >
          Submit paper
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((tab) => {
          const isActive = status === tab.value || (!status && !tab.value);
          const href = tab.value
            ? `/papers?status=${tab.value}${sort !== "newest" ? `&sort=${sort}` : ""}`
            : `/papers${sort !== "newest" ? `?sort=${sort}` : ""}`;
          return (
            <Link
              key={tab.label}
              href={href}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors no-underline ${
                isActive
                  ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <PaperList
        papers={data?.papers ?? []}
        total={data?.total ?? 0}
        page={page}
        totalPages={data?.total_pages ?? 0}
        currentSort={sort}
        currentStatus={status}
      />
    </section>
  );
}
