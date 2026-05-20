import Link from "next/link";

export function CTA() {
  return (
    <section
      aria-label="Final call to action"
      className="bg-ink-1 border-ink-4 border-b"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-24 text-center">
        <p className="cp-marker mb-6">007 · ship something this week</p>
        <h2 className="cp-h1 text-fg-1 mx-auto max-w-3xl">
          Start with one library. Stay for the <em className="cp-em">studio</em>.
        </h2>
        <p className="cp-lead text-fg-2 mx-auto mt-6 max-w-2xl">
          Read the docs, install a package, and rip out a brittle pipeline.
          We&apos;ll be in your terminal if you need a hand.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/products"
            className="bg-ratchet text-ink-0 hover:bg-ratchet-hot inline-flex items-center px-6 py-3 text-sm font-medium transition-colors"
          >
            Browse the products
          </Link>
          <Link
            href="/contact"
            className="border-fg-3 text-fg-1 hover:bg-ink-3 inline-flex items-center border px-6 py-3 text-sm font-medium transition-colors"
          >
            Talk to the team
          </Link>
        </div>
      </div>
    </section>
  );
}
