import Image from "next/image";
import Link from "next/link";
import type { Icon } from "react-bootstrap-icons";
import { EnvelopeAt, Github, TwitterX } from "react-bootstrap-icons";

import { FooterNewsletterForm } from "./footer-newsletter-form";

const LINKS = {
  products: [
    { href: "/products", label: "Products" },
    { href: "/products/trace", label: "TracePawl" },
    { href: "/products/mempawl", label: "Mempawl" },
    { href: "/products/openpawl", label: "OpenPawl" },
    { href: "/products/cachepawl", label: "CachePawl" },
  ],
  resources: [
    { href: "/research", label: "Research" },
    { href: "/blog", label: "Blog" },
    { href: "/docs", label: "Docs" },
  ],
  company: [
    { href: "/contact", label: "Contact" },
    { href: "/careers", label: "Careers" },
    { href: "/pricing", label: "Pricing" },
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
              className="cp-hover-link cp-link text-fg-2 hover:text-ratchet inline-block transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterSocialLink({
  href,
  label,
  Icon,
  external = true,
}: {
  href: string;
  label: string;
  Icon: Icon;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="cp-hover-button cp-button border-ink-4 text-fg-2 hover:border-ratchet hover:text-ratchet inline-flex items-center gap-2 border px-3 py-2 transition-colors"
    >
      <Icon aria-hidden size={15} />
      <span>{label}</span>
    </a>
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
            Infrastructure for AI agents.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <FooterSocialLink
              href="mailto:founder@codepawl.com"
              label="Email"
              Icon={EnvelopeAt}
              external={false}
            />
            <FooterSocialLink
              href="https://github.com/codepawl"
              label="GitHub"
              Icon={Github}
            />
            <FooterSocialLink
              href="https://x.com/codepawl"
              label="X"
              Icon={TwitterX}
            />
          </div>
          <div className="cp-hover-frame mt-6 w-full max-w-none border-2 border-ink-4 bg-ink-0 p-4">
            <FooterNewsletterForm />
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {(["products", "resources", "company", "legal"] as const).map((group) => (
            <FooterLinks key={group} group={group} />
          ))}
        </nav>
      </div>
      <div className="border-ink-4 mx-auto flex max-w-[1240px] flex-col gap-2 border-t-2 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="cp-caption text-fg-4">© 2026 CodePawl</p>
        <p className="cp-caption text-fg-4">
          Infrastructure for AI agents.
        </p>
      </div>
    </footer>
  );
}
