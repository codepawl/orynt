# Codex Phase 5 Prompt — Evaluation, Safety, and Reliability

Goal: build an evaluation harness that proves CodePawl is safe, auditable, cost-aware, and useful for supervised computer-use tasks.

Context: inspect existing test framework, CI, fake model/gateway infrastructure, permission policy, and benchmark/eval utilities.

Constraints: evals must be deterministic where possible. Include malicious external content tests. Do not require paid external services for default CI. Report metrics in machine-readable and human-readable formats.

Done when: eval suite includes safe read-only tasks, low-risk state-changing tasks, sensitive-action tasks, blocked-action tasks, prompt-injection tests, memory regression tests, and cost regression tests. Reports include success rate, permission coverage, blocked execution count, intervention count, retry rate, loop rate, p50/p90 cost, and evidence coverage.
