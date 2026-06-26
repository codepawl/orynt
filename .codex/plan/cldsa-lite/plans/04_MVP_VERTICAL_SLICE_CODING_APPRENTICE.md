# MVP Vertical Slice — Coding Apprentice

## User promise

Give CodePawl a small repository task. It delegates the work to Codex inside an isolated workspace, shows what is happening, asks before risky actions, validates the result, records the evidence, and learns only after review.

## Supported task envelope

P0 tasks:

- fix a small reproducible bug;
- add or update a focused test;
- make a small UI/component change;
- update a small documentation section;
- perform a bounded refactor with existing tests.

Excluded:

- production deployment;
- database migration execution;
- secret rotation;
- dependency upgrades across a large graph;
- unrestricted network actions;
- arbitrary root shell;
- merge/push without approval;
- multi-repository orchestration.

## User flow

### Setup

- select repository;
- confirm project trust;
- choose validation commands or accept discovered defaults;
- choose policy mode;
- connect/sign in to Codex;
- define budget.

### Run

- enter task;
- review generated work contract;
- create isolated worktree;
- start Codex thread;
- stream plan, commands, patches, output and approvals;
- show active subgoal and budget.

### Verify

- inspect diff;
- run targeted validation;
- run final validation;
- classify result;
- show evidence and unresolved risks.

### Learn

- user rates/corrects result;
- create candidate rule or skill;
- show exact evidence;
- user can promote, edit, reject, or leave as candidate.

## Minimal cognitive loop implementation

```ts
while (!run.isTerminal()) {
  const observation = await perception.observe(run);
  const workspace = await contextWorkspace.build(run, observation);
  const plan = await planner.propose(workspace);
  const prediction = transitionPredictor.predict(workspace, plan.nextAction);
  const decision = actionGate.decide(plan.nextAction, run.policy, run.budget);

  if (decision.requiresApproval) {
    await approvals.wait(decision);
  }

  const result = await executor.execute(decision.compiledAction);
  const verdict = await verifier.check(prediction.expectedResult, result);

  await eventStore.append(normalizeEpisode(...));
  await taskState.update(verdict);
  await resourceGovernor.update(result.usage);

  if (verdict.requiresReplan) {
    await planner.replan(verdict);
  }
}

await postRunConsolidator.proposeCandidates(run.id);
```

## Codex is not the cognitive kernel

Codex may:

- analyze repository context;
- propose a plan;
- edit files;
- run allowed commands;
- explain results.

CodePawl owns:

- task state;
- budgets;
- sandbox;
- permissions;
- event normalization;
- verification;
- memory lifecycle;
- user review;
- capability metrics;
- provider switching.

## P0 product screen

The default Run screen needs only:

- task input;
- active goal/subgoal;
- run status;
- live Codex event timeline;
- approval card;
- changed files and diff summary;
- validation status;
- cost/budget meter;
- final verdict;
- candidate learning card.

Advanced raw logs remain collapsible.
