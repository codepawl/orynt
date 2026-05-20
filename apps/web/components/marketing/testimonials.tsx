const QUOTES = [
  {
    quote:
      "OpenPawl turned 'agents are still a research project' into 'we have one in prod next week'.",
    author: "Mira H.",
    role: "Staff Engineer, Wave Labs",
  },
  {
    quote:
      "We rewrote our caching layer with Cachepawl and watched our Anthropic bill drop 40% the same day.",
    author: "Dan K.",
    role: "CTO, Sigma Cortex",
  },
  {
    quote:
      "Featcat is the first feature-flag library that didn't make me want to write my own.",
    author: "Ana P.",
    role: "Founder, Pico Field",
  },
] as const;

export function Testimonials() {
  return (
    <section
      aria-label="Testimonials"
      className="border-ink-4 border-b"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">006 · what builders say</p>
        <ul className="grid gap-6 md:grid-cols-3">
          {QUOTES.map((q) => (
            <li
              key={q.author}
              className="border-ink-4 bg-ink-1 flex h-full flex-col justify-between gap-6 border p-6"
            >
              <blockquote className="cp-body text-fg-2">&ldquo;{q.quote}&rdquo;</blockquote>
              <footer>
                <p className="cp-small text-fg-1">{q.author}</p>
                <p className="cp-caption text-fg-3 mt-1">{q.role}</p>
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
