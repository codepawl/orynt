# Openpawl GitHub Marketplace Readiness

CP-026 candidate release: `v0.5.1`

## Verdict

`BLOCKED_WITH_REASON`: `v0.5.1` is reproducible and installable as a GitHub Actions workflow, but it is not directly publishable as a GitHub Marketplace Action because this monorepo does not contain a root `action.yml` or `action.yaml` action metadata file and is not packaged as a single-action repository.

Openpawl should not be submitted to GitHub Marketplace until there is an explicit Marketplace action wrapper or a dedicated single-action repository. The current install path remains the documented copyable workflow or reusable workflow pinned to `v0.5.1`.

## Marketplace Field Draft

- Product name: `Openpawl by CodePawl`
- Owner: `CodePawl`
- Candidate version: `v0.5.1`
- Primary category: `Code quality`
- Secondary category: `Testing`
- Short description: `Dry-run-first AI code review workflow for GitHub issues and pull requests.`
- Full description:
  - `Openpawl is a conservative GitHub Actions workflow for AI-assisted repository review. It runs dry-run reviews by default, writes schema-versioned artifacts, posts report context when issue or PR comments are available, and only enters write mode through explicit maintainer approval or manual workflow dispatch. Current beta writes are limited to safe test-file creation on a bot branch with PR review.`
- Current install URL: `https://github.com/codepawl/codepawl/blob/v0.5.1/docs/OPENPAWL_INSTALL.md`
- Reusable workflow URL: `https://github.com/codepawl/codepawl/blob/v0.5.1/.github/workflows/openpawl-run.yml`
- Copyable workflow URL: `https://github.com/codepawl/codepawl/blob/v0.5.1/docs/samples/openpawl.workflow.yml`
- Sample config URL: `https://github.com/codepawl/codepawl/blob/v0.5.1/docs/samples/openpawl.config.json`
- Release URL: `https://github.com/codepawl/codepawl/releases/tag/v0.5.1`
- Source URL: `https://github.com/codepawl/codepawl`
- Support URL: `https://github.com/codepawl/codepawl/issues`
- Status URL: `https://github.com/codepawl/codepawl/actions/workflows/openpawl.yml`
- Security/contact URL: `https://github.com/codepawl/codepawl/security/advisories`
- Documentation URL: `https://github.com/codepawl/codepawl/tree/v0.5.1/docs`

## Copy Guardrails

- Do not claim unattended autonomous writing.
- Do not claim broad code modification support in beta.
- Do not claim npm installability or package publication.
- Do not imply Marketplace publication is complete while no root action metadata exists.
- State that dry-run is the default.
- State that write mode requires explicit maintainer approval or manual dispatch.
- State that beta write behavior is constrained to safe test-file creation, bot branches, and PR review.
- State that reports and artifacts are retained under `.codepawl/runs/<run-id>/`.

## Screenshot And Feature-Card Checklist

- Workflow dispatch setup screen showing `mode=dry-run` and a pinned `v0.5.1` workflow reference.
- Successful Openpawl Actions run with `Openpawl Agent Run` and artifact upload steps visible.
- `report.md` Evidence Summary showing run ID, Actions URL, artifact name, report path, trace path, and `schemaVersion`.
- Example issue or PR report comment with dry-run output and artifact context.
- Safety card showing dry-run default, exact commands only, maintainer-approved write mode, bot branch, and PR review.
- Artifact card listing `run.json`, `trace.json`, `patch-plan.json`, `selected-files.json`, `applied-files.json`, and `report.md`.
- Limitations card stating beta write mode only applies safe test-file create chunks and rejects unsupported tasks.

## Publication Blockers

- Add a root `action.yml` or `action.yaml` metadata file for a real Marketplace Action, or move the action wrapper into a dedicated single-action repository.
- Package only the metadata, code, and files necessary for the Action listing.
- Decide whether Openpawl Marketplace install should be a composite action, JavaScript action, or separate workflow-template distribution.
- Accept the GitHub Marketplace Developer Agreement for the publishing account before release publication.
- Re-run the live smoke on the final Marketplace package before submitting.
