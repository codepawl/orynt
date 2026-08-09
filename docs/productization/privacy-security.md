# Privacy and Security

Status: CLI-first local runtime guidance, not legal advice.

## Data Handling

- Orynt keeps the current MVP local-first. Repository work runs through managed local worktrees and local artifact paths.
- Run events, artifacts, memory, skill candidates, and usage summaries are designed for user review and replay.
- Durable memories must include source provenance and redaction metadata.
- Secrets, credentials, cookies, private keys, and raw sensitive values must not be stored in memory, skill definitions, reports, or public docs.

## Permission and Takeover Behavior

- Repository is the only executable P0 surface in the current MVP.
- Browser access is opt-in through an explicit loopback CDP session and exact
  origin allowlist. Read operations return bounded semantic snapshots/deltas;
  typed mutations require semantic risk inspection and gateway approval.
- State-changing work is policy gated before execution.
- Sensitive actions such as credential entry, payments, external sends, destructive shell commands, and secret access require blocking, explicit approval, or user takeover.
- The agent must not execute payments, financial transfers, credential entry, or production-system changes autonomously.

## Audit Evidence

- Every agent action should have a run event and evidence artifact.
- Approval decisions must record actor, reason, run id, action id, and policy version.
- Evaluation reports must include success rate, permission coverage, blocked execution count, intervention count, cost, evidence coverage, memory source coverage, and skill approval before use.

## External connections

- Model calls go to the provider selected in local model-tier settings.
- A startup update request goes to the signed GitHub release endpoint only
  after stored consent. Manual `orynt update --check` is always explicit.
- Browser connections begin only after `orynt browser start` or `attach`;
  attachment is loopback-only, exact-origin scoped, and does not grant cookie
  or credential tools.
- Orynt does not send telemetry, email, scheduled jobs, analytics events, or
  repository contents to an Orynt-hosted backend.

## Public beta caveats

- No hosted multi-tenant backend is implemented in this checkout.
- Operators should treat Orynt as supervised software and review diffs,
  artifacts, browser approvals, and verifier results before trusting outputs.
