import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-20">
      <p className="cp-marker mb-6">404 · not found</p>
      <h1 className="cp-h1 text-fg-1">We couldn&apos;t find that page.</h1>
      <p className="cp-lead text-fg-2 mt-6">
        It may have moved while we were rebuilding the site. Head back to{" "}
        <Link href="/" className="text-ratchet hover:text-ratchet-hot">
          the homepage
        </Link>{" "}
        or browse the{" "}
        <Link href="/products" className="text-ratchet hover:text-ratchet-hot">
          product catalog
        </Link>
        .
      </p>
    </main>
  );
}
