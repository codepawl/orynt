import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "404",
  description: "Lost in the void of the internet.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <section>
      <h1 className="font-medium text-2xl mb-8 tracking-tight text-neutral-900 dark:text-neutral-100">
        404 - Page not found
      </h1>
      <p className="mb-4 text-neutral-800 dark:text-neutral-200">
        Whoops! Looks like you wandered off the map. Maybe the page you&apos;re
        looking for is in Narnia?
      </p>
      <Link href="/" className="text-neutral-700 dark:text-neutral-300 hover:underline">
        Let&apos;s go back home before Aslan gets upset.
      </Link>
    </section>
  );
}
