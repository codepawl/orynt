# Openpawl Marketplace Website Support

This website provides stable support pages for the Openpawl GitHub Marketplace
submission. The Action source of truth is the public repository at
`https://github.com/codepawl/openpawl`.

## Current Status

Openpawl is a Marketplace candidate. Do not claim the listing is live until the
GitHub Marketplace listing URL exists and has been verified.

Use `v0.5.1` for release-pinned Action install instructions. Keep Marketplace
listing copy pending until the GitHub Marketplace listing URL exists and has
been verified.

## Marketplace-Critical URLs

- Install: `https://codepawl.com/openpawl/install`
- Documentation: `https://codepawl.com/openpawl/docs`
- Support: `https://codepawl.com/openpawl/support`
- Status: `https://codepawl.com/status`
- Security: `https://codepawl.com/security`
- Privacy: `https://codepawl.com/privacy`
- Terms: `https://codepawl.com/terms`
- Webhook: `https://codepawl.com/api/github/marketplace`

## Public Source URLs

- Source repository: `https://github.com/codepawl/openpawl`
- Action release: `https://github.com/codepawl/openpawl/releases/tag/v0.5.1`
- Action metadata: `https://github.com/codepawl/openpawl/blob/v0.5.1/action.yml`
- Install docs: `https://github.com/codepawl/openpawl/blob/v0.5.1/docs/OPENPAWL_INSTALL.md`
- Marketplace docs: `https://github.com/codepawl/openpawl/blob/v0.5.1/docs/MARKETPLACE.md`
- Current docs tree: `https://github.com/codepawl/openpawl/tree/main/docs`
- Support issues: `https://github.com/codepawl/openpawl/issues`
- Security advisories: `https://github.com/codepawl/openpawl/security/advisories`
- Actions status: `https://github.com/codepawl/openpawl/actions`

## Copy Guardrails

- Do not claim unattended autonomous writing.
- Do not claim the GitHub Marketplace listing is live until the listing URL
  exists.
- Do not claim CodePawl Cloud is available; it is upcoming and waitlist-only.
- Do not expose private deployment, billing, database, or internal operational
  details.
- State that Openpawl is dry-run-first and self-managed.
- State that write behavior requires explicit maintainer approval and remains
  constrained by the Action safety gates.

## Webhook Notes

`GET /api/github/marketplace` must return `405` with `Allow: POST`.

`POST /api/github/marketplace` must keep the existing GitHub Marketplace webhook
behavior. It verifies GitHub signatures and accepts Marketplace purchase events
without provisioning a hosted Cloud product from the public website.
