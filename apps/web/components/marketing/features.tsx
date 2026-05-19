import { LightningCharge, Bricks, Boxes, Stack } from "react-bootstrap-icons";

const FEATURES = [
  {
    icon: LightningCharge,
    title: "Fast where it matters",
    body: "Every primitive is benchmarked. We publish numbers, not slogans.",
  },
  {
    icon: Bricks,
    title: "Composable by design",
    body: "Each library does one thing. Mix and match without a framework tax.",
  },
  {
    icon: Boxes,
    title: "Local-first",
    body: "Runs offline. The studio is optional. Your data stays where it lives.",
  },
  {
    icon: Stack,
    title: "Production batteries",
    body: "Observability, rate limits, retries, and replay built in — not added later.",
  },
] as const;

export function Features() {
  return (
    <section
      aria-label="Features"
      className="border-ink-4 border-b"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">002 · what you get</p>
        <h2 className="cp-h2 text-fg-1 max-w-2xl">
          Built for engineers who already know what they want.
        </h2>
        <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="border-ink-4 hover:border-ratchet bg-ink-1 flex flex-col gap-3 border p-6 transition-colors"
            >
              <feature.icon
                aria-hidden
                className="text-ratchet"
                size={28}
              />
              <h3 className="cp-h4 text-fg-1">{feature.title}</h3>
              <p className="cp-body text-fg-3">{feature.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
