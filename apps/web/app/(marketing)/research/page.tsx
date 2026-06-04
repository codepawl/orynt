import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Research notes",
  description: "Curated AI/ML research notes from the CodePawl team.",
};

export default function ResearchIndex() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">research</p>
      <h1 className="cp-h1 text-fg-1">
        Research <em className="cp-em">notes</em>
      </h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        We&apos;re curating short, opinionated notes on the AI/ML papers we
        find useful while shipping agents. Subscribe to the newsletter to be
        notified when the first batch lands.
      </p>
    </section>
  );
}
