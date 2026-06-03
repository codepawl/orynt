import Image from "next/image";
import Link from "next/link";

import { FooterNewsletterForm } from "./footer-newsletter-form";

const LINKS = {
  explore: [
    { href: "/products", label: "Stack" },
    { href: "/products/trace", label: "TracePawl" },
    { href: "/research", label: "Research" },
  ],
  company: [
    { href: "/blog", label: "Blog" },
    { href: "/careers", label: "Careers" },
    { href: "/contact", label: "Contact" },
  ],
  legal: [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ],
} as const;

function FooterLinks({ group }: { group: keyof typeof LINKS }) {
  return (
    <div>
      <p className="cp-caption text-fg-3 mb-3">{group}</p>
      <ul className="space-y-2">
        {LINKS[group].map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-fg-2 hover:text-ratchet cp-small transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink-1 border-ink-4 border-t-2">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-16 lg:grid-cols-[2fr_3fr]">
        <div>
          <div className="cp-h4 flex items-center gap-3 text-fg-1 font-display">
            <Image
              src="/logo_for_light_mode.svg"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span>CODEPAWL</span>
          </div>
          <p className="cp-small text-fg-3 mt-3 max-w-lg">
            Infrastructure for autonomous coding agents.
          </p>
          <div className="mt-6 w-full max-w-none border-2 border-ink-4 bg-ink-0 p-4">
            <FooterNewsletterForm />
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-3 gap-6">
          {(["explore", "company", "legal"] as const).map((group) => (
            <FooterLinks key={group} group={group} />
          ))}
        </nav>
      </div>
      <div className="border-ink-4 mx-auto flex max-w-[1240px] flex-col gap-2 border-t-2 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="cp-caption text-fg-4">© 2026 CodePawl</p>
        <p className="cp-caption text-fg-4">
          Infrastructure for autonomous coding agents.
        </p>
      </div>
    </footer>
  );
}
