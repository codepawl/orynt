import type { Metadata } from "next";
import Link from "next/link";
import { DinoGame } from "./components/features/DinoGame";

export const metadata: Metadata = {
  title: "404",
  description: "Page not found.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <section className="flex flex-col items-center text-center">
      <h1 className="font-medium text-6xl mb-2 tracking-tight text-neutral-900 dark:text-neutral-100">
        404
      </h1>
      <p className="mb-2 text-neutral-600 dark:text-neutral-400">
        This page doesn&apos;t exist. But while you&apos;re here...
      </p>
      <DinoGame />
      <Link
        href="/"
        className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors text-sm"
      >
        &larr; Back to home
      </Link>
    </section>
  );
}
