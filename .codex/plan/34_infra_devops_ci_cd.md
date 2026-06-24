# Infrastructure, DevOps, and CI/CD

Generated: 2026-06-24

## MVP infra philosophy

Local-first product means no production backend is required for the first runtime MVP. Use infrastructure only for development, releases, docs, crash reporting if opt-in, and later cloud sync.

Commercial account, license, and billing services are allowed later, but the local alpha must run with offline-first placeholder trial/license state.

Future cloud deployment is tracked separately in `51_cloud_deployment_roadmap.md`. The first cloud target is a small commercial control plane that can handle roughly 1000 registered users without moving browser automation to the cloud.

## CI pipeline

GitHub Actions:

```text
on pull request:
  pnpm install
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm test:integration
  pnpm build
```

## Required checks

- ESLint.
- TypeScript strict typecheck.
- Unit tests.
- Browser adapter integration tests.
- Security/static checks where available.
- Dependency audit.

## Release pipeline

P0:

- manual release builds
- versioned GitHub releases
- changelog
- checksums

P1:

- code signing
- auto-updater
- staged release channels
- crash reporting opt-in
- cloud account/license/billing backend
- release metadata endpoint

P2:

- optional encrypted sync
- team account support
- cloud artifact backup

## Environments

- local dev
- offline local alpha
- preview builds
- beta release
- stable release
- cloud staging
- cloud production

## Secrets in CI

- Release signing secrets only in protected environments.
- No model provider keys in CI except dedicated test keys with strict limits.
- Redact logs.

## Build artifacts

- desktop installers/packages
- source zip
- checksum file
- SBOM later

## Development scripts

```json
{
  "dev": "...",
  "build": "...",
  "lint": "...",
  "typecheck": "...",
  "test": "...",
  "test:integration": "...",
  "eval:browser": "..."
}
```

## Done when

A clean clone can install, run, test, and build from documented commands.
