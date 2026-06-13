# Installing Openpawl

Openpawl is an open runtime for coding-agent coordination. The first supported
surface is GitHub Actions, distributed from the public Action repository:
`https://github.com/codepawl/openpawl`.

Use the verified public Action release tag for installs. The GitHub Marketplace
listing remains pending until its listing URL exists and has been verified.

## Minimal Action Setup

Use the public Action directly from the Openpawl repository. This is the current
concrete install path for reviewable agent work:

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
      - uses: codepawl/openpawl@v0.6.0
```

`v0.6.0` is the verified public Action release tag. This install guide does not
claim that the GitHub Marketplace listing is live.

Openpawl `v0.5.3+` GitHub Action runs also produce
`openpawl-evidence-bundle.json` for local browser preview at
`https://codepawl.com/cloud/evidence`. CodePawl Cloud Evidence Hub is a
local-preview/demo surface only; artifact contents are not uploaded or stored by
CodePawl during that preview.

## Public References

- Source repository: `https://github.com/codepawl/openpawl`
- Action release: `https://github.com/codepawl/openpawl/releases/tag/v0.6.0`
- Action metadata: `https://github.com/codepawl/openpawl/blob/v0.5.3/action.yml`
- Release install docs: `https://github.com/codepawl/openpawl/blob/v0.6.0/docs/OPENPAWL_INSTALL.md`
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
