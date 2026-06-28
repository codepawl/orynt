import { useEffect, useMemo, useState } from "react";
import { createMockRunState, MVP_BLOCKED_SURFACES } from "@codepawl/shared";
import { Archive, Brain, CircleCheck, Code2, Info, LayoutDashboard, Megaphone, MessageSquare, Plus, Search, Send, Settings as SettingsIcon, ShieldCheck, Sparkles } from "lucide-react";
import type { CandidateRule, CandidateRuleStatus, MemoryReviewSnapshot, MockRunState, RunEvent, SurfaceKind } from "@codepawl/shared";
import type { SkillDefinition, SkillPromotionDecision, SkillRegistrySnapshot, SkillReplayPlan } from "@codepawl/shared";
import type { FormEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { CodexExecutionPreview } from "./codepawlClient";

import { codepawl } from "./codepawlClient";
import darkThemeLogo from "../../../assets/pictures/dark-theme-logo.svg";
import "./styles.css";

const topbarItems = [
  { href: "/app/cockpit", icon: "cockpit", label: "Cockpit" },
  { href: "#dashboard", icon: "dashboard", label: "Dashboard" },
] as const;

type TopbarView = "cockpit" | "dashboard";

const topbarIconMap = {
  cockpit: MessageSquare,
  dashboard: LayoutDashboard,
} satisfies Record<(typeof topbarItems)[number]["icon"], LucideIcon>;

type PurposeSpace = {
  id: string;
  label: string;
  purpose: string;
  badge: string;
  icon: LucideIcon;
};

const initialPurposeSpaces = [
  { id: "code", icon: Code2, label: "Code", purpose: "Repository fixes, tests, and implementation runs.", badge: "46" },
  { id: "marketing", icon: Megaphone, label: "Marketing", purpose: "Launch copy, positioning, and product narrative.", badge: "0" },
  { id: "research", icon: Search, label: "Research", purpose: "Evidence gathering, comparisons, and notes.", badge: "0" },
] satisfies PurposeSpace[];

const cockpitTabs = [
  { id: "chat", icon: MessageSquare, label: "Chat", summary: "Run the active workspace conversation.", badge: "live" },
  { id: "approvals", icon: ShieldCheck, label: "Approvals", summary: "Review protected actions before anything mutates the repository.", badge: "1" },
  { id: "memory", icon: Brain, label: "Memory", summary: "Inspect candidate rules before they become reusable behavior.", badge: "2" },
  { id: "skills", icon: Sparkles, label: "Skills", summary: "Promote, reject, archive, and preview manual skill replay plans.", badge: "1" },
  { id: "archive", icon: Archive, label: "Archive", summary: "Keep finished local runs out of the active conversation.", badge: "0" },
] as const;

type CockpitTabId = (typeof cockpitTabs)[number]["id"];
type CockpitTab = (typeof cockpitTabs)[number];

const surfaceLabels: Record<SurfaceKind, string> = {
  repository: "Repository",
  browser: "Browser",
  desktop: "Desktop",
  files: "Files",
  terminal: "Terminal",
};

const permissionModeOptions = [
  { value: "safe", label: "Safe", helper: "Ask before protected paths, destructive commands, network access, and secret access." },
  { value: "ask-first", label: "Ask first", helper: "Pause before every repository-affecting action in this workspace." },
  { value: "locked", label: "Locked", helper: "Keep the cockpit read-only until the operator re-enables controlled actions." },
] as const;

type PermissionModeOption = (typeof permissionModeOptions)[number]["value"];
type SurfaceToggleState = Record<SurfaceKind, boolean>;

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

function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function NoRunSelected() {
  return (
    <section className="empty-state empty-state-run" aria-label="No run selected">
      <strong>No run selected</strong>
      <p>Select a local repository task or start the fake Codex walkthrough to inspect a controlled run.</p>
      <span>No Codex process runs until an execution plan is approved, and verification remains a separate stage after result import.</span>
    </section>
  );
}

function EventStreamPanel({ events, latestEvent }: { events: RunEvent[]; latestEvent: RunEvent | undefined }) {
  return (
    <section className="event-stream-panel" aria-label="Mock event stream">
      <h2>Event stream</h2>
      <p>{latestEvent ? `${describeRunEvent(latestEvent)} (${latestEvent.type})` : "Waiting for mock events"}</p>
      <div>
        {events.map((event, index) => (
          <span key={`${event.type}-${index}`}>
            {describeRunEvent(event)} - run_event: {event.type}
          </span>
        ))}
      </div>
    </section>
  );
}

function VerifierEvidencePanel({ runState }: { runState: MockRunState }) {
  return (
    <section className="verifier-evidence-panel" aria-label="Verifier evidence">
      <div className="memory-panel-header">
        <div>
          <h2>Verifier evidence</h2>
          <span>{runState.skillDraft.name}</span>
        </div>
        <strong>{runState.traceSummary.latestVerdict}</strong>
      </div>
      <div className="verifier-evidence-grid">
        <span>
          verdict <strong>{runState.traceSummary.latestVerdict}</strong>
        </span>
        <span>
          trace <strong>{runState.traceSummary.eventCount} events</strong>
        </span>
        <span>
          artifacts <strong>{runState.traceSummary.artifactCount} captured</strong>
        </span>
      </div>
    </section>
  );
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
        <p>{latestEpisode?.summary ?? "No memory yet."}</p>
        {latestEpisode ? (
          <small>
            provenance: {latestEpisode.provenance.runId} / {latestEpisode.provenance.taskId}
          </small>
        ) : null}
      </div>

      <div className="candidate-rule-list">
        {memoryReview.candidateRules.length === 0 ? (
          <EmptyState title="No memory yet">Verified runs will create local episodes and candidate rules here after import and verifier evidence is available.</EmptyState>
        ) : null}
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
        <p>Candidate skills are inert until manually promoted. Replay is review-only until the operator promotes them.</p>
      </div>

      <div className="candidate-rule-list">
        {skillRegistry.skills.length === 0 ? (
          <>
            <EmptyState title="No skills yet">Promote reviewed candidate rules manually before any skill appears here.</EmptyState>
            <EmptyState title="No replay plan yet">Dry-run replay plans appear after a reviewed skill is available for preview.</EmptyState>
          </>
        ) : null}
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
              ) : (
                <EmptyState title="No replay plan yet">Preview dry-run plan to inspect steps, policy checks, approvals, and expected artifacts without execution.</EmptyState>
              )}
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
    <section className={`execution-control execution-control-${execution.status}`} aria-label="Controlled Codex execution">
      <div className="memory-panel-header">
        <div>
          <h2>Controlled execution</h2>
          <span>{execution.summary}</span>
        </div>
        <strong>{statusLabel}</strong>
      </div>
      <div className="execution-control-grid">
        <span>
          plan <strong>{execution.planId}</strong>
        </span>
        <span>
          contract <strong>{execution.contractArtifact}</strong>
        </span>
        <span>
          artifacts <strong>{execution.artifactRoot}</strong>
        </span>
      </div>
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

function App({
  initialRunState,
  initialSelectedRunId,
}: {
  initialRunState?: MockRunState;
  initialSelectedRunId?: string | null;
} = {}) {
  const runState = useMemo(() => initialRunState ?? createMockRunState(), [initialRunState]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [approvalStatus, setApprovalStatus] = useState("Waiting for operator approval");
  const [currentRunId, setCurrentRunId] = useState<string | null>(initialSelectedRunId === undefined ? runState.traceSummary.runId : initialSelectedRunId);
  const [codexExecution, setCodexExecution] = useState<CodexExecutionPreview>(() => codepawl.createCodexExecutionPreview(runState.traceSummary.runId));
  const [memoryReview, setMemoryReview] = useState<MemoryReviewSnapshot>(runState.memoryReview);
  const [skillRegistry, setSkillRegistry] = useState<SkillRegistrySnapshot>(runState.skillRegistry);
  const [replayPlans, setReplayPlans] = useState<Record<string, SkillReplayPlan>>({});
  const [composerValue, setComposerValue] = useState("");
  const [operatorMessages, setOperatorMessages] = useState<string[]>(() => [runState.activeTask.title]);
  const [purposeSpaces, setPurposeSpaces] = useState<PurposeSpace[]>(() => [...initialPurposeSpaces]);
  const [activePurposeSpaceId, setActivePurposeSpaceId] = useState("code");
  const [activeCockpitTab, setActiveCockpitTab] = useState<CockpitTabId>("chat");
  const [activeTopbarView, setActiveTopbarView] = useState<TopbarView>("cockpit");
  const [showRunInfo, setShowRunInfo] = useState(false);
  const [showSettingsSidebar, setShowSettingsSidebar] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionModeOption>(() => {
    const currentMode = runState.permissionPolicy.mode;
    return permissionModeOptions.some((option) => option.value === currentMode) ? (currentMode as PermissionModeOption) : "safe";
  });
  const [surfaceToggles, setSurfaceToggles] = useState<SurfaceToggleState>(() => ({
    repository: true,
    browser: !MVP_BLOCKED_SURFACES.includes("browser"),
    desktop: !MVP_BLOCKED_SURFACES.includes("desktop"),
    files: !MVP_BLOCKED_SURFACES.includes("files"),
    terminal: !MVP_BLOCKED_SURFACES.includes("terminal"),
  }));
  const shouldHydrateClientState = initialRunState === undefined;
  const permissionModeCopy = permissionModeOptions.find((option) => option.value === permissionMode) ?? permissionModeOptions[0];
  const orderedSurfaces = Object.keys(surfaceLabels) as SurfaceKind[];

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
    if (!shouldHydrateClientState) {
      return;
    }
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
  }, [shouldHydrateClientState]);

  useEffect(() => {
    if (!shouldHydrateClientState) {
      return;
    }
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
  }, [shouldHydrateClientState]);

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const goal = composerValue.trim();
    if (!goal) {
      return;
    }

    const run = await codepawl.createRun({
      goal,
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
    setOperatorMessages((current) => [...current, goal]);
    setComposerValue("");
  };

  const handleApproval = async (decision: "approved" | "denied") => {
    if (!currentRunId) {
      return;
    }
    await codepawl.approve({
      runId: currentRunId,
      approvalId: "approval-submit-1",
      decision,
    });
  };

  const handleReviewRule = async (rule: CandidateRule, status: Exclude<CandidateRuleStatus, "candidate">) => {
    if (!currentRunId) {
      return;
    }
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
    runId: currentRunId ?? undefined,
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
    const plan = await codepawl.createSkillReplayPlan(skill.id, currentRunId ?? undefined);
    setReplayPlans((current) => ({ ...current, [skill.id]: plan }));
  };

  const handleApproveCodexExecution = async () => {
    if (!currentRunId) {
      return;
    }
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
    if (!currentRunId) {
      return;
    }
    const blocked = await codepawl.showBlockedCodexExecution(currentRunId, codexExecution.planId);
    setCodexExecution(blocked);
  };

  const latestEvent = events.at(-1);
  const hasSelectedRun = currentRunId !== null;
  const isDashboardView = activeTopbarView === "dashboard";
  const activePurposeSpace = purposeSpaces.find((space) => space.id === activePurposeSpaceId) ?? purposeSpaces[0];
  const activeCockpitTabConfig = cockpitTabs.find((tab) => tab.id === activeCockpitTab) ?? cockpitTabs[0];
  const shellClassName = [
    "app-shell",
    isDashboardView ? "app-shell-dashboard" : "app-shell-cockpit",
    showSettingsSidebar ? "app-shell-settings-open" : "app-shell-settings-closed",
  ].join(" ");

  const handleSelectPurposeSpace = (spaceId: string) => {
    setActivePurposeSpaceId(spaceId);
    setActiveCockpitTab("chat");
    setActiveTopbarView("cockpit");
  };

  const handleCreatePurposeSpace = () => {
    const nextIndex = purposeSpaces.length + 1;
    const newSpace: PurposeSpace = {
      id: `workspace-${nextIndex}`,
      icon: MessageSquare,
      label: `Workspace ${nextIndex}`,
      purpose: "Custom cockpit purpose space.",
      badge: "new",
    };
    setPurposeSpaces((current) => [...current, newSpace]);
    setActivePurposeSpaceId(newSpace.id);
    setActiveCockpitTab("chat");
    setActiveTopbarView("cockpit");
  };

  const renderApprovalBubble = () => (
    <article className="chat-bubble chat-bubble-action" aria-label="Approval request">
      <span>Approval center</span>
      <h3>Approve protected repository action?</h3>
      <p>{approvalStatus}</p>
      <div className="approval-actions">
        <button type="button" onClick={() => void handleApproval("approved")}>
          Approve step
        </button>
        <button type="button" onClick={() => void handleApproval("denied")}>
          Deny step
        </button>
      </div>
    </article>
  );

  const renderRunInfoPanel = () => {
    if (!showRunInfo || !hasSelectedRun) {
      return null;
    }

    return (
      <aside className="run-info-panel" id="run-info-panel" aria-label="Run info">
        <CodexExecutionPanel
          execution={codexExecution}
          onApprove={() => void handleApproveCodexExecution()}
          onShowBlocked={() => void handleShowBlockedCodexExecution()}
        />
        <VerifierEvidencePanel runState={runState} />
        <EventStreamPanel events={events} latestEvent={latestEvent} />
      </aside>
    );
  };

  const renderDashboardPage = () => (
    <section className="chat-surface dashboard-surface" aria-label="Dashboard overview">
      <header className="run-header dashboard-chat-header">
        <div className="run-header-title">
          <h1>
            <LayoutDashboard className="channel-surface-icon" aria-hidden="true" strokeWidth={2} />
            <span>Dashboard</span>
          </h1>
          <span>Workspace health across active runs, approvals, memory, and verifier state.</span>
        </div>
        <div className="run-status" aria-label="Dashboard status">
          <strong className="run-status-chip">Local preview</strong>
        </div>
      </header>

      <div className="chat-thread dashboard-thread">
        <article className="chat-bubble chat-bubble-system dashboard-intro-bubble">
          <span>Overview</span>
          <h3>Dashboard is the compact cockpit overview.</h3>
          <p>Use it to scan the active run, budget, queues, and surface policy without opening Cockpit tabs.</p>
        </article>

        <section className="dashboard-metrics dashboard-metrics-chat" aria-label="Dashboard metrics">
          <article className="chat-bubble dashboard-metric">
            <span>Active run</span>
            <strong>{titleCaseStatus(runState.activeTask.status)}</strong>
            <small>{runState.activeTask.title}</small>
          </article>
          <article className="chat-bubble dashboard-metric">
            <span>Run spend</span>
            <strong>
              {formatUsd(runState.activeTask.costUsd)} / {formatUsd(runState.usageBudget.runLimitUsd)}
            </strong>
            <small>{runState.traceSummary.modelTokens.toLocaleString()} model tokens</small>
          </article>
          <article className="chat-bubble dashboard-metric">
            <span>Trace</span>
            <strong>{runState.traceSummary.eventCount} events</strong>
            <small>{runState.traceSummary.artifactCount} artifacts captured</small>
          </article>
          <article className="chat-bubble dashboard-metric">
            <span>Verifier</span>
            <strong>{runState.traceSummary.latestVerdict}</strong>
            <small>{runState.skillDraft.name}</small>
          </article>
        </section>

        <section className="dashboard-grid" aria-label="Dashboard work queues">
          <article className="chat-bubble dashboard-panel">
            <div className="dashboard-panel-header">
              <h2>Queues</h2>
              <span>Product status</span>
            </div>
            <div className="dashboard-row">
              <span>Approvals</span>
              <strong>1 pending</strong>
            </div>
            <div className="dashboard-row">
              <span>Memory rules</span>
              <strong>{memoryReview.summary.candidateRuleCount} reviewable</strong>
            </div>
            <div className="dashboard-row">
              <span>Skills</span>
              <strong>{skillRegistry.summary.skillCount} registered</strong>
            </div>
          </article>

          <article className="chat-bubble dashboard-panel">
            <div className="dashboard-panel-header">
              <h2>Allowed surfaces</h2>
              <span>Current toggles</span>
            </div>
            {orderedSurfaces.map((surface) => (
              <div className="dashboard-row" key={surface}>
                <span>{surfaceLabels[surface]}</span>
                <strong>{surfaceToggles[surface] ? "enabled" : "blocked"}</strong>
              </div>
            ))}
          </article>
        </section>
      </div>
    </section>
  );

  const renderCockpitTabs = () => (
    <nav className="cockpit-tabs" aria-label="Cockpit sections">
      {cockpitTabs.map((tab) => {
        const TabIcon = tab.icon;
        return (
          <button
            className="cockpit-tab"
            type="button"
            aria-pressed={activeCockpitTab === tab.id}
            onClick={() => setActiveCockpitTab(tab.id)}
            key={tab.id}
          >
            <TabIcon className="channel-icon" aria-hidden="true" strokeWidth={2} />
            <span>{tab.label}</span>
            <strong>{tab.badge}</strong>
          </button>
        );
      })}
    </nav>
  );

  const renderCockpitSurface = ({
    label,
    summary,
    children,
    showComposer = false,
  }: {
    label: string;
    summary: string;
    children: ReactNode;
    showComposer?: boolean;
  }) => (
    <section className="chat-surface" aria-label={label === "Chat" ? "Cockpit conversation" : `${label} tab`}>
      <header className="run-header">
        <div className="run-header-title">
          <h1>Cockpit</h1>
          <span>{activePurposeSpace.label} workspace / {label}</span>
          <small>{summary}</small>
        </div>
        <div className="run-header-actions">
          <div className="run-status" aria-label="Run status">
            <span className="run-status-chip run-status-chip-info">Active run</span>
            <span className="run-status-chip run-status-chip-warning">{titleCaseStatus(runState.activeTask.status)}</span>
            <span className="run-status-chip run-status-chip-success">
              <CircleCheck className="status-icon" aria-hidden="true" strokeWidth={2} />
              Verifier: {runState.traceSummary.latestVerdict}
            </span>
            <strong className="run-status-chip">{formatUsd(runState.activeTask.costUsd)}</strong>
          </div>
          <button
            className="run-info-toggle"
            type="button"
            aria-controls="run-info-panel"
            aria-expanded={showRunInfo}
            aria-label={showRunInfo ? "Close run info" : "Open run info"}
            onClick={() => setShowRunInfo((current) => !current)}
          >
            <Info className="run-info-icon" aria-hidden="true" strokeWidth={2} />
            <span>Info</span>
          </button>
        </div>
      </header>
      {renderCockpitTabs()}
      <div className={`chat-thread ${showComposer ? "" : "channel-chat-thread"}`}>{children}</div>
      {showComposer ? (
        <form className="chat-composer" aria-label="Cockpit composer" onSubmit={(event) => void handleTaskSubmit(event)}>
          <input
            aria-label="Repository task message"
            placeholder={`Describe the next ${activePurposeSpace.label} task...`}
            type="text"
            value={composerValue}
            onChange={(event) => setComposerValue(event.target.value)}
          />
          <button type="submit" disabled={composerValue.trim().length === 0}>
            <Send className="send-icon" aria-hidden="true" strokeWidth={2} />
            <span>Send task</span>
          </button>
        </form>
      ) : null}
    </section>
  );

  const renderCockpitContent = () => {
    if (!hasSelectedRun) {
      return <NoRunSelected />;
    }

    if (activeCockpitTab === "memory") {
      return renderCockpitSurface({
        label: activeCockpitTabConfig.label,
        summary: activeCockpitTabConfig.summary,
        children: (
          <>
          <article className="chat-bubble chat-bubble-system">
            <span>Memory</span>
            <h3>Candidate rules stay local and review-only.</h3>
            <p>Use this tab to inspect verified corrections before they become reusable behavior. Nothing is accepted until the operator chooses a review action.</p>
          </article>
          <article className="chat-bubble channel-workbench-bubble">
            <MemoryPanel memoryReview={memoryReview} onReviewRule={(rule, status) => void handleReviewRule(rule, status)} onCopyRule={(rule) => void handleCopyRule(rule)} />
          </article>
          </>
        ),
      });
    }

    if (activeCockpitTab === "skills") {
      return renderCockpitSurface({
        label: activeCockpitTabConfig.label,
        summary: activeCockpitTabConfig.summary,
        children: (
          <>
          <article className="chat-bubble chat-bubble-system">
            <span>Skills</span>
            <h3>Skills are promoted manually, then previewed as dry runs.</h3>
            <p>Use this tab to decide which reviewed rules deserve a reusable skill. Replay remains inspectable and non-executing in this preview.</p>
          </article>
          <article className="chat-bubble channel-workbench-bubble">
            <SkillRegistryPanel
              skillRegistry={skillRegistry}
              replayPlans={replayPlans}
              onPromoteSkill={(skill) => void handlePromoteSkill(skill)}
              onRejectSkill={(skill) => void handleRejectSkill(skill)}
              onArchiveSkill={(skill) => void handleArchiveSkill(skill)}
              onCopySkill={(skill) => void handleCopySkill(skill)}
              onPreviewReplayPlan={(skill) => void handlePreviewReplayPlan(skill)}
            />
          </article>
          </>
        ),
      });
    }

    if (activeCockpitTab === "approvals") {
      return renderCockpitSurface({
        label: activeCockpitTabConfig.label,
        summary: activeCockpitTabConfig.summary,
        children: (
          <>
          <article className="chat-bubble chat-bubble-system">
            <span>Approvals</span>
            <h3>Protected actions pause here before anything can mutate the repository.</h3>
            <p>Review the request, then approve or deny the step. The run stays blocked until a decision is recorded.</p>
          </article>
          {renderApprovalBubble()}
          </>
        ),
      });
    }

    if (activeCockpitTab === "archive") {
      return renderCockpitSurface({
        label: activeCockpitTabConfig.label,
        summary: activeCockpitTabConfig.summary,
        children: (
          <>
          <article className="chat-bubble chat-bubble-system">
            <span>Archive</span>
            <h3>Finished local runs will move here after completion.</h3>
            <p>Archive keeps old run context out of active tabs while preserving the path back to evidence, approvals, verifier output, and memory decisions.</p>
          </article>
          <article className="chat-bubble channel-empty-row">
            <span>Empty history</span>
            <h3>No archived repository runs yet.</h3>
            <p>The active run remains available in Chat until the workflow has a finished local result to file away.</p>
          </article>
          </>
        ),
      });
    }

    return renderCockpitSurface({
      label: activeCockpitTabConfig.label,
      summary: activeCockpitTabConfig.summary,
      showComposer: true,
      children: (
        <>
          {operatorMessages.map((message, index) => (
            <article className="chat-bubble chat-bubble-user" key={`${message}-${index}`}>
              <span>Operator</span>
              <p>{message}</p>
            </article>
          ))}
          <article className="chat-bubble chat-bubble-system">
            <span>CodePawl</span>
            <p>Controlled runtime only. Codex execution and browser automation require an approved connector before they run.</p>
          </article>
          <article className="chat-bubble chat-bubble-system">
            <span>CodePawl</span>
            <p>Verifier evidence stays separate from result import. Open run info for execution state and event stream details.</p>
          </article>
          <article className="chat-bubble chat-bubble-verifier" aria-label="Verifier evidence summary">
            <span>Verifier</span>
            <h3>{runState.traceSummary.latestVerdict}</h3>
            <p>{runState.skillDraft.name}</p>
            <small>
              {runState.traceSummary.artifactCount} artifacts attached to {runState.traceSummary.eventCount} trace events.
            </small>
          </article>
          {renderApprovalBubble()}
        </>
      ),
    });
  };

  return (
    <main className={shellClassName}>
      <header className="topbar" aria-label="Primary app top bar">
        <button className="topbar-brand" type="button" aria-label="Open Cockpit" onClick={() => setActiveTopbarView("cockpit")}>
          <img src={darkThemeLogo} alt="" width="40" height="40" />
          <span>CodePawl</span>
        </button>
        <nav aria-label="Primary app navigation">
          {topbarItems.map((item) => (
            (() => {
              const TopbarItemIcon = topbarIconMap[item.icon];
              return (
                <a
                  aria-current={(item.label === "Cockpit" && activeTopbarView === "cockpit") || (item.label === "Dashboard" && activeTopbarView === "dashboard") ? "page" : undefined}
                  href={item.href}
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveTopbarView(item.label === "Dashboard" ? "dashboard" : "cockpit");
                  }}
                  key={item.label}
                >
                  <TopbarItemIcon className="nav-icon" aria-hidden="true" strokeWidth={2} />
                  <span>{item.label}</span>
                </a>
              );
            })()
          ))}
        </nav>
        <div className="topbar-actions">
          <button
            className="topbar-icon-button"
            type="button"
            aria-controls="settings-sidebar"
            aria-expanded={showSettingsSidebar}
            aria-label="Toggle settings"
            title="Settings"
            onClick={() => setShowSettingsSidebar((current) => !current)}
          >
            <SettingsIcon className="nav-icon" aria-hidden="true" strokeWidth={2} />
          </button>
        </div>
      </header>

      {!isDashboardView ? (
        <aside className="channel-sidebar purpose-sidebar">
          <div className="purpose-sidebar-header">
            <div>
              <span>Purpose spaces</span>
              <strong>{runState.workspace.name}</strong>
            </div>
            <button className="purpose-add-button" type="button" aria-label="Create purpose space" title="Create purpose space" onClick={handleCreatePurposeSpace}>
              <Plus className="channel-icon" aria-hidden="true" strokeWidth={2} />
            </button>
          </div>
          <nav aria-label="Purpose spaces">
            {purposeSpaces.map((space) => {
              const SpaceIcon = space.icon;
              return (
                <button
                  className="purpose-space-button"
                  type="button"
                  aria-pressed={activePurposeSpace.id === space.id}
                  onClick={() => handleSelectPurposeSpace(space.id)}
                  key={space.id}
                >
                  <SpaceIcon className="channel-icon" aria-hidden="true" strokeWidth={2} />
                  <span>{space.label}</span>
                  <small>{space.purpose}</small>
                  <strong>{space.badge}</strong>
                </button>
              );
            })}
          </nav>
        </aside>
      ) : null}

      <section className={`run-surface ${isDashboardView ? "run-surface-dashboard" : "run-surface-cockpit"}`}>
        {isDashboardView ? (
          renderDashboardPage()
        ) : (
          <>
            {renderRunInfoPanel()}
            {renderCockpitContent()}
          </>
        )}
      </section>

      {showSettingsSidebar ? (
        <aside className="settings-sidebar" id="settings-sidebar" aria-label="Settings">
          <div className="settings-header">
            <div>
              <strong>Settings</strong>
              <span>Workspace controls</span>
            </div>
          </div>

          <section className="settings-control" aria-label="Permission mode">
            <label htmlFor="permission-mode">Permission mode</label>
            <select id="permission-mode" value={permissionMode} onChange={(event) => setPermissionMode(event.target.value as PermissionModeOption)}>
              {permissionModeOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span>{permissionModeCopy.helper}</span>
          </section>

          <section className="settings-metric" aria-label="Run limits">
            <span>Run limits</span>
            <strong>
              {formatUsd(runState.activeTask.costUsd)} / {formatUsd(runState.usageBudget.runLimitUsd)}
            </strong>
            <small>{runState.traceSummary.modelTokens.toLocaleString()} model tokens</small>
          </section>

          <section className="surface-switcher" aria-label="Allowed surfaces">
            <h2>Allowed surfaces</h2>
            {orderedSurfaces.map((surface) => (
              <button
                className="surface-switch"
                type="button"
                role="switch"
                aria-checked={surfaceToggles[surface]}
                onClick={() => setSurfaceToggles((current) => ({ ...current, [surface]: !current[surface] }))}
                key={surface}
              >
                <span>{surfaceLabels[surface]}</span>
                <strong>{surfaceToggles[surface] ? "enabled" : "blocked"}</strong>
              </button>
            ))}
          </section>

          <section className="settings-metric" aria-label="Trace">
            <span>Trace</span>
            <strong>{runState.traceSummary.eventCount} events</strong>
            <small>{runState.traceSummary.artifactCount} artifacts</small>
          </section>

          <section className="settings-metric" aria-label="Verifier">
            <span>Verifier</span>
            <strong>{runState.skillDraft.name}</strong>
            <small>Latest verdict: {runState.traceSummary.latestVerdict}</small>
          </section>
        </aside>
      ) : null}
    </main>
  );
}

export default App;
