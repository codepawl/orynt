export * from "./runSpine";
export * from "./corePolicy";
export * from "./codexContracts";
export * from "./verifierContracts";

import { createMockRunSequence } from "./runSpine";
import type { PermissionMode } from "./corePolicy";
import type { RunEvent, RunSummary } from "./runSpine";

export type SurfaceKind = "repository" | "browser" | "desktop" | "files" | "terminal";

export type TaskStatus = "draft" | "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "paused";

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
  type: RunEvent["type"];
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
  eventCount: number;
  artifactCount: number;
  latestVerdict: string;
  modelTokens: number;
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
  runSummary: RunSummary;
  events: RunEvent[];
  skillDraft: SkillDraft;
};

export const MVP_EXECUTABLE_SURFACES = ["repository"] as const satisfies readonly SurfaceKind[];

export const MVP_BLOCKED_SURFACES = ["browser", "desktop", "files", "terminal"] as const satisfies readonly SurfaceKind[];

export function isExecutableMvpSurface(surface: SurfaceKind): boolean {
  return surface === "repository";
}

export function createMockRunState(): MockRunState {
  const mockRun = createMockRunSequence();
  const activeTask: AgentTask = {
    id: mockRun.run.taskId,
    title: mockRun.run.goal,
    status: "succeeded",
    surface: "repository",
    createdAt: "2026-06-25T16:00:00.000Z",
    costUsd: 0,
    screenshotCount: 0,
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
        title: "Refactor stale shared type",
        status: "paused",
        surface: "repository",
        createdAt: "2026-06-25T15:20:00.000Z",
        costUsd: 0.18,
        screenshotCount: 0,
        savedAsSkill: true,
      },
      {
        id: "task-check-dashboard",
        title: "Add validation test coverage",
        status: "succeeded",
        surface: "repository",
        createdAt: "2026-06-25T14:10:00.000Z",
        costUsd: 0.31,
        screenshotCount: 0,
        savedAsSkill: true,
      },
    ],
    steps: mockRun.events.map((event) => ({
      id: event.id,
      taskId: activeTask.id,
      index: event.sequence,
      type: event.type,
      title: event.type.replaceAll("_", " "),
      detail: String((event.payload as { summary?: unknown }).summary ?? event.type),
      costUsd: event.budget?.estimatedUsd,
      tokens: event.budget?.modelTokens,
      status: event.verdict?.status === "fail" ? "failed" : "passed",
    })),
    permissionPolicy: {
      mode: "safe",
      allowedSurfaces: {
        repository: true,
        browser: false,
        desktop: false,
        files: false,
        terminal: false,
      },
      askBefore: ["protected_path_change", "destructive_command", "network_access", "secret_access"],
      neverAllow: ["secret_exfiltration", "unapproved_filesystem_write", "unapproved_shell_command"],
      domainAllowlist: [],
      domainDenylist: [],
    },
    usageBudget: {
      monthlyLimitUsd: 25,
      currentSpendUsd: 7.4,
      runLimitUsd: 1,
      screenshotLimitPerRun: 3,
      warnAtPercent: 80,
    },
    traceSummary: {
      runId: mockRun.run.id,
      eventCount: mockRun.summary.eventCount,
      artifactCount: mockRun.summary.artifactCount,
      latestVerdict: mockRun.summary.latestVerdict?.status ?? "inconclusive",
      modelTokens: mockRun.summary.latestBudget?.modelTokens ?? 0,
    },
    runSummary: mockRun.summary,
    events: mockRun.events,
    skillDraft: {
      id: "candidate-memory-failing-test",
      name: "Candidate repository rule from verified correction",
      sourceRunId: mockRun.run.id,
      replayModelCalls: 0,
      replaySavingsEstimateUsd: 0,
    },
  };
}
