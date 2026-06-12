import { Link } from "@/components/link";

export function Hero() {
  return (
    <section
      aria-label="CodePawl introduction"
      className="border-ink-4 border-b"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-24">
        <p className="cp-marker mb-6">001 · codepawl</p>
        <h1 className="cp-display text-fg-1">CodePawl</h1>
        <p className="cp-h3 text-fg-2 mt-6 max-w-3xl">
          CodePawl makes coding agents work together.
        </p>
        <p className="cp-body text-fg-3 mt-8 max-w-2xl">
          Infrastructure for coordinated agent work - plans, evidence,
          guardrails, memory, replay, and cloud workflows. Openpawl starts with
          reviewable agent work in GitHub Actions.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/openpawl/install"
            className="cp-button bg-ratchet text-ink-0 hover:bg-ratchet-hot inline-flex items-center px-4 py-2 transition-colors"
          >
            Install Openpawl
          </Link>
          <a
            href="https://github.com/codepawl"
            target="_blank"
            rel="noopener noreferrer"
            className="cp-button border-fg-3 text-fg-1 hover:bg-ink-3 inline-flex items-center border px-4 py-2 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
