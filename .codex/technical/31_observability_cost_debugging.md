# Observability, Cost, and Debugging

## User-visible trace

```text
Opened site
Found form
Filled field
Needs approval before submit
Verified result
```

## Developer debug mode

```text
raw graph
candidate scores
context packet
model output JSON
policy decision
selector attempts
verifier result
sidecar logs
token/cost ledger
```

## Logging split

```text
Rust host logs: app/sidecar/permission/storage events
Sidecar logs: browser/runtime/model/graph events
```

Both must be redacted.
