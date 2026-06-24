# Context Packet Protocol

## Purpose

A `ContextPacket` is the only model input for action selection.

## Layout

```text
Stable system instructions
Stable action schema
Stable safety rules
--- volatile data ---
Task
Current state summary
Top candidate actions
Recent step summaries
Permissions
Budget
Required JSON output
```

## Packet type

```ts
export interface ContextPacket {
  packetId: string;
  runId: string;
  stepIndex: number;
  task: string;
  currentStateSummary: string;
  uiSummary: string;
  candidates: CandidateAction[];
  recentHistory: StepSummary[];
  permissions: PermissionSummary;
  budget: BudgetSummary;
  attachments?: ContextAttachment[];
}
```

## Size targets

```text
normal: < 12k input tokens
complex: < 24k only when justified
screenshots: explicit budget impact
```
