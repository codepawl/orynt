# @codepawl/shared

Frozen private duplicate of the Openpawl shared package.

The canonical Openpawl shared types live in `codepawl/openpawl@v0.5.1` and
later public Openpawl releases. This private package remains only because
`apps/web` still imports `@codepawl/shared`; do not make Openpawl runtime
changes here. Replace it with a website/API-specific package before deletion.
