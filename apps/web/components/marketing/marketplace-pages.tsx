import type { ReactNode } from "react";

type PageShellProps = {
  eyebrow: string;
  title: ReactNode;
  lead: string;
  children: ReactNode;
};

type InfoCardProps = {
  title: string;
  children: ReactNode;
};

type LinkItem = {
  href: string;
  label: string;
  body: string;
  external?: boolean;
};

export const OPENPAWL_REPO = "https://github.com/codepawl/openpawl";
export const OPENPAWL_MAIN_DOCS =
  "https://github.com/codepawl/openpawl/tree/main/docs";
export const OPENPAWL_INSTALL_DOC =
  "https://github.com/codepawl/openpawl/blob/main/docs/OPENPAWL_INSTALL.md";
export const OPENPAWL_ACTION_METADATA =
  "https://github.com/codepawl/openpawl/blob/main/action.yml";
export const OPENPAWL_ISSUES = "https://github.com/codepawl/openpawl/issues";
export const OPENPAWL_SECURITY =
  "https://github.com/codepawl/openpawl/security/advisories";
export const OPENPAWL_ACTIONS =
  "https://github.com/codepawl/openpawl/actions";
export const OPENPAWL_STATUS_WORKFLOW =
  "https://github.com/codepawl/openpawl/actions/workflows/openpawl.yml";

export function PageShell({ eyebrow, title, lead, children }: PageShellProps) {
  return (
    <article className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">{eyebrow}</p>
      <h1 className="cp-h1 max-w-4xl text-fg-1">{title}</h1>
      <p className="cp-lead mt-6 max-w-3xl text-fg-2">{lead}</p>
      <div className="mt-12 grid gap-6">{children}</div>
    </article>
  );
}

export function InfoCard({ title, children }: InfoCardProps) {
  return (
    <section className="border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6">
      <h2 className="cp-h3 text-fg-1">{title}</h2>
      <div className="cp-body mt-4 grid gap-4 text-fg-2">{children}</div>
    </section>
  );
}

export function LinkGrid({ items }: { items: ReadonlyArray<LinkItem> }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <li key={item.href}>
          <a
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            className="cp-hover-frame border-ink-4 bg-ink-0 block h-full border-2 p-5"
          >
            <span className="cp-link text-ratchet">{item.label}</span>
            <span className="cp-small mt-3 block text-fg-3">{item.body}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function BulletList({ items }: { items: ReadonlyArray<ReactNode> }) {
  return (
    <ul className="grid gap-3">
      {items.map((item, index) => (
        <li key={index} className="grid grid-cols-[18px_minmax(0,1fr)] gap-3">
          <span className="mt-2 h-2 w-2 border border-ratchet bg-ratchet" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="border-ink-5 bg-code-bg cp-code overflow-x-auto border p-4 text-fg-5">
      <code>{children}</code>
    </pre>
  );
}

export function InlineLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="cp-hover-link text-ratchet hover:text-ratchet-hot"
    >
      {children}
    </a>
  );
}

