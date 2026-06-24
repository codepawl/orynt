# Project Management and Roadmap

Generated: 2026-06-24

## Phase 0: Foundation

- repo setup
- desktop shell
- UI skeleton
- local settings
- provider settings mock
- SQLite setup

Exit: app opens, persists workspace, shows empty cockpit.

## Phase 1: Browser surface

- launch browser
- navigate
- observe accessibility/DOM
- show live preview
- show UI graph list

Exit: user can inspect page elements in CodePawl.

## Phase 2: Action loop

- candidate actions
- model action schema
- action compiler
- execute click/fill/scroll
- verifier
- ledger

Exit: agent can complete simple form tasks.

## Phase 3: Token economy

- context packet builder
- budget config
- token estimate
- cost HUD
- diff packets
- screenshot budget

Exit: run shows cost and avoids raw context dumps.

## Phase 4: Safety and approvals

- risk classifier
- approval cards
- policy engine
- redaction
- privacy settings

Exit: risky actions pause and cannot be bypassed by model output.

## Phase 5: Trace and skills

- durable trace events
- trace inspector
- export report
- save skill
- replay skill

Exit: successful run can replay cheaper.

## Phase 6: Weak-model support

- model router
- local/small model adapter
- action narrowing improvements
- escalation rules

Exit: weak model completes constrained tasks or escalates safely.

## Phase 7: Public alpha polish

- onboarding
- docs
- sample workflows
- packaging
- launch page
- demo video

Exit: private/public alpha ready.
