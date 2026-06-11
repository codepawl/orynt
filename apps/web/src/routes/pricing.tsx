import { createRoute } from "@tanstack/react-router";

import { Link } from "@/components/link";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "pricing",
  head: () => ({
    meta: [
      { title: "Pricing" },
      {
        name: "description",
        content:
          "Openpawl is free to self-manage as an open runtime for coding-agent coordination. CodePawl Cloud is upcoming and waitlist-only.",
      },
    ],
  }),
  component: PricingPage,
});

const TIERS = [
  {
    name: "Open",
    price: "Free",
    note: "Self-managed Openpawl runtime; GitHub Actions first.",
    cta: { href: "/openpawl/install", label: "Install Openpawl" },
    features: [
      "Public source at codepawl/openpawl",
      "Reviewable plans and traceable run evidence",
      "MIT license",
    ],
  },
  {
    name: "Cloud",
    price: "Waitlist",
    note: "Upcoming evidence and team workflow layer.",
    cta: { href: "/contact", label: "Join waitlist" },
    demo: { href: "/cloud/evidence", label: "View evidence demo" },
    features: [
      "Not generally available yet",
      "No billing or provisioning from this page",
      "Early access by request only",
    ],
  },
  {
    name: "Teams",
    price: "Discuss",
    note: "Private planning for future team needs.",
    cta: { href: "/contact", label: "Talk to sales" },
    features: [
      "Openpawl rollout planning",
      "Security review support",
      "No production SLA offered yet",
    ],
  },
] as const;

function PricingPage() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">pricing</p>
      <h1 className="cp-h1 text-fg-1 max-w-3xl">
        CodePawl makes coding agents work <em className="cp-em">together</em>.
      </h1>
      <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <li
            key={tier.name}
            className="cp-hover-lift border-ink-4 bg-ink-1 flex flex-col gap-4 border p-6"
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
              className="cp-hover-contained cp-button border-ratchet text-ratchet hover:bg-ratchet hover:text-ink-0 mt-auto inline-flex items-center justify-center border px-4 py-2 transition-colors"
            >
              {tier.cta.label}
            </Link>
            {"demo" in tier ? (
              <Link
                href={tier.demo.href}
                className="cp-hover-link cp-small w-fit text-ratchet hover:text-ratchet-hot"
              >
                {tier.demo.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
