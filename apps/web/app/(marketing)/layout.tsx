import type { ReactNode } from "react";

import { Footer } from "@/components/marketing/footer";
import { Nav } from "@/components/marketing/nav";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
