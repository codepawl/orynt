# Future Desktop Surfaces

## Principle

Tauri makes future native integrations more natural, but full desktop control is still not MVP.

## Rollout

```text
L0 Browser control
L1 Browser + file references
L2 Read-only desktop observation
L3 Approval-gated desktop actions
L4 Cross-system workflows
```

## macOS future

Use Accessibility API with explicit permission onboarding. Screenshot fallback may require Screen Recording permission.

## Windows future

Use Windows UI Automation for semantic control. This may become the most important commercial desktop surface.

## Linux future

Investigate AT-SPI/DBus. Support as dev preview first.

## Tauri implication

Native desktop adapters can live in Rust plugins/crates and expose only scoped commands through Tauri capabilities.
