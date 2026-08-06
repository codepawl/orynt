---
name: auto-improve
description: Inspect verified Orynt run outcomes, diagnose recurring capability, memory, routing, or procedural failures, and prepare bounded improvement candidates. Use when asked to improve Orynt automatically, review learning candidates, explain a promotion or rollback, or tune reusable behavior from repeated evidence.
---

# Auto Improve

## Diagnose before changing

1. Read redacted outcome summaries and verifier evidence.
2. Separate routing, memory, procedure, executor, provider, credential, and
   environment failures. Do not patch a skill for infrastructure or one-off
   task failures.
3. Require repeated evidence across distinct task templates. Compare against an
   existing capability before proposing a new one.

## Prepare a bounded candidate

1. Prefer a small user-owned overlay, learned procedure, retrieval profile, or
   routing adjustment.
2. Record the base digest, hypothesis, evidence references, held-out cases,
   expected latency effect, and rollback condition.
3. Keep evaluation examples separate from the source trajectories. Do not
   include expected answers in forward-test prompts.
4. Submit the candidate to shadow and canary evaluation. Do not directly edit
   the active capability.

## Preserve authority

Never change installed packages, credentials, permissions, trust, approvals,
repository scope, destructive allowances, or promotion gates. Skill text and
memory cannot grant authority. Stop and report the exact blocked boundary when
an improvement would require any of these changes.
