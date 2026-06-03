import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Careers",
  description: "Open roles at CodePawl.",
};

export default function CareersIndex() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">careers</p>
      <h1 className="cp-h1 text-fg-1">No open roles at the moment</h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        We hire deliberately around product milestones. The next hiring window
        is planned after the v0.1 launch. If your work is closely aligned with
        agent tooling and production AI systems,{" "}
        <Link
          href="/contact"
          className="text-ratchet hover:text-ratchet-hot"
        >
          get in touch
        </Link>{" "}
        and share what you&apos;ve built.
      </p>
    </section>
  );
}
