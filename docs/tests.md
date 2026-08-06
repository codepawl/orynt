# Verification map

## Existing coverage

| Rule | Evidence | Status |
| --- | --- | --- |
| Mutable repository work requires verified semantic plan and exact paths | shared contracts, coding-apprentice suites, `test:core:codex-fixture` | Existing, CI-required |
| Built CLI crosses argv, JSONL, planning, approval, sandbox, verifier and artifacts | `test:e2e-cli` controlled process suite | Existing, CI-required |
| Interactive terminal onboarding, commands, model turn, verified mutation, redacted `/diff`, exit and resume work in a real PTY | Linux `test:e2e-cli` PTY lane | Existing, CI-required |
| `latest` resumes the newest active session, never Trash, and explicit Trash resume is rejected | CLI state/app suites plus seeded Linux PTY lane | Existing, CI-required |
| No startup update request without consent | CLI state/update tests | Existing, CI-required |
| Signed updater rejects tamper, unsafe redirect, unknown key and old protocol | CLI update tests | Existing, CI-required |
| Browser tools are origin-scoped; semantic risk, batches and mutations use gateway approval | browser-runtime, gateway and CLI browser suites | Existing, CI-required |
| Candidates do not auto-promote | shared/CLI scheduler and improve suites | Existing, CI-required |
| Package contains runtime resources, notices and SBOM | `package:cli`, legal generator and package smoke | Existing release gate |
| Packaged CLI model tiers, clarification, read-only/mutation and browser behavior are real | `cli-live-e2e-v1.json` plus prompt-understanding evidence | Guarded live release gate |

`bun run gate:release:deterministic` combines the full deterministic CLI,
desktop, packaging, legal, and security checks. `bun run gate:release` also
requires current source-bound live evidence. Live evidence generation remains
an explicit quota-using operation.

## Browser R2 promotion

Run the fail-closed R2 evaluator with:

```bash
bun bench:browser:v2 -- --runs <matched-live-results.json>
```

The input must contain 30 paired tasks with five repetitions for both
`orynt_cdp` and `orynt_cdp_v2`, including model-call, observation-byte,
recovery, consequential-action classification, unsafe-action, and evidence
fields. Fixture results test the evaluator only and are not release evidence.

## Test layers

- `bun test:cli` covers CLI components and adapter contracts.
- `bun e2e:cli` builds the executable and runs offline process plus Linux PTY
  scenarios with isolated state, repositories, and a controlled Codex fixture.
- `bun test:package-cli` validates output and resources from the assembled npm
  package. Native release jobs run the corresponding archive smoke.
- `bun run release:evidence:live` uses the authenticated local Codex session and
  real Chrome. It requires exact quota confirmation, records no prompts or
  model responses, and binds evidence to the current source digest. Its
  interactive read-only lane advances through ordered PTY states and does not
  send `/exit` until the composer has returned after the live answer.
  Its mutation lane requires a digest-bound redacted repository-diff artifact
  while keeping the source fixture immutable.
- `bun run test:host-stdio` verifies that the host can deliver stdin to a child
  process before transport-dependent CLI tests start. When a managed sandbox
  blocks that primitive, GitHub Actions is the authoritative host gate.
- `bun run scripts/verify-desktop-bundles.mjs` checks the expected platform
  installers and target-specific sidecar after packaging; CI uploads only the
  verified bundle directory.

## Proposed/manual checks

| Rule | Check | Type |
| --- | --- | --- |
| Four native archives install cleanly | Fresh supported runner install/uninstall smoke | Automated release matrix plus manual VM review |
| Public history contains no private material | Review Gitleaks findings, licenses, Actions logs/artifacts | Automated scan plus manual review |
| GitHub/npm hardening matches runbook | Inspect rulesets, security settings, provenance and trusted publisher | Manual release review |

## Gaps

- Production public key and protected release environment do not exist in
  source; they must be provisioned and reviewed before tagging.
- The owner must confirm redistribution rights for project artwork listed in
  `assets/PROVENANCE.md` before changing repository visibility.
- Live evidence becomes intentionally stale after source changes and must be
  refreshed with explicit quota consent.
- `--only-scenario` output is diagnostic and never satisfies the release
  evidence validator.
- GitHub visibility, rulesets, security features, npm namespace bootstrap, and
  registry provenance cannot be proven by local tests before publication.
