# Openpawl Release Sync Plan

Status: receiver implementation in progress
Current release fixture: `codepawl/openpawl@v0.5.3`

## Goal

Notify the CodePawl website repository when a public `codepawl/openpawl` GitHub
Release is published, validate the payload, update reviewed website/docs release
metadata, and open a PR for human review.

The receiver must not publish npm packages, create releases, auto-merge,
auto-deploy, expose secrets, change Openpawl runtime behavior, or claim hosted
CodePawl Cloud upload/storage.

## Dispatch Payload

The receiver accepts `repository_dispatch` events of type
`openpawl_release_published` with this schema:

- `schemaVersion`: `1`
- `source`: `codepawl/openpawl`
- `tag`: `vX.Y.Z`
- `releaseUrl`: `https://github.com/codepawl/openpawl/releases/tag/<tag>`
- `repoUrl`: `https://github.com/codepawl/openpawl`
- `publishedAt`: ISO-compatible timestamp
- `commitSha`: optional release target SHA
- `docs`: release-locked Openpawl README/install/Marketplace/config/security/privacy URLs
- `capabilities.cloudEvidence`: `local-preview`
- `capabilities.actionRef`: `codepawl/openpawl@<tag>`
- `capabilities.artifactSchemaVersion`: `"1"`
- `capabilities.evidenceBundle`: `true`
- `capabilities.writeMode`: `explicit-safety-gated`

Payloads must not include artifact contents, customer data, workflow logs,
secrets, tokens, private keys, or evidence bundle bodies.

## CodePawl Receiver

The receiver lives at `.github/workflows/openpawl-release-sync.yml` and:

1. Checks out `main`.
2. Writes the dispatch payload to a local file without printing secrets.
3. Runs `scripts/sync-openpawl-release.ts --check` to validate the current state.
4. Runs `scripts/sync-openpawl-release.ts` to update the manifest and scoped docs.
5. Runs typecheck, tests, build, e2e, route smoke, webhook GET smoke, and
   `git diff --check`.
6. Opens or updates a PR on `automation/openpawl-release-<tag>`.

It never merges the PR and never deploys.

## Source Of Truth

`apps/web/src/data/openpawl-release.ts` is the website manifest for the current
Openpawl release metadata. Website components should import this file where
practical. Markdown docs and `.agents` coordination files may be updated by the
sync script as derived reviewable text.

## Manual Fixture

Use `.agents/sync/openpawl-release-v0.5.3.json` for local checks:

```bash
bun scripts/sync-openpawl-release.ts --payload .agents/sync/openpawl-release-v0.5.3.json --check
```

The check should pass when the website/docs are synced to Openpawl `v0.5.3`.

## Guardrails

- Do not touch public `openpawl/`.
- Do not edit `packages/core`, `packages/cli`, or `packages/shared`.
- Do not change Marketplace webhook behavior.
- Keep CodePawl Cloud Evidence as local/browser-only preview unless a later
  reviewed payload and product checkpoint explicitly approve more.
- Keep Marketplace listing copy pending until a GitHub Marketplace listing URL
  exists and is verified.
