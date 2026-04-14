import type { Metadata } from "next";
import { metaData } from "app/config";
import { DocsSidebar } from "./_components/DocsSidebar";

export const metadata: Metadata = {
  title: {
    template: "%s | CodePawl Docs",
    default: "Documentation | CodePawl",
  },
  description: "CodePawl platform documentation — guides, API references, and developer resources.",
  alternates: {
    canonical: `${metaData.baseUrl}docs`,
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="lg:flex lg:gap-8">
        <DocsSidebar />
        {children}
      </div>
    </div>
  );
}
