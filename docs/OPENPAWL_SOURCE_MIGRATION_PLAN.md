# Openpawl Source-Of-Truth Migration Plan

Date: 2026-06-11

Status: planning only. Do not delete, move, tag, publish, or change runtime behavior from this document without a separate implementation pass.

## Verdict

`OPENPAWL_MIGRATION_PLAN_READY`

Openpawl source of truth should move to the public repository at `codepawl/openpawl`. The private `codepawl` repository should keep the duplicated Openpawl packages temporarily, freeze them, and stop treating them as the active development surface. Future Openpawl runtime work should land in `/home/annx9/Code/Personal/openpawl` first, then private CodePawl surfaces should consume the public Action release, docs, and status links.

Do not delete `codepawl/packages/core`, `codepawl/packages/cli`, or `codepawl/packages/shared` yet. They still appear in the private workspace, scripts, lockfile, workflows, and docs, and `packages/core` plus `packages/cli` have already drifted from the public repo. Remove them only after workflow-link changes, dependency checks, and a package-removal checkpoint pass.

## Sources Inspected

Public Openpawl repo:

- `/home/annx9/Code/Personal/openpawl`
- `action.yml`
- `packages/core`
- `packages/cli`
- `packages/shared`
- `docs/MARKETPLACE.md`
- `docs/OPENPAWL_INSTALL.md`
- `docs/NATIVE_RUNTIME_MASTER_PLAN.md`
- current local tag state: `v0.5.1` points at the public repo HEAD inspected locally

Private CodePawl repo:

- `/home/annx9/Code/Personal/codepawl`
- commit `fd9b416` docs: add website cloud master plan
- commit `e3021398` feat(web): add marketplace support routes
- `packages/core`
- `packages/cli`
- `packages/shared`
- `.github/workflows/openpawl.yml`
- `.github/workflows/openpawl-run.yml`
- `docs/MARKETPLACE.md`
- `docs/OPENPAWL_INSTALL.md`
- `docs/WEBSITE_CLOUD_MASTER_PLAN.md`
- `apps/web`

## Source-Of-Truth Map

| Surface | Current state | Source of truth after migration | Action |
| --- | --- | --- | --- |
| Marketplace Action metadata | Public `openpawl/action.yml` exists and is release-tagged at `v0.5.1`. | `codepawl/openpawl` root `action.yml`. | Keep only in public repo. Private website links to release metadata. |
| Action runtime packages | Present in both repos as `packages/core`, `packages/cli`, `packages/shared`. | `codepawl/openpawl/packages/*`. | Freeze private copies, then remove later after dependency audit. |
| Artifact schema v1 | Implemented in both runtime copies. | Public `openpawl/packages/core`. | No schema drift allowed. Validate from public repo before workflow switch. |
| Trace legacy compatibility | Runtime behavior lives in duplicated core/cli packages. | Public Openpawl runtime. | Preserve while switching callers to public Action. |
| `.gitignore` scanning | Runtime behavior lives in `packages/core/src/gitignore.ts`. | Public Openpawl runtime. | Do not modify in private repo except freeze notes. |
| Bounded validation retries | Runtime behavior lives in core/cli package paths. | Public Openpawl runtime. | No private behavior changes. |
| Evidence Summary | Runtime behavior lives in core report export paths and workflow comment wrappers. | Public runtime plus private workflow comment wrapper only if still needed. | Preserve output contract during workflow-link change. |
| Marketplace docs | Public repo has full Action submission fields for `v0.5.1`; private repo has website support docs. | Public repo for Action docs; private repo for website URLs. | Private docs should link to public versioned docs and avoid duplicating runtime instructions. |
| Website Marketplace routes | Added in private repo Phase 1. | Private `apps/web`, with public Openpawl links. | Update to reference `v0.5.1` where release URL is verified. |
| Private Openpawl workflows | Still run local private packages or checkout `codepawl/codepawl`. | Public `codepawl/openpawl@v0.5.1`. | Change in a workflow-link phase, not in this plan. |
| Future Openpawl development | Split across public/private copies risk. | Public `openpawl` repo only. | Make private repo a consumer, not runtime owner. |

## Duplicate And Stale Files In `codepawl`

### Runtime duplicates to freeze now

These are duplicated Openpawl runtime packages and should be considered stale after `v0.5.1`:

- `packages/core`
- `packages/cli`
- `packages/shared`

Observed comparison with public `openpawl`:

- `packages/shared` is identical excluding generated cache directories.
- `packages/core` differs in:
  - `src/runner.ts`
  - `src/agent/nodes.ts`
  - `src/providers/llm.ts`
  - `src/__tests__/runner.test.ts`
  - `src/__tests__/safety.test.ts`
- `packages/cli` differs in:
  - `src/bin.ts`
  - `src/patch-quality-eval.ts`
  - `src/__tests__/cli.test.ts`
  - local `.codepawl/evals` generated outputs

Decision: freeze these private packages immediately by policy, not by deletion. Do not accept feature work in private copies. If a critical private-only fix is discovered, port or re-evaluate it into `openpawl` first, then consume a new public Action release.

### Workflow duplicates to replace with public Action usage

- `.github/workflows/openpawl.yml` runs the local private `@codepawl/cli` package.
- `.github/workflows/openpawl-run.yml` checks out `repository: codepawl/codepawl` at `openpawl_ref` and runs `.openpawl-src`.

Decision: these should switch to public release consumption in a dedicated workflow-link phase. The target is `uses: codepawl/openpawl@v0.5.1` for direct Action use, or `uses: codepawl/openpawl/.github/workflows/openpawl-run.yml@v0.5.1` only where the reusable workflow shape is required.

Do not weaken current private workflow protections while switching:

- dry-run remains default
- write mode remains explicit
- maintainer approval remains required
- comments from forks remain guarded
- artifact upload and report comments remain preserved

### Docs that should become links or website-specific notes

These private docs should not duplicate Action runtime install semantics long-term:

- `docs/MARKETPLACE.md`
- `docs/OPENPAWL_INSTALL.md`
- `docs/samples/openpawl.workflow.yml`

Decision: keep them as website and Marketplace URL support docs. Link to public versioned Openpawl docs:

- `https://github.com/codepawl/openpawl/blob/v0.5.1/docs/MARKETPLACE.md`
- `https://github.com/codepawl/openpawl/blob/v0.5.1/docs/OPENPAWL_INSTALL.md`
- `https://github.com/codepawl/openpawl/blob/v0.5.1/action.yml`
- `https://github.com/codepawl/openpawl/releases/tag/v0.5.1`

After the listing URL exists, update website copy to say the Marketplace listing is live and include the listing URL. Until then, use "Marketplace Action release" and "Marketplace candidate/listing pending" language.

### Private workspace files that depend on package removal timing

These private files still assume the packages exist and must be changed only in the package-deprecation/removal phases:

- root `package.json` workspaces and scripts:
  - `packages/shared`
  - `packages/core`
  - `packages/cli`
  - `typecheck:shared`
  - `typecheck:core`
  - `typecheck:cli`
  - `test:core`
  - `test:cli`
  - `dev:cli`
- `bun.lock`
- `turbo.json`, if it references package tasks
- docs describing `packages/core`, `packages/cli`, or Openpawl internals:
  - `docs/ARCHITECTURE.md`
  - `docs/ROADMAP.md`
  - `docs/PRODUCT.md`
  - `docs/API.md`
  - `docs/DATA.md`
  - `docs/UI.md`

Decision: do not remove package paths until these references are audited. Prefer a transitional `docs/OPENPAWL_SOURCE_MIGRATION_PLAN.md` link and deprecation note first.

## Website Reference Policy

Now that public Action release `v0.5.1` exists, private website Marketplace pages should move from `main` and "current candidate" links to verified release links where they describe installs:

- Install snippets should use `codepawl/openpawl@v0.5.1`.
- Source/doc links can use `v0.5.1` for release-locked docs and `main` for current development docs when explicitly labeled.
- Status links can continue to point to public Actions pages on `codepawl/openpawl`.
- Support and security links should remain repository-level:
  - `https://github.com/codepawl/openpawl/issues`
  - `https://github.com/codepawl/openpawl/security/advisories`
- Privacy/terms website routes remain private website pages unless the Marketplace form uses public repo `PRIVACY.md` and `LICENSE`.

Do not claim the GitHub Marketplace listing is live until the listing URL exists. It is acceptable to say the `v0.5.1` Action release exists.

## Future Development Policy

All future Openpawl runtime work happens in `/home/annx9/Code/Personal/openpawl`:

- Action metadata
- runtime packages
- CLI trigger parsing
- artifact schemas
- trace compatibility
- `.gitignore` scanning
- safety/write gates
- validation retry behavior
- Evidence Summary behavior
- Marketplace docs
- native runtime planning and spikes

The private `codepawl` repo should own:

- CodePawl website and Cloud positioning
- website Marketplace support/legal/status routes
- contact/newsletter/waitlist surfaces
- private API and operational docs
- future Cloud integrations that consume Openpawl artifacts or public releases

If CodePawl Cloud later needs private integration code, add a new private package with a Cloud-specific name. Do not keep modifying `@codepawl/core`, `@codepawl/cli`, or `@codepawl/shared` as shadow Openpawl runtime packages.

## Phased Checkpoints

### Phase 0: Planning And Freeze Notice

Scope: docs-only.

Tasks:

- Add this migration plan.
- Add a short freeze note near private Openpawl docs or package README files in a follow-up docs-only change.
- Record that `codepawl/packages/core`, `codepawl/packages/cli`, and `codepawl/packages/shared` are frozen duplicates.

Go criteria:

- Plan exists.
- No runtime behavior changed.
- Both repos have clean or understood git status.

No-go criteria:

- Any package code changes are included.
- Any tag, npm publish, repo visibility, or workflow behavior changes are attempted.

### Phase 1: Website Release-Link Update

Scope: private website docs/copy only.

Tasks:

- Update `apps/web/components/marketing/marketplace-pages.tsx` constants to include `v0.5.1` release docs for install and action metadata where appropriate.
- Update `/openpawl/install` snippet from `codepawl/openpawl@main` to `codepawl/openpawl@v0.5.1`.
- Update `docs/MARKETPLACE.md`, `docs/OPENPAWL_INSTALL.md`, and `docs/samples/openpawl.workflow.yml` to point at `v0.5.1`.
- Keep listing copy as pending unless the GitHub Marketplace listing URL exists.

Validation:

```bash
cd /home/annx9/Code/Personal/codepawl
bun --filter @codepawl/web typecheck
bun --filter @codepawl/web test
bun --filter @codepawl/web build
git diff --check
```

Go criteria:

- Required website routes still return 200.
- `GET /api/github/marketplace` still returns 405 with `Allow: POST`.
- No page claims Cloud is available.
- No page claims Marketplace listing is live without a verified listing URL.

Rollback:

- Revert only the docs/copy commit. Do not touch public Openpawl release tags.

### Phase 2: Private Workflow-Link Change

Scope: private GitHub Actions workflow wiring.

Recommended target:

- Replace local package execution in `.github/workflows/openpawl.yml` with `uses: codepawl/openpawl@v0.5.1` where direct Action invocation is enough.
- Replace checkout of `repository: codepawl/codepawl` in `.github/workflows/openpawl-run.yml` with `repository: codepawl/openpawl`, or replace the reusable workflow with `uses: codepawl/openpawl/.github/workflows/openpawl-run.yml@v0.5.1` if compatible.

Preserve:

- exact trigger command behavior
- fork comment guard
- maintainer-only `/openpawl apply`
- `openpawl-approved` behavior
- bot branch/PR behavior if still required
- artifact upload
- report comments and GitHub Actions evidence context

Validation:

```bash
cd /home/annx9/Code/Personal/codepawl
bun install
bun run typecheck
bun run test
git diff --check
```

Remote validation:

```bash
gh workflow run openpawl.yml --repo codepawl/codepawl -f mode=dry-run -f task="review changes and suggest improvements"
gh run list --repo codepawl/codepawl --workflow openpawl.yml --limit 5
```

Go criteria:

- Dry-run workflow passes using public `codepawl/openpawl@v0.5.1`.
- Report/artifact paths remain available.
- No npm publish workflow is triggered.
- Write-mode path remains explicitly gated and is not broadened.

Rollback:

- Revert the workflow-link commit to restore local private package execution.
- Do not rewrite public Action tags.

### Phase 3: Package Deprecation In Private Repo

Scope: docs and package metadata only. No deletion yet.

Tasks:

- Add deprecation/read-only notes to private package README files or package comments.
- Remove private package scripts from normal developer docs, but keep them runnable while packages exist.
- Update `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and `docs/PRODUCT.md` to describe Openpawl runtime as external/public.
- Decide whether `packages/shared` is still needed by `apps/web`; if yes, rename the future shared package to a website/API-specific type package before removal.

Validation:

```bash
cd /home/annx9/Code/Personal/codepawl
bun run typecheck
bun run test
bun --filter @codepawl/web build
rg -n "packages/(core|cli)|@codepawl/(core|cli)" docs apps package.json turbo.json
git diff --check
```

Go criteria:

- Private docs clearly identify public Openpawl as source of truth.
- No product code imports private `@codepawl/core` or `@codepawl/cli`.
- Remaining `@codepawl/shared` usage is understood and either retained or renamed in a later pass.

Rollback:

- Revert deprecation docs if they block internal development unexpectedly.

### Phase 4: Package Removal Candidate

Scope: remove private duplicated packages only after all consumers are gone.

Tasks:

- Remove `packages/core` and `packages/cli` from private workspace.
- Remove or rename `packages/shared` only if `apps/web`, API docs, and generated types no longer depend on it.
- Update `package.json`, `bun.lock`, `turbo.json`, docs, and CI scripts.
- Keep no local Openpawl runtime implementation in private repo.

Validation:

```bash
cd /home/annx9/Code/Personal/codepawl
bun install
bun run typecheck
bun run test
bun --filter @codepawl/web build
git diff --check
rg -n "@codepawl/(core|cli)|packages/(core|cli)" .
```

Go criteria:

- No imports, scripts, workflows, docs, or lockfile entries require removed packages.
- Website Marketplace routes still pass.
- Private workflows consume public Openpawl release.
- Public Openpawl validation remains green.

Rollback:

- Revert the package-removal commit.
- If lockfile churn is the only failure, restore `bun.lock` from the previous commit and rerun `bun install`.

### Phase 5: Future Cloud Integration

Scope: new Cloud-specific integrations only.

Tasks:

- Consume Openpawl artifacts as external inputs.
- Do not fork or shadow Openpawl runtime internals.
- Add Cloud-specific packages only with Cloud names and data boundaries.
- Keep privacy/terms/status pages updated before any Cloud availability claim.

Validation:

```bash
cd /home/annx9/Code/Personal/codepawl
bun --filter @codepawl/web typecheck
bun --filter @codepawl/web test
bun --filter @codepawl/web build
```

Go criteria:

- Cloud pages remain upcoming/waitlist-only until a real product surface exists.
- No private deployment, billing, database, or internal details leak into public pages.
- Openpawl runtime remains sourced from public releases.

## Public Openpawl Validation Commands

Run these in `/home/annx9/Code/Personal/openpawl` before any new Openpawl release or before consuming a newer release in CodePawl:

```bash
bun install
bun run typecheck
bun run test
bun run build
bun --filter @codepawl/cli dev -- eval patch-quality --limit 50
git diff --check
```

Action smoke checks:

```bash
# Local action smoke should exercise uses: ./
gh workflow run action-smoke.yml --repo codepawl/openpawl

# Remote consumer smoke should exercise the release tag
# Use an explicit dry-run task and pinned release ref.
```

Required invariants:

- `action.yml` exists at repo root.
- `v*` tags are Action release tags only.
- TUI/npm release workflow remains scoped to `tui-v*` or manual TUI release flow.
- No npm package is published by consuming `v0.5.1`.
- Artifact schema stays `schemaVersion: "1"`.
- Trace legacy compatibility remains tested.
- `.gitignore` scanning stays enabled.
- Bounded validation retries remain bounded.
- Evidence Summary behavior stays present in reports/comments.
- Write-mode safety gates are not relaxed.

## Private CodePawl Validation Commands

Run these in `/home/annx9/Code/Personal/codepawl` after docs, website, or workflow migration phases:

```bash
bun install
bun run typecheck
bun run test
bun --filter @codepawl/web build
git diff --check
```

Website route smoke:

```bash
cd /home/annx9/Code/Personal/codepawl/apps/web
bun run dev
```

Then probe:

```bash
node -e 'const paths=["/openpawl/install","/openpawl/docs","/openpawl/support","/status","/privacy","/terms","/security","/api/github/marketplace"]; (async()=>{let bad=false; for (const path of paths){const res=await fetch("http://localhost:3000"+path); console.log(`${res.status} ${path} allow:${res.headers.get("allow")||""}`); if (path==="/api/github/marketplace" ? res.status!==405 || res.headers.get("allow")!=="POST" : res.status!==200) bad=true;} process.exit(bad?1:0);})().catch((err)=>{console.error(err); process.exit(1);})'
```

Required website invariants:

- all Marketplace-critical routes return 200
- webhook GET returns 405 and POST behavior is unchanged
- Openpawl source links point to `codepawl/openpawl`
- install snippets use `v0.5.1` only after the release URL is verified
- Cloud remains upcoming/waitlist-only
- Marketplace listing is not called live until the listing URL exists

## Risks

### Runtime drift between repos

Risk: private `packages/core` and `packages/cli` already differ from public Openpawl. A private-only fix could be lost or a public-only safety fix could be missed.

Mitigation: freeze private packages, compare drift before removal, and port any legitimate private-only fixes to public Openpawl through a normal public validation cycle.

### Workflow behavior regression

Risk: replacing local private package execution with public Action usage could lose trigger resolution, comment posting, artifact upload, or PR creation behavior.

Mitigation: split workflow-link changes from package removal. Validate dry-run first, then approved write smoke only on a controlled test issue with explicit test intent.

### Website overclaim after release

Risk: the site may confuse "Action release exists" with "Marketplace listing is live."

Mitigation: keep release URL and listing URL as separate fields. Update listing-live copy only after the GitHub Marketplace listing URL exists.

### Package removal breaks private app types

Risk: `apps/web` imports `@codepawl/shared` today. Removing all packages together can break the website or generated API type flow.

Mitigation: decide `packages/shared` separately. It may need a private website/API replacement before removal.

### Safety gate drift

Risk: migration could accidentally relax write gates, artifact schema, `.gitignore` scanning, validation retry bounds, or Evidence Summary behavior.

Mitigation: no runtime changes in private repo. Public Openpawl release validation is required before CodePawl consumes a new tag.

### Generated artifact leakage

Risk: private eval outputs under package-local `.codepawl` paths can leak into diffs or comparisons.

Mitigation: treat package-local `.codepawl/evals` as generated artifacts. Do not use them as source of truth.

## Rollback Strategy

- Docs-only phases: revert the docs commit.
- Website link phases: revert the website/docs commit and keep the prior route behavior.
- Workflow-link phase: revert the workflow commit to restore local package execution.
- Package deprecation phase: revert deprecation notes if they block required internal work.
- Package removal phase: revert the removal commit, restore lockfile, rerun `bun install`, `bun run typecheck`, and `bun run test`.
- Public Openpawl release tags: do not rewrite or delete release tags as rollback. Create a new patch release if a public release has a defect.

## Final Go/No-Go Criteria

Go for Phase 1 when:

- `v0.5.1` public release URLs are reachable.
- Website copy can link to release docs without claiming listing availability.
- Web validation passes.

Go for Phase 2 when:

- Public `codepawl/openpawl@v0.5.1` remote action smoke has passed.
- Private workflows have an explicit rollback commit path.
- Trigger/comment/artifact behavior is covered by workflow review.

Go for package deprecation/removal only when:

- No private runtime development remains in progress.
- Public Openpawl is accepted as the only runtime source of truth.
- All private imports/scripts/workflows/docs have migrated away from `@codepawl/core` and `@codepawl/cli`.
- `@codepawl/shared` is either still intentionally private or replaced by a website/API-specific package.

No-go if:

- Any migration step changes Openpawl runtime behavior.
- Safety gates, artifact schema v1, trace legacy compatibility, `.gitignore` scanning, bounded retries, or Evidence Summary behavior are weakened.
- npm publishing, tag creation, repo visibility, or Marketplace listing status changes are bundled into migration cleanup.
- CodePawl Cloud is described as generally available before it is real.
