export type SurfaceKind = "browser" | "desktop" | "files" | "terminal";

export type TaskStatus = "draft" | "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "paused";

export type PermissionMode = "safe" | "balanced" | "manual";

export type RiskLevel = "low" | "medium" | "high" | "blocked";

export type Workspace = {
  id: string;
  name: string;
  plan: "trial" | "starter" | "pro" | "team";
  trialRunsRemaining?: number;
};

export type AgentTask = {
  id: string;
  title: string;
  status: TaskStatus;
  surface: SurfaceKind;
  createdAt: string;
  costUsd: number;
  screenshotCount: number;
  savedAsSkill: boolean;
};

export type AgentStep = {
  id: string;
  taskId: string;
  index: number;
  type: "observe" | "plan" | "act" | "verify" | "approval" | "error";
  title: string;
  detail: string;
  costUsd?: number;
  tokens?: number;
  status: "pending" | "running" | "passed" | "failed" | "blocked";
};

export type PermissionPolicy = {
  mode: PermissionMode;
  allowedSurfaces: Record<SurfaceKind, boolean>;
  askBefore: string[];
  neverAllow: string[];
  domainAllowlist: string[];
  domainDenylist: string[];
};

export type UsageBudget = {
  monthlyLimitUsd: number;
  currentSpendUsd: number;
  runLimitUsd: number;
  screenshotLimitPerRun: number;
  warnAtPercent: number;
};

export type TraceSummary = {
  runId: string;
  observationGraphNodes: number;
  candidateActions: number;
  modelCalls: number;
  contextPacketTokens: number;
};

export type SkillDraft = {
  id: string;
  name: string;
  sourceRunId: string;
  replayModelCalls: number;
  replaySavingsEstimateUsd: number;
};

export type MockRunState = {
  workspace: Workspace;
  activeTask: AgentTask;
  tasks: AgentTask[];
  steps: AgentStep[];
  permissionPolicy: PermissionPolicy;
  usageBudget: UsageBudget;
  traceSummary: TraceSummary;
  skillDraft: SkillDraft;
};

export const MVP_EXECUTABLE_SURFACES = ["browser"] as const satisfies readonly SurfaceKind[];

export const MVP_BLOCKED_SURFACES = ["desktop", "files", "terminal"] as const satisfies readonly SurfaceKind[];

export function isExecutableMvpSurface(surface: SurfaceKind): boolean {
  return surface === "browser";
}

export function createMockRunState(): MockRunState {
  const activeTask: AgentTask = {
    id: "task-competitor-pricing",
    title: "Research competitor pricing",
    status: "waiting_approval",
    surface: "browser",
    createdAt: "2026-06-25T16:00:00.000Z",
    costUsd: 0.42,
    screenshotCount: 1,
    savedAsSkill: false,
  };

  return {
    workspace: {
      id: "workspace-local-alpha",
      name: "Local Alpha Workspace",
      plan: "trial",
      trialRunsRemaining: 12,
    },
    activeTask,
    tasks: [
      activeTask,
      {
        id: "task-update-page",
        title: "Update pricing page copy",
        status: "paused",
        surface: "browser",
        createdAt: "2026-06-25T15:20:00.000Z",
        costUsd: 0.18,
        screenshotCount: 0,
        savedAsSkill: true,
      },
      {
        id: "task-check-dashboard",
        title: "Extract dashboard metrics",
        status: "succeeded",
        surface: "browser",
        createdAt: "2026-06-25T14:10:00.000Z",
        costUsd: 0.31,
        screenshotCount: 1,
        savedAsSkill: true,
      },
    ],
    steps: [
      {
        id: "step-observe-1",
        taskId: activeTask.id,
        index: 1,
        type: "observe",
        title: "Observe pricing page",
        detail: "Built a compact browser UI graph from DOM and accessibility data.",
        costUsd: 0.02,
        tokens: 620,
        status: "passed",
      },
      {
        id: "step-plan-1",
        taskId: activeTask.id,
        index: 2,
        type: "plan",
        title: "Rank candidate actions",
        detail: "Selected top browser actions without sending the full DOM to the model.",
        costUsd: 0.08,
        tokens: 2800,
        status: "passed",
      },
      {
        id: "step-act-1",
        taskId: activeTask.id,
        index: 3,
        type: "act",
        title: "Extract pricing cards",
        detail: "Read plan names, prices, feature lists, and CTA states.",
        costUsd: 0.19,
        tokens: 5100,
        status: "passed",
      },
      {
        id: "step-approval-1",
        taskId: activeTask.id,
        index: 4,
        type: "approval",
        title: "Approval required",
        detail: "Submit/export action is paused until the operator approves.",
        costUsd: 0.0,
        tokens: 0,
        status: "blocked",
      },
      {
        id: "step-verify-1",
        taskId: activeTask.id,
        index: 5,
        type: "verify",
        title: "Verify extracted table",
        detail: "Pending until approval resolves the final browser action.",
        costUsd: 0.13,
        tokens: 2200,
        status: "pending",
      },
    ],
    permissionPolicy: {
      mode: "safe",
      allowedSurfaces: {
        browser: true,
        desktop: false,
        files: false,
        terminal: false,
      },
      askBefore: ["submit", "download", "upload", "delete"],
      neverAllow: ["payment", "terminal_write", "filesystem_write"],
      domainAllowlist: ["example.com", "docs.example.com"],
      domainDenylist: ["bank.example", "checkout.example"],
    },
    usageBudget: {
      monthlyLimitUsd: 25,
      currentSpendUsd: 7.4,
      runLimitUsd: 1,
      screenshotLimitPerRun: 3,
      warnAtPercent: 80,
    },
    traceSummary: {
      runId: "run-local-alpha-1",
      observationGraphNodes: 17,
      candidateActions: 5,
      modelCalls: 2,
      contextPacketTokens: 11840,
    },
    skillDraft: {
      id: "skill-competitor-pricing",
      name: "Competitor pricing extraction",
      sourceRunId: "run-local-alpha-1",
      replayModelCalls: 0,
      replaySavingsEstimateUsd: 0.34,
    },
  };
}
