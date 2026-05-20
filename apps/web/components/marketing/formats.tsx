const FORMATS = [
  { label: "TypeScript", note: "Bun + npm registries" },
  { label: "Python", note: "uv + pip registries" },
  { label: "Rust", note: "crates.io for the inference core" },
  { label: "Docker", note: "for the studio runtime" },
] as const;

export function Formats() {
  return (
    <section
      aria-label="Distribution formats"
      className="bg-ink-1 border-ink-4 border-b"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">003 · ships in your stack</p>
        <h2 className="cp-h2 text-fg-1 max-w-2xl">
          Drop in <em className="cp-em">today</em> in the language you write.
        </h2>
        <ul className="mt-10 grid gap-4 md:grid-cols-4">
          {FORMATS.map((fmt) => (
            <li
              key={fmt.label}
              className="border-ink-5 bg-ink-2 flex flex-col gap-2 border p-5"
            >
              <p className="cp-h4 text-fg-1">{fmt.label}</p>
              <p className="cp-small text-fg-3">{fmt.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
