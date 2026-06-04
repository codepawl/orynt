const ITEMS = [
  "Failure diagnosis for long-horizon AI agents",
  "Persistent agent memory and operational learning",
  "Multi-agent coordination and recovery semantics",
  "Cost optimization for repeated agent execution",
  "Replayable traces and failure datasets",
] as const;

export function ResearchDirection() {
  return (
    <section aria-label="Research direction" className="border-ink-4 border-b">
      <div className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">005 · research direction</p>
        <h2 className="cp-h2 text-fg-1">Research direction</h2>
        <ul className="mt-8 grid max-w-2xl gap-3">
          {ITEMS.map((item) => (
            <li key={item} className="cp-body text-fg-2 flex gap-3">
              <span className="text-ratchet" aria-hidden>
                →
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
