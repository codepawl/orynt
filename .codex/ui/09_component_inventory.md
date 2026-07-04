# Component inventory

## Shell

- `AppShell`
- `WorkspaceRail`
- `TaskSidebar`
- `TopBar`
- `RightInspector`
- `RouteContainer`

## Run cockpit

- `CommandComposer`
- `MessageThread`
- `RunTimeline`
- `RunMilestone`
- `ApprovalPanel`
- `SandboxStatus`
- `VerifierStatus`
- `BudgetMeter`
- `SurfaceStatusPill`
- `RunSummary`
- `MemoryReviewPanel`
- `SkillRegistryPanel`
- `ReplayPreviewPanel`

## Tasks

- `TaskTable`
- `TaskStatusBadge`
- `TaskFilterBar`
- `TaskDetailDrawer`

## Overview

- `HealthSummary`
- `FailureModeList`
- `CostSummary`
- `SkillReplaySummary`

## Permissions

- `PermissionPresetSelector`
- `SurfacePermissionMatrix`
- `RiskRuleList`
- `DomainPolicyList`
- `SecretsPolicyPanel`

## Usage

- `UsageSummary`
- `CostBreakdownTable`
- `ModelRoutingPanel`
- `ContextPacketTimeline`
- `ScreenshotBudget`

## Billing

- `TrialStatusBanner`
- `PlanSummary`
- `ProviderSpendNotice`
- `UpgradeDialog`

## Visual primitives

- `GlassPanel`
- `RoundedButton`
- `SegmentedControl`
- `Pill`
- `ProgressMeter`
- `MiniSparkline`
- `EmptyState`
- `InlineAlert`

## Naming rule

Prefer `Panel`, `Summary`, `Status`, `Timeline`, `Row`, and `Checkpoint` names
unless the component truly represents one bounded card object. This keeps the
desktop UI from drifting back into a dashboard of repeated cards.
