# Orynt Agent Guide

This repository is currently in planning/bootstrap mode. Treat `.codex/` as the working source of truth until product code is added.

## Path Map

- `.codex/plan/`: Product plans, setup plans, roadmap notes, requirements, backlog, launch checklists, and planning contracts.
- `.codex/ui/`: UI/UX material, including information architecture, wireframes, mockups, screen contracts, design tokens, and implementation prompts for the interface.
- `.codex/technical/`: Technical architecture notes, implementation research, ADR drafts, runtime design, platform decisions, and engineering setup details.
- `.codex/skills/`: Orynt-specific skills only. Put application-local Codex skills here when they implement or document behavior unique to Orynt.

## Working Rules

- Keep planning, UI, technical, and skill material in their assigned folders.
- Do not place general-purpose Codex skills in `.codex/skills/`; that folder is only for Orynt application behavior owned by CodePawl.
- Prefer adding focused README files or small topic files over mixing unrelated concerns into one large document.
- When product code is introduced, keep `.codex/` as project guidance and put runtime code in normal source directories such as `apps/`, `packages/`, or `crates/`.
