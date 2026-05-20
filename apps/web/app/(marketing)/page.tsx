import type { Metadata } from "next";

import { CTA } from "@/components/marketing/cta";
import { Features } from "@/components/marketing/features";
import { Formats } from "@/components/marketing/formats";
import { Hero } from "@/components/marketing/hero";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { SDKDemo } from "@/components/marketing/sdk-demo";
import { Testimonials } from "@/components/marketing/testimonials";
import { TrustedBy } from "@/components/marketing/trusted-by";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Ship production agents, not demos",
  description:
    "Open-source AI agent tooling for engineers. OpenPawl, Featcat, HebbMem, TurboQuant, Cachepawl, and the KStudio closed product.",
  openGraph: {
    title: "Codepawl — Ship production agents",
    description:
      "Open-source AI agent tooling for engineers shipping in 2026.",
    type: "website",
    url: "/",
  },
};

export default function MarketingLanding() {
  return (
    <>
      <Hero />
      <TrustedBy />
      <Formats />
      <Features />
      <SDKDemo />
      <PricingTeaser />
      <Testimonials />
      <CTA />
    </>
  );
}
