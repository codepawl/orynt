# Permission Policy Engine

## Permission modes

```text
Manual: approve every external/risky action
Safe: allow low-risk navigation/read/fill; ask for submit/download/upload
Balanced: allow common medium actions; ask for high-risk actions
```

## Policy decision

```ts
export type PolicyDecision =
  | { type: 'allow'; reason: string }
  | { type: 'deny'; reason: string }
  | { type: 'require_approval'; reason: string; approvalRequest: ApprovalRequest }
  | { type: 'stop_budget'; reason: string };
```

## Rust/sidecar split

Sidecar can classify risk and propose policy decision. Rust host owns final approval state and emits approval requests to UI.

## MVP defaults

```text
submit: approval required
download: approval required
upload: approval required
delete: approval or denied
payment: denied
terminal/filesystem write: denied
```
