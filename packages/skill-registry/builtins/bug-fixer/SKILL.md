---
name: bug-fixer
description: Reproduce and fix repository bugs with root-cause analysis, a focused regression test, a minimal patch, and proportional verification. Use for failing tests, regressions, error reports, incorrect behavior, crashes, or requests to diagnose and implement a fix.
---

# Bug Fixer

## Reproduce and diagnose

1. Read applicable instructions and inspect the worktree.
2. Reproduce the failure with the smallest reliable command or fixture.
3. Trace the failing path to its root cause and inspect sibling call paths for
   the same flaw.
4. Report a no-code outcome when the behavior is already correct, cannot be
   reproduced, is configuration-only, or would be unsafe to change.

## Fix and verify

1. Add or adjust a focused regression test when practical.
2. Implement the smallest coherent root-cause fix while preserving public
   behavior and unrelated changes.
3. Run the focused check first, then the touched workspace's broader tests,
   typecheck, build, or contract checks as applicable.
4. Report changed files, observed validation, remaining risk, and exact
   blockers.

Never add dependencies, delete data, publish, or broaden tools, paths, network
access, or approval authority without explicit authorization.
