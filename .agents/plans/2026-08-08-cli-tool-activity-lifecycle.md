# CLI tool activity lifecycle

## Goal

Make repository tool work observable without duplicating agent replies: show an
immediate animated activity with a per-call duration and safe concrete detail,
then preserve the post-tool evidence synthesis as the authoritative reply.

## Implementation

- Preserve app-server agent-message item identity and reset partial structured
  output at item boundaries.
- Route executor-owned tool descriptors through app-server activity events.
- Measure each tool call with a monotonic clock and retain its duration on the
  completed or failed row.
- Bypass the normal 120 ms activity debounce for explicit tool calls while
  retaining it for startup and coordination activity.
- Finalize the authoritative agent reply before writing the Activity audit
  summary. Retry once only when a post-tool final reply exactly repeats the
  pre-tool intent statement.

## Evidence

- Focused adapter, model-runtime, agent, composer, and session regressions.
- `bun test:cli`
- `bun build:cli`
- `bun e2e:cli`
- `git diff --check`
