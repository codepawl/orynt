import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Blog",
  description: "Engineering notes from the CodePawl team.",
};

export default function BlogIndex() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">blog</p>
      <h1 className="cp-h1 text-fg-1">Notes from the team</h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        First posts are queued for the production deploy. Subscribe to the
        newsletter for the launch.
      </p>
    </section>
  );
}
