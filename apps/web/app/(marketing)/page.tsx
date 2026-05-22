import type { Metadata } from "next";

import { ContactBlock } from "@/components/marketing/contact-block";
import { CurrentFocus } from "@/components/marketing/current-focus";
import { Hero } from "@/components/marketing/hero";
import { Problem } from "@/components/marketing/problem";
import { ResearchDirection } from "@/components/marketing/research-direction";
import { Stack } from "@/components/marketing/stack";
import { Status } from "@/components/marketing/status";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "CodePawl — Infrastructure for autonomous coding agents",
  description:
    "Debugging, memory, coordination, and optimization infrastructure for autonomous coding agents.",
  openGraph: {
    title: "CodePawl — Infrastructure for autonomous coding agents",
    description:
      "Debugging, memory, coordination, and optimization infrastructure for autonomous coding agents.",
    type: "website",
    url: "/",
  },
};

export default function MarketingLanding() {
  return (
    <>
      <Hero />
      <Problem />
      <Stack />
      <CurrentFocus />
      <ResearchDirection />
      <Status />
      <ContactBlock />
    </>
  );
}
