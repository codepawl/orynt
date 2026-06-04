export function Problem() {
  return (
    <section aria-label="The problem" className="border-ink-4 border-b">
      <div className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">002 · the problem</p>
        <h2 className="cp-h2 text-fg-1 max-w-3xl">
          Coding agents need engineering infrastructure.
        </h2>
        <div className="mt-8 grid max-w-4xl gap-6 md:grid-cols-2">
          <p className="cp-body text-fg-2">
            Modern AI agents can write, edit, and reason over software
            projects, but long-running execution remains fragile. Agents drift
            from intent, use stale context, misuse tools, repeat failures, and
            struggle to coordinate across multi-step tasks.
          </p>
          <p className="cp-body text-fg-2">
            CodePawl focuses on the infrastructure around these agents:
            debugging, memory, coordination, recovery, and workload
            optimization.
          </p>
        </div>
      </div>
    </section>
  );
}
