import Link from "next/link";

import { FooterNewsletterForm } from "./footer-newsletter-form";

const LINKS = {
  product: [
    { href: "/products", label: "Products" },
    { href: "/pricing", label: "Pricing" },
    { href: "/docs", label: "Docs" },
  ],
  company: [
    { href: "/research", label: "Research" },
    { href: "/blog", label: "Blog" },
    { href: "/careers", label: "Careers" },
    { href: "/contact", label: "Contact" },
  ],
  legal: [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ],
} as const;

export function Footer() {
  return (
    <footer className="bg-ink-0 border-ink-4 border-t">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-16 lg:grid-cols-[2fr_3fr]">
        <div>
          <p className="cp-h4 text-fg-1 font-display">Codepawl</p>
          <p className="cp-small text-fg-3 mt-3 max-w-sm">
            Open-source AI agent tooling. Subscribe for new releases and the
            occasional research note.
          </p>
          <div className="mt-6 max-w-md">
            <FooterNewsletterForm />
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-3 gap-6">
          {(["product", "company", "legal"] as const).map((group) => (
            <div key={group}>
              <p className="cp-caption text-fg-3 mb-3">{group}</p>
              <ul className="space-y-2">
                {LINKS[group].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-fg-2 hover:text-fg-1 cp-small transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-ink-4 mx-auto flex max-w-[1240px] items-center justify-between border-t px-6 py-6">
        <p className="cp-caption text-fg-4">© 2026 Codepawl</p>
        <p className="cp-caption text-fg-4">
          Built with motion, Tailwind v4, and a lot of black coffee.
        </p>
      </div>
    </footer>
  );
}
