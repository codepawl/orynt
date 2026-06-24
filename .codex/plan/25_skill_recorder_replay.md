# Skill Recorder and Replay

Generated: 2026-06-24

## Goal

Let users teach CodePawl a workflow once and replay it cheaply.

## Recording modes

### Human record

User operates browser manually. CodePawl records observations, actions, selectors, values, and state transitions.

### Agent record

Agent completes task. User marks run as successful. CodePawl turns trace into skill draft.

### Hybrid record

Agent fails. User fixes one step. CodePawl incorporates correction.

## Skill schema

```ts
export interface Skill {
  id: string;
  name: string;
  description?: string;
  surfaceKind: SurfaceKind;
  startUrlPattern?: string;
  variables: SkillVariable[];
  preconditions: ExpectedResult[];
  steps: SkillStep[];
  successCriteria: ExpectedResult[];
  riskPolicy: SkillRiskPolicy;
  createdFromRunId?: string;
  version: number;
}
```

## Skill step

```ts
export interface SkillStep {
  id: string;
  action: CompiledActionTemplate;
  expectedResult: ExpectedResult;
  fallbackHints: string[];
  maxRetries: number;
}
```

## Skill variables

Examples:

- login email
- invoice id
- search term
- date range
- CSV file path

## Replay modes

- Dry run: check preconditions only.
- Assisted replay: pause on each risky step.
- Fast replay: deterministic low-risk steps, pause on risk/failure.

## Skill quality metrics

- replay success rate
- average token reduction
- failure step distribution
- selector stability
- user interventions

## Done when

A successful form-fill run can be saved as a skill and replayed with less model usage than the original run.
