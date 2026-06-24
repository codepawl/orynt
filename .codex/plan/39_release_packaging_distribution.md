# Release, Packaging, and Distribution

Generated: 2026-06-24

## Release channels

- dev
- alpha
- beta
- stable

## Package targets

MVP target order:

1. macOS arm64 if primary dev machine.
2. Windows x64.
3. Linux AppImage/deb later.

Adjust based on actual user base.

## Release checklist

- version bump
- changelog
- tests pass
- manual smoke test
- security smoke test
- package build
- checksum generated
- download link tested
- rollback plan

## Auto-update

Not required for first private MVP. Add later when packaging stabilizes.

## Signing

Code signing is important before broad distribution. For private alpha, unsigned builds are acceptable with clear warning.

## Crash reporting

Only opt-in. Do not upload traces/screenshots/prompts automatically.

## Documentation

- install guide
- model provider key setup
- privacy explanation
- first demo workflow
- limitations
- security policy

## Done when

A user can download, install, run a demo task, and delete all local data from settings.
