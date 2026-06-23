import * as Dialog from "@radix-ui/react-dialog";
import { Search, ShieldCheck } from "lucide-react";
import { type ReactNode } from "react";
import darkLogo from "../../../assets/images/dark-logo.svg";
import {
  evidenceConsoleOrder,
  localContext,
  pages,
  type EvidenceStatus,
  type PageFixture,
  type PageId,
  type ProjectFixture,
  type SessionFixture,
  type Verdict,
} from "./fixtures/studio-fixtures";

export const verdictLabels: Record<Verdict, string> = {
  verified: "Verified",
  needs_evidence: "Needs Evidence",
  risky: "Risky",
  failed: "Failed",
  blocked: "Blocked",
};

function statusClass(status: EvidenceStatus | Verdict | string) {
  if (status === "verified" || status === "passed" || status === "connected" || status === "enabled") {
    return "verified";
  }
  if (status === "risky" || status === "failed") {
    return "risk";
  }
  if (status === "needs_evidence" || status === "missing" || status === "required") {
    return "warning";
  }
  if (status === "blocked") {
    return "muted";
  }
  return "primary";
}

export function StatusChip({ children, tone = "primary" }: { children: ReactNode; tone?: string }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <StatusChip tone={statusClass(verdict)}>{verdictLabels[verdict]}</StatusChip>;
}

export function Topbar({ page }: { page: PageFixture }) {
  return (
    <div className="topbar">
      <div className="brand">
        <img src={darkLogo} alt="CodePawl logo" />
        <span>{page.id === "session-detail" ? "Session Report" : "CodePawl Studio"}</span>
      </div>
      <div className="search">
        <Search size={15} />
        <span>{page.searchPlaceholder}</span>
      </div>
      <div className="header-actions">
        <span className="sync-pill">
          <span className="status-dot" />
          {localContext.mode}
        </span>
        <span className="icon-btn" title="Help">?</span>
        <span className="icon-btn" title="Notifications">!</span>
        <span className="avatar-btn">AX</span>
      </div>
    </div>
  );
}

export function Sidebar({
  activePage,
  onSelect,
  reportMode = false,
}: {
  activePage: PageId;
  onSelect: (page: PageId) => void;
  reportMode?: boolean;
}) {
  const grouped: Record<string, PageFixture[]> = reportMode
    ? {
        "Report Review": pages.filter((page) => page.id === "responsive-report-review"),
        "Report Sections": [],
      }
    : {
        Workspace: pages.filter((page) => page.navGroup === "Workspace" && page.id !== "onboarding"),
        Operate: pages.filter((page) => page.navGroup === "Operate"),
        Report: pages.filter((page) => page.navGroup === "Report"),
      };

  return (
    <aside className="sidebar">
      {Object.entries(grouped).map(([group, items]) => (
        <div className="nav-group" key={group}>
          <div className="nav-label">{group}</div>
          {items.length > 0
            ? items.map((page) => (
                <button
                  type="button"
                  key={page.id}
                  className={page.id === activePage ? "nav-item active" : "nav-item"}
                  onClick={() => onSelect(page.id)}
                >
                  <span>{page.label}</span>
                  {page.count ? <StatusChip tone={page.badge ?? "primary"}>{page.count}</StatusChip> : null}
                </button>
              ))
            : evidenceConsoleOrder.map((item) => (
                <div className="nav-item" key={item.id}>
                  <span>{item.label.replace(/ .*/, "")}</span>
                  <span>{item.id === "verdict" ? "Needs" : item.id === "evidence" ? "1/4" : ""}</span>
                </div>
              ))}
        </div>
      ))}
      <div className="sidebar-footer">
        <div className="footer-line"><span>Daemon</span><strong>{localContext.daemon}</strong></div>
        <div className="footer-line"><span>Sync</span><strong>{localContext.sync}</strong></div>
        <div className="footer-line"><span>Data</span><strong>{localContext.data}</strong></div>
        <div className="footer-line"><span>Version</span><strong>{localContext.version}</strong></div>
      </div>
    </aside>
  );
}

export function PageHeader({
  page,
  action,
}: {
  page: PageFixture;
  action?: ReactNode;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{page.title}</h1>
          <div className="page-kicker">{page.kicker}</div>
          <div className="source-note">{page.sourceSection}</div>
        </div>
        {action ?? (
          <div className="page-action">
            <StatusChip tone="verified">Local-first</StatusChip>
            <button type="button" className="btn">Analyze current repo</button>
          </div>
        )}
      </div>
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="control">All projects</span>
          <span className="control">7 days</span>
        </div>
        <div className="toolbar-right">
          <span className="control">Local-only</span>
          <span className="control">Sync off</span>
          <span className="control">Data {localContext.data}</span>
          <span className="control">No source upload by default</span>
        </div>
      </div>
    </>
  );
}

export function AppShell({
  activePage,
  currentPage,
  onSelect,
  children,
}: {
  activePage: PageId;
  currentPage: PageFixture;
  onSelect: (page: PageId) => void;
  children: ReactNode;
}) {
  return (
    <section className="screen" data-source="mockup-light-theme.html">
      <Topbar page={currentPage} />
      <div className="shell">
        <Sidebar activePage={activePage} onSelect={onSelect} reportMode={activePage === "responsive-report-review"} />
        <section className="main">{children}</section>
      </div>
    </section>
  );
}

export function MetricCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="card metric-card">
      <div className="card-title">
        {title} {tone ? <StatusChip tone={tone}>{tone === "warning" ? "Health summary" : tone}</StatusChip> : null}
      </div>
      <div className="metric">{value}</div>
      <p className="muted">{detail}</p>
    </div>
  );
}

export function SessionCard({ session }: { session: SessionFixture }) {
  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">{session.session}</div>
        <div className="row-meta">{session.project} - {session.reason}</div>
      </div>
      <VerdictBadge verdict={session.verdict} />
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectFixture }) {
  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">{project.name}</div>
        <div className="row-meta">{project.detail}</div>
      </div>
      <StatusChip tone={statusClass(project.status)}>{project.status === "needs_evidence" ? "Needs evidence" : project.status}</StatusChip>
    </div>
  );
}

export function ReportCard({ session }: { session: SessionFixture }) {
  return (
    <tr>
      <td>{session.session}</td>
      <td><VerdictBadge verdict={session.verdict} /></td>
      <td>{session.validationEvidence.filter((item) => item.status === "passed").length}/{session.validationEvidence.length} checks</td>
      <td>MD, JSON</td>
    </tr>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="table">{children}</table>;
}

export function EvidenceTable({ session }: { session: SessionFixture }) {
  return (
    <Table>
      <thead>
        <tr><th>Check</th><th>Status</th><th>Evidence</th></tr>
      </thead>
      <tbody>
        {session.validationEvidence.map((item) => (
          <tr key={item.check}>
            <td>{item.check}</td>
            <td><StatusChip tone={statusClass(item.status)}>{item.status}</StatusChip></td>
            <td>{item.evidence}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function RiskList({ session }: { session: SessionFixture }) {
  return (
    <div className="risk-rail">
      {session.risks.map((risk) => (
        <div key={risk.title}>
          <strong>{risk.severity} - {risk.title}</strong>
          <p className="muted">{risk.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function Timeline({ session }: { session: SessionFixture }) {
  return (
    <div className="report-mini-map">
      <div className="mini-map-line" />
      <div className="mini-map-items">
        {session.timeline.map((item) => (
          <div key={`${item.time}-${item.title}`}>
            <strong>{item.time} {item.title}</strong>
            <p className="muted">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommandBlock({ command }: { command: string }) {
  return (
    <div className="action-command">
      <div className="card-title">Recommended Action</div>
      <p>Copy the command before applying a readiness label.</p>
      <div className="command-line">{command}</div>
      <div className="card-actions"><button type="button" className="btn">Copy command</button></div>
    </div>
  );
}

export function FollowUpPrompt({ prompt }: { prompt: string }) {
  return (
    <div className="prompt">
      {prompt}
    </div>
  );
}

export function MemoryCandidate({ children }: { children: ReactNode }) {
  return (
    <div className="memory-candidate">
      <p>{children}</p>
      <div className="card-actions">
        <button type="button" className="btn">Save memory</button>
        <button type="button" className="btn secondary">Edit</button>
        <button type="button" className="btn secondary">Ignore</button>
      </div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="card span-12 empty-state">
      <ShieldCheck size={28} />
      <h3>Analyze your first agent session.</h3>
      <p className="muted">CodePawl will inspect changed files, validation evidence, risks, follow-up prompts, and memory candidates.</p>
    </div>
  );
}

export function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="btn secondary">{title}</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div>{children}</div>
          </Dialog.Description>
          <Dialog.Close asChild>
            <button type="button" className="btn">Close</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Drawer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="drawer-preview">
      <div className="card-title">{title}</div>
      {children}
    </div>
  );
}
