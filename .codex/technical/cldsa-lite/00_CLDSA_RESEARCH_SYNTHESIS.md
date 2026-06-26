# CLDSA Research Synthesis for CodePawl

## The useful conclusion

CodePawl should not be a large prompt wrapped around a model. It should be a closed-loop runtime in which the model is replaceable and the system owns state, memory, permissions, verification, learning, and cost.

The practical cognitive loop is:

```text
Perceive
→ focus a bounded workspace
→ retrieve relevant experience
→ propose a plan
→ predict the expected transition
→ gate the action by policy and budget
→ execute through an adapter
→ verify actual outcome
→ record the episode
→ propose memory or skill updates
```

## Principles to adopt immediately

1. Working context is bounded and organized by active goal/subgoal.
2. Raw run events are append-only and preserve provenance.
3. Every meaningful action has an intent and expected result.
4. Tool success is not task success; deterministic verification is mandatory.
5. Memory has different roles and timescales:
   - working state;
   - episodic run history;
   - verified semantic rules;
   - procedural skills.
6. Learning is staged:
   - candidate memory;
   - candidate skill;
   - evaluation;
   - promotion;
   - revalidation or retirement.
7. Resource pressure, uncertainty, risk, and progress affect routing and verification.
8. Post-run consolidation is separate from live execution.
9. Forgetting means archive, supersede, merge, expire, or delete under policy—not blindly retaining everything.
10. The safety governor and evaluator cannot be modified by the learning loop.

## Ideas to delay

The following are research tracks, not P0 requirements:

- learned JEPA-style world models;
- model-weight continual learning;
- full competitive global-workspace bidding;
- affective or emotional simulation;
- broad autonomous curriculum generation;
- nightly GPU training;
- graph databases;
- full ablation matrix;
- general browser/desktop/social/marketing competence.

## Engineering translations

| Research term | CodePawl engineering component |
|---|---|
| Global workspace | `ContextWorkspace` and `ContextPacketBuilder` |
| Working memory | bounded `TaskState` and subgoal summaries |
| Episodic memory | append-only `RunEventStore` |
| Semantic memory | verified `ProjectRuleStore` with provenance |
| Procedural memory | versioned `SkillRegistry` |
| Executive control | `RunOrchestrator` and `PlannerAdapter` |
| World model | heuristic `TransitionPredictor` first |
| Basal-ganglia gating | `ActionGate` |
| Metacognition | `CapabilityProfile` and confidence calibration |
| Homeostasis | `ResourceGovernor` |
| Neuromodulation | deterministic `AdaptiveController` |
| Sleep/consolidation | `PostRunConsolidator` |
| Forgetting | `MemoryLifecycleManager` |
| Genome | immutable `CorePolicy` |
