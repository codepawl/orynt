# CodePawl Launch and Beta Plan

## 1. Launch principles

CodePawl should launch as a local-first session intelligence tool for AI-assisted engineering work.

Core launch message:

> Turn every AI coding session into measurable engineering work.

Principles:

* Dogfood before public alpha. The founder should use CodePawl daily for 2 weeks before asking strangers to trust it.
* Report quality before dashboard polish. The first launchable value is a useful engineering report, not a broad dashboard.
* Do not post Show HN or launch on Product Hunt before CodePawl is something others can actually run or try.
* Lead with the local-first trust message: local analysis, no source upload by default, no cloud account required for local CodePawl.
* Do not overpromise cloud, GitHub App, desktop, billing, team governance, or source sync before those surfaces exist.
* Do not launch as WakaTime for AI, a generic analytics dashboard, CodeRabbit, or another coding agent.
* Every public demo should prove session intelligence value: evidence checking, clean report generation, and a concrete next prompt or command.

Launch readiness follows the execution plan:

* v0.1: usable CLI, stable local JSON/Markdown reports, local history, sample reports, and report quality gates.
* v0.2: Studio can show local session/report data and provide screenshots or wireframes for launch assets.
* v0.3: GitHub Action can generate PR-ready reports and validate team demand, but it is not required for first public GitHub alpha.

## 2. Alpha stages

### Founder dogfood

Run CodePawl on real founder AI coding sessions for 2 weeks.

Goal:

* Prove the founder naturally uses CodePawl after AI coding sessions.
* Improve reports until they explain what changed, what evidence exists, what failed or drifted, and what to do next.
* Collect real examples for sample reports and demo scripts without exposing private source or logs.

Entry criteria:

* v0.1 fixture and real-repo analysis can generate usable local reports.
* Reports include verdict, evidence references, risks, and next action.
* Founder can run the CLI without manual patching or one-off debugging.

Move forward when:

* Founder uses CodePawl daily for 2 weeks.
* At least 5 real founder sessions produce reports worth reviewing.
* The most common report failures are clear enough to become fixture or rule improvements.

### X cold reach and small public social

Invite 3-5 developers through low-volume X outreach and small public build-in-public posts.

Goal:

* Learn whether real AI-coding users can get to a first report.
* Test whether reports catch something useful.
* Validate that the next action is concrete enough to copy or run.

Entry criteria:

* v0.1 CLI/report path is usable without founder handholding.
* README quickstart exists.
* Privacy note exists.
* At least one sample report and one short demo asset exist.

Move forward when:

* 5 external users run CodePawl more than once.
* At least 3 users say they would pay for deep diagnosis, next prompts, memory, delivery packets, or GitHub reports.
* Setup friction does not prevent most invited users from reaching their first report.

### Public GitHub alpha

Open a public GitHub alpha after the CLI/report loop is usable.

Goal:

* Let interested developers install or run CodePawl without a private invite.
* Use GitHub issues or discussions for bug reports, confusing reports, fixture ideas, and setup pain.
* Validate whether a team wants the GitHub PR report workflow.

Entry criteria:

* v0.1 is complete enough for a public README quickstart.
* Reports are useful on fixture and real-repo sessions.
* Sample reports and privacy note are available.
* The repo does not imply CloudPawl, GitHub App, paid plans, or desktop are live if they are not.

Move forward when:

* 1 team wants a GitHub PR report.
* Public users can reproduce the demo locally or on their own repo.
* Feedback points to specific report quality, setup, or GitHub Action needs instead of confusion about what CodePawl is.

## 3. Success metrics

Primary validation sequence:

1. Founder uses CodePawl daily.
2. 5 external users run CodePawl more than once.
3. 3 users say they would pay.
4. 1 team wants a GitHub PR report.

Operational metrics:

* Founder daily use: founder opens or reads a CodePawl report after real AI coding sessions during the 2-week dogfood period.
* External repeat use: users run CodePawl on more than one session or repo after the first report.
* Willingness to pay: users name a specific paid value, not vague encouragement.
* Team GitHub interest: a team wants PR-level session evidence, not generic AI usage analytics.
* Report usefulness rating: users answer whether the report was useful and why.
* Setup completion rate: invited users can install/run and reach a first report.
* Next action copied or used: users copy the next prompt, run the next command, or say the recommendation changed their next step.

Quality metrics:

* Verdict correctness: users agree the report verdict matches the available evidence.
* Evidence trust: important claims cite files, logs, commands, diffs, or session events.
* Missing evidence detection: CodePawl catches claims like "tests passed" when the available logs do not prove it.
* Report readability: users can understand the outcome without reading raw logs or the full diff.

## 4. Demo strategy

Hero demos:

1. "Agent claimed tests passed. CodePawl found missing evidence."
2. "Turn one messy AI coding session into a clean engineering report."
3. "Generate the next prompt after a failed or risky agent run."

Follow-up demos:

* "Agent drifted into unrelated files. CodePawl explains where and what to do next."
* "Generate a GitHub Action job summary and PR-ready report artifacts."
* "Attach a sticky CodePawl report to a GitHub PR." Later GitHub App/team workflow demo only.
* "Save a project memory from a repeated agent failure."

Demo rules:

* Use real product behavior only. Do not claim GitHub PR comments, project memory, Studio, cloud, or desktop are live before they are built.
* Prefer simple, inspectable examples over polished marketing scenes.
* Show the before and after: messy agent output, then CodePawl verdict, evidence, risk, and next action.
* For missing-evidence demos, make the evidence gap obvious: the agent claimed tests passed, but the logs are missing, partial, or failing.
* For report demos, show Markdown or JSON report output before Studio polish.
* For next-prompt demos, show the generated prompt or command as the actionable result.

Demo priority by product version:

* v0.1: missing evidence, messy session to clean report, next prompt/action after risky or failed run.
* v0.2: local Studio screenshots or wireframes showing session/report detail.
* v0.3: GitHub Action job summary, redacted artifacts, fail-on behavior, and PR-ready report output when built.

## 5. Outreach strategy

Outreach channels:

* X cold reach to AI-heavy developers.
* X build-in-public thread showing the problem, the report, and what changed after feedback.
* Devtool communities where local-first engineering tools are welcome.
* Codex, Claude, Cursor, and similar AI-coding communities.
* GitHub repo README, issues, and discussions.

Outreach rules:

* Ask for feedback, not generic promotion.
* Do not spam communities or post the same launch copy everywhere.
* Be specific about the rough alpha state.
* Ask users to try one Codex, Claude, Cursor, or similar session and judge whether the report was useful.
* Avoid implying CodePawl replaces their agent, IDE, CI, PR review, or time tracker.

Example cold reach message:

```txt id="65w0jb"
I’m building CodePawl, a local-first tool that turns AI coding sessions into engineering reports.

The first demo catches cases where an agent says tests passed but the evidence is missing, then suggests the next prompt/command.

Would you be open to trying a rough CLI on one Codex/Claude/Cursor session and telling me if the report is actually useful?
```

Example public social post:

```txt id="p84ejl"
I’m building CodePawl.

It turns messy AI coding sessions into measurable engineering work:
- what changed
- what evidence exists
- what failed or drifted
- what to do next

First goal: catch “agent said tests passed” when the logs don’t prove it.
```

## 6. Public launch timing

Launch order:

1. GitHub alpha first, after v0.1 CLI/report quality is usable.
2. Small community posts and X build-in-public while collecting feedback.
3. HN later only when CodePawl is runnable or tryable by strangers.
4. Product Hunt later only when onboarding, assets, screenshots, sample reports, and docs are polished.

Do not:

* Launch only a signup page.
* Post Show HN before users can run or try CodePawl.
* Launch Product Hunt before the onboarding path is clear.
* Use future CloudPawl, GitHub App, desktop, or paid features as if they are live.
* Optimize for launch traffic before the report loop is useful.

Public alpha is ready when:

* README quickstart works.
* A developer can run CodePawl and get a first report.
* Sample reports show the expected output.
* Privacy note explains local-first behavior and no source upload by default.
* Feedback channel exists through GitHub issues, discussions, or a form.

## 7. Feedback form

The feedback form should be short and focused on report usefulness.

Required questions:

* Did CodePawl find something you would have missed?
* Was the report useful?
* Was the verdict correct?
* Was the next action useful?
* Was setup easy?
* Was setup painful? If yes, where did you get stuck?
* What was confusing?
* Would you use it again?
* Which feature would you pay for?
* Would you pay for deep diagnosis, project memory, delivery packets, or GitHub reports?
* What made you distrust the report?
* What agent/repo did you use it with?

Suggested answer types:

* Use yes/no for repeat use, setup completion, verdict correctness, and whether CodePawl found something useful.
* Use short free text for confusion, distrust, missing value, and repo/agent context.
* Use multi-select for paid value candidates: deep diagnosis, next prompt, project memory, delivery packet, GitHub PR report, team governance.

Feedback handling:

* Turn wrong or unclear verdict feedback into fixture candidates or rule improvements.
* Turn setup failures into README or install fixes before broadening alpha.
* Treat "useful but too vague" as a report-quality issue, not a marketing issue.
* Treat privacy hesitation as a product blocker until the trust message and behavior are clear.

## 8. Launch assets checklist

Required before public GitHub alpha:

* README quickstart.
* Sample reports.
* 60-90 second demo video or GIF.
* Screenshots or wireframe.
* Privacy note.
* Short social copy.
* GitHub issue or discussion template.
* Feedback form.

Asset requirements:

* README should explain the local-first CLI/report loop and avoid promising unbuilt cloud or desktop behavior.
* Demo video or GIF should show one complete session intelligence loop: run, report, evidence, verdict, next action.
* Sample reports should include at least one missing-evidence or failed/risky case.
* Screenshots or wireframes should emphasize report detail, evidence, risk, and next action.
* Privacy note should state no source upload by default and no cloud account required for local CodePawl.
* Social copy should ask for feedback from AI-coding users, not broad hype.
* GitHub template should ask for command run, expected behavior, report excerpt, setup environment, and whether private data was removed.

## 9. Pricing validation

Pricing posture:

* Alpha is free.
* Do not run a paid beta unless strong demand appears.
* Ask willingness-to-pay only after repeated use or a clearly useful report.
* Do not charge before the core loop is useful.

Validate Pro value around:

* Deep diagnosis.
* Next prompt and next command generation.
* Project memory.
* Delivery packets.
* GitHub PR-ready reports.
* Unlimited or longer local history after basic trust exists.

Do not validate pricing around:

* Generic dashboard charts.
* AI usage tracking alone.
* Basic visibility that should remain part of adoption.
* Cloud sync before local trust is proven.

Pricing signal quality:

* Weak signal: "This is cool" or "I might use it."
* Medium signal: "I would run this again on real agent sessions."
* Strong signal: "I would pay for this specific feature because it saves review/debug time."
* Team signal: "We want this as a PR report or policy layer for AI-assisted work."

## 10. Stop conditions / pivot signals

Stop, narrow, or pivot if:

* Reports are not useful after 20 real sessions.
* Users quit before first report due to setup friction.
* The product feels too much like WakaTime or AI usage analytics.
* The product feels too much like CodeRabbit or a generic PR reviewer.
* AI analysis is too vague or not evidence-bound.
* Privacy concerns block usage.
* No repeated use appears after invited users reach a first report.
* Users cannot explain what CodePawl helped them decide.

Response by failure mode:

* If reports are not useful, return to v0.1 report fixtures, evidence rules, verdict correctness, and next action quality.
* If setup friction is high, reduce install steps and improve README before more outreach.
* If the product feels like WakaTime, remove vanity metrics from launch messaging and lead with session reports.
* If the product feels like CodeRabbit, clarify that CodePawl explains the agent session and evidence, not line-by-line code review.
* If diagnosis is vague, require every major claim to cite concrete evidence.
* If privacy blocks adoption, simplify and strengthen the local-first explanation and avoid optional cloud framing.
* If no repeated use appears, tighten the core loop before building more surfaces.

## 11. Done-when criteria

This planning doc is done when:

* The launch/beta plan exists at `.codex/plan/launch_beta_plan.md`.
* Founder dogfooding to X cold reach/public social to GitHub alpha path is clear.
* Alpha stages and movement criteria are clear.
* Success metrics include founder daily use, external repeated use, willingness to pay, team GitHub report interest, report usefulness, setup completion, and next action copied/used.
* Hero demos A, B, and D are listed: missing evidence, messy session to clean report, and next prompt after failed/risky run.
* Demo C is listed as a follow-up: unrelated files or drift.
* Feedback form questions are clear.
* Launch assets checklist is clear.
* Pricing validation is tied to repeated use and core-loop usefulness.
* Stop conditions and pivot signals are clear.
* The plan does not implement pages, forms, social posts, analytics, or launch assets.
