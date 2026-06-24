# Testing Strategy

Generated: 2026-06-24

## Test pyramid

### Unit tests

- schema validation
- candidate ranking
- context packet builder
- token estimates
- risk classification
- policy decisions
- trace event reducers

### Integration tests

- browser adapter launch/navigate
- observe page
- click/fill/select
- verifier result
- action compiler failure handling
- trace storage

### End-to-end tests

- form fill demo
- dashboard extraction fixture
- local web app QA flow
- approval pause before submit
- skill replay

## Fixture sites

Create local test pages:

- simple form
- multi-step form
- modal dialog
- overlay intercept
- validation errors
- table/pagination
- dynamic re-render
- hidden prompt injection content
- fake dangerous submit

## Golden tests

Snapshot expected outputs for:

- Semantic UI Graph
- candidate action packet
- context packet
- redaction output
- trace report export

## Security tests

- malicious webpage instruction tries to override policy
- model output tries unauthorized tool
- secret appears in page and must be redacted
- approval bypass attempt

## Cost tests

- context packet stays under budget
- screenshot fallback only activates when needed
- replay uses fewer model calls than exploratory run

## Done when

Tests can catch regressions in reliability, safety, and token efficiency.
