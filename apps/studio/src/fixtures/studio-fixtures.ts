import { routeSourceMap } from "./mockup-source-map";

export type Verdict = "verified" | "needs_evidence" | "risky" | "failed" | "blocked";
export type EvidenceStatus = "passed" | "missing" | "required" | "failed";
export type PageId = keyof typeof routeSourceMap;

export interface PageFixture {
  id: PageId;
  label: string;
  navGroup: "Workspace" | "Operate" | "Report";
  count?: string;
  badge?: "primary" | "warning" | "risk";
  title: string;
  kicker: string;
  searchPlaceholder: string;
  sourceSection: string;
}

export interface SessionFixture {
  id: string;
  session: string;
  agent: string;
  project: string;
  branch: string;
  reportId: string;
  changedFileCount: number;
  verdict: Verdict;
  verdictLabel: string;
  reason: string;
  summary: string;
  nextAction: string;
  changedFiles: Array<{ path: string; scope: "in_scope" | "suspicious" | "protected" }>;
  validationEvidence: Array<{ check: string; status: EvidenceStatus; evidence: string }>;
  risks: Array<{ severity: "Blocker" | "High" | "Medium" | "Low"; title: string; detail: string }>;
  timeline: Array<{ time: string; title: string; detail: string }>;
  auditTrail: Array<{ status: EvidenceStatus; detail: string; evidence: string }>;
  aiDiagnosis: string;
  followUpPrompt: string;
  memoryCandidate: string;
}

export interface ProjectFixture {
  name: string;
  detail: string;
  status: Verdict | "optional" | "connected" | "enabled" | "off";
}

export const verdicts: Verdict[] = ["verified", "needs_evidence", "risky", "failed", "blocked"];

export const evidenceConsoleOrder = [
  { id: "verdict", label: "Verdict first" },
  { id: "reason", label: "Reason second" },
  { id: "evidence", label: "Evidence third" },
  { id: "risk", label: "Risk fourth" },
  { id: "next-action", label: "Next action fifth" },
  { id: "memory", label: "Memory sixth" },
] as const;

export const pages: PageFixture[] = [
  {
    id: "overview",
    label: "Overview",
    navGroup: "Workspace",
    count: "Live",
    badge: "primary",
    title: "CodePawl Studio",
    kicker: "Evidence console for routing from urgent session signals to the next command or prompt.",
    searchPlaceholder: "Search sessions...",
    sourceSection: routeSourceMap.overview,
  },
  {
    id: "sessions",
    label: "Sessions",
    navGroup: "Workspace",
    count: "24",
    title: "Sessions",
    kicker: "Browse captured agent runs by project, branch, verdict, and next action.",
    searchPlaceholder: "Search sessions by repo, branch, agent, verdict...",
    sourceSection: routeSourceMap.sessions,
  },
  {
    id: "needs-attention",
    label: "Needs Attention",
    navGroup: "Workspace",
    count: "7",
    badge: "warning",
    title: "Needs Attention",
    kicker: "A triage queue for sessions that need evidence, policy handling, or a focused rerun.",
    searchPlaceholder: "Search sessions needing attention...",
    sourceSection: routeSourceMap["needs-attention"],
  },
  {
    id: "session-detail",
    label: "Session Detail",
    navGroup: "Workspace",
    count: "24",
    title: "Codex - codepawl/web redesign",
    kicker: "Branch ui-redesign - 32 files changed - 10:14 to 10:35 - report #128",
    searchPlaceholder: "Search evidence, files, commands...",
    sourceSection: routeSourceMap["session-detail"],
  },
  {
    id: "reports",
    label: "Reports",
    navGroup: "Workspace",
    count: "18",
    title: "Reports",
    kicker: "Durable engineering records with verdict, evidence, risks, formats, and local exports.",
    searchPlaceholder: "Search reports...",
    sourceSection: routeSourceMap.reports,
  },
  {
    id: "projects",
    label: "Projects",
    navGroup: "Operate",
    count: "4",
    title: "Projects",
    kicker: "Project policies, required checks, protected paths, memories, and local artifact folders.",
    searchPlaceholder: "Search projects, paths, required checks...",
    sourceSection: routeSourceMap.projects,
  },
  {
    id: "agents",
    label: "Agents",
    navGroup: "Operate",
    count: "3",
    title: "Agents",
    kicker: "Compare agent reliability by task type, evidence quality, and scope drift.",
    searchPlaceholder: "Search agents, task types, failure patterns...",
    sourceSection: routeSourceMap.agents,
  },
  {
    id: "memory",
    label: "Memory",
    navGroup: "Operate",
    count: "12",
    title: "Memory",
    kicker: "Editable project rules, validation requirements, failure patterns, and prompt guidance.",
    searchPlaceholder: "Search memories...",
    sourceSection: routeSourceMap.memory,
  },
  {
    id: "integrations",
    label: "Integrations",
    navGroup: "Operate",
    count: "2",
    badge: "warning",
    title: "Integrations",
    kicker: "Connect session sources, artifact destinations, and report publishing targets.",
    searchPlaceholder: "Search integrations and session sources...",
    sourceSection: routeSourceMap.integrations,
  },
  {
    id: "settings",
    label: "Settings",
    navGroup: "Operate",
    title: "Settings",
    kicker: "Workspace defaults for validation, protected paths, exports, data location, and local-first behavior.",
    searchPlaceholder: "Search settings, policies, exports...",
    sourceSection: routeSourceMap.settings,
  },
  {
    id: "onboarding",
    label: "Onboarding",
    navGroup: "Workspace",
    count: "Setup",
    badge: "primary",
    title: "Welcome to CodePawl",
    kicker: "Add local projects, connect session sources, and open a sample report before any cloud setup.",
    searchPlaceholder: "Search sessions, projects, reports, memories...",
    sourceSection: routeSourceMap.onboarding,
  },
  {
    id: "responsive-report-review",
    label: "Responsive Report Review",
    navGroup: "Report",
    count: "3",
    badge: "primary",
    title: "Responsive Report Review",
    kicker: "Same report content adapted for mobile, tablet, and desktop review contexts.",
    searchPlaceholder: "Search report review surfaces...",
    sourceSection: routeSourceMap["responsive-report-review"],
  },
];

export const primarySession: SessionFixture = {
  id: "session-128",
  session: "Codex - codepawl/web redesign",
  agent: "Codex",
  project: "codepawl/web",
  branch: "ui-redesign",
  reportId: "Report #128",
  changedFileCount: 32,
  verdict: "needs_evidence",
  verdictLabel: "Needs Evidence",
  reason: "UI files changed without e2e or screenshot proof.",
  summary: "Agent completed the UI redesign, but validation evidence is incomplete.",
  nextAction: "pnpm exec playwright test --project=chromium",
  changedFiles: [
    { path: "apps/web/app/page.tsx", scope: "in_scope" },
    { path: "apps/web/components/session-card.tsx", scope: "in_scope" },
    { path: "apps/web/styles/design-tokens.css", scope: "in_scope" },
    { path: "apps/api/billing/route.ts", scope: "suspicious" },
  ],
  validationEvidence: [
    { check: "test", status: "passed", evidence: "pnpm test log" },
    { check: "typecheck", status: "missing", evidence: "no matching log" },
    { check: "build", status: "missing", evidence: "no matching log" },
    { check: "e2e", status: "required", evidence: "UI files changed" },
  ],
  risks: [
    { severity: "High", title: "UI without e2e", detail: "apps/web/** changed without Playwright or screenshot proof." },
    { severity: "Medium", title: "Scope drift", detail: "Backend billing route touched outside the UI task scope." },
  ],
  timeline: [
    { time: "10:14", title: "Started", detail: "Prompt requested UI redesign." },
    { time: "10:22", title: "UI edited", detail: "Page and session-card surfaces changed." },
    { time: "10:25", title: "Drift", detail: "Backend billing route touched." },
    { time: "10:31", title: "Partial validation", detail: "Only unit test evidence found." },
  ],
  auditTrail: [
    { status: "passed", detail: "Unit test evidence from pnpm test.", evidence: "10:31" },
    { status: "required", detail: "UI files changed, so e2e or screenshot proof is required.", evidence: "apps/web" },
    { status: "missing", detail: "Typecheck and build logs were not attached.", evidence: "logs/" },
  ],
  aiDiagnosis:
    "The run likely drifted after backend files changed during a UI-only task. Evidence: billing route changed, task scope was web UI, and no e2e evidence was found.",
  followUpPrompt:
    "Re-run the UI task only. Keep changes inside apps/web UI files, revert billing route changes unless explicitly required, and attach Playwright screenshot evidence before marking the report ready.",
  memoryCandidate: "For codepawl/web UI tasks, require Playwright or screenshot proof before marking a session ready.",
};

export const sessions: SessionFixture[] = [
  primarySession,
  {
    ...primarySession,
    id: "session-129",
    session: "Claude Code - api refactor",
    agent: "Claude Code",
    project: "codepawl/api",
    branch: "api-refactor",
    reportId: "Report #129",
    verdict: "verified",
    verdictLabel: "Verified",
    reason: "Required evidence is present and no blocking risk is detected.",
    summary: "Scoped refactor with complete validation evidence.",
    nextAction: "Mark ready",
    risks: [],
  },
  {
    ...primarySession,
    id: "session-130",
    session: "Cursor - docs update",
    agent: "Cursor",
    project: "docs-site",
    branch: "docs-refresh",
    reportId: "Report #130",
    verdict: "blocked",
    verdictLabel: "Blocked",
    reason: "Diff artifact is missing, so the report cannot make a useful decision.",
    summary: "Report is incomplete because required input is missing.",
    nextAction: "Attach diff artifact",
  },
  {
    ...primarySession,
    id: "session-131",
    session: "Codex - settings cleanup",
    project: "client-app",
    branch: "settings-cleanup",
    reportId: "Report #131",
    verdict: "risky",
    verdictLabel: "Risky",
    reason: "Protected auth path changed and needs inspection.",
    summary: "Settings work touched protected policy files.",
    nextAction: "Inspect protected path",
  },
  {
    ...primarySession,
    id: "session-132",
    session: "Cursor - route generation",
    agent: "Cursor",
    project: "docs-site",
    branch: "route-generation",
    reportId: "Report #132",
    verdict: "failed",
    verdictLabel: "Failed",
    reason: "Build log ends with a route generation error.",
    summary: "Available evidence shows the build failed.",
    nextAction: "Fix build error",
  },
];

export const projects: ProjectFixture[] = [
  { name: "codepawl/web", detail: "Checks: test, typecheck, build, e2e - 12 recent sessions", status: "needs_evidence" },
  { name: "pawlm/tokenizer", detail: "Checks: test, typecheck - 8 recent sessions", status: "verified" },
  { name: "client-app", detail: "Protected paths: auth, billing, database", status: "risky" },
  { name: "docs-site", detail: "Checks: markdown lint, link check - 4 recent sessions", status: "verified" },
];

export const memories = [
  { title: "UI tasks require e2e", detail: "Validation rule - source session #128 - high confidence", status: "enabled" },
  { title: "Broad prompts drift scope", detail: "Failure pattern - source session #119 - medium confidence", status: "enabled" },
  { title: "Protect billing paths", detail: "Project policy - applies to client-app and codepawl/web", status: "policy" },
];

export const localContext = {
  daemon: "On",
  sync: "Off",
  data: "~/.codepawl",
  version: "0.1.0",
  mode: "Local",
  localOnly: "Local-only",
};
