import { useEffect, useMemo, useState } from "react";
import type { RunEvent } from "@codepawl/ipc-contracts";
import { createMockRunState, MVP_BLOCKED_SURFACES } from "@codepawl/shared";
import type { SurfaceKind } from "@codepawl/shared";

import { codepawl } from "./codepawlClient";
import "./styles.css";

const navItems = ["Run", "Tasks", "Dashboard", "Permissions", "Skills", "Usage", "Settings"];

const surfaceLabels: Record<SurfaceKind, string> = {
  browser: "Browser",
  desktop: "Desktop",
  files: "Files",
  terminal: "Terminal",
};

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function describeRunEvent(event: RunEvent): string {
  if (event.type === "run.created") {
    return event.summary;
  }
  if (event.type === "run.step_added") {
    return event.summary;
  }

  return `Approval ${event.decision} for ${event.approvalId}`;
}

function App() {
  const runState = useMemo(() => createMockRunState(), []);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [approvalStatus, setApprovalStatus] = useState("Waiting for operator approval");
  const [currentRunId, setCurrentRunId] = useState(runState.traceSummary.runId);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

    codepawl.onRunEvent((event) => {
      setEvents((current) => [...current, event]);
      if (event.type === "run.created") {
        setCurrentRunId(event.runId);
      }
      if (event.type === "approval.resolved") {
        setApprovalStatus(`Approval ${event.decision} for ${event.approvalId}`);
      }
    }).then((listener) => {
      if (mounted) {
        unlisten = listener;
        return;
      }

      listener();
    });

    return () => {
      mounted = false;
      unlisten?.();
      codepawl.resetMockListenersForTest();
    };
  }, []);

  const handleRunTask = async () => {
    const run = await codepawl.createRun({
      task: runState.activeTask.title,
      surfaceKind: "browser",
      budgetPolicy: {
        maxSteps: 40,
        maxUsd: runState.usageBudget.runLimitUsd,
        stopOnBudgetExceeded: true,
      },
    });
    setCurrentRunId(run.id);
  };

  const handleApproval = async (decision: "approved" | "denied") => {
    await codepawl.approve({
      runId: currentRunId,
      approvalId: "approval-submit-1",
      decision,
    });
  };

  const latestEvent = events.at(-1);

  return (
    <main className="app-shell">
      <aside className="app-rail">
        <div className="brand-mark" aria-label="CodePawl">
          CP
        </div>
        <nav aria-label="Primary app navigation">
          {navItems.map((item) => (
            <a aria-current={item === "Run" ? "page" : undefined} href={item === "Run" ? "/app/run" : "#"} key={item}>
              {item}
            </a>
          ))}
        </nav>
      </aside>

      <aside className="task-sidebar" aria-label="Task sidebar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>{runState.workspace.name}</h2>
          <span>{runState.workspace.trialRunsRemaining} trial runs left</span>
        </div>
        <button type="button" onClick={handleRunTask}>
          Run task
        </button>
        <section aria-label="Active tasks">
          {runState.tasks.map((task) => (
            <article className="task-row" key={task.id}>
              <strong>{task.title}</strong>
              <span>{task.status.replace("_", " ")}</span>
            </article>
          ))}
        </section>
      </aside>

      <section className="run-surface">
        <header className="run-header">
          <div>
            <p className="eyebrow">Browser surface</p>
            <h1>Run cockpit</h1>
          </div>
          <div className="run-status">
            <span>{runState.activeTask.status.replace("_", " ")}</span>
            <strong>{formatUsd(runState.activeTask.costUsd)}</strong>
          </div>
        </header>

        <section className="composer" aria-label="Task prompt">
          <p>{runState.activeTask.title}</p>
          <span>Mock runtime only. Live sidecar and Playwright are intentionally not connected in this slice.</span>
        </section>

        <section className="timeline" aria-label="Run timeline">
          {runState.steps.map((step) => (
            <article className={`step-card step-card-${step.status}`} key={step.id}>
              <span>{String(step.index).padStart(2, "0")}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
              <strong>{step.type}</strong>
            </article>
          ))}
        </section>

        <section className="approval-card" aria-label="Approval request">
          <div>
            <p className="eyebrow">Approval center</p>
            <h2>Submit/export extracted pricing?</h2>
            <p>{approvalStatus}</p>
          </div>
          <div className="approval-actions">
            <button type="button" onClick={() => void handleApproval("approved")}>
              Approve step
            </button>
            <button type="button" onClick={() => void handleApproval("denied")}>
              Deny step
            </button>
          </div>
        </section>

        <section className="event-log" aria-label="Mock event stream">
          <h2>Event stream</h2>
          <p>{latestEvent ? `${describeRunEvent(latestEvent)} (${latestEvent.type})` : "Waiting for mock events"}</p>
          {events.map((event, index) => (
            <span key={`${event.type}-${index}`}>
              {describeRunEvent(event)} - run_event: {event.type}
            </span>
          ))}
        </section>
      </section>

      <aside className="run-inspector" aria-label="Run inspector">
        <section>
          <p className="eyebrow">Permission mode</p>
          <h2>{runState.permissionPolicy.mode[0].toUpperCase() + runState.permissionPolicy.mode.slice(1)}</h2>
          <span>Ask before: {runState.permissionPolicy.askBefore.join(", ")}</span>
        </section>

        <section>
          <p className="eyebrow">Budget</p>
          <h2>
            {formatUsd(runState.activeTask.costUsd)} / {formatUsd(runState.usageBudget.runLimitUsd)}
          </h2>
          <span>{runState.traceSummary.contextPacketTokens.toLocaleString()} context tokens</span>
        </section>

        <section aria-label="Allowed surfaces">
          <p className="eyebrow">Allowed surfaces</p>
          <ul className="surface-list">
            <li>
              <span>Browser</span>
              <strong>enabled</strong>
            </li>
            {MVP_BLOCKED_SURFACES.map((surface) => (
              <li key={surface}>
                <span>{surfaceLabels[surface]}</span>
                <strong>blocked</strong>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="eyebrow">Trace</p>
          <h2>{runState.traceSummary.observationGraphNodes} graph nodes</h2>
          <span>{runState.traceSummary.candidateActions} candidate actions</span>
        </section>

        <section>
          <p className="eyebrow">Skill draft</p>
          <h2>{runState.skillDraft.name}</h2>
          <span>Replay: {runState.skillDraft.replayModelCalls} model calls</span>
        </section>
      </aside>
    </main>
  );
}

export default App;
