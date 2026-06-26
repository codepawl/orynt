/plan

Goal: Reconcile the completed CodePawl repository audit with the CLDSA-Lite architecture and produce the repo-specific implementation plan. Do not implement yet.

Context:
- First run `/status` and inspect the plan/audit already produced in this Codex session.
- Inspect the current repository, existing UI/UX, package files, Tauri configuration, source layout, tests, and AGENTS.md if present.
- If present, inspect `.codex/technical/cldsa-lite/deep-research-report.md`.
- Inspect `.codex/technical/cldsa-lite/00_CLDSA_RESEARCH_SYNTHESIS.md`.
- Inspect `.codex/plan/cldsa-lite/plans/00_CLDSA_LITE_MASTER_PLAN.md` through `05_EVALS_AND_MATURITY.md`.
- Reuse valid findings from the previous audit instead of restarting a generic analysis.

Constraints:
- Preserve Tauri-first architecture; do not add Electron.
- The first sellable capability is Coding Apprentice using Codex in an isolated repository workspace.
- Preserve the long-term capability-pack and SurfaceAdapter architecture.
- Implement CLDSA-Lite, not the full research system.
- Do not add a learned world model, continuous model training, graph database, emotional simulation, multi-agent team, general desktop control, or autonomous skill promotion in P0.
- Treat Run, append-only events, deterministic verification, safety, bounded context, resource budgets, and Stable/Candidate separation as non-negotiable.
- Use engineering names in code rather than literal brain-region names.
- Do not perform a large repository migration unless the audit proves it is required.

Done when:
- Produce a file-by-file repo-specific architecture map.
- Decide whether to keep a single-project layout or introduce workspace packages, with evidence.
- Define the first five implementation slices and dependencies.
- Identify code that can be reused, code that conflicts with the plan, and missing foundations.
- Define validation commands for every slice.
- Write or update `.codex/plan/cldsa-lite/plans/IMPLEMENTATION_PLAN.md`.
- Select the first executable work contract: Run and event spine.
- Do not change production code.
