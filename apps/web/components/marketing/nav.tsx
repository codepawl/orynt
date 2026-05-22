import Link from "next/link";

const LINKS = [
  { href: "/products", label: "Stack" },
  { href: "/products/trace", label: "TracePawl" },
  { href: "/research", label: "Research" },
] as const;

export function Nav() {
  return (
    <header className="border-ink-4 bg-ink-0/80 sticky top-0 z-50 border-b backdrop-blur">
      <a
        href="#main"
        className="bg-ratchet text-ink-0 sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:px-3 focus:py-2 focus:font-medium"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
        <Link href="/" className="text-fg-1 cp-h4 font-display tracking-tight">
          CodePawl
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-6">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-fg-3 hover:text-fg-1 cp-small transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href="https://github.com/codepawl"
          target="_blank"
          rel="noopener noreferrer"
          className="border-ratchet text-ratchet hover:bg-ratchet hover:text-ink-0 border px-4 py-2 text-sm font-medium transition-colors"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
