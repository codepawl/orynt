const COMPANIES = [
  "Wave Labs",
  "Sigma Cortex",
  "Loop Robotics",
  "Adit AI",
  "Helm & Co.",
  "Pico Field",
] as const;

export function TrustedBy() {
  return (
    <section
      aria-label="Trusted by"
      className="border-ink-4 bg-ink-1 border-b"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <p className="cp-caption text-fg-3 mb-6">trusted by teams shipping agents</p>
        <ul className="grid grid-cols-2 gap-6 md:grid-cols-6">
          {COMPANIES.map((name) => (
            <li
              key={name}
              className="text-fg-3 hover:text-fg-1 cp-caption text-center transition-colors"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
