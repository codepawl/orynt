# Research-to-Product Map

This file translates cognitive science and neuroscience ideas into practical CodePawl product mechanisms. It separates useful engineering inspiration from claims CodePawl should avoid.

## Principle

CodePawl should be "brain-inspired" in the engineering sense, not in the consciousness or biological replication sense.

Use this public wording:

> CodePawl uses a brain-inspired operating model based on memory, attention, planning, feedback, and supervised action.

Avoid these claims:

- "Conscious AI."
- "Human brain replica."
- "Thinks exactly like a human."
- "AGI."
- "Autonomous worker that can do anything."

## Mapping table

| Human cognition / neuroscience idea | Practical agent mechanism | CodePawl feature | Evidence level | Product value |
|---|---|---|---|---|
| Working memory | Active task state with goal, constraints, current observation, pending decisions | Task cockpit, current plan, open questions | Strong engineering analogy | Less context loss, better task continuity |
| Global workspace / blackboard | Shared state/event bus where modules publish observations, plans, risk, memory hits, and action proposals | Transparent agent timeline and coordination layer | Strong architecture analogy | Users can see why the agent acts |
| Prefrontal executive control | Planner/supervisor deciding when to act, ask, pause, approve, or recover | Approval gates, scope control, uncertainty handling | Strong engineering analogy | Safer delegation |
| Hippocampal episodic memory | Indexed traces of prior runs, screenshots, logs, outcomes | Replay, "remember how I did this last time" | Strong analogy | Personalization and auditability |
| Semantic memory | Stable facts and preferences | User profile, site rules, workspace rules | Strong analogy | Less repeated instruction |
| Procedural memory | Skills/playbooks learned from repeated successful workflows | Reusable workflows, templates, skill library | Strong analogy | Compounding productivity |
| Basal ganglia / action selection | Rank candidate actions using utility, risk, confidence, cost, and policy | Action selection policy | Useful but abstract | Better decisions than raw prompting |
| Attention | Context and UI-element salience selection under token/time budget | Focus mode, context compression, relevant memory retrieval | Strong engineering need | Lower cost and better accuracy |
| Predictive processing | Predict expected result of action, compare with observation, repair if mismatch | Self-checking task execution | Useful operational analogy | Fewer silent failures |
| Active inference | Act to reduce uncertainty and achieve expected state | Ask/observe/act loop with uncertainty thresholds | Useful but should not be overclaimed | More robust multi-step workflows |
| Metacognition | Agent monitors confidence, risk, progress, loops, and uncertainty | "I am not sure", escalation, pause, review | Strong product need | Trust and reduced damage |
| Emotion / motivation | Priority, urgency, frustration, cost-of-delay as user-defined task metadata | Goal stack and priority scoring | Speculative if framed biologically | Better queueing, but avoid emotional AI claims |

## CodePawl cognitive loop

Use this canonical loop:

```text
1. Observe
   Capture screen, DOM/accessibility tree, file state, command output, user request, and environment signals.

2. Orient
   Update working memory, retrieve relevant semantic/episodic/procedural memory, identify constraints.

3. Predict
   Form expected next state and likely risks.

4. Plan
   Create candidate actions and fallback paths.

5. Gate
   Classify risk, check permissions, budget, privacy, and policy.

6. Act
   Execute through CodePawl Gateway or ask the user to take over.

7. Verify
   Compare actual observation to expected state.

8. Learn
   Store episode, update preference candidates, propose skill extraction, record cost and outcome.
```

## Product claims that are safe

- "Teachable computer-use agent."
- "Learns reusable workflows from feedback."
- "Memory-guided task execution."
- "Supervised autonomy with permission gates."
- "Replayable evidence and action history."
- "Brain-inspired architecture for memory, planning, attention, and feedback."

## Product claims that are risky

- "Fully autonomous employee."
- "Handles any computer task."
- "No supervision needed."
- "Learns everything automatically."
- "Can safely handle banking, payments, contracts, or high-stakes decisions."

## Key insight for CodePawl

Most agent products sell autonomy. The urgent unsolved user need is controlled delegation:

> Users want AI to do real work, but they do not trust agents enough to hand over credentials, money, production systems, or personal accounts.

CodePawl's wedge is a control layer: memory + permissions + evidence + teaching.
