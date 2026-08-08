# Architecture

## Product and stack

Orynt is a local-first Bun 1.3.14 CLI in a bun TypeScript workspace. Portable
agent, capability, browser, model, gateway, memory, verifier,
repository-sandbox, skill, and shared-contract packages hold product behavior.
The Tauri application is a frozen compatibility adapter and is excluded
from default product development and CI.

There is no Orynt account service, hosted multi-tenant database, email sender,
scheduled job, public web route, analytics service, or SEO surface.

ContextVM follows the same package boundary: shared owns storage-free
contracts, memory owns SQLite/archive behavior, and the intelligence runtime
owns canonical paths and composition. See
[ADR 0007](adr/0007-contextvm-foundation.md).

The completed invocation boundary and sole Context Pack authority are defined
in [ContextVM v1](contextvm-v1.md) and
[ADR 0013](adr/0013-contextvm-invocation-authority.md).

## Model providers

Orynt routes a turn through one of four providers, chosen by the model tier
bound to that turn: the Codex CLI, the OpenAI Responses API, the Anthropic
Messages API, and OpenCode. See [ADR 0014](adr/0014-anthropic-provider.md) and
[ADR 0015](adr/0015-opencode-provider.md).

Provider differences that other subsystems must respect are declared once, in
shared contracts, rather than checked ad hoc at each call site. Two matter
today: whether a provider bills per token or by subscription, which decides
whether a cost estimate exists at all, and whether it reports prompt-cache
counts, which decides whether a cache figure carries meaning. Adding a provider
fails to compile until both are stated.

## Trust boundaries

- User input and repository content are untrusted intent/data, not authority.
- Confirmed prompt requirements produce a digest-bound semantic task plan.
- Mutable work requires one writer, exact paths, explicit authorization,
  isolated worktree execution, and independent verification.
- Model output and skill text cannot expand tools, paths, approvals, credentials
  or destructive authority.
- Browser sessions are absent until explicit local start/attach. Model-visible
  pages are restricted by an operator-owned origin allowlist; typed mutations
  pass semantic risk inspection and gateway approval.
- Provider, GitHub update, and browser-target connections are external
  boundaries disclosed in [privacy and security](productization/privacy-security.md).

## Known risks and assumptions

- Exact default models may change provider-side, so live tier probes block
  release and execution rather than selecting a silent fallback.
- GitHub release redirects are expected; updater code bounds and validates them
  before verifying signed metadata and bytes.
- Local state may contain redacted operational history. Users own retention and
  filesystem access to their state directory.
- Public release remains blocked until full-history secret/IP/license review
  and GitHub security settings are complete.

## Related documents

- [Flows](flows.md)
- [Permissions](permissions.md)
- [Session lifecycle](session-lifecycle.md)
- [Variables and secrets](variables.md)
- [Test coverage](tests.md)
- [Automation](automation.md)
- [Release runbook](release/cli-release.md)
