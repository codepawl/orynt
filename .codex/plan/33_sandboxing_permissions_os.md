# Sandboxing, Permissions, and OS Integration

Generated: 2026-06-24

## MVP sandboxing

MVP should keep automation inside the controlled browser runtime as much as possible.

## Browser sandbox

- Dedicated browser context per workspace.
- Optional isolated profile per run.
- User-visible active session.
- Download directory scoped to CodePawl workspace.
- Camera/mic/geolocation permissions denied by default unless user grants.

## Filesystem permissions

P0:

- export files only to user-selected location
- no arbitrary file reads unless user picks file
- no delete operations

P1:

- scoped workspace folder
- allowlist paths
- approval for writes

## Terminal permissions

Not in MVP except maybe read-only diagnostics. Future terminal adapter requires:

- command allowlist
- no shell interpolation
- per-command approval
- working directory restrictions
- output truncation
- timeout
- environment redaction

## OS accessibility permissions

Future desktop control will require explicit OS permissions. UX must explain:

- why permission is needed
- which actions become possible
- how to revoke
- which apps/surfaces are allowed

## Permission model

```ts
export interface PermissionGrant {
  id: string;
  scope: 'browser' | 'filesystem' | 'terminal' | 'desktop' | 'network' | 'model_provider';
  resource: string;
  actions: string[];
  expiresAt?: string;
  approvedBy: 'user' | 'policy';
}
```

## Hard deny list

- credential exfiltration
- stealth automation
- bot/CAPTCHA bypass
- destructive filesystem operations without explicit confirmation
- payment without explicit approval
- privilege escalation
