import type { Metadata } from "next";

import { ModernistLanding } from "@/components/marketing/modernist-landing";

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
  return <ModernistLanding />;
}
