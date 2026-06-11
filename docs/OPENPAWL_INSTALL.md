# Installing Openpawl

Openpawl is distributed from the public Action repository:
`https://github.com/codepawl/openpawl`.

This website uses current-candidate install wording until the final Marketplace
release tag and listing URL are verified.

## Minimal Action Setup

Use the public Action directly from the Openpawl repository:

```yaml
name: Openpawl

on:
  workflow_dispatch:

jobs:
  openpawl:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v6
      - uses: codepawl/openpawl@main
```

Replace `main` with the verified Marketplace release tag after the Action
release exists and the listing has been confirmed.

## Public References

- Source repository: `https://github.com/codepawl/openpawl`
- Action metadata: `https://github.com/codepawl/openpawl/blob/main/action.yml`
- Repository docs: `https://github.com/codepawl/openpawl/tree/main/docs`
- Support issues: `https://github.com/codepawl/openpawl/issues`
- Security advisories: `https://github.com/codepawl/openpawl/security/advisories`

## Safety Notes

Openpawl is dry-run-first. Write behavior must remain behind explicit
maintainer approval and the Action safety gates. Do not present Openpawl as an
unattended autonomous writer.

## Website Routes

The public website routes used for Marketplace submission are:

- `https://codepawl.com/openpawl/install`
- `https://codepawl.com/openpawl/docs`
- `https://codepawl.com/openpawl/support`
- `https://codepawl.com/status`
- `https://codepawl.com/security`
- `https://codepawl.com/privacy`
- `https://codepawl.com/terms`
