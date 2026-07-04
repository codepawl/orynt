# Screen specs

## 1. Onboarding

Goal: get user from install to first controlled browser run.

Required sections:

- Welcome: “Run computer agents without losing control.”
- Trial status: days/runs/credits when commercial packaging is in scope.
- Provider setup: bring your own key or use included trial credits if available.
- Permission preset: Safe, Balanced, Manual.
- First task prompt.

## 2. Run cockpit

Goal: start and supervise one task.

Required regions:

- Task sidebar: active, scheduled, saved, failed.
- Main workspace: run brief, prompt composer, messages when useful, readable
  milestones, approval checkpoint, and result import state.
- Inspector: sandbox boundary, permission mode, budget meter, verifier state,
  current surface, current step, memory review, skill promotion, and replay
  preview.

## 3. Tasks

Goal: manage task history and replay.

Required columns:

- status,
- task title,
- surface,
- cost,
- duration,
- approvals,
- skill saved yes/no.

## 4. Overview

Goal: answer “Is CodePawl useful and under control?”

Required information:

- success rate,
- average cost per successful task,
- current budget posture,
- approvals waiting or recently resolved,
- verifier result,
- most common failure modes when enough data exists,
- top saved skills when enough data exists.

Use compact rows, sections, and disclosure controls first. Do not make this a
large analytics dashboard for P0.

## 5. Permissions

Goal: make agent power legible.

Required sections:

- global mode,
- allowed surfaces,
- always ask before,
- never allow,
- domain allowlist/denylist,
- secrets handling,
- destructive action rules.

These can use grouped lists and rule tables. Do not turn every permission rule
into a separate card.

## 6. Usage

Goal: prevent token-cost shock.

Required sections:

- current period spend,
- per-task cost,
- model split,
- screenshot count,
- context packets,
- cache hit estimate,
- budget alerts.

Show summary first and defer detailed ledgers behind disclosure or route-level
drilldown.

## 7. Billing / trial

Goal: make commercial packaging obvious.

Required sections:

- trial status,
- plan summary when commercial packaging is in scope,
- included features,
- BYOK vs included credits,
- upgrade button,
- invoice/account placeholder.

Do not add billing backend, real payment flow, or a plan-card grid unless that
work is explicitly scoped.
