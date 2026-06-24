# Sidecar Protocol

## Transport

Use newline-delimited JSON-RPC over stdio for MVP.

## Handshake

Rust host starts sidecar and sends:

```json
{"jsonrpc":"2.0","id":"hello-1","method":"hello","params":{"protocolVersion":"1","sessionToken":"...","appVersion":"0.1.0"}}
```

Sidecar replies:

```json
{"jsonrpc":"2.0","id":"hello-1","result":{"ok":true,"sidecarVersion":"0.1.0","capabilities":["browser"]}}
```

## Request example

```json
{"jsonrpc":"2.0","id":"run-1","method":"run.create","params":{"task":"Fill this form","surfaceKind":"browser","budgetPolicy":{"maxSteps":40}}}
```

## Event example

```json
{"type":"event","event":"run.step_added","payload":{"runId":"r1","stepIndex":2,"summary":"Filled email field"}}
```

## Protocol rules

- Every request has `id`.
- Every event has `type: event`.
- Every payload is schema-validated on both sides.
- Large blobs are not sent over stdio; send local blob IDs/paths managed by Rust.
- No raw browser screenshots in normal event stream.
- Sidecar must support cancellation.

## Method list

```text
hello
health.check
run.create
run.cancel
run.get_state
approval.resolve
browser.open
browser.close
skill.replay
settings.runtime_update
shutdown
```

## Security

- Sidecar is not exposed to network by default.
- Session token is required after handshake.
- Rust host is the only controller.
- Debug methods disabled in production.
