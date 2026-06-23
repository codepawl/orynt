import { useMemo, useState } from "react";
import darkLogo from "../../../assets/images/dark-logo.svg";
import {
  AppShell,
  CommandBlock,
  Drawer,
  EmptyState,
  EvidenceTable,
  FollowUpPrompt,
  MemoryCandidate,
  MetricCard,
  Modal,
  PageHeader,
  ProjectCard,
  ReportCard,
  RiskList,
  SessionCard,
  StatusChip,
  Table,
  Timeline,
  VerdictBadge,
} from "./components";
import {
  evidenceConsoleOrder,
  memories,
  pages,
  primarySession as fallbackPrimarySession,
  projects,
  sessions as fixtureSessions,
  type PageFixture,
  type PageId,
  type SessionFixture,
} from "./fixtures/studio-fixtures";
import { reportDataState } from "./fixtures/report-fixtures";
import { mockupInventory } from "./fixtures/mockup-source-map";
import { type ReportDataState } from "./reports/report-adapter";

function findPage(id: PageId) {
  return pages.find((page) => page.id === id) ?? pages[0];
}

function pageWithReportContext(page: PageFixture, primarySession: SessionFixture): PageFixture {
  if (page.id !== "session-detail") return page;
  return {
    ...page,
    title: primarySession.session,
    kicker: `${primarySession.branch} - ${primarySession.changedFileCount} files changed - ${primarySession.reportId}`,
  };
}

function evidenceCount(session: SessionFixture) {
  const passed = session.validationEvidence.filter((item) => item.status === "passed").length;
  return `${passed}/${session.validationEvidence.length}`;
}

function ReportDataNotice({ state }: { state: ReportDataState }) {
  const label =
    state.status === "report-backed"
      ? "Report JSON"
      : state.status === "empty"
        ? "No report JSON found"
        : "Malformed report data";

  return (
    <div className="report-data-notice">
      <div>
        <div className="card-title">Report Data Source <StatusChip tone={state.status === "report-backed" ? "evidence" : "warning"}>{label}</StatusChip></div>
        <p>{state.statusMessage}</p>
        <p className="muted">{state.bridgeNote}</p>
      </div>
      {state.errors.length > 0 ? (
        <div className="notice-errors">
          {state.errors.map((error) => <code key={error}>{error}</code>)}
        </div>
      ) : null}
    </div>
  );
}

function LocalSourceInventory() {
  return (
    <div className="source-map-strip" aria-label=".codex/ui inventory">
      {mockupInventory.map((source) => (
        <div key={source.file}>
          <strong>{source.file}</strong>
          <span>{source.role} - {source.drives}</span>
        </div>
      ))}
    </div>
  );
}

function OnboardingPage() {
  return (
    <div className="grid">
      <EmptyState />
      {["Add project folders", "Enable Codex integration", "Enable Claude Code integration", "Open generated sample report"].map((step, index) => (
        <div className="card span-3" key={step}>
          <div className="card-title">Step {index + 1}</div>
          <h3>{step}</h3>
          <p className="muted">Fixture mode keeps the flow local and does not require backend setup.</p>
        </div>
      ))}
    </div>
  );
}

function OverviewPage({
  onOpenSession,
  sessions,
  primarySession,
  reportState,
}: {
  onOpenSession: () => void;
  sessions: SessionFixture[];
  primarySession: SessionFixture;
  reportState: ReportDataState;
}) {
  const counts = useMemo(
    () =>
      sessions.reduce(
        (acc, session) => {
          acc[session.verdict] += 1;
          return acc;
        },
        { verified: 0, needs_evidence: 0, risky: 0, failed: 0, blocked: 0 },
      ),
    [sessions],
  );
  const nonVerified = sessions.filter((session) => session.verdict !== "verified");
  const primaryNextCheck = primarySession.validationEvidence.find((item) => item.status !== "passed")?.check ?? "inspect";

  return (
    <>
      <ReportDataNotice state={reportState} />
      <div className="attention-lead">
        <div>
          <div className="card-title">Most Urgent Decision <StatusChip tone="risk">High</StatusChip></div>
          <div className="attention-title">{primarySession.session} needs a report decision.</div>
          <p className="muted">{primarySession.reason} The console keeps the verdict, evidence, risk, and next action in one decision path.</p>
          <div className="card-actions">
            <button type="button" className="btn" onClick={onOpenSession}>Open session detail</button>
            <button type="button" className="btn secondary">Copy next command</button>
          </div>
        </div>
        <div className="signal-strip">
          <div className="signal-card"><span className="tiny">Evidence</span><strong>{evidenceCount(primarySession)}</strong><span className="muted">Checks found</span></div>
          <div className="signal-card"><span className="tiny">Risk</span><strong>{primarySession.risks.length}</strong><span className="muted">Open issues</span></div>
          <div className="signal-card"><span className="tiny">Scope</span><strong>{primarySession.changedFileCount}</strong><span className="muted">Changed files</span></div>
          <div className="signal-card"><span className="tiny">Action</span><strong>{primaryNextCheck}</strong><span className="muted">Next before ready</span></div>
        </div>
      </div>
      <div className="metric-row">
        <MetricCard title="AI Shipping Health" value="78" detail="Health summary. UI sessions need e2e evidence." tone="warning" />
        <MetricCard title="Verified Sessions" value={String(counts.verified)} detail="Passed required evidence checks." />
        <MetricCard title="Needs Evidence" value={String(counts.needs_evidence)} detail="Missing typecheck, e2e, or screenshot proof." />
        <MetricCard title="Risky Sessions" value={String(counts.risky)} detail="Scope drift or protected paths detected." />
      </div>
      <div className="grid">
        <div className="card span-5 tall">
          <div className="card-title">Needs Attention <StatusChip tone="warning">Actionable</StatusChip></div>
          <div className="list">{nonVerified.slice(0, 3).map((session) => <SessionCard key={session.id} session={session} />)}</div>
        </div>
        <div className="card span-7 tall">
          <div className="card-title">Recent Sessions</div>
          <Table>
            <thead><tr><th>Session</th><th>Agent</th><th>Verdict</th><th>Next action</th></tr></thead>
            <tbody>
              {sessions.slice(0, 4).map((session) => (
                <tr key={session.id}><td>{session.session}</td><td>{session.agent}</td><td><VerdictBadge verdict={session.verdict} /></td><td>{session.nextAction}</td></tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div className="card span-7">
          <div className="card-title">Weekly AI Shipping Funnel</div>
          <div className="funnel">
            {[42, 38, 24, 19, 15].map((value, index) => (
              <div key={value} className={index === 2 ? "funnel-step evidence" : "funnel-step"} style={{ height: `${48 + value}px` }}>{value}</div>
            ))}
          </div>
          <div className="chart-labels"><span>Captured</span><span>Analyzed</span><span>Evidence</span><span>Passed</span><span>Ready</span></div>
        </div>
        <div className="card span-5">
          <div className="card-title">Validation Coverage</div>
          {[
            ["test", "92"],
            ["typecheck", "76"],
            ["build", "68"],
            ["e2e", "41"],
          ].map(([label, value]) => (
            <div className="stack-row" key={label}><span>{label}</span><div className="progress"><span style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div>
          ))}
        </div>
      </div>
    </>
  );
}

function SessionsPage({ sessions, primarySession }: { sessions: SessionFixture[]; primarySession: SessionFixture }) {
  return (
    <div className="grid">
      <div className="card span-8 tall">
        <div className="card-title">Session Ledger</div>
        <Table>
          <thead><tr><th>Session</th><th>Project</th><th>Agent</th><th>Verdict</th><th>Next action</th></tr></thead>
          <tbody>{sessions.map((session) => <tr key={session.id}><td>{session.session}</td><td>{session.project}</td><td>{session.agent}</td><td><VerdictBadge verdict={session.verdict} /></td><td>{session.nextAction}</td></tr>)}</tbody>
        </Table>
      </div>
      <div className="card span-4 tall">
        <div className="card-title">Selected Session</div>
        <h3>{primarySession.session}</h3>
        <p className="muted">{primarySession.summary}</p>
        <div className="list">
          <div className="row"><span>Evidence</span><strong>{evidenceCount(primarySession)}</strong></div>
          <div className="row"><span>Risks</span><strong>{primarySession.risks.length}</strong></div>
          <div className="row"><span>Next</span><strong>{primarySession.nextAction}</strong></div>
        </div>
      </div>
    </div>
  );
}

function NeedsAttentionPage({ sessions }: { sessions: SessionFixture[] }) {
  const queue = sessions.filter((session) => session.verdict !== "verified");

  return (
    <div className="card">
      <div className="card-title">Decision Queue <StatusChip tone="warning">Evidence first</StatusChip></div>
      <div className="attention-board">
        {queue.length === 0 ? (
          <div className="empty-inline">
            <strong>No sessions need attention.</strong>
            <p className="muted">Generated report JSON currently contains only verified sessions.</p>
          </div>
        ) : queue.map((session) => (
          <div className="attention-row" key={session.id}>
            <StatusChip tone={session.verdict === "risky" || session.verdict === "failed" ? "risk" : "warning"}>{session.verdictLabel}</StatusChip>
            <div><strong>{session.session}</strong><p className="muted">{session.reason}</p></div>
            <div><strong>Evidence state</strong><p className="muted">{session.validationEvidence.find((item) => item.status !== "passed")?.evidence ?? "Evidence attached"}</p></div>
            <div><strong>Recommended action</strong><p className="mono tiny">{session.nextAction}</p></div>
            <strong>Open</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionDetailPage({ session }: { session: SessionFixture }) {
  return (
    <div className="grid" data-evidence-console-order={evidenceConsoleOrder.map((item) => item.id).join(",")}>
      <div className="decision-console span-12">
        <div>
          <div className="card-title">Verdict Hero <VerdictBadge verdict={session.verdict} /></div>
          <div className="decision-title">{session.summary}</div>
          <p className="muted">Main issue: {session.reason} Next action: {session.nextAction}</p>
          <div className="signal-strip">
            <div className="signal-card"><span className="tiny">Evidence</span><strong>{evidenceCount(session)}</strong><span className="muted">Checks found</span></div>
            <div className="signal-card"><span className="tiny">Scope</span><strong>{session.changedFileCount}</strong><span className="muted">Changed files</span></div>
            <div className="signal-card"><span className="tiny">Risks</span><strong>{session.risks.length}</strong><span className="muted">Detected risks</span></div>
            <div className="signal-card"><span className="tiny">Memory</span><strong>{session.memoryCandidate.startsWith("No memory") ? 0 : 1}</strong><span className="muted">Candidate rule</span></div>
          </div>
        </div>
        <CommandBlock command={session.nextAction} />
      </div>
      <div className="card span-4 tall">
        <div className="card-title">Changed Files</div>
        {["in_scope", "suspicious", "protected"].map((scope) => (
          <div className="file-group" key={scope}>
            <strong>{scope.replace("_", " ")}</strong>
            {session.changedFiles.filter((file) => file.scope === scope).map((file) => <code key={file.path}>{file.path}</code>)}
          </div>
        ))}
      </div>
      <div className="card span-8 tall">
        <div className="card-title">Evidence Audit Trail <StatusChip tone="evidence">Traceable</StatusChip></div>
        <div className="audit-list">
          {session.auditTrail.map((item) => (
            <div className="audit-item" key={`${item.status}-${item.detail}`}>
              <StatusChip tone={item.status === "passed" ? "verified" : item.status === "required" ? "risk" : "warning"}>{item.status}</StatusChip>
              <span>{item.detail}</span>
              <strong>{item.evidence}</strong>
            </div>
          ))}
        </div>
        <div className="card-title table-title">Validation Evidence</div>
        <EvidenceTable session={session} />
      </div>
      <div className="card span-4 tall">
        <div className="card-title">Risk List</div>
        <RiskList session={session} />
      </div>
      <div className="card span-4 tall">
        <div className="card-title">Timeline</div>
        <Timeline session={session} />
      </div>
      <div className="card span-4 tall">
        <div className="card-title">AI Diagnosis <StatusChip tone="ai">Evidence-bound</StatusChip></div>
        <p>{session.aiDiagnosis}</p>
      </div>
      <div className="card span-6">
        <div className="card-title">Follow-up Prompt</div>
        <FollowUpPrompt prompt={session.followUpPrompt} />
      </div>
      <div className="card span-6">
        <div className="card-title">Memory Candidate</div>
        <MemoryCandidate>{session.memoryCandidate}</MemoryCandidate>
      </div>
    </div>
  );
}

function ReportsPage({
  sessions,
  primarySession,
  reportState,
}: {
  sessions: SessionFixture[];
  primarySession: SessionFixture;
  reportState: ReportDataState;
}) {
  return (
    <div className="grid">
      <div className="span-12">
        <ReportDataNotice state={reportState} />
      </div>
      <div className="card span-8 tall">
        <div className="card-title">Report List</div>
        <Table>
          <thead><tr><th>Report</th><th>Verdict</th><th>Evidence</th><th>Formats</th></tr></thead>
          <tbody>{sessions.map((session) => <ReportCard key={session.id} session={session} />)}</tbody>
        </Table>
      </div>
      <div className="card span-4 tall">
        <div className="card-title">Selected Report Preview</div>
        <p className="muted">Reason: {primarySession.reason}</p>
        <div className="prompt">## CodePawl Session Report<br />Verdict: {primarySession.verdictLabel}<br />Next action: {primarySession.nextAction}</div>
        <Modal title="Export Report modal">Markdown and JSON exports stay local by default.</Modal>
      </div>
    </div>
  );
}

function ProjectsPage() {
  return (
    <div className="grid">
      <div className="card span-6 tall"><div className="card-title">Project Cards</div><div className="list">{projects.map((project) => <ProjectCard key={project.name} project={project} />)}</div></div>
      <div className="card span-6 tall"><div className="card-title">Project Policy</div><Table><tbody><tr><td>test</td><td><StatusChip tone="verified">Required</StatusChip></td></tr><tr><td>typecheck</td><td><StatusChip tone="verified">Required</StatusChip></td></tr><tr><td>build</td><td><StatusChip tone="verified">Required</StatusChip></td></tr><tr><td>e2e for UI</td><td><StatusChip tone="warning">Conditional</StatusChip></td></tr></tbody></Table></div>
    </div>
  );
}

function AgentsPage() {
  return (
    <div className="grid">
      {[
        ["Codex", "82%", "Best for implementation and UI iteration.", "Higher retry rate"],
        ["Claude Code", "88%", "Best for refactors and lower unrelated file touches.", "Low drift"],
        ["Cursor", "71%", "Best for docs and small review tasks.", "Needs validation follow-up"],
      ].map(([name, value, detail, chip]) => <MetricCard key={name} title={name} value={value} detail={`${detail} ${chip}`} />)}
      <div className="card span-12">
        <Table><thead><tr><th>Agent</th><th>Sessions</th><th>Ready</th><th>Risky</th><th>Missing evidence</th><th>Best task</th><th>Weak task</th></tr></thead><tbody><tr><td>Codex</td><td>14</td><td>82%</td><td>4</td><td>29%</td><td>UI iteration</td><td>Broad prompts</td></tr><tr><td>Claude Code</td><td>8</td><td>88%</td><td>1</td><td>13%</td><td>Refactors</td><td>Fast prototypes</td></tr><tr><td>Cursor</td><td>6</td><td>71%</td><td>1</td><td>34%</td><td>Docs</td><td>Validation-heavy work</td></tr></tbody></Table>
      </div>
    </div>
  );
}

function MemoryPage() {
  return (
    <div className="grid">
      <div className="card span-6 tall"><div className="card-title">Memory Cards</div><div className="list">{memories.map((memory) => <div className="row" key={memory.title}><div className="row-main"><div className="row-title">{memory.title}</div><div className="row-meta">{memory.detail}</div></div><StatusChip tone={memory.status === "policy" ? "primary" : "verified"}>{memory.status}</StatusChip></div>)}</div></div>
      <div className="card span-6 tall"><div className="card-title">Selected Memory</div><h3>UI tasks require e2e</h3><p className="muted">For codepawl/web UI tasks, require Playwright or screenshot proof before marking a session ready.</p><div className="prompt">type: validation rule<br />source: session #128<br />confidence: high<br />last used: today</div></div>
    </div>
  );
}

function IntegrationsPage() {
  return (
    <div className="grid">
      <div className="card span-6 tall"><div className="card-title">Session Sources</div><div className="list"><ProjectCard project={{ name: "Codex", detail: "Local session source connected and indexed.", status: "connected" }} /><ProjectCard project={{ name: "Claude Code", detail: "Session folder detected, indexing paused until confirmation.", status: "needs_evidence" }} /><ProjectCard project={{ name: "Filesystem artifacts", detail: "Reports and logs saved under ~/.codepawl.", status: "enabled" }} /></div></div>
      <div className="card span-6 tall"><div className="card-title">Publishing Targets</div><div className="list"><ProjectCard project={{ name: "GitHub PR comments", detail: "Not configured. Can publish compact session reports later.", status: "off" }} /><ProjectCard project={{ name: "Markdown export", detail: "Copy durable reports for issues, PRs, and notes.", status: "enabled" }} /><ProjectCard project={{ name: "JSON export", detail: "Structured report records for automation.", status: "enabled" }} /></div></div>
      <div className="card span-12"><Drawer title="GitHub Action Setup drawer"><p className="muted">Accountless setup preview. No source upload by default.</p></Drawer></div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="grid">
      <div className="card span-6 tall"><div className="card-title">Validation Policy</div><Table><tbody><tr><td>Required checks</td><td>test, typecheck, build</td></tr><tr><td>UI changes</td><td>Require e2e or screenshot proof</td></tr><tr><td>Missing evidence</td><td>Verdict becomes Needs Evidence</td></tr><tr><td>False validation claim</td><td>Flag as risk</td></tr></tbody></Table></div>
      <div className="card span-6 tall"><div className="card-title">Workspace Defaults</div><Table><tbody><tr><td>Data location</td><td className="mono">~/.codepawl</td></tr><tr><td>Sync mode</td><td>Local-only by default</td></tr><tr><td>Report formats</td><td>Markdown, JSON</td></tr><tr><td>Daemon</td><td>Enabled</td></tr></tbody></Table></div>
      <div className="card span-6"><div className="card-title">Protected Paths</div><div className="prompt">auth/**<br />billing/**<br />schema/**<br />database/**</div></div>
      <div className="card span-6"><div className="card-title">Privacy And Sync</div><p>Source code is not uploaded by default. Reports are generated from local session evidence and saved locally unless explicit sync is enabled.</p><Modal title="AI Analyze Consent modal">AI Analyze requires explicit consent and a redaction warning before diff/log/source upload.</Modal></div>
    </div>
  );
}

function ResponsiveReportReviewPage({ primarySession }: { primarySession: SessionFixture }) {
  return (
    <div className="viewport-gallery">
      {[
        ["mobile", "Mobile report review", "390 x 844"],
        ["tablet", "Tablet report review", "768 x 1024"],
        ["desktop", "Desktop report review", "1280 x 720"],
      ].map(([size, label, dimensions]) => (
        <div key={size}>
          <div className="viewport-label"><span>{label}</span><span>{dimensions}</span></div>
          <div className={`viewport-frame ${size}`}>
            <div className="review-top"><span className="brand"><img src={darkLogo} alt="CodePawl logo" />CodePawl Report</span><StatusChip>Local-only | Sync off</StatusChip></div>
            <div className="report-hero">
              <div className="report-hero-row"><div><div className="report-title">{primarySession.session}</div><p className="muted">{primarySession.branch} - {primarySession.changedFileCount} files - {primarySession.reportId}</p></div><span className="verdict-pill">{primarySession.verdictLabel}</span></div>
              <div className="report-stats"><div className="report-stat"><div className="stat-value">{evidenceCount(primarySession)}</div><div className="tiny">Checks</div></div><div className="report-stat"><div className="stat-value">{primarySession.risks.length}</div><div className="tiny">Risks</div></div><div className="report-stat"><div className="stat-value">{primarySession.memoryCandidate.startsWith("No memory") ? 0 : 1}</div><div className="tiny">Memory</div></div></div>
            </div>
            <div className="review-body"><CommandBlock command={primarySession.nextAction} /><div className="evidence-strip">{primarySession.validationEvidence.map((item) => <div className="evidence-item" key={item.check}><span className={`evidence-dot ${item.status}`} /><strong>{item.check}</strong><span className="tiny">{item.status}</span></div>)}</div><RiskList session={primarySession} /><MemoryCandidate>{primarySession.memoryCandidate}</MemoryCandidate></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function renderPage(
  active: PageId,
  onOpenSession: () => void,
  sessions: SessionFixture[],
  primarySession: SessionFixture,
  reportState: ReportDataState,
) {
  if (active === "onboarding") return <OnboardingPage />;
  if (active === "overview") return <OverviewPage onOpenSession={onOpenSession} sessions={sessions} primarySession={primarySession} reportState={reportState} />;
  if (active === "sessions") return <SessionsPage sessions={sessions} primarySession={primarySession} />;
  if (active === "needs-attention") return <NeedsAttentionPage sessions={sessions} />;
  if (active === "session-detail") return <SessionDetailPage session={primarySession} />;
  if (active === "reports") return <ReportsPage sessions={sessions} primarySession={primarySession} reportState={reportState} />;
  if (active === "projects") return <ProjectsPage />;
  if (active === "agents") return <AgentsPage />;
  if (active === "memory") return <MemoryPage />;
  if (active === "integrations") return <IntegrationsPage />;
  if (active === "settings") return <SettingsPage />;
  return <ResponsiveReportReviewPage primarySession={primarySession} />;
}

function App() {
  const [activePage, setActivePage] = useState<PageId>("overview");
  const reportSessions = reportDataState.sessions.length > 0 ? reportDataState.sessions : fixtureSessions;
  const primarySession = reportSessions[0] ?? fallbackPrimarySession;
  const currentPage: PageFixture = pageWithReportContext(findPage(activePage), primarySession);

  return (
    <main className="app-frame">
      <LocalSourceInventory />
      <AppShell activePage={activePage} currentPage={currentPage} onSelect={setActivePage}>
        <PageHeader page={currentPage} />
        {renderPage(activePage, () => setActivePage("session-detail"), reportSessions, primarySession, reportDataState)}
      </AppShell>
    </main>
  );
}

export default App;
