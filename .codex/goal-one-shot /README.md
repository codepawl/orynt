# CodePawl Brain-Inspired Computer-Use Agent Timeline

This ZIP packages a Codex-compatible execution plan for turning CodePawl into a brain-inspired, teachable computer-use agent platform.

Important assumption: the Deep Research document text was not directly available inside this chat session. This package is built from the CodePawl brief in the conversation: CodePawl is a computer-use agent that users can teach, adjust, and supervise to perform tasks according to their needs, with an operating model inspired by human cognition. Replace or amend the research notes if your Deep Research output contains different conclusions.

## Folder structure

```text
.
├── 00_ONE_SHOT_GOAL.md
├── 01_MASTER_TIMELINE.md
├── 02_RESEARCH_TO_PRODUCT_MAP.md
├── 03_ARCHITECTURE_SPEC.md
├── 04_VALIDATION_AND_METRICS.md
├── 05_PRODUCT_POSITIONING_AND_PRICING.md
├── 06_RISKS_AND_GUARDRAILS.md
├── codex/
│   ├── phase_0_discovery.prompt.md
│   ├── phase_1_foundation.prompt.md
│   ├── phase_2_cognitive_kernel.prompt.md
│   ├── phase_3_computer_use_gateway.prompt.md
│   ├── phase_4_teach_adjust_memory.prompt.md
│   ├── phase_5_eval_safety.prompt.md
│   └── phase_6_productization.prompt.md
├── plans/
│   ├── backlog_by_phase.md
│   ├── schema_contract.md
│   ├── permission_policy.md
│   ├── skill_learning_contract.md
│   └── pilot_research_plan.md
├── product/
│   ├── paddle_product_copy.md
│   ├── landing_page_copy.md
│   └── customer_discovery_questions.md
└── research/
    ├── evidence_levels.md
    └── sources.md
```

## How to use with Codex

1. Copy the content of `00_ONE_SHOT_GOAL.md` into Codex.
2. Attach or mention this folder, or paste the master timeline after the `/goal` command.
3. If the repository already has `AGENTS.md`, `.agents`, `PLAN.md`, or internal docs, Codex should inspect those first and treat this package as the implementation roadmap.
4. After each phase, use `/status`, `/diff`, and `/review` to inspect progress.

## Product thesis

CodePawl should not compete only as "another browser agent." The defensible wedge is:

> A teachable, brain-inspired computer-use agent cockpit that learns the user's way of working, keeps memory and skills organized, requires approval for sensitive actions, and produces replayable evidence for trust.

The core product value is not autonomy alone. It is controlled delegation.
