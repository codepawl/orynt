# Sources and Reference Notes

These sources informed the roadmap. Re-check sources before publishing public research copy.

## AI agent products and current market

- OpenAI Operator / ChatGPT agent: OpenAI describes Operator as an agent using its own browser to type, click, scroll, self-correct, and ask users to take over for login/payment/sensitive steps. Source: https://openai.com/index/introducing-operator/
- Claude Code: Anthropic describes Claude Code as an agentic coding tool that reads codebases, edits files, runs commands, integrates with tools, uses memories/skills/hooks, and supports multiple surfaces. Source: https://docs.anthropic.com/en/docs/claude-code/overview
- Devin: Cognition describes Devin as an AI software engineer with long-term reasoning/planning, sandboxed shell/editor/browser, progress reporting, feedback, and mistake fixing. Source: https://www.cognition.ai/blog/introducing-devin
- Manus: Manus positions itself as a broad AI agent/product suite with web app, browser operator, slides, design, desktop apps, team plan, API, and business features. Source: https://manus.im/

## Cognitive architectures

- Laird, Rosenbloom, Newell: Soar cognitive architecture; symbolic cognitive architecture for decision making, problem solving, planning, learning, memory. See Soar project and Laird's work.
- Anderson/Lebiere: ACT-R; cognitive architecture with declarative/procedural memory and modular cognition.
- Franklin/Baars: LIDA cognitive architecture; global workspace-based cognitive cycles with perception, attention, memory, action selection, and learning.
- Common Model of Cognition: consensus-style architecture using perception, working memory, long-term memories, action, and procedural control.

## Relevant research themes

- Global Workspace Theory: useful as an engineering analogy for a shared workspace/blackboard and broadcast mechanism across modules.
- Working memory: useful for active task state and executive control.
- Prefrontal cortex and executive control: useful analogy for planning, inhibition, approval, and task switching.
- Hippocampal episodic memory: useful analogy for indexed run traces and retrieval for later tasks.
- Basal ganglia/action selection: useful analogy for scoring candidate actions by utility/risk/confidence/cost.
- Predictive processing and active inference: useful analogy for predicting expected state, comparing observations, and recovering from mismatch.
- Metacognition: useful for self-monitoring uncertainty, progress, competence, and when to ask the user.

## Product interpretation

The strongest commercial insight is not "make AI more human." It is:

> Design agents around the mechanisms humans need to safely delegate: memory, attention, planning, inhibition, feedback, and evidence.

CodePawl should sell controlled delegation rather than maximal autonomy.
