# Orynt Skills Hub implementation plan

## Goal

Build one operator-facing Skill Manager that discovers portable Agent Skills from approved machine and repository roots, aggregates multiple marketplace/catalog sources, installs and updates skills transactionally, and attaches explicit immutable skill snapshots to supervised repository runs.

Keep installed `SKILL.md` packages separate from the existing learned `SkillDefinition` lifecycle.

## Locked decisions

- Discovery precedence is `<repository>/.agents/skills`, then `~/.agents/skills`.
- Runtime-native Codex, Claude, Hermes, and plugin catalogs are read-only and opt-in.
- The hub supports OpenAI curated skills, Hermes official skills, skill-only Claude marketplace entries, skills.sh, ClawHub, GitHub paths, `marketplace.json`, direct HTTPS `SKILL.md`, and well-known skill indexes through provider adapters.
- New installs are always explicit.
- Trusted publishers may receive content-only automatic updates during an explicit refresh/sync when immutable source, digest, scan, capability diff, and local drift checks all pass.
- Skill installation never runs scripts, dependency managers, or post-install hooks.
- Remove is recoverable through Trash; purge is a separate destructive approval.
- Orynt execution remains repository-only and approval-gated.

## Implementation sequence

1. Add versioned package-manager contracts without changing learned-skill contracts.
2. Add bounded local discovery, parsing, fingerprints, durable receipts, transactions, backup, Trash, and recovery in `packages/skill-registry`.
3. Add multi-source provider adapters with bounded HTTPS/cache behavior.
4. Add plan/approve/execute IPC and a JSON sidecar shared by desktop and CLI.
5. Add top-level `orynt skills` commands and interactive skill attachment.
6. Add the desktop Installed, Discover, Updates, Learned, and Sources & policy views.
7. Snapshot selected skill instructions and bounded text resources into run evidence; never expose host skill paths to the model.
8. Update product/security/release docs and packaged runner contents.
9. Run package, contract, CLI, desktop, Tauri, walkthrough, release, and security validation.

## Acceptance

- Approved roots are scanned deterministically with path-containment and size limits.
- Unmanaged/runtime skills cannot be overwritten or removed.
- All mutations have immutable plans, operator decisions, audit events, expected fingerprints, receipts, rollback, and crash recovery.
- Digest mismatch, path escape, archive bombs, special files, critical scans, stale plans, and capability-expanding auto-updates are blocked.
- Desktop and CLI use one manager state and expose stable JSON contracts.
- Selected skills are explicit, eligible, immutable per run, and remain subject to existing conservative policy.
