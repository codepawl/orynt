import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Open-source libraries are free forever. KStudio is a closed paid product. Enterprise pricing on request.",
};

const TIERS = [
  {
    name: "Open",
    price: "Free",
    note: "All six OSS libraries under MIT.",
    cta: { href: "/products", label: "Browse libraries" },
    features: [
      "OpenPawl, Featcat, HebbMem, TurboQuant, Cachepawl",
      "GitHub issues + community Discord",
      "MIT license, no telemetry",
    ],
  },
  {
    name: "Studio",
    price: "$ Custom",
    note: "KStudio closed beta with hands-on onboarding.",
    cta: { href: "/contact", label: "Request access" },
    features: [
      "Hosted KStudio environment",
      "Shared Slack with the team",
      "Quarterly architecture review",
    ],
  },
  {
    name: "Enterprise",
    price: "Contact us",
    note: "On-prem KStudio + SLAs + dedicated review.",
    cta: { href: "/contact", label: "Talk to sales" },
    features: [
      "On-prem deploy of the KStudio runtime",
      "Custom SLAs and dedicated review",
      "Vendor-grade security review",
    ],
  },
] as const;

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">pricing</p>
      <h1 className="cp-h1 text-fg-1 max-w-3xl">
        Free libraries. Paid <em className="cp-em">studio</em>.
      </h1>
      <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <li
            key={tier.name}
            className="border-ink-4 bg-ink-1 flex flex-col gap-4 border p-6"
          >
            <p className="cp-caption text-fg-3">{tier.name}</p>
            <p className="cp-h3 text-fg-1">{tier.price}</p>
            <p className="cp-small text-fg-3">{tier.note}</p>
            <ul className="text-fg-2 cp-small space-y-2">
              {tier.features.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            <Link
              href={tier.cta.href}
              className="cp-button border-ratchet text-ratchet hover:bg-ratchet hover:text-ink-0 mt-auto inline-flex items-center justify-center border px-4 py-2 transition-colors"
            >
              {tier.cta.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
