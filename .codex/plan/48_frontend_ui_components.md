# Frontend UI Components

Generated: 2026-06-24

## UI style

Discord-like organization with iOS-inspired glass and rounded cards. Do not let visual polish delay core runtime.

## Layout

```text
AppShell
  WorkspaceRail
  ChannelSidebar
  MainPanel
    BrowserPreview
    RunCommandBar
    ActionLedger
  InspectorPanel
    SemanticUIMap
    TokenHUD
    ApprovalQueue
    TraceDetails
```

## P0 components

- `WorkspaceRail`
- `TaskThreadList`
- `BrowserPreview`
- `CommandBar`
- `SemanticUIMap`
- `ActionLedger`
- `ApprovalCard`
- `TokenBudgetHUD`
- `RunStatusBadge`
- `ProviderSettings`
- `PrivacySettings`

## Interaction rules

- User can pause/stop run at all times.
- Approval cards must be prominent.
- Risky actions must not be hidden in logs.
- Token/cost should be visible without opening devtools.
- Semantic UI map should be searchable/filterable.

## Visual hierarchy

- Live browser preview is primary.
- Current action and approval state are second.
- Logs/details are inspectable but not noisy.

## Done when

A user can understand the current run state without reading terminal logs.
