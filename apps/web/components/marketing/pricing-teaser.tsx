import Link from "next/link";

const TIERS = [
  {
    name: "Open",
    price: "Free",
    note: "All six OSS libraries, MIT-licensed.",
  },
  {
    name: "Studio",
    price: "$ Custom",
    note: "KStudio early access. Hands-on onboarding.",
  },
  {
    name: "Enterprise",
    price: "Contact us",
    note: "On-prem, SLAs, dedicated review.",
  },
] as const;

export function PricingTeaser() {
  return (
    <section
      aria-label="Pricing teaser"
      className="bg-ink-1 border-ink-4 border-b"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">005 · pricing</p>
        <h2 className="cp-h2 text-fg-1 max-w-2xl">
          Open libraries forever. A studio when you need it.
        </h2>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <li
              key={tier.name}
              className="border-ink-5 bg-ink-2 flex flex-col gap-3 border p-6"
            >
              <p className="cp-caption text-fg-3">{tier.name}</p>
              <p className="cp-h3 text-fg-1">{tier.price}</p>
              <p className="cp-small text-fg-3">{tier.note}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8">
          <Link
            href="/pricing"
            className="text-ratchet hover:text-ratchet-hot cp-small inline-flex items-center gap-1 transition-colors"
          >
            See the full pricing page →
          </Link>
        </p>
      </div>
    </section>
  );
}
