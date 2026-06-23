import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function findRepoRoot(start) {
  let current = start;
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "AGENTS.md")) && existsSync(path.join(current, ".codex"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return start;
}

const root = findRepoRoot(process.cwd());
const requiredFiles = [
  "apps/studio/package.json",
  "apps/studio/index.html",
  "apps/studio/playwright.config.ts",
  "apps/studio/e2e/studio-smoke.spec.ts",
  "apps/studio/src/App.tsx",
  "apps/studio/src/components.tsx",
  "apps/studio/src/fixtures/report-fixtures.ts",
  "apps/studio/src/fixtures/studio-fixtures.ts",
  "apps/studio/src/fixtures/mockup-source-map.ts",
  "apps/studio/src/fixtures/reports/report-blocked-severe-policy.json",
  "apps/studio/src/fixtures/reports/report-failed-command-log.json",
  "apps/studio/src/fixtures/reports/report-fixture-basic.json",
  "apps/studio/src/fixtures/reports/report-needs-evidence-ui-missing-e2e.json",
  "apps/studio/src/fixtures/reports/report-risky-protected-path.json",
  "apps/studio/src/reports/report-adapter.ts",
  "apps/studio/src/reports/report-adapter.test.ts",
  "apps/studio/src/reports/report-schema.ts",
  "apps/studio/src/styles.css",
];

const requiredPages = [
  "onboarding",
  "overview",
  "sessions",
  "needs-attention",
  "session-detail",
  "reports",
  "projects",
  "agents",
  "memory",
  "integrations",
  "settings",
  "responsive-report-review",
];

const requiredSurfaces = [
  "Most Urgent Decision",
  "Decision Queue",
  "Evidence Audit Trail",
  "Responsive Report Review",
  "LocalSourceInventory",
  "No source upload by default",
  "Report Data Source",
];

const requiredSessionDetailTerms = [
  "verdict hero",
  "changed files",
  "validation evidence",
  "risk list",
  "timeline",
  "evidence audit trail",
  "AI diagnosis",
  "recommended action",
  "follow-up prompt",
  "memory candidate",
];

const requiredComponents = [
  "AppShell",
  "Sidebar",
  "Topbar",
  "PageHeader",
  "StatusChip",
  "VerdictBadge",
  "MetricCard",
  "SessionCard",
  "ProjectCard",
  "ReportCard",
  "EvidenceTable",
  "RiskList",
  "Timeline",
  "CommandBlock",
  "FollowUpPrompt",
  "MemoryCandidate",
  "EmptyState",
  "Modal",
  "Drawer",
  "Table",
];

const allowedVerdicts = ["verified", "needs_evidence", "risky", "failed", "blocked"];
const bannedVerdictText = ["mostly healthy", "mark accepted", "draft-heavy", " unknown ", " done "];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) {
    failures.push(`Missing required file: ${file}`);
  }
}

if (failures.length === 0) {
  const app = read("apps/studio/src/App.tsx");
  const components = read("apps/studio/src/components.tsx");
  const fixtures = read("apps/studio/src/fixtures/studio-fixtures.ts");
  const reportFixtures = read("apps/studio/src/fixtures/report-fixtures.ts");
  const reportAdapter = read("apps/studio/src/reports/report-adapter.ts");
  const reportSchema = read("apps/studio/src/reports/report-schema.ts");
  const sourceMap = read("apps/studio/src/fixtures/mockup-source-map.ts");
  const styles = read("apps/studio/src/styles.css");
  const packageJson = read("apps/studio/package.json");
  const playwright = read("apps/studio/playwright.config.ts");
  const smoke = read("apps/studio/e2e/studio-smoke.spec.ts");

  for (const page of requiredPages) {
    if (!fixtures.includes(`id: "${page}"`)) {
      failures.push(`Missing required page fixture: ${page}`);
    }
  }

  for (const surface of requiredSurfaces) {
    if (!app.includes(surface) && !fixtures.includes(surface)) {
      failures.push(`Missing required UI surface: ${surface}`);
    }
  }

  for (const term of requiredSessionDetailTerms) {
    if (!fixtures.toLowerCase().includes(term.toLowerCase()) && !app.toLowerCase().includes(term.toLowerCase())) {
      failures.push(`Session Detail missing required term: ${term}`);
    }
  }

  for (const component of requiredComponents) {
    if (!components.includes(`function ${component}`) && !components.includes(`const ${component}`)) {
      failures.push(`Missing extracted component: ${component}`);
    }
  }

  for (const source of [
    ".codex/ui/mockup-light-theme.html",
    ".codex/ui/mockup-dark-theme.html",
    ".codex/ui/wireframe-light-theme.html",
    ".codex/ui/wireframe-dark-theme.html",
  ]) {
    if (!sourceMap.includes(source)) {
      failures.push(`Missing .codex/ui inventory source: ${source}`);
    }
  }

  for (const marker of [
    "light high-fidelity mockup",
    "main app UI reference",
    "dark high-fidelity mockup",
    "landing/marketing style reference",
    "low-fidelity wireframes",
    "structure, flow, hierarchy, and responsive behavior",
  ]) {
    if (!sourceMap.includes(marker)) {
      failures.push(`Missing source-of-truth mapping marker: ${marker}`);
    }
  }

  for (const token of [
    "--bg",
    "--surface-2",
    "--muted-surface",
    "--border-strong",
    "--text",
    "--muted",
    "--primary",
    "--evidence",
    "--verified",
    "--warning",
    "--risk",
    "--intel",
    "--sidebar",
  ]) {
    if (!styles.includes(token)) {
      failures.push(`Missing mockup-derived CSS token: ${token}`);
    }
  }

  for (const mockupClass of [
    ".screen",
    ".topbar",
    ".shell",
    ".main",
    ".attention-lead",
    ".decision-console",
    ".signal-strip",
    ".evidence-strip",
    ".risk-rail",
    ".viewport-gallery",
  ]) {
    if (!styles.includes(mockupClass)) {
      failures.push(`Missing mockup-derived CSS class: ${mockupClass}`);
    }
  }

  for (const orderMarker of [
    'id: "verdict"',
    'id: "reason"',
    'id: "evidence"',
    'id: "risk"',
    'id: "next-action"',
    'id: "memory"',
  ]) {
    if (!fixtures.includes(orderMarker)) {
      failures.push(`Missing Evidence Console order marker: ${orderMarker}`);
    }
  }

  if (!app.includes('data-source="mockup-light-theme.html"') && !components.includes('data-source="mockup-light-theme.html"')) {
    failures.push("Studio app must identify the light mockup as the app UI source");
  }

  if (app.includes("CriticalSurfaceLauncher")) {
    failures.push("Critical surface launcher should not appear as a global invented page block");
  }

  for (const verdict of allowedVerdicts) {
    if (!fixtures.includes(`"${verdict}"`) && !reportSchema.includes(`"${verdict}"`)) {
      failures.push(`Missing allowed verdict value: ${verdict}`);
    }
  }

  for (const banned of bannedVerdictText) {
    if (` ${app} ${fixtures} ${reportAdapter} `.toLowerCase().includes(banned)) {
      failures.push(`Banned verdict/workflow wording still present: ${banned.trim()}`);
    }
  }

  for (const privacyText of [
    "Local-only",
    "Sync off",
    "No source upload by default",
    "explicit consent",
    "redaction warning",
  ]) {
    if (!app.includes(privacyText) && !fixtures.includes(privacyText)) {
      failures.push(`Missing local-first/privacy marker: ${privacyText}`);
    }
  }

  if (!packageJson.includes('"smoke:visual"')) {
    failures.push("Missing Playwright visual smoke script");
  }

  for (const marker of [
    "buildReportDataState",
    "adaptCodePawlReport",
    "isCodePawlReport",
    "browser Studio cannot read arbitrary project files",
    "report-needs-evidence-ui-missing-e2e",
  ]) {
    if (!reportAdapter.includes(marker) && !reportFixtures.includes(marker) && !reportSchema.includes(marker)) {
      failures.push(`Missing report adapter marker: ${marker}`);
    }
  }

  if (!playwright.includes("screenshot") && !smoke.includes("screenshot")) {
    failures.push("Playwright smoke check must capture screenshots");
  }
}

if (failures.length > 0) {
  console.error("Studio verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Studio verification passed.");
