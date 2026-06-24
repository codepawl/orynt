# Skill Recorder and Replay Engine

## Goal

Successful runs should become cheaper and more reliable through replay.

## Skill type

```ts
export interface SkillDefinition {
  id: string;
  name: string;
  surfaceKind: SurfaceKind;
  startConditions: SkillCondition[];
  variables: SkillVariable[];
  steps: SkillStep[];
  successConditions: SkillCondition[];
  permissionsRequired: PermissionRequirement[];
  createdFromRunId?: string;
}
```

## Replay

```text
check start condition
execute deterministic step
verify
next step
on divergence: ask model or user
```

Replay should use near-zero model tokens unless the page diverges.
