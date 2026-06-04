import type { Metadata } from "next";

import { ModernistLanding } from "@/components/marketing/modernist-landing";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "CodePawl — Infrastructure for AI agents",
  description:
    "Debugging, memory, coordination, and optimization infrastructure for AI agents.",
  openGraph: {
    title: "CodePawl — Infrastructure for AI agents",
    description:
      "Debugging, memory, coordination, and optimization infrastructure for AI agents.",
    type: "website",
    url: "/",
  },
};

export default function MarketingLanding() {
  return <ModernistLanding />;
}
