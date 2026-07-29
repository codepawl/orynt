---
name: release-readiness
description: Assess repository release readiness from manifests, CI, tests, builds, packaging, documentation, security boundaries, and observed evidence. Use for preflight checks, go or no-go reviews, ship-readiness audits, beta packaging, or release checklists.
---

# Release Readiness

## Derive the release contract

1. Read repository instructions, release documentation, manifests, and CI.
2. Identify required tests, builds, contract checks, generated artifacts,
   packaging outputs, versioning, and platform constraints.
3. Inspect the worktree for unrelated, missing, generated, or untracked files
   that affect the release.

## Produce evidence

Run safe, non-publishing checks from smallest to broadest. Classify every gate
as passed, failed, or blocked and include the observed command or artifact.
Report:

- release verdict and blocking issues;
- completed checks and material evidence;
- documentation, security, compatibility, or recovery gaps;
- exact remaining commands and owners.

Never tag, commit, upload, deploy, publish, spend, or change credentials. Do not
broaden tools, paths, network access, or approval authority.
