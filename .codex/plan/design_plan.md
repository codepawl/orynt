# CodePawl Design Plan

## Product design thesis

CodePawl is not an analytics toy. CodePawl is a local-first control room for AI coding sessions.

Primary tagline:

Turn every AI coding session into measurable engineering work.

The UI must help users answer:

* What did my coding agents do?
* Which session needs attention?
* What changed?
* What evidence exists?
* What is missing?
* What should I do next?
* What should be remembered for future sessions?

The UI should feel like a calm engineering cockpit: precise, readable, analytical, and trustworthy.

## Design source of truth

The web prototype is the active design source of truth for CodePawl. Figma is optional later for presentation/handoff.

Existing HTML mockups and wireframes remain references. They are useful for layout, flow, tone, and coverage, but they must not be treated as final component architecture, production CSS, implementation API, or exact data contract.

The active design surface should move into `apps/studio` as fixture-backed React components. The same components should become the real Studio UI later rather than creating a separate throwaway prototype.

The current low-fidelity structural references live in `.codex/ui/wireframe-light-theme.html` and `.codex/ui/wireframe-dark-theme.html`. The current high-fidelity references live in `.codex/ui/mockup-light-theme.html` and `.codex/ui/mockup-dark-theme.html`.

## Web prototype source of truth

Build product UI directly in `apps/studio`.

Prototype rules:

* Use fixture-backed data first.
* Do not require the backend, Rust core, local daemon, or SQLite store for design iteration.
* Later connect the same components to the local daemon/store.
* Let design evolve directly in React components, not in a detached design artifact.
* Preserve the report schema vocabulary, verdict taxonomy, evidence model, risk model, and next-action model.
* Keep fixture mode available after real data integration so design states remain testable.

Recommended web stack:

* Vite
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Radix primitives
* lucide-react
* Recharts later, after fixture-backed chart needs stabilize
* Storybook later, when components stabilize

Theme decision:

* App UI is light-first.
* Dark marketing/landing pages are allowed.
* Dark app theme is optional later.
* Do not implement a dark app theme before the light app is stable.

Implementation source hierarchy:

1. `design_plan.md` defines design principles, product coverage, semantic rules, and implementation constraints.
2. HTML mockups and wireframes are references for structure, coverage, and visual direction.
3. `apps/studio` fixture mode is the active design surface.
4. The real app should reuse the same components when connecting to local CodePawl data.
5. Figma is optional later for presentation, sales, investor, or handoff material.

Do not overbuild:

* Do not mark auth, payment, cloud sync, GitHub App, desktop, billing, or team features as live.
* Do not build fake analytics unsupported by fixtures or the report schema.
* Do not introduce a Figma dependency before implementation.
* Do not create a separate throwaway prototype if `apps/studio` can serve fixture mode.
* Do not build the dark app theme before the light app is stable.

First web prototype scope:

Required pages:

* onboarding
* overview
* sessions
* needs attention
* session detail
* reports
* projects
* agents
* memory
* integrations
* settings
* responsive report review

Required critical modals/drawers:

* Analyze Current Repo modal
* Add Project modal
* AI Analyze Consent modal
* Save Memory modal
* Export Report modal
* GitHub Action Setup drawer
* GitHub PR Sticky Comment preview

## Optional Figma strategy

Create one Figma file later only if it helps presentation or handoff.

If created, rebuild selected screens in Figma using:

* components
* variants
* Auto Layout
* variables
* reusable tokens
* prototype links for primary flows

Figma Dev Mode and Code Connect can be considered later for implementation handoff, but neither should block v0.1.

## Current design inventory

Existing high-fidelity mockup coverage:

* landing
* app shell
* onboarding
* overview
* sessions
* needs attention
* session detail
* reports
* projects
* agents
* memory
* integrations
* settings
* design system
* responsive report review

Existing wireframe coverage:

* landing/account entry
* app shell
* page previews
* responsive report review
* platform assets
* design system wireframe

Design coverage is broad enough for the current product direction. The main remaining design work is consolidation, missing states, interaction coverage, verdict normalization, and implementation handoff clarity.

## Figma file structure

If a Figma file is created later, use a structure like this:

Suggested Figma pages:

* `00 Cover`
* `01 Product Flows`
* `02 Wireframes`
* `03 App Screens`
* `04 Components`
* `05 Design Tokens`
* `06 Landing / Marketing`
* `07 GitHub PR Surfaces`
* `08 Responsive`
* `09 Prototype`
* `10 Archive / HTML References`

Import or screenshot HTML mockups only into `10 Archive / HTML References`. Rebuild selected screens with components, variants, Auto Layout, and variables instead of converting HTML directly into production assumptions.

Use one component system with light and dark modes if a dark app theme is ever designed, not separate duplicated design systems. App UI remains light-first; dark app theme is optional later.

## Visual direction decision

App UI:

* light-first
* calm
* clinical
* evidence-first
* dashboard-readable
* optimized for repeated engineering review

Landing/marketing:

* dark editorial style is allowed
* stronger typography and brand atmosphere are allowed
* glow assets may be used sparingly for brand moments

Dense app screens:

* avoid heavy gradients
* avoid decorative glow backgrounds
* use semantic colors for verdict, evidence, risk, validation, and sync state
* keep evidence, reason, risk, next action, and memory close together

## Core flows to finalize

Finalize these flows before broad Studio implementation:

* first run
* add project
* analyze fixture/sample
* analyze current repo
* session detail review
* copy next action
* save memory
* export report
* AI Analyze upload consent
* GitHub PR report
* GitHub Action setup
* fork PR read-only state

## Missing UI states

Required states:

* no sessions
* no project
* no git repo
* no diff found
* missing validation logs
* analysis running
* analysis failed
* daemon offline
* sync off
* sync enabled
* upload consent required
* redaction warning
* command copied
* memory saved
* GitHub Action unavailable
* fork PR read-only
* CloudPawl not connected

## Missing frames to add or refine

Required frames:

* Analyze Current Repo modal
* Add Project modal
* Configure Project Checks modal
* AI Analyze Consent modal
* Save Memory modal
* Edit Memory modal
* Export Report modal
* GitHub Action Setup drawer
* GitHub PR sticky comment
* GitHub job summary
* GitHub check state
* Fork PR read-only state

## Component system

Required components:

* AppShell
* Sidebar
* Topbar
* PageHeader
* Button
* IconButton
* Input/Search
* Select/Filter
* StatusChip
* VerdictBadge
* MetricCard
* SessionCard
* ProjectCard
* ReportCard
* EvidenceTable
* RiskList
* Timeline
* CommandBlock
* FollowUpPrompt
* MemoryCandidate
* EmptyState
* Modal
* Drawer
* Tabs
* Table
* Toast/Notification

React component names should match the design docs where practical. If optional Figma work is created later, use the same names instead of creating a parallel component vocabulary.

## Component states

Every interactive component should define:

* default
* hover
* active
* selected
* disabled
* loading
* focus
* error

Focus states must be visible. Loading states must preserve component dimensions so layouts do not jump.

## Verdict UI system

App report verdicts are exactly:

* `verified`
* `needs_evidence`
* `risky`
* `failed`
* `blocked`

Do not use `draft`, `mostly healthy`, `accepted`, or `review` as report verdicts. Those may appear only as clearly labeled non-verdict workflow labels, such as merge decision, review queue label, or document status.

Verdict definitions:

| Verdict | Label | Color token | Icon direction | Short description | Allowed next action style |
| --- | --- | --- | --- | --- | --- |
| `verified` | Verified | `verified` / `verified-soft` | checkmark or shield-check | Expected evidence is present and no blocking risk is detected. | Ship, archive, save memory, or export report. |
| `needs_evidence` | Needs evidence | `warning` / `warning-soft` | alert circle or file-search | Changes may be acceptable but required proof is missing. | Run a test/build/e2e command, attach evidence, or rerun validation. |
| `risky` | Risky | `risky` / `risky-soft` | alert triangle or shield-alert | Sensitive, broad, or policy-controlled changes need review. | Inspect diff, split changes, review protected paths, or rerun with narrower scope. |
| `failed` | Failed | `risky` / `risky-soft` | x-circle or terminal-x | Available evidence shows a command, build, test, or validation failure. | Fix failure, rerun command, revert, or generate a focused follow-up prompt. |
| `blocked` | Blocked | `text-secondary` / `surface-muted` with warning accent | octagon-alert or lock | CodePawl cannot produce a useful decision because required input/context is missing. | Provide missing diff/log/config, fix setup, or run doctor/troubleshooting. |

## Design token implementation mapping

Token groups:

* color
* typography
* spacing
* radius
* shadow
* layer/z-index
* status tokens
* evidence tokens
* code/command block tokens

Map design tokens to Tailwind, shadcn, and Radix implementation later. Token names should match implementation token names so engineers do not translate between design and code.

Required implementation token direction:

```txt
color: background, surface, surface-muted, border, text-primary, text-secondary, primary, evidence, verified, warning, risky, intelligence
typography: font-sans, font-mono, font-display, font-hand
spacing: page, section, card, control, table-cell
radius: card, control, chip, modal
shadow: surface, overlay, focus
layer: base, sticky, dropdown, modal, toast
status: verified, needs-evidence, risky, failed, blocked
evidence: evidence-present, evidence-missing, evidence-partial
code: command-bg, command-border, command-text, command-copy
```

## Implementation handoff rules

* `apps/studio` React components are the active implementation design surface.
* Optional Figma components should map to React components if Figma is created later.
* Token names should match implementation token names.
* Use fixture-backed data for charts and sample reports.
* Do not build fake analytics not supported by the report schema.
* Do not mark cloud, auth, payment, GitHub App, desktop, or team features as live unless implemented.
* Every app screen must use report schema terminology.
* Session Detail has priority over dashboard polish.
* Overview dashboard routes users to actionable sessions; it is not the core product alone.
* HTML mockups are references, not production markup or implementation contracts.
* Do not create a separate throwaway prototype when `apps/studio` fixture mode can express the design.
* GitHub PR surfaces must follow the GitHub integration and security/privacy plans.

## Accessibility checklist

* Target WCAG AA contrast.
* Provide visible focus states.
* Do not rely on color-only status.
* Support keyboard navigation.
* Keep tables readable and scannable.
* Preserve responsive report review.
* Use minimum readable text sizes.
* Command blocks must be scrollable and copyable.
* Status chips must include text labels.
* Interactive hit targets must be large enough for repeated use.
* Modals and drawers must have clear titles, close behavior, and focus management.

## Visual direction

Use a clean SaaS dashboard style inspired by:

* Nexus SaaS Marketing Dashboard
* Healthcare SaaS Platform Design
* Consulting & Coaching Website
* Engraved martini glass

Reference links:

* Consulting & Coaching Website: https://dribbble.com/shots/27488625-Consulting-Coaching-Website
* Engraved martini glass: https://dribbble.com/shots/27487811-Engraved-martini-glass
* Nexus - Saas Marketing Dashboard: https://dribbble.com/shots/23038744-Nexus-Saas-Marketing-Dashboard
* Healthcare SaaS Platform design: https://dribbble.com/shots/27489883-Healthcare-SaaS-Platform-design

Do not copy the references directly. Extract their principles:

From Nexus:

* light dashboard surface
* left sidebar navigation
* compact KPI cards
* clean chart panels
* soft borders
* subtle color accents
* readable grid layout

From Healthcare SaaS:

* high information clarity
* crisp form layout
* restrained operational palette
* friendly cards
* simple navigation
* status-driven layout

From Consulting/Coaching:

* strong typography
* confident homepage copy
* credibility blocks
* result-oriented sections
* case-study style presentation
* strong but restrained primary accent

From Engraved martini glass:

* refined etched-detail feeling
* crisp linework and subtle craft cues
* restrained premium texture for brand moments only
* no literal glass, alcohol, or nightlife aesthetic in the product UI
* no decorative engraving patterns in dense dashboard surfaces

Final CodePawl style:

* light-first
* crisp technical SaaS background
* white cards with defined borders
* precise typography
* deep technical blue `#005397` as primary product action
* coral `#FF8788` as restrained attention/accent color
* teal as the split-complement evidence/data accent
* green reserved for verified/passed state
* amber/red used sparingly for risk
* no noisy gradients in core dashboard
* subtle glow only on marketing/landing hero, not dense app screens

## Design keywords

Use these words when making UI decisions:

* measurable
* traceable
* calm
* evidence-bound
* focused
* local-first
* engineering-grade
* reviewable
* explainable
* action-oriented

Avoid:

* playful
* gamified-first
* neon-heavy
* noisy charts
* too many badges
* AI magic visuals
* generic admin dashboard
* “trust me” UI without evidence

## Layout system

Use a 12-column dashboard grid on desktop.

Desktop app layout:

```txt
┌────────────────────────────────────────────────────────────┐
│ Top bar: project/search/sync/status/user                   │
├───────────────┬────────────────────────────────────────────┤
│ Sidebar       │ Main content                               │
│               │                                            │
│ Overview      │ Page header                                │
│ Sessions      │ Primary insight / action panel             │
│ Projects      │ Cards / timeline / report sections         │
│ Agents        │                                            │
│ Reports       │                                            │
│ Memory        │                                            │
│ Settings      │                                            │
└───────────────┴────────────────────────────────────────────┘
```

Recommended desktop sizes:

* Sidebar: 240px
* Page max width: fluid, but content should not feel stretched
* Card radius: 16px
* Inner card padding: 20px to 24px
* Dense table padding: 12px to 16px
* Page spacing: 24px to 32px
* Main background: very light gray/off-white
* Card background: white or near-white
* Border: subtle neutral line

## Navigation

Primary sidebar items:

* Overview
* Sessions
* Projects
* Agents
* Reports
* Memory
* Integrations
* Settings

Sidebar footer:

* Local-only / Sync off indicator
* Daemon status
* Current data location
* Version

Top bar:

* Global search
* Active project filter
* Time range selector
* Local/cloud sync status
* Quick action: Analyze current repo

## First-run UX

Do not show an empty dashboard as the first screen.

First-run flow:

```txt
Welcome to CodePawl
Turn every AI coding session into measurable engineering work.

Step 1: Add project folders
Step 2: Enable integrations
Step 3: Analyze current repo
Step 4: View first session report
```

First-run cards:

* Add project folder
* Enable Claude Code integration
* Enable Codex integration
* Analyze current repo
* Open sample report

Empty states must teach the product:

Bad empty state:
“No sessions found.”

Good empty state:
“Analyze your first agent session. CodePawl will inspect changed files, validation evidence, risks, and next actions.”

## Primary UX hierarchy

Most important screen:

1. Session Detail

Second:

2. Needs Attention Queue

Third:

3. Overview Dashboard

Fourth:

4. Analytics / trends / streaks

Dashboard must route users to the right session. It is not the core value by itself.

## Overview dashboard

Dashboard title:

CodePawl Studio

Subtitle:

Turn every AI coding session into measurable engineering work.

Top section:

* AI Shipping Health
* Needs Attention
* Recent Sessions

Main dashboard cards:

1. AI Shipping Health

Fields:

* status
* main issue
* verified sessions
* risky sessions
* missing evidence
* false validation claims

Use only fixture-backed or real local report data. Do not show an aggregate numeric score in v0.1 unless the report engine actually produces that score.

Example:

```txt
AI Shipping Health
Needs attention
UI sessions are missing e2e evidence.

Verified sessions: 18
Needs evidence: 7
Risky sessions: 4
Blocked: 2
```

2. Needs Attention

This is the most important dashboard module.

Each item should show:

* project
* agent
* short issue
* evidence reason
* recommended action
* severity

Example:

```txt
codepawl/web
Codex session changed UI files without Playwright evidence.
Action: run pnpm exec playwright test.
```

3. Recent Sessions

Each session row/card:

* agent
* project
* branch
* verdict
* changed files
* validation status
* timestamp
* next action

4. Weekly AI Shipping Funnel

Use funnel-style metric progression:

* captured sessions
* analyzed sessions
* sessions with validation evidence
* passed validation
* marked ready or merged
* blocked/risky

5. Agent Performance

Do not only show usage counts.

Show:

* best agent by task type
* retry rate
* missing evidence rate
* unrelated file touch rate
* ready-session rate

6. Project Health

Each project row:

* health status
* recent sessions
* common missing evidence
* common risky path
* latest memory

## Session Detail page

This is the core CodePawl experience.

Header:

```txt
Session: Codex · codepawl/web redesign
Verdict: Needs Evidence
Repo: ~/Code/personal/codepawl
Branch: ui-redesign
Started: 10:14
Ended: 10:35
```

Primary summary card:

* one-sentence outcome
* verdict
* main issue
* next action

Example:

```txt
Agent completed the UI redesign, but validation evidence is incomplete.
Main issue: UI files changed without e2e or screenshot proof.
Next action: run Playwright before marking this session ship-ready.
```

Sections:

1. Outcome

* completed
* verified
* needs evidence
* risky
* failed
* blocked

Stored/report verdicts must use the exact v0.1 taxonomy from `.codex/plan/data_eval_plan.md`: `verified`, `needs_evidence`, `risky`, `failed`, and `blocked`. UI copy may be friendlier, but report data, filters, chips, and GitHub mappings must preserve those states.

2. Timeline

Events:

* session started
* prompt submitted
* tool call
* files edited
* command run
* validation result
* session stopped

Timeline should be vertical, compact, and scannable.

3. Change Analysis

Show:

* total files changed
* in-scope files
* suspicious files
* protected paths
* lockfile/package changes
* migration/schema changes

Use grouped lists:

* In scope
* Suspicious
* Protected
* Generated/ignored

4. Validation Evidence

Use a table:

```txt
Check        Status       Evidence
test         passed       pnpm test log found
typecheck    missing      no matching log
build        missing      no matching log
e2e          required     UI files changed
```

5. AI Diagnosis

Evidence-bound analysis only.

Every diagnosis must reference:

* command
* log
* changed file
* config rule
* session event
* policy

Bad diagnosis:
“The agent probably made a mistake.”

Good diagnosis:
“The run likely drifted after backend files were changed during a UI-only task. Evidence: apps/api/billing/route.ts changed, but the task scope was web UI.”

6. Next Actions

Actions should be actionable:

* run command
* revert files
* rerun with focused prompt
* add missing test
* inspect specific diff
* save memory
* mark ready

7. Follow-up Prompt

Generate a copyable prompt:

```txt
The previous run changed UI files and touched unrelated backend files.
Revert apps/api/billing/** unless required.
Run pnpm typecheck and pnpm exec playwright test.
Only fix UI regressions.
Do not modify billing, auth, schema, or database files.
```

8. Memory Candidate

Show suggested memory:

```txt
For codepawl/web UI tasks, require Playwright or screenshot proof.
```

Actions:

* Save memory
* Edit memory
* Ignore

## Reports page

Reports are durable engineering records.

Report list should show:

* session
* project
* verdict
* created date
* exported formats
* linked PR if any
* evidence count
* missing evidence count

Report detail should support:

* Copy Markdown
* Export JSON
* Open artifact folder
* Open GitHub PR later
* Save memory

## Projects page

Project card fields:

* project name
* path
* repo URL
* default branch
* recent sessions
* project health
* required checks
* protected paths
* memories

Project detail sections:

* Overview
* Policies
* Checks
* Memories
* Recent sessions
* Integrations

## Agents page

Agent comparison must be practical, not vanity.

Show per agent:

* sessions
* ready sessions
* risky sessions
* missing evidence rate
* average retries
* common failure pattern
* best task type
* weakest task type

Example:

```txt
Claude Code
Best for: refactors
Weakness: slower, but fewer unrelated file touches

Codex
Best for: implementation and UI iteration
Weakness: more retries and more scope drift on broad prompts
```

## Memory page

Memory is a product differentiator.

Memory types:

* project rule
* failure pattern
* validation rule
* agent preference
* prompt pattern
* protected path
* workflow note

Memory cards:

* title
* type
* source session
* confidence
* last used
* enabled/disabled

Memory must be editable. Do not make memory feel mysterious.

## Visual language

### Color tokens

Use semantic colors, not random palette names.

Base:

* background: cool technical gray
* surface: white
* surface-muted: cool gray
* border: crisp blue-gray line
* text-primary: graphite near-black
* text-secondary: steel gray

Accent:

* primary: deep technical blue
* attention accent: coral
* evidence: split-complement teal
* verified: green
* intelligence: indigo
* warning: amber
* risky: red
* neutral: slate

Suggested approximate palette:

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

Avoid making the UI feel medical or lifestyle-oriented. Use `#005397` for primary actions, `#FF8788` for restrained attention highlights, teal for evidence/data emphasis, green only for verified success, and bright color only for active states, chips, and small highlights.

### Typography

Use local font assets for the standalone high-fidelity mockups so the preview is stable offline:

* UI/body font: Lato from `assets/fonts/Lato/`
* Code/log font: Fira Code from `assets/fonts/Fira_Code/`
* Editorial/display font: Playfair Display from `assets/fonts/Playfair_Display/`
* Handwritten accent font: Playwrite DE Grund from `assets/fonts/Playwrite_DE_Grund/`

Implementation tokens:

```txt
--font-sans: "Lato", ui-sans-serif, system-ui, sans-serif
--font-mono: "Fira Code", ui-monospace, SFMono-Regular, monospace
--font-display: "Playfair Display", Georgia, serif
--font-hand: "Playwrite DE Grund", cursive
```

Type scale:

```txt
page title: 28–32px
section title: 18–22px
card title: 14–16px
body: 14px
small/meta: 12px
code/log: 12–13px
```

Keep text compact but not cramped.

Use Lato for product UI, dashboards, reports, navigation, forms, tables, and dense app text. Use Fira Code for code, logs, terminal output, command snippets, JSON, diffs, and evidence references. Use Playfair Display only for brand/editorial moments such as landing-page hero text, report covers, release notes, or polished marketing headings. Use Playwrite DE Grund sparingly for small annotation or brand-accent moments; do not use it for app navigation, controls, tables, evidence, logs, or long text.

### UI reference fidelity

Maintain two separate standalone HTML reference types:

* Wireframes: `.codex/ui/wireframe-light-theme.html` and `.codex/ui/wireframe-dark-theme.html`
* Mockups: `.codex/ui/mockup-light-theme.html` and `.codex/ui/mockup-dark-theme.html`

Wireframes are low-fidelity structure and flow references. Keep them grayscale, layout-first, and free of final logos, banners, color palettes, glow artwork, decorative images, gradients, and polished visual styling.

Mockups are high-fidelity visual references. Use them for theme direction, typography, color, asset usage, component polish, and final-ish product presentation.

### Cards

Card types:

* KPI card
* Status card
* Evidence card
* Risk card
* Session card
* Project card
* Memory card
* Report card

Card rules:

* one primary idea per card
* clear title
* one key value or verdict
* optional small trend/status chip
* no decorative charts unless useful
* repeated cards in the same row must align titles, body text, and CTA/button baselines
* card groups need stable min heights so wrapped text does not make buttons jump vertically
* buttons should sit in a dedicated action row, not float immediately after variable-length copy

### Status chips

Statuses:

Report verdict chips:

* Verified
* Needs evidence
* Risky
* Failed
* Blocked

Non-verdict state chips:

* Passed
* Local-only
* Sync off

Use consistent colors:

* Primary actions: deep blue `#005397`
* Attention accent: coral `#FF8788`
* Evidence/data: teal
* Verified/Passed: green
* Needs evidence: amber
* Risky/Blocked/Failed: red
* Local-only/Sync off: gray/slate
* AI diagnosis/agent intelligence: indigo

## Data visualization rules

Charts must explain workflow health, not decorate.

Chart alignment rules:

* values inside bars, bins, or funnel steps should sit near the top or just outside the mark, not drift to the bottom
* repeated chart marks must align labels and values consistently across the full row
* chart labels need stable lanes so long labels do not push adjacent values or bins out of alignment

Allowed chart types:

* funnel/progression
* stacked bar for validation coverage
* line chart for weekly trend
* bar chart for agent comparison
* donut only for simple ratio, avoid overuse
* timeline for session events

Avoid:

* chart walls
* tiny unreadable charts
* decorative gradient charts
* too many colors
* meaningless percentages

Main charts:

1. Weekly AI Shipping Funnel
2. Validation Evidence Coverage
3. Risk by Project
4. Agent Outcome Comparison
5. Session Volume Trend
6. Missing Evidence by Check Type

## Accessibility

Minimum rules:

* text contrast must pass WCAG AA
* normal text should target at least 4.5:1 contrast
* large text should target at least 3:1 contrast
* interactive controls must have visible focus state
* status must not rely on color alone
* charts must include labels/tooltips/text summaries
* keyboard navigation must work for core actions
* tables must have readable headers
* avoid tiny gray text below 12px

Every status chip should include text, not color-only signal.

## Interaction principles

Use calm, precise interactions.

Good interactions:

* hover reveals secondary metadata
* click session opens detail
* copy prompt button
* save memory button
* expand evidence logs
* filter by project/agent/status
* command palette later

Avoid:

* heavy animations
* playful bounces
* modals for everything
* auto-opening noisy panels
* hiding critical evidence behind hover only

## Responsive behavior

Desktop-first because CodePawl is a developer tool.

Breakpoints:

* desktop: full sidebar + grid
* tablet: collapsible sidebar
* mobile: read-only/report review mode

Mobile should support:

* view reports
* read PR/session summary
* copy next action
* not full analysis workflow

## Component stack

For Studio:

* Vite
* React
* TypeScript
* TanStack Router
* TanStack Query
* Tailwind CSS
* shadcn/ui
* Radix primitives
* lucide-react for icons
* Recharts later for charts
* Storybook later when components stabilize

Core components to implement first:

* AppShell
* Sidebar
* Topbar
* PageHeader
* StatusChip
* VerdictCard
* MetricCard
* SessionCard
* EvidenceTable
* RiskList
* Timeline
* NextActionPanel
* MemoryCandidateCard
* EmptyState
* ReportMarkdownView

## Page priority

Build order:

1. Session Detail
2. Reports
3. Projects
4. Overview Dashboard
5. Memory
6. Agents
7. Integrations
8. Settings

Reason:

Session Detail creates first value. Dashboard becomes useful only after sessions exist.

## Dashboard wireframe

```txt
┌──────────────────────────────────────────────────────────────────────────────┐
│ CodePawl Studio                            Search...    Local-only · Sync off│
├───────────────┬──────────────────────────────────────────────────────────────┤
│ Overview      │ Turn every AI coding session into measurable engineering work│
│ Sessions      │                                                              │
│ Projects      │ ┌──────────────────────────────────────────────────────────┐ │
│ Agents        │ │ AI Shipping Health                         Needs attention│ │
│ Reports       │ │ UI sessions need e2e evidence.                            │ │
│ Memory        │ │ Verified 18 · Needs evidence 7 · Risky 4 · Blocked 2     │ │
│ Integrations  │ └──────────────────────────────────────────────────────────┘ │
│ Settings      │                                                              │
│               │ ┌──────────────────────┐ ┌───────────────────────────────┐ │
│ Local-only    │ │ Needs Attention       │ │ Recent Sessions               │ │
│ Sync off      │ │ codepawl/web          │ │ Codex · codepawl/web · risky  │ │
│ Daemon on     │ │ missing e2e evidence  │ │ Claude · pawlm · verified     │ │
│               │ │ pawlm/tokenizer       │ │ Cursor · needs evidence       │ │
│               │ │ lockfile changed      │ │                               │ │
│               │ └──────────────────────┘ └───────────────────────────────┘ │
│               │                                                              │
│               │ ┌──────────────────────────────────────────────────────────┐ │
│               │ │ Weekly AI Shipping Funnel                               │ │
│               │ │ Captured → Analyzed → Evidence → Passed → Accepted      │ │
│               │ └──────────────────────────────────────────────────────────┘ │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

## Session detail wireframe

```txt
┌──────────────────────────────────────────────────────────────────────────────┐
│ Codex · codepawl/web redesign                                  Needs Evidence│
│ Branch: ui-redesign · 32 files changed · 10:14–10:35                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ Outcome                                                                      │
│ Agent completed the UI redesign, but validation evidence is incomplete.       │
│ Next action: run Playwright or attach screenshot proof.                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Evidence                                                                     │
│ ✓ unit test log found                                                        │
│ ✕ typecheck log missing                                                      │
│ ✕ e2e evidence missing                                                       │
│ ✕ screenshot proof missing                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Risks                                                                        │
│ 1. UI files changed without e2e evidence.                                    │
│ 2. Backend billing file touched outside expected scope.                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Timeline                                                                     │
│ 10:14 session started                                                        │
│ 10:16 prompt submitted                                                       │
│ 10:22 edited apps/web/app/page.tsx                                           │
│ 10:25 edited apps/api/billing/route.ts                                       │
│ 10:31 ran pnpm test                                                          │
│ 10:35 session stopped                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Follow-up Prompt                                                             │
│ [copy] Revert unrelated backend files, run typecheck and Playwright...        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Memory Candidate                                                             │
│ For codepawl/web UI tasks, require Playwright or screenshot proof. [Save]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Landing page direction

Landing page can borrow more from Consulting/Coaching reference.

Hero:

```txt
Turn every AI coding session into measurable engineering work.

CodePawl tracks what your coding agents changed, verifies the evidence,
diagnoses drift, and tells you what to do next.
```

Landing sections:

1. Problem
   AI coding sessions are scattered across agents, repos, logs, and PRs.

2. Product
   CodePawl turns each session into a traceable engineering record.

3. How it works
   Capture → Analyze → Verify → Diagnose → Recommend → Remember

4. Screens
   Dashboard, Session Detail, GitHub PR Report

5. Use cases
   Solo developer, open-source maintainer, agency, team

6. Privacy
   Local-first. No source upload by default.

7. CTA
   Analyze your first session.

Landing should use stronger typography and more open spacing than the app.

## GitHub report design

GitHub PR comment should be compact and scannable.

Structure:

```md
<!-- codepawl-report -->

## CodePawl Session Report

**Verdict:** Needs evidence  
**Reason:** UI changes detected without e2e or screenshot evidence.

### What changed
- 18 files changed
- 14 in expected scope
- 4 suspicious / outside policy

### Evidence
| Check | Status | Evidence |
|---|---|---|
| test | passed | pnpm test log |
| typecheck | missing | no log found |
| e2e | required | apps/web/** changed |

### Risks
1. Backend billing path touched outside expected scope.
2. Agent claimed full validation, but only unit test evidence was found.

### Next action
Run typecheck and Playwright before marking this session complete.
```

Do not make GitHub comments visually noisy. GitHub surface should be factual and concise.

## Design QA checklist

Before accepting UI work:

* Does the screen answer a clear user question?
* Is the next action visible?
* Are evidence and risk separated?
* Are status colors consistent?
* Is there any chart that does not change a decision?
* Does the UI still work without cloud?
* Does the empty state guide the user?
* Can the user copy the follow-up prompt?
* Can the user inspect evidence?
* Does the screen pass contrast requirements?
* Is the dashboard useful without vanity metrics?
* Is Session Detail clearly more important than raw analytics?

## Implementation constraints for agents

When implementing UI:

* Do not introduce a generic admin template without adapting terminology.
* Do not build a chart-only dashboard.
* Do not make green/red the only risk signal.
* Do not hide local-only/privacy status.
* Do not add heavy animations.
* Do not add fake metrics without fixture-backed data.
* Do not overuse gradients in the app UI.
* Use real report schema from Rust core.
* Keep app components reusable.
* Keep visual density moderate.
* Use mock data only from fixtures.
* Prioritize Session Detail before analytics polish.

## First UI implementation contract

Goal: implement the initial CodePawl Studio web prototype in `apps/studio` with fixture-backed data and reusable components that can later connect to the local daemon/store.

Context: CodePawl is a local-first session intelligence tool for AI coding agents. The primary tagline is “Turn every AI coding session into measurable engineering work.” The first UI should not be a generic admin dashboard. It should show session verdicts, evidence, risks, next actions, and memory candidates.

Constraints:

* Use Vite React TypeScript.
* Use Tailwind CSS, shadcn/ui, Radix primitives, and lucide-react.
* Use fixture-backed data only.
* Build the first web prototype scope defined above.
* Keep local-only/sync-off status visible.
* Do not build auth/cloud/billing.
* Do not build vanity charts first.
* Do not require backend, Rust core, daemon, or SQLite setup for design iteration.
* Prioritize accessibility and readable contrast.
* Keep colors semantic.

Done when:

* Studio fixture mode renders the required pages.
* Studio fixture mode renders the required critical modals/drawers.
* Overview shows AI Shipping Health, Needs Attention, Recent Sessions, and Weekly Shipping Funnel.
* Session Detail shows Outcome, Evidence, Risks, Timeline, Next Action, Follow-up Prompt, and Memory Candidate.
* UI uses reusable components.
* Empty states are useful.
* Build and typecheck pass.
