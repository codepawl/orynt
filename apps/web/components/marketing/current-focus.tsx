import Link from "next/link";

export function CurrentFocus() {
  return (
    <section
      aria-label="Current focus: TracePawl"
      className="border-ink-4 border-b"
    >
      <div className="mx-auto grid max-w-[1240px] items-start gap-12 px-6 py-20 md:grid-cols-2">
        <div>
          <p className="cp-marker mb-6">004 · current focus</p>
          <h2 className="cp-h2 text-fg-1">Current focus: TracePawl</h2>
          <p className="cp-lead text-fg-2 mt-6 max-w-xl">
            TracePawl is the first product wedge in the CodePawl stack. It
            focuses on postmortem intelligence for AI agents: understanding
            why a run failed, where execution drifted, which event caused the
            failure, and what recovery action should be attempted next.
          </p>
          <Link
            href="/products/trace"
            className="text-ratchet hover:text-ratchet-hot cp-small mt-8 inline-flex items-center gap-1 transition-colors"
          >
            Read the TracePawl notes →
          </Link>
        </div>
        <pre
          aria-label="TracePawl example output"
          className="border-ink-5 bg-code-bg cp-code overflow-x-auto border p-6 leading-relaxed"
        >
          <code>{`Failure: stale context edit
Root cause: agent attempted file modification using outdated file state
Evidence: edit failed after line mismatch
Suggested recovery: re-read file before patching; validate target range
Similar failures: planned memory integration`}</code>
        </pre>
      </div>
    </section>
  );
}
