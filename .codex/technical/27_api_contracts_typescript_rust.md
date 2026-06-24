# API Contracts — TypeScript and Rust

## Contract strategy

Use JSON schemas as the source of truth for app/sidecar protocol. Generate or mirror types in TypeScript and Rust.

## Shared message shape

```ts
export type RpcRequest = {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: unknown;
};

export type RpcResponse = {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type RpcEvent = {
  type: 'event';
  event: string;
  payload: unknown;
};
```

## Error codes

```text
SIDECAR_SPAWN_FAILED
SIDECAR_PROTOCOL_MISMATCH
BROWSER_LAUNCH_FAILED
OBSERVATION_FAILED
MODEL_SCHEMA_INVALID
POLICY_DENIED
APPROVAL_REQUIRED
ACTION_TARGET_NOT_FOUND
ACTION_SILENT_NOOP
VERIFICATION_FAILED
BUDGET_EXCEEDED
USER_CANCELED
```
