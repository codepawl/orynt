# Performance Optimization

Generated: 2026-06-24

## Performance targets

- Browser observation under 500ms for ordinary pages where possible.
- Context packet build under 100ms for cached observations.
- UI remains responsive during agent run.
- Trace write does not block action loop.
- Token packet stays compact.

## Bottlenecks

- full DOM/accessibility extraction
- screenshots
- model latency
- trace artifact writes
- large JSON serialization
- React rendering of long traces

## Optimization tactics

### Observation

- incremental diffing
- cache stable element metadata
- lazy raw snapshot storage
- avoid screenshot unless needed

### UI

- virtualize long ledger lists
- background artifact loading
- separate live preview from trace inspector

### Model

- small context packets
- prompt cache alignment
- local model for simple classification
- batch deterministic verifications

### Storage

- append-only writes
- artifact compression
- indexes on run/step/type

## Token optimization hierarchy

1. Do not collect unnecessary data.
2. Do not send raw data if summary is enough.
3. Send top-k candidates, not full UI tree.
4. Send diffs, not full repeated state.
5. Use prompt caching stable prefix.
6. Replay skills deterministically.
7. Compress only after selection/diffing.

## Done when

A demo run feels interactive and the cost HUD proves fewer tokens than a naive screenshot/full-snapshot loop.
