# Automation

## Embedded agent

- Trigger/owner: an operator starts an interactive or explicitly approved
  headless run.
- Inputs: confirmed prompt basis, selected repository, approved memory and
  bounded capability descriptions.
- Tools: repository tools bound to plan paths and the four browser tools
  `browser_tabs`, `browser_observe`, `browser_act`, and `browser_wait` when an
  explicit session exists.
- Steering is advisory. Gateway policy, semantic-plan digest, path scope,
  command policy, approval, verifier, redaction, budgets, and kill/cancel
  signals are non-prompt controls.
- Outputs are typed results, events and artifact manifests. Invalid output,
  missing approval, budget exhaustion, provider failure, or verifier failure
  blocks completion.

## Improvement automation

Verified outcomes may produce shadow candidates. Public v0.1 performs no
automatic promotion and no candidate may change credentials, permissions,
trust, approval policy, repository scope, packages, or promotion gates.

## GitHub automation

- Orynt uses standard GitHub-hosted runners. Public repositories do not consume
  paid Actions minutes for these runners, so Jenkins and self-hosted runners are
  not part of the v0.1 operating model.
- Quality checks run with read-only repository permission.
- Untrusted contributions use the `pull_request` event, never
  `pull_request_target`, and receive no release secrets or write permission.
- Release builds use one tag SHA and pinned third-party Actions.
- Only draft/publish jobs receive `contents: write`; npm provenance alone gets
  `id-token: write`.
- Signing/npm secrets are limited to a reviewer-protected `release`
  environment.
- Before public release, configure protected `main` and `v*` tags, required
  checks, read-only default Actions permissions, Dependabot, CodeQL, secret
  scanning and push protection.

CodeQL has one weekly scheduled scan. There are no custom webhooks, email
automation, autonomous background agents, spending flows, or deployment jobs.

`bun release:check` runs every deterministic check in one sequence, which is
what a local run should do. The Quality workflow splits the LSP suites into
their own job and names them in `ORYNT_RELEASE_CHECK_SKIP` so the same suites do
not run twice in one pipeline; a test fails the build if a skipped name has no
job that owns it. `build:cli` reuses an existing build whose manifest still
matches the current sources, so the three commands that need the CLI in one job
build it once. `ORYNT_BUILD_CLI_FORCE=1` rebuilds regardless.

Browser screenshots and visual crops are not ambient permissions. Orynt binds
browser vision to an in-memory trust digest covering the repository realpath,
selected provider/model, and exact allowed origins. The grant is shown once per
process and is invalidated when any bound value changes. Candidate crops are
revision-bound, limited to three, and rejected for credential, OTP, card, or
payment controls.

Repository image generation is explicit-only. It must name one to four
PNG/WebP/JPEG output paths inside the approved writer scope and update
`assets/PROVENANCE.md`. Existing files are not replaced unless the approved
request uses replace mode. SVG remains code-authored.
