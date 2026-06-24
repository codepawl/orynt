# Technical UI contract

## Data-first UI

Implement the UI against typed mock data first. The UI should not require live agent runtime to render.

Recommended TypeScript contracts:

```ts
export type SurfaceKind = 'browser' | 'desktop' | 'files' | 'terminal';
export type TaskStatus = 'draft' | 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'paused';
export type PermissionMode = 'safe' | 'balanced' | 'manual';
export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';

export interface Workspace {
  id: string;
  name: string;
  plan: 'trial' | 'starter' | 'pro' | 'team';
  trialRunsRemaining?: number;
}

export interface AgentTask {
  id: string;
  title: string;
  status: TaskStatus;
  surface: SurfaceKind;
  createdAt: string;
  costUsd: number;
  screenshotCount: number;
  savedAsSkill: boolean;
}

export interface AgentStep {
  id: string;
  taskId: string;
  index: number;
  type: 'observe' | 'plan' | 'act' | 'verify' | 'approval' | 'error';
  title: string;
  detail: string;
  costUsd?: number;
  tokens?: number;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'blocked';
}

export interface PermissionPolicy {
  mode: PermissionMode;
  allowedSurfaces: Record<SurfaceKind, boolean>;
  askBefore: string[];
  neverAllow: string[];
  domainAllowlist: string[];
  domainDenylist: string[];
}

export interface UsageBudget {
  monthlyLimitUsd: number;
  currentSpendUsd: number;
  runLimitUsd: number;
  screenshotLimitPerRun: number;
  warnAtPercent: number;
}
```

## Implementation rules

- Build responsive but optimize for desktop width first.
- Keep advanced panels collapsed by default.
- Use accessible buttons, labels, focus states, and keyboard navigation.
- Keep animation subtle.
- No hard-coded real billing provider in UI mock stage.
- No real secrets in fixtures.
- Separate UI state from agent runtime state.

## Suggested files

```text
src/app/routes/
src/app/components/shell/
src/app/components/run/
src/app/components/permissions/
src/app/components/usage/
src/app/components/billing/
src/app/mocks/codepawl-fixtures.ts
src/app/types/codepawl.ts
```
