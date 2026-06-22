# CodePawl Agent Instructions

## Read First

Use the planning docs before implementation work:

- Product/master plan: `.codex/plan/master_plan.md`
- Technical architecture: `.codex/plan/technical_plan.md`
- UI/UX direction: `.codex/plan/design_plan.md`
- Business direction: `.codex/plan/business_plan.md`
- Execution roadmap and sprint order: `.codex/plan/execution_plan.md`
- Data, evaluation, fixtures, and verdicts: `.codex/plan/data_eval_plan.md`
- Security, privacy, redaction, and upload boundaries: `.codex/plan/security_privacy_plan.md`
- GitHub Action/App direction: `.codex/plan/github_integration_plan.md`
- Release, install, distribution, and update path: `.codex/plan/release_distribution_plan.md`
- Launch, beta, demos, feedback, and pricing validation: `.codex/plan/launch_beta_plan.md`
- README, quickstart, docs, and onboarding: `.codex/plan/onboarding_docs_plan.md`
- Light low-fidelity wireframe reference: `.codex/ui/wireframe-light-theme.html`
- Dark low-fidelity wireframe reference: `.codex/ui/wireframe-dark-theme.html`
- Light high-fidelity mockup reference: `.codex/ui/mockup-light-theme.html`
- Dark high-fidelity mockup reference: `.codex/ui/mockup-dark-theme.html`

Follow the relevant plan for the task. Keep this file as the short operating brief; do not duplicate full plan content here.

## Task Routing

Read the most relevant docs before changing files:

- CLI, local core, storage, reports, or daemon work: read `execution_plan.md`, `technical_plan.md`, `data_eval_plan.md`, and `security_privacy_plan.md`.
- Fixture, verdict, snapshot, report-template, or report-quality work: read `data_eval_plan.md` and `execution_plan.md`.
- Studio, dashboard, session detail, wireframe, mockup, or frontend work: read `design_plan.md` and the relevant `.codex/ui/` reference.
- GitHub Action, sticky PR comment, PR report, or future GitHub App work: read `github_integration_plan.md`, `security_privacy_plan.md`, and `execution_plan.md`.
- Release, install, binary distribution, npm wrapper, Homebrew, desktop packaging, or update work: read `release_distribution_plan.md` and `execution_plan.md`.
- README, quickstart, troubleshooting, privacy docs, example reports, or onboarding work: read `onboarding_docs_plan.md`, `security_privacy_plan.md`, and `launch_beta_plan.md`.
- Launch, demo, social copy, public alpha, beta, feedback, or pricing-validation work: read `launch_beta_plan.md`, `business_plan.md`, and `onboarding_docs_plan.md`.

If plans disagree, preserve the stricter local-first, privacy-safe, evidence-bound behavior and update the planning docs before implementing broad changes.

## Product Direction

CodePawl is a local-first control layer for AI-assisted software engineering. It is not another coding agent, generic analytics dashboard, PR reviewer, or wrapper that forces users to run agents through CodePawl.

The core promise:

> Capture the session. Explain the outcome. Verify the evidence. Diagnose the failure. Recommend the next action. Remember the lesson.

Prioritize the first product loop:

1. Add or detect a project/session.
2. Analyze what happened.
3. Show evidence, risk, and missing validation.
4. Recommend the next command or prompt.
5. Save useful lessons as project memory.
6. Generate a report or delivery packet.

## Architecture Boundaries

- Rust owns the local core, CLI, daemon, SQLite store, evidence engine, and report engine.
- TypeScript owns Studio UI, GitHub Action wrapper, GitHub App/backend, and CloudPawl web surfaces.
- SQLite is the local source of truth for local projects, sessions, reports, memories, and artifact indexes.
- CloudPawl PostgreSQL is the future cloud source of truth for users, workspaces, orgs, billing, entitlements, sync metadata, report summaries, audit, quota, and retention state.
- Local CodePawl must work without CloudPawl, Clerk, Stripe, GitHub App, or a cloud account.
- No source upload by default.
- Do not make CloudPawl required for local CodePawl or the GitHub Action.

CloudPawl is planned future SaaS infrastructure, not current MVP implementation scope. Do not add Clerk, Stripe, GitHub App, cloud sync, cloud migrations, secrets, production auth/payment code, or cloud app scaffolding unless a task explicitly changes that scope.

## GitHub Direction

- GitHub Action ships first.
- The Action must work without a CloudPawl account or token.
- A CloudPawl token is optional and may sync metadata/report summaries only.
- GitHub App ships later for team workflows, sticky PR comments, rich Check Runs, and PR commands.
- Do not upload source, diffs, or logs to cloud by default.

## Data, Evaluation, and Report Quality

- Follow `.codex/plan/data_eval_plan.md` for verdict taxonomy, fixtures, snapshots, and human review.
- v0.1 verdicts are exactly: `verified`, `needs_evidence`, `risky`, `failed`, and `blocked`.
- Every report must include a verdict, evidence references, risks when applicable, and a next action unless the evaluation plan explicitly allows an exception.
- Every important claim should cite concrete evidence: file, diff, command, log, policy rule, session event, or artifact.
- Deterministic checks come before AI diagnosis. AI wording must not override deterministic evidence without an explicit rule.
- Keep fixtures synthetic by default. Use sanitized real sessions only when explicitly requested and document what was removed.
- Do not loosen snapshots, verdicts, or evidence requirements just to make tests pass.

## Security and Privacy

- Follow `.codex/plan/security_privacy_plan.md` for data classes, redaction, ignored paths, protected files, retention, AI Analyze safety, and telemetry policy.
- No source upload by default.
- No hidden telemetry, hidden sync, hidden cloud analysis, or silent background upload.
- Treat diffs, logs, prompts, screenshots, raw session events, and source snippets as sensitive unless the security plan says otherwise.
- Redact secrets, tokens, environment values, private paths, internal hostnames, and credential files before storing, showing, exporting, or using them in fixtures.
- Do not capture `.env`, SSH keys, credential files, or ignored secret paths by default.
- Optional cloud or AI upload must be explicit, scoped, and consistent with the security/privacy plan.

## UI Direction

The UI should feel like a calm engineering cockpit: precise, readable, analytical, and trustworthy.

Use:

- 12-column desktop dashboard grid.
- Left sidebar navigation for app screens.
- Compact KPI cards and dense but readable tables.
- White cards with defined borders.
- Clear page-level action hierarchy.
- Stable card heights and aligned titles, body text, and buttons.
- Evidence, risk, next action, and validation status near each other.

Avoid:

- Generic admin dashboard filler.
- Playful, gamified, neon-heavy, or AI-magic visuals.
- Marketing hero layouts for app screens.
- Too many same-looking cards without a focal decision area.
- Misaligned buttons, titles, charts, bins, labels, or side panels.
- Hidden upload or sync behavior.

## Design Tokens

Use the palette from `.codex/plan/design_plan.md`:

```txt
background: #F4F7FB
surface: #FFFFFF
surface-muted: #EEF2F7
border: #D7DEE8
text-primary: #101318
text-secondary: #5B6472

primary: #005397
primary-soft: #E6F1FF
brand-coral: #FF8788
brand-coral-soft: #FFE8E8
evidence: #008B8F
evidence-soft: #E3F7F6
verified: #087F5B
verified-soft: #DEF7EC
intelligence: #3B4FD8
intelligence-soft: #EEF2FF
warning: #B7791F
warning-soft: #FFF4D8
risky: #C9383A
risky-soft: #FFE8E8
```

Color roles:

- Primary actions and active navigation: `#005397`.
- Attention highlights: `#FF8788`.
- Evidence and traceable data: teal.
- Verified/passed states: green.
- Caution: amber.
- Risk/failure: readable red, not soft coral text.

## Typography

Use local fonts:

- UI/body font: Lato from `assets/fonts/Lato`
- Code/log font: Fira Code from `assets/fonts/Fira_Code`
- Editorial/display font: Playfair Display from `assets/fonts/Playfair_Display`
- Handwritten accent font: Playwrite DE Grund from `assets/fonts/Playwrite_DE_Grund`

Recommended CSS tokens:

```css
--font-sans: "Lato", ui-sans-serif, system-ui, sans-serif;
--font-mono: "Fira Code", ui-monospace, SFMono-Regular, monospace;
--font-display: "Playfair Display", Georgia, serif;
--font-hand: "Playwrite DE Grund", "Comic Sans MS", cursive;
```

Use Lato for product UI, dashboards, reports, navigation, forms, tables, and dense app text. Use Fira Code for code, logs, terminal output, command snippets, JSON, diffs, and evidence references. Use Playfair Display only for brand/editorial moments such as landing-page hero text, report covers, release notes, or polished marketing headings. Use Playwrite DE Grund sparingly for human accent moments such as small annotations or brand details; do not use it for app navigation, controls, tables, evidence, logs, or long text.

Keep type compact and stable. Do not scale font size with viewport width.

## Assets

Master folder: `assets`

Fonts:

- Fira Code: `assets/fonts/Fira_Code`
- Lato: `assets/fonts/Lato`
- Playfair Display: `assets/fonts/Playfair_Display`
- Playwrite DE Grund: `assets/fonts/Playwrite_DE_Grund`

Images:

- Light banner: `assets/images/light-banner.svg`
- Dark banner: `assets/images/dark-banner.svg`
- Light logo: `assets/images/light-logo.svg`
- Dark logo: `assets/images/dark-logo.svg`
- Landing glow blue: `assets/images/landing-glow-blue.svg`
- Landing glow coral: `assets/images/landing-glow-coral.svg`
- Landing glow mint: `assets/images/landing-glow-mint.svg`
- Landing glow violet: `assets/images/landing-glow-violet.svg`

Use assets by contrast, not by theme name: dark logo/banner on light UI surfaces, and light logo/banner on dark UI surfaces. Use logos in navigation, docs headers, login, and report covers. Use banners for brand moments, docs covers, and release notes. Do not use banner artwork as repeated card decoration or behind dense interface text.

Use landing glow assets only for marketing or brand moments where the design plan allows subtle glow. Do not use glow assets in dense app surfaces, report details, tables, charts, or evidence/risk panels.

## Wireframe Work

The standalone low-fidelity wireframe references live at `.codex/ui/wireframe-light-theme.html` and `.codex/ui/wireframe-dark-theme.html`.

Wireframes are for structure, hierarchy, flow, page coverage, layout, and responsive behavior. Keep them grayscale and low fidelity. Do not add final logos, banners, color palettes, glow artwork, decorative images, gradients, or polished visual styling to wireframes.

When editing them:

- Keep it self-contained HTML/CSS/JS.
- Avoid local image/font assets unless they are represented as simple placeholders.
- Maintain consistent side panels across app preview screens.
- Keep overview, sessions, needs attention, reports, projects, agents, memory, integrations, settings, platform assets, design system, and responsive report review represented.
- Preserve the grid overlay control.
- Verify repeated blocks align: card titles, descriptions, CTA rows, chart labels, chart values, and topbar controls.

## Mockup Work

The standalone high-fidelity mockup references live at `.codex/ui/mockup-light-theme.html` and `.codex/ui/mockup-dark-theme.html`.

Mockups are for visual design direction: color, typography, imagery, spacing polish, branded assets, refined component styling, and final-ish content. Use mockups when testing theme direction or product presentation. Preserve the grid overlay control and validate desktop/mobile screenshots after visual changes.

## Implementation Discipline

- Preserve local-first behavior.
- Keep edits scoped to the requested area.
- Prefer existing repo patterns and helpers.
- Do not add unrelated refactors.
- Do not create secrets or production cloud credentials.
- Do not invent cloud-only assumptions in local core.
- Add tests or focused validation when changing executable behavior.
- For documentation-only tasks, do not add implementation files.

## Launch and Docs Discipline

- Follow `.codex/plan/onboarding_docs_plan.md` for README, quickstart, troubleshooting, example report, and privacy documentation work.
- Follow `.codex/plan/launch_beta_plan.md` for alpha, beta, demo, feedback, public launch, and pricing-validation work.
- Do not claim unbuilt features are live.
- Do not create launch pages, forms, analytics, or social posts unless the task explicitly asks for those deliverables.
- Do not launch a signup-only page as if it proves the product.
- Do not plan or post Show HN/Product Hunt before CodePawl is runnable or tryable.
- Public docs should lead with local-first report value: what changed, what evidence exists, what failed or drifted, and what to do next.

## Final Check Before Handoff

Before finishing a task, check the relevant items:

- Planning docs still agree with implementation direction.
- Local CodePawl still works without CloudPawl.
- No source upload is introduced by default.
- UI changes follow the palette, typography, spacing, and alignment rules.
- Asset paths point to existing files.
- GitHub Action behavior, if touched, remains accountless by default.
- Report changes preserve verdict taxonomy, evidence-bound claims, and useful next actions.
- Security/privacy changes preserve no source upload by default and no hidden telemetry/sync.
- Docs and launch copy do not imply future CloudPawl, GitHub App, desktop, paid, or team features are live.
- Any command/test that could not be run is reported clearly.
