# CodePawl Data and Evaluation Plan

## Evaluation principles

CodePawl turns every AI coding session into measurable engineering work. That value depends on report quality, not dashboard vanity metrics.

Principles:

* Report quality before dashboard polish. A report must explain what happened, what evidence exists, what is risky, and what to do next.
* Deterministic checks before AI. Diff parsing, validation evidence, protected path rules, lockfile detection, and claim/evidence matching must stand on their own.
* Evidence-bound claims only. Every important report claim should cite a file, diff hunk, command, log, policy rule, or session event.
* Simple verdict taxonomy. v0.1 uses exactly five verdict states and does not add vague states.
* Human review for eval changes. Benchmark fixture additions, expected report changes, and scoring changes require human review.
* Synthetic fixtures by default. Real session fixtures can come later only after strict sanitization.

## Verdict taxonomy

v0.1 uses exactly these verdicts:

* `verified`
* `needs_evidence`
* `risky`
* `failed`
* `blocked`

Do not add `draft`, `unknown`, or `abandoned` in v0.1.

UI filters, GitHub fail-on behavior, reports, fixtures, and example docs must consume these exact verdict values. User-facing labels may adjust capitalization or spacing, but stored/report values should remain stable.

### `verified`

Use when the session appears complete and the expected validation evidence is present.

Example:

* Diff is scoped to the requested task.
* Tests and typecheck/build evidence are present and passing.
* No protected path, lockfile, or drift risks are detected.

### `needs_evidence`

Use when the changes may be acceptable, but required validation evidence is missing or incomplete.

Example:

* Backend code changed, but no test log is available.
* TypeScript files changed, but no typecheck/build evidence is present.
* UI changed, but no e2e, screenshot, or browser validation evidence exists.

### `risky`

Use when the session touched sensitive files, broad surfaces, or policy-controlled paths even if some validation passed.

Example:

* Protected path or migration touched.
* Package manifest or lockfile changed.
* Diff is broad enough to require review before acceptance.

### `failed`

Use when available evidence shows a command, build, test, or validation step failed.

Example:

* Test log contains failing tests.
* Build log ends with an error.
* Agent claims success, but the captured command output failed.

### `blocked`

Use when CodePawl cannot produce a useful acceptance decision because a required input or context is missing.

Example:

* No diff is available.
* Required fixture files are missing.
* Session data is malformed enough that evidence cannot be trusted.

## Fixture format

v0.1 uses folder fixtures, not real repo fixtures. Real repo fixtures can come later after the deterministic report engine is stable.

Recommended layout:

```txt
fixtures/sessions/<case-name>/
  raw-events.jsonl
  diff.patch
  logs/
    test.log
    typecheck.log
    build.log
    e2e.log
  input.json
  expected.report.json
  expected.report.md
  README.md
```

File roles:

* `raw-events.jsonl` records synthetic session events such as prompts, commands, command results, file changes, validation claims, and session stop.
* `diff.patch` contains the synthetic git diff the report engine analyzes.
* `logs/` contains validation evidence. Missing files are meaningful when a fixture tests missing evidence.
* `input.json` declares fixture metadata, expected policy context, agent name, project context, and validation requirements.
* `expected.report.json` is the strict expected report contract.
* `expected.report.md` is either a Markdown expected output file or the source for Markdown snapshot/assertion checks.
* `README.md` explains the real failure mode represented by the fixture and why the expected verdict is correct.

Fixtures should be small, specific, and readable. Avoid fixtures that exist only to increase coverage numbers without representing a real report-quality risk.

## Initial golden fixture set

Start with 8 golden fixtures. The prompt lists 9 failure modes, so combine broad drift and failed command/log error into one fixture for the first set.

| Fixture | Expected verdict | What it tests |
| --- | --- | --- |
| `safe-verified` | `verified` | Scoped change with passing test and typecheck/build evidence. |
| `missing-test-evidence` | `needs_evidence` | Code changed without required test evidence. |
| `missing-build-or-typecheck-evidence` | `needs_evidence` | TypeScript/build-relevant files changed without typecheck or build evidence. |
| `ui-change-missing-e2e-evidence` | `needs_evidence` | UI files changed without e2e, screenshot, or browser validation evidence. |
| `protected-path-touched` | `risky` | Sensitive or policy-protected path changed and must be called out with evidence. |
| `lockfile-package-change` | `risky` | Package manifest or lockfile changed and requires dependency-focused review. |
| `false-validation-claim` | `failed` | Agent claims validation passed, but logs show missing or failing validation. |
| `drift-and-failed-command` | `failed` | Broad prompt causes out-of-scope changes and captured command/log evidence fails. |

Each fixture must include:

* the intended failure mode
* the expected verdict
* the evidence references that must appear in the report
* the expected next action unless the verdict is `verified`

## Evaluation dimensions

Evaluate reports on these dimensions:

* Verdict correctness: the report chooses the right state from the 5-state taxonomy.
* Risk detection correctness: real risks are detected and assigned to the correct evidence.
* Evidence reference completeness: every risk and major claim cites concrete evidence.
* Next action usefulness: the report tells the user what command, review step, rerun prompt, or decision should happen next.
* False positive control: the report avoids inventing risk when evidence does not support it.
* Markdown readability: the human report is scannable, concise, and decision-oriented.

Primary eval focus for v0.1:

1. verdict correctness
2. useful next action
3. complete evidence citation

## Snapshot strategy

JSON snapshots are strict.

* `expected.report.json` should match the generated report shape and content exactly, except for explicitly normalized volatile fields.
* Volatile values such as timestamps, absolute local paths, temporary IDs, and machine-specific paths should be normalized before comparison.
* Schema-affecting changes require review because downstream CLI, Studio, and GitHub surfaces depend on report stability.

Markdown checks are softer.

* Prefer partial Markdown assertions for required headings, verdict wording, evidence references, risks, and next actions.
* Full Markdown snapshots are allowed for stable templates, but small copy changes should not create unnecessary churn.
* Markdown must remain readable; do not optimize only for snapshot stability.

Use Rust `insta` later if aligned with the technical implementation.

Snapshot review requirements:

* Any expected report update must explain what changed and why.
* New benchmark fixtures require human review.
* Do not accept snapshot changes that make the report less useful, less evidence-bound, or more generic.

## AI diagnosis evaluation

v0.1 uses mock AI diagnosis output only.

Rules:

* Do not call real model provider APIs in tests.
* Mock AI output must be deterministic and fixture-controlled.
* Deterministic checks must produce useful verdicts, risks, evidence references, and next actions without AI.
* AI diagnosis may add wording or synthesis, but it must not override deterministic evidence without explicit rules.

Future provider eval can begin only after deterministic reports are stable.

Future eval should measure:

* whether AI summaries remain evidence-bound
* whether AI next actions are more useful than deterministic next actions
* whether AI introduces unsupported claims
* provider variance across the same fixture

## Human review loop

Human rating values:

* `useful`
* `not_useful`
* `wrong`
* `unclear`

Optional reviewer notes should capture:

* why the report helped or failed
* which evidence was missing or misleading
* whether the next action was actionable
* whether the verdict matched the reviewer decision
* whether the report was too generic

Every `wrong` or `unclear` rating should create one of:

* a new fixture candidate
* a rule improvement candidate
* an evidence parser improvement candidate
* a report template improvement candidate
* a policy/default requirement clarification

Human review is required before accepting new benchmark cases or changing expected benchmark outputs.

## Privacy and fixture hygiene

Fixtures are synthetic by default.

Sanitized real sessions are allowed later, but only after removing:

* secrets
* private paths
* customer names
* tokens
* environment variables
* `.env` content
* SSH paths and keys
* API keys
* private source snippets that should not be committed
* internal hostnames, project names, and account identifiers when sensitive

Do not commit raw private session logs, customer data, production secrets, or proprietary source content.

Sanitized real fixtures must include a README note stating:

* source is sanitized
* what was removed or generalized
* which failure mode the fixture represents
* why the expected verdict is correct

## Codex fixture contribution rules

Codex may:

* propose new fixtures
* update fixture README files
* update expected report snapshots when the report contract intentionally changes
* suggest rule or parser improvements based on fixture failures

Codex must:

* explain the real failure mode each fixture represents
* keep fixture content synthetic unless explicitly told to work from sanitized real input
* update expected report snapshots together with intentional report behavior changes
* preserve the 5-state verdict taxonomy in v0.1
* keep every risk evidence-bound

Human review is required before accepting:

* new benchmark cases
* expected report changes
* eval scoring changes
* verdict taxonomy changes after v0.1

Do not optimize reports only to pass snapshots if the output becomes less useful, less readable, or less evidence-bound.

Avoid fake eval improvements:

* Do not add a fixture unless it represents a real report-quality failure mode.
* Do not loosen assertions to hide report regressions.
* Do not remove evidence requirements to make tests pass.
* Do not change expected verdicts without explaining the product reasoning.

## Done-when criteria for v0.1

v0.1 data/eval is ready when:

* 8 golden fixtures exist.
* `cargo test` validates report JSON against expected snapshots.
* Markdown report assertions pass.
* Every risk has an evidence reference.
* Every report has at least one next action unless the verdict is `verified`.
* The human rating schema is documented, even if it is not wired into product UI yet.
* AI diagnosis uses mock output only.
* No real model provider APIs are called in tests.
* Benchmark/eval changes require human review.
