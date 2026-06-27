import { useEffect, useMemo, useState } from "react";
import { createMockRunState, MVP_BLOCKED_SURFACES } from "@codepawl/shared";
import type { CandidateRule, CandidateRuleStatus, MemoryReviewSnapshot, RunEvent, SurfaceKind } from "@codepawl/shared";
import type { SkillDefinition, SkillPromotionDecision, SkillRegistrySnapshot, SkillReplayPlan } from "@codepawl/shared";
import type { CodexExecutionPreview } from "./codepawlClient";

import { codepawl } from "./codepawlClient";
import "./styles.css";

const navItems = ["Run", "Tasks", "Dashboard", "Permissions", "Skills", "Usage", "Settings"];

const surfaceLabels: Record<SurfaceKind, string> = {
  repository: "Repository",
  browser: "Browser",
  desktop: "Desktop",
  files: "Files",
  terminal: "Terminal",
};

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function describeRunEvent(event: RunEvent): string {
  const summary = (event.payload as { summary?: unknown }).summary;
  return typeof summary === "string" ? summary : event.type.replaceAll("_", " ");
}

function titleCaseStatus(status: string): string {
  const normalized = status.replaceAll("_", " ");
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}% confidence`;
}

function updateMemoryRule(snapshot: MemoryReviewSnapshot, rule: CandidateRule): MemoryReviewSnapshot {
  const candidateRules = snapshot.candidateRules.map((item) => (item.id === rule.id ? rule : item));
  return {
    ...snapshot,
    candidateRules,
    summary: {
      ...snapshot.summary,
      candidateRuleStatusCounts: {
        candidate: candidateRules.filter((item) => item.status === "candidate").length,
        accepted: candidateRules.filter((item) => item.status === "accepted").length,
        rejected: candidateRules.filter((item) => item.status === "rejected").length,
        superseded: candidateRules.filter((item) => item.status === "superseded").length,
      },
    },
  };
}

function MemoryPanel({
  memoryReview,
  onReviewRule,
  onCopyRule,
}: {
  memoryReview: MemoryReviewSnapshot;
  onReviewRule: (rule: CandidateRule, status: Exclude<CandidateRuleStatus, "candidate">) => void;
  onCopyRule: (rule: CandidateRule) => void;
}) {
  const latestEpisode = memoryReview.latestEpisode ?? memoryReview.episodes[0];
  const candidateCount = memoryReview.summary.candidateRuleStatusCounts.candidate;

  return (
    <section className="memory-panel" aria-label="Memory review">
      <div className="memory-panel-header">
        <div>
          <p className="eyebrow">Local memory</p>
          <h2>Memory review</h2>
        </div>
        <strong>{candidateCount > 0 ? "Candidate" : "Reviewed"}</strong>
      </div>

      <div className="memory-episode">
        <span>{memoryReview.namespace.capabilityId} / {memoryReview.namespace.workspaceId}</span>
        <p>{latestEpisode?.summary ?? "No episode memory recorded yet."}</p>
        {latestEpisode ? (
          <small>
            provenance: {latestEpisode.provenance.runId} / {latestEpisode.provenance.taskId}
          </small>
        ) : null}
      </div>

      <div className="candidate-rule-list">
        {memoryReview.candidateRules.map((rule) => {
          const evidence = rule.evidence[0];
          const canReview = rule.status === "candidate";
          return (
            <article className={`candidate-rule candidate-rule-${rule.status}`} key={rule.id}>
              <div className="candidate-rule-topline">
                <h3>{rule.title}</h3>
                <div className="rule-status">
                  <span>Status</span>
                  <strong>{titleCaseStatus(rule.status)}</strong>
                </div>
              </div>
              <p>{rule.rule}</p>
              {evidence ? (
                <div className="rule-evidence">
                  <span>{evidence.kind}</span>
                  <strong>{confidenceLabel(evidence.confidence)}</strong>
                </div>
              ) : null}
              <small>provenance: {rule.provenance.runId}</small>
              {rule.redaction.applied ? <small>redaction applied: {rule.redaction.redactedPaths.join(", ")}</small> : null}
              <div className="candidate-rule-actions">
                <button type="button" onClick={() => onReviewRule(rule, "accepted")} disabled={!canReview} aria-label={`Accept ${rule.title}`}>
                  Accept
                </button>
                <button type="button" onClick={() => onReviewRule(rule, "rejected")} disabled={!canReview} aria-label={`Reject ${rule.title}`}>
                  Reject
                </button>
                <button type="button" onClick={() => onReviewRule(rule, "superseded")} disabled={!canReview} aria-label={`Mark superseded ${rule.title}`}>
                  Supersede
                </button>
                <button type="button" onClick={() => onCopyRule(rule)} aria-label={`Copy ${rule.title}`}>
                  Copy
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SkillRegistryPanel({
  skillRegistry,
  replayPlans,
  onPromoteSkill,
  onRejectSkill,
  onArchiveSkill,
  onCopySkill,
  onPreviewReplayPlan,
}: {
  skillRegistry: SkillRegistrySnapshot;
  replayPlans: Record<string, SkillReplayPlan>;
  onPromoteSkill: (skill: SkillDefinition) => void;
  onRejectSkill: (skill: SkillDefinition) => void;
  onArchiveSkill: (skill: SkillDefinition) => void;
  onCopySkill: (skill: SkillDefinition) => void;
  onPreviewReplayPlan: (skill: SkillDefinition) => void;
}) {
  const candidateCount = skillRegistry.summary.statusCounts.candidate;

  return (
    <section className="skill-panel" aria-label="Skill registry">
      <div className="memory-panel-header">
        <div>
          <p className="eyebrow">Manual skills</p>
          <h2>Skill registry</h2>
        </div>
        <strong>{candidateCount > 0 ? "Candidate" : "Reviewed"}</strong>
      </div>

      <div className="memory-episode">
        <span>{skillRegistry.namespace.capabilityId} / {skillRegistry.namespace.workspaceId}</span>
        <p>Candidate skills are inert until manually promoted. Replay is preview-only in this slice.</p>
      </div>

      <div className="candidate-rule-list">
        {skillRegistry.skills.map((skill) => {
          const canReview = skill.status === "candidate";
          const canArchive = skill.status !== "archived";
          const replayPlan = replayPlans[skill.id];
          return (
            <article className={`candidate-rule skill-card skill-card-${skill.status}`} key={skill.id}>
              <div className="candidate-rule-topline">
                <h3>{skill.title}</h3>
                <div className="rule-status">
                  <span>Status</span>
                  <strong>{titleCaseStatus(skill.status)}</strong>
                </div>
              </div>
              <p>{skill.summary}</p>
              <div className="skill-meta-grid">
                <span>rules: {skill.provenance.candidateRuleIds.join(", ") || "none"}</span>
                <span>episodes: {skill.provenance.episodeIds.join(", ") || "none"}</span>
                <span>runs: {skill.provenance.sourceRunIds.join(", ") || "none"}</span>
                <span>validation: {skill.validation.commands.join(", ") || "manual verifier evidence"}</span>
                <span>safety: {skill.safety.blockedActions.join(", ")}</span>
              </div>
              <div className="rule-evidence">
                <span>{skill.validation.expectedEvidenceKinds.join(", ")}</span>
                <strong>{confidenceLabel(skill.confidence)}</strong>
              </div>
              {skill.redaction.applied ? <small>redaction applied: {skill.redaction.redactedPaths.join(", ")}</small> : null}
              <div className="candidate-rule-actions">
                <button type="button" onClick={() => onPromoteSkill(skill)} disabled={!canReview} aria-label={`Promote manually ${skill.title}`}>
                  Promote manually
                </button>
                <button type="button" onClick={() => onRejectSkill(skill)} disabled={!canReview} aria-label={`Reject ${skill.title}`}>
                  Reject
                </button>
                <button type="button" onClick={() => onArchiveSkill(skill)} disabled={!canArchive} aria-label={`Archive ${skill.title}`}>
                  Archive
                </button>
                <button type="button" onClick={() => onPreviewReplayPlan(skill)} aria-label={`Preview dry-run plan ${skill.title}`}>
                  Preview dry-run plan
                </button>
                <button type="button" onClick={() => onCopySkill(skill)} aria-label={`Copy skill summary ${skill.title}`}>
                  Copy summary
                </button>
              </div>
              {replayPlan ? (
                <div className={`skill-replay-plan skill-replay-plan-${replayPlan.readiness}`} aria-label={`Replay plan for ${skill.title}`}>
                  <div className="skill-replay-topline">
                    <span>Dry-run only</span>
                    <strong>{titleCaseStatus(replayPlan.readiness)}</strong>
                  </div>
                  <p>{replayPlan.summary}</p>
                  <div className="skill-replay-grid">
                    <span>skill status: <strong>{titleCaseStatus(replayPlan.skillStatus)}</strong></span>
                    <span>mode: <strong>{titleCaseStatus(replayPlan.mode)}</strong></span>
                    {replayPlan.preconditions.length > 0 ? (
                      replayPlan.preconditions.map((item) => (
                        <span key={item.id}>
                          precondition: <strong>{item.id}</strong> {titleCaseStatus(item.status)}
                        </span>
                      ))
                    ) : (
                      <span>preconditions: <strong>none</strong></span>
                    )}
                    <span>blocked actions: <strong>{replayPlan.blockedActions.join(", ") || "none"}</strong></span>
                    <span>required approvals: <strong>{replayPlan.requiredApprovals.join(", ") || "none"}</strong></span>
                    <span>
                      validation commands: <strong>{replayPlan.validationExpectations.map((item) => item.command).join(", ") || "manual verifier evidence"}</strong>
                    </span>
                    <span>
                      budget: <strong>{replayPlan.budgetEstimate.estimatedSteps} steps / {replayPlan.budgetEstimate.estimatedCommands} commands /{" "}
                      {replayPlan.budgetEstimate.estimatedModelTokens.toLocaleString()} tokens</strong>
                    </span>
                    <span>expected artifacts: <strong>{replayPlan.expectedArtifacts.map((artifact) => artifact.kind).join(", ")}</strong></span>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CodexExecutionPanel({
  execution,
  onApprove,
  onShowBlocked,
}: {
  execution: CodexExecutionPreview;
  onApprove: () => void;
  onShowBlocked: () => void;
}) {
  const statusLabel = execution.status === "result_ready" ? "Result ready" : titleCaseStatus(execution.status);
  return (
    <section className={`execution-panel execution-panel-${execution.status}`} aria-label="Controlled Codex execution">
      <div className="memory-panel-header">
        <div>
          <p className="eyebrow">Controlled execution</p>
          <h2>Codex execution gate</h2>
        </div>
        <strong>{statusLabel}</strong>
      </div>
      <div className="execution-plan-grid">
        <span>
          plan <strong>{execution.planId}</strong>
        </span>
        <span>
          command <strong>{execution.command}</strong>
        </span>
        <span>
          contract <strong>{execution.contractArtifact}</strong>
        </span>
        <span>
          artifacts <strong>{execution.artifactRoot}</strong>
        </span>
      </div>
      <p>{execution.summary}</p>
      {execution.blockedReasons.length > 0 ? <p className="execution-blocked-reasons">blocked: {execution.blockedReasons.join(", ")}</p> : null}
      {execution.verificationSeparate ? <small>Verification remains separate after result import.</small> : null}
      <div className="candidate-rule-actions">
        <button type="button" onClick={onApprove} disabled={!execution.approvalRequired} aria-label="Approve Codex execution">
          Approve Codex execution
        </button>
        <button type="button" onClick={onShowBlocked} aria-label="Show blocked reason">
          Show blocked reason
        </button>
      </div>
    </section>
  );
}

function updateSkill(snapshot: SkillRegistrySnapshot, skill: SkillDefinition): SkillRegistrySnapshot {
  const skills = snapshot.skills.map((item) => (item.id === skill.id ? skill : item));
  return {
    ...snapshot,
    skills,
    summary: {
      ...snapshot.summary,
      statusCounts: {
        candidate: skills.filter((item) => item.status === "candidate").length,
        active: skills.filter((item) => item.status === "active").length,
        rejected: skills.filter((item) => item.status === "rejected").length,
        superseded: skills.filter((item) => item.status === "superseded").length,
        archived: skills.filter((item) => item.status === "archived").length,
      },
    },
  };
}

function App() {
  const runState = useMemo(() => createMockRunState(), []);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [approvalStatus, setApprovalStatus] = useState("Waiting for operator approval");
  const [currentRunId, setCurrentRunId] = useState(runState.traceSummary.runId);
  const [codexExecution, setCodexExecution] = useState<CodexExecutionPreview>(() => codepawl.createCodexExecutionPreview(runState.traceSummary.runId));
  const [memoryReview, setMemoryReview] = useState<MemoryReviewSnapshot>(runState.memoryReview);
  const [skillRegistry, setSkillRegistry] = useState<SkillRegistrySnapshot>(runState.skillRegistry);
  const [replayPlans, setReplayPlans] = useState<Record<string, SkillReplayPlan>>({});

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

    codepawl.onRunEvent((event) => {
      setEvents((current) => [...current, event]);
      if (event.type === "run_started") {
        setCurrentRunId(event.runId);
      }
      if (event.type === "action_blocked_or_approved") {
        setApprovalStatus(describeRunEvent(event));
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

  useEffect(() => {
    let mounted = true;
    codepawl.listSkills().then((skills) => {
      if (!mounted) {
        return;
      }
      setSkillRegistry((current) => ({
        ...current,
        skills,
        summary: {
          ...current.summary,
          skillCount: skills.length,
          statusCounts: {
            candidate: skills.filter((skill) => skill.status === "candidate").length,
            active: skills.filter((skill) => skill.status === "active").length,
            rejected: skills.filter((skill) => skill.status === "rejected").length,
            superseded: skills.filter((skill) => skill.status === "superseded").length,
            archived: skills.filter((skill) => skill.status === "archived").length,
          },
        },
      }));
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([codepawl.listMemoryEpisodes(), codepawl.listCandidateRules()]).then(([episodes, candidateRules]) => {
      if (!mounted) {
        return;
      }
      setMemoryReview((current) => ({
        ...current,
        latestEpisode: episodes[0],
        episodes,
        candidateRules,
      }));
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleRunTask = async () => {
    const run = await codepawl.createRun({
      goal: runState.activeTask.title,
      capabilityId: "coding-apprentice",
      taskId: runState.activeTask.id,
      workspaceId: runState.workspace.id,
      budget: {
        maxSteps: runState.runSummary.run.budget.maxSteps,
        maxWallTimeMs: runState.runSummary.run.budget.maxWallTimeMs,
        maxModelTokens: runState.runSummary.run.budget.maxModelTokens,
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

  const handleReviewRule = async (rule: CandidateRule, status: Exclude<CandidateRuleStatus, "candidate">) => {
    const updated = await codepawl.updateCandidateRuleStatus({
      id: rule.id,
      status,
      runId: currentRunId,
      supersededBy: status === "superseded" ? "candidate-rule-replacement-demo" : undefined,
    });
    setMemoryReview((current) => updateMemoryRule(current, updated));
  };

  const handleCopyRule = async (rule: CandidateRule) => {
    await navigator.clipboard?.writeText(rule.rule);
  };

  const skillDecision = (skill: SkillDefinition, decision: SkillPromotionDecision["decision"], reason: string): SkillPromotionDecision => ({
    skillId: skill.id,
    decision,
    actor: "operator",
    reason,
    runId: currentRunId,
    decidedAt: new Date().toISOString(),
    supersededBy: decision === "supersede" ? "skill-replacement-demo" : undefined,
  });

  const handlePromoteSkill = async (skill: SkillDefinition) => {
    const updated = await codepawl.promoteSkillManually(skillDecision(skill, "promote", "Manual promotion from reviewed skill panel."));
    setSkillRegistry((current) => updateSkill(current, updated));
  };

  const handleRejectSkill = async (skill: SkillDefinition) => {
    const updated = await codepawl.rejectSkill(skillDecision(skill, "reject", "Manual rejection from reviewed skill panel."));
    setSkillRegistry((current) => updateSkill(current, updated));
  };

  const handleArchiveSkill = async (skill: SkillDefinition) => {
    const updated = await codepawl.archiveSkill(skillDecision(skill, "archive", "Manual archive from reviewed skill panel."));
    setSkillRegistry((current) => updateSkill(current, updated));
  };

  const handleCopySkill = async (skill: SkillDefinition) => {
    await navigator.clipboard?.writeText(
      [
        `${skill.title} (${skill.status})`,
        skill.summary,
        `rules: ${skill.provenance.candidateRuleIds.join(", ")}`,
        `validation: ${skill.validation.commands.join(", ")}`,
        `safety: ${skill.safety.blockedActions.join(", ")}`,
      ].join("\n"),
    );
  };

  const handlePreviewReplayPlan = async (skill: SkillDefinition) => {
    const plan = await codepawl.createSkillReplayPlan(skill.id, currentRunId);
    setReplayPlans((current) => ({ ...current, [skill.id]: plan }));
  };

  const handleApproveCodexExecution = async () => {
    setCodexExecution((current) => ({
      ...current,
      status: "running",
      approvalRequired: false,
      summary: "Controlled Codex execution is running inside the managed sandbox.",
    }));
    const result = await codepawl.approveCodexExecution(currentRunId, codexExecution.planId);
    setCodexExecution(result);
  };

  const handleShowBlockedCodexExecution = async () => {
    const blocked = await codepawl.showBlockedCodexExecution(currentRunId, codexExecution.planId);
    setCodexExecution(blocked);
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
            <p className="eyebrow">Repository workspace</p>
            <h1>Run cockpit</h1>
          </div>
          <div className="run-status">
            <span>{runState.activeTask.status.replace("_", " ")}</span>
            <strong>{formatUsd(runState.activeTask.costUsd)}</strong>
          </div>
        </header>

        <section className="composer" aria-label="Task prompt">
          <p>{runState.activeTask.title}</p>
          <span>Mock runtime only. Codex execution and browser automation are intentionally not connected in this slice.</span>
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
            <h2>Approve protected repository action?</h2>
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

        <CodexExecutionPanel
          execution={codexExecution}
          onApprove={() => void handleApproveCodexExecution()}
          onShowBlocked={() => void handleShowBlockedCodexExecution()}
        />

        <section className="event-log" aria-label="Mock event stream">
          <h2>Event stream</h2>
          <p>{latestEvent ? `${describeRunEvent(latestEvent)} (${latestEvent.type})` : "Waiting for mock events"}</p>
          {events.map((event, index) => (
            <span key={`${event.type}-${index}`}>
              {describeRunEvent(event)} - run_event: {event.type}
            </span>
          ))}
        </section>

        <MemoryPanel memoryReview={memoryReview} onReviewRule={(rule, status) => void handleReviewRule(rule, status)} onCopyRule={(rule) => void handleCopyRule(rule)} />
        <SkillRegistryPanel
          skillRegistry={skillRegistry}
          replayPlans={replayPlans}
          onPromoteSkill={(skill) => void handlePromoteSkill(skill)}
          onRejectSkill={(skill) => void handleRejectSkill(skill)}
          onArchiveSkill={(skill) => void handleArchiveSkill(skill)}
          onCopySkill={(skill) => void handleCopySkill(skill)}
          onPreviewReplayPlan={(skill) => void handlePreviewReplayPlan(skill)}
        />
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
          <span>{runState.traceSummary.modelTokens.toLocaleString()} model tokens</span>
        </section>

        <section aria-label="Allowed surfaces">
          <p className="eyebrow">Allowed surfaces</p>
          <ul className="surface-list">
            <li>
              <span>Repository</span>
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
          <h2>{runState.traceSummary.eventCount} events</h2>
          <span>{runState.traceSummary.artifactCount} artifacts</span>
        </section>

        <section>
          <p className="eyebrow">Verifier</p>
          <h2>{runState.skillDraft.name}</h2>
          <span>Latest verdict: {runState.traceSummary.latestVerdict}</span>
        </section>
      </aside>
    </main>
  );
}

export default App;
