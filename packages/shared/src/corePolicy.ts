import type { Actor, ArtifactRef, RunEventDraft, RunStore, SafetySnapshot } from "./runSpine";

export type PermissionMode = "manual" | "safe" | "balanced" | "experimental";

export type ActionRisk = "low" | "medium" | "high" | "blocked";

export type PolicyDecisionKind = "allow" | "require_approval" | "block";

export type RepositoryScope = {
  repositoryPath: string;
  worktreePath: string;
  baseRef: string;
  allowedPaths: string[];
  protectedPaths: string[];
};

export type CommandPolicy = {
  allowlist: string[];
  blockedCommands: string[];
  approvalRequiredCommands: string[];
  blockShellOutsideAllowlist: boolean;
};

export type FileWritePolicy = {
  allowedGlobs: string[];
  protectedGlobs: string[];
  maxChangedFiles: number;
  maxFileBytes: number;
  broadWriteRequiresApproval: boolean;
};

export type NetworkPolicy = {
  default: "deny" | "require_approval" | "allow";
  allowlist: string[];
  blocklist: string[];
};

export type SandboxBudget = {
  maxWallTimeMs: number;
  maxSteps: number;
  maxChangedFiles: number;
  maxOutputBytes: number;
  maxProcessCount: number;
  maxModelTokens: number;
};

export type SandboxProfile = {
  id: string;
  mode: "dry_run" | "planned_worktree";
  repository: RepositoryScope;
  budget: SandboxBudget;
  commandPolicy: CommandPolicy;
  fileWritePolicy: FileWritePolicy;
  networkPolicy: NetworkPolicy;
};

export type CorePolicy = {
  id: string;
  capabilityId: string;
  permissionMode: PermissionMode;
  defaultRisk: ActionRisk;
  sandbox: SandboxProfile;
  immutableFields: string[];
  secretAccess: "deny" | "require_approval";
};

export type PolicyViolation = {
  code:
    | "blocked_command"
    | "command_not_allowlisted"
    | "protected_path"
    | "broad_filesystem_write"
    | "network_denied"
    | "secret_access"
    | "budget_exceeded"
    | "unsafe_repository_path"
    | "repository_not_git"
    | "sandbox_unmanaged";
  message: string;
  evidence: string[];
};

export type PolicyAction = {
  id: string;
  kind: "command" | "file_write" | "network" | "secret_access" | "sandbox_plan" | "sandbox_create";
  summary: string;
  command?: string;
  paths?: string[];
  networkHost?: string;
  estimatedChangedFiles?: number;
};

export type PolicyDecision = {
  id: string;
  actionId: string;
  decision: PolicyDecisionKind;
  risk: ActionRisk;
  reasons: string[];
  violations: PolicyViolation[];
  approvalRequired: boolean;
};

export interface PolicyEngine {
  evaluateAction(action: PolicyAction, policy: CorePolicy): PolicyDecision;
  requireApproval(action: PolicyAction, policy: CorePolicy, reasons: string[]): PolicyDecision;
  blockAction(action: PolicyAction, policy: CorePolicy, violations: PolicyViolation[]): PolicyDecision;
  explainDecision(decision: PolicyDecision): string;
}

export type SandboxPlanRequest = {
  runId: string;
  taskId: string;
  repositoryPath: string;
  baseRef: string;
};

export type SandboxPlan = {
  id: string;
  runId: string;
  taskId: string;
  repositoryPath: string;
  plannedWorktreePath: string;
  baseRef: string;
  dryRun: true;
  profile: SandboxProfile;
  commands: string[];
  cleanupRequired: boolean;
};

export type RepositoryInspection = {
  repositoryPath: string;
  gitRoot: string;
  currentBranch: string | null;
  currentCommit: string;
  isDirty: boolean;
  hasRemote: boolean;
  remotes: string[];
};

export type WorktreePlan = {
  id: string;
  runId: string;
  taskId: string;
  repositoryPath: string;
  gitRoot: string;
  baseRef: string;
  branchName: string;
  worktreePath: string;
  gitArgs: string[];
  policyDecision: PolicyDecision;
};

export type RepositorySandbox = {
  id: string;
  runId: string;
  taskId: string;
  repositoryPath: string;
  gitRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  currentCommit: string;
  createdAt: string;
};

export type SandboxCleanupPlan = {
  sandboxId: string;
  runId?: string;
  worktreePath?: string;
  branchName?: string;
  dryRun: true;
  blocked: boolean;
  reasons: string[];
  gitArgs: string[][];
};

export type RepositorySandboxError = {
  code:
    | "path_not_found"
    | "path_not_directory"
    | "unsafe_repository_path"
    | "repository_out_of_scope"
    | "repository_not_git"
    | "policy_denied"
    | "approval_required"
    | "worktree_create_failed"
    | "sandbox_not_found";
  message: string;
  evidence: string[];
};

export interface SandboxManager {
  inspectRepository(request: SandboxPlanRequest, policy: CorePolicy): Promise<RepositoryInspection>;
  planRepositorySandbox(request: SandboxPlanRequest, policy: CorePolicy): SandboxPlan;
  planWorktree(request: SandboxPlanRequest, policy: CorePolicy, inspection: RepositoryInspection): WorktreePlan;
  createRepositorySandbox(request: SandboxPlanRequest, policy: CorePolicy): Promise<RepositorySandbox>;
  createWorktree(plan: WorktreePlan): Promise<RepositorySandbox>;
  listSandboxes(): Promise<RepositorySandbox[]>;
  cleanupSandboxPlan(sandboxId: string, runId?: string): Promise<SandboxCleanupPlan>;
}

const DANGEROUS_COMMAND_PATTERN = /\b(git\s+(?:push|merge)|git\s+branch\s+-D|rm\s+-rf|sudo|curl|wget)\b/i;

const DEFAULT_COMMAND_POLICY: CommandPolicy = {
  allowlist: ["git status", "git diff", "pnpm test", "pnpm test:contracts", "pnpm test:desktop", "pnpm build:desktop"],
  blockedCommands: ["git push", "git merge", "git branch -D", "rm -rf", "sudo", "credential", "secret"],
  approvalRequiredCommands: ["pnpm install", "npm install", "yarn install", "bun install"],
  blockShellOutsideAllowlist: true,
};

const DEFAULT_FILE_WRITE_POLICY: FileWritePolicy = {
  allowedGlobs: ["apps/**", "packages/**", ".codex/**", "README.md", "PRODUCT.md"],
  protectedGlobs: [".git/**", ".env", ".env.*", "**/*secret*", "**/*credential*", "pnpm-lock.yaml", "apps/desktop/src-tauri/Cargo.lock"],
  maxChangedFiles: 12,
  maxFileBytes: 200_000,
  broadWriteRequiresApproval: true,
};

const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  default: "deny",
  allowlist: [],
  blocklist: ["*"],
};

export function createDefaultSandboxBudget(): SandboxBudget {
  return {
    maxWallTimeMs: 30 * 60 * 1000,
    maxSteps: 40,
    maxChangedFiles: 12,
    maxOutputBytes: 2_000_000,
    maxProcessCount: 4,
    maxModelTokens: 120_000,
  };
}

export function createConservativeCodingApprenticePolicy(
  repositoryPath = "/workspace/repository",
  worktreePath = "/workspace/codepawl-worktrees/run-dry-run",
): CorePolicy {
  const repository: RepositoryScope = {
    repositoryPath,
    worktreePath,
    baseRef: "HEAD",
    allowedPaths: ["apps/**", "packages/**", ".codex/**", "README.md", "PRODUCT.md"],
    protectedPaths: DEFAULT_FILE_WRITE_POLICY.protectedGlobs,
  };

  return {
    id: "core-policy-coding-apprentice-safe",
    capabilityId: "coding-apprentice",
    permissionMode: "safe",
    defaultRisk: "blocked",
    secretAccess: "deny",
    immutableFields: ["permissionMode", "secretAccess", "sandbox.commandPolicy", "sandbox.networkPolicy"],
    sandbox: {
      id: "sandbox-coding-apprentice-dry-run",
      mode: "dry_run",
      repository,
      budget: createDefaultSandboxBudget(),
      commandPolicy: DEFAULT_COMMAND_POLICY,
      fileWritePolicy: DEFAULT_FILE_WRITE_POLICY,
      networkPolicy: DEFAULT_NETWORK_POLICY,
    },
  };
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function pathLooksProtected(path: string, protectedGlobs: string[]): boolean {
  return protectedGlobs.some((glob) => {
    const normalizedGlob = glob.replaceAll("**/", "").replaceAll("/**", "");
    return path === normalizedGlob || path.includes(normalizedGlob.replaceAll("*", ""));
  });
}

function createDecision(action: PolicyAction, decision: PolicyDecisionKind, risk: ActionRisk, reasons: string[], violations: PolicyViolation[]): PolicyDecision {
  return {
    id: `policy-decision-${action.id}`,
    actionId: action.id,
    decision,
    risk,
    reasons,
    violations,
    approvalRequired: decision === "require_approval",
  };
}

export class ConservativePolicyEngine implements PolicyEngine {
  evaluateAction(action: PolicyAction, policy: CorePolicy): PolicyDecision {
    if (action.kind === "secret_access") {
      return this.blockAction(action, policy, [
        { code: "secret_access", message: "Secret access is denied by the default Coding Apprentice policy.", evidence: [action.summary] },
      ]);
    }

    if (action.kind === "network") {
      if (policy.sandbox.networkPolicy.default === "deny") {
        return this.blockAction(action, policy, [
          { code: "network_denied", message: "Network access is denied unless explicitly approved in a future policy.", evidence: [action.networkHost ?? action.summary] },
        ]);
      }
      return this.requireApproval(action, policy, ["Network access requires operator approval."]);
    }

    if (action.kind === "command") {
      const command = normalizeCommand(action.command ?? "");
      if (!command) {
        return this.blockAction(action, policy, [
          { code: "command_not_allowlisted", message: "Command text is required for command actions.", evidence: [action.summary] },
        ]);
      }
      if (DANGEROUS_COMMAND_PATTERN.test(command) || policy.sandbox.commandPolicy.blockedCommands.some((blocked) => command.includes(blocked))) {
        return this.blockAction(action, policy, [
          { code: "blocked_command", message: "Destructive or privileged command is blocked by default.", evidence: [command] },
        ]);
      }
      if (policy.sandbox.commandPolicy.approvalRequiredCommands.some((approval) => command.includes(approval))) {
        return this.requireApproval(action, policy, ["Dependency installation and environment-changing commands require approval."]);
      }
      if (policy.sandbox.commandPolicy.blockShellOutsideAllowlist && !policy.sandbox.commandPolicy.allowlist.includes(command)) {
        return this.requireApproval(action, policy, ["Command is outside the conservative allowlist."]);
      }
      return createDecision(action, "allow", "low", ["Command is on the conservative allowlist."], []);
    }

    if (action.kind === "file_write") {
      const paths = action.paths ?? [];
      const protectedPath = paths.find((path) => pathLooksProtected(path, policy.sandbox.fileWritePolicy.protectedGlobs));
      if (protectedPath) {
        return this.blockAction(action, policy, [
          { code: "protected_path", message: "Protected paths cannot be written without a later approval system.", evidence: [protectedPath] },
        ]);
      }
      if ((action.estimatedChangedFiles ?? paths.length) > policy.sandbox.fileWritePolicy.maxChangedFiles) {
        return this.requireApproval(action, policy, ["Broad filesystem writes exceed the conservative changed-file limit."]);
      }
      return createDecision(action, "allow", "low", ["Write is scoped to repository paths and below changed-file limits."], []);
    }

    if (action.kind === "sandbox_create") {
      return createDecision(action, "allow", "low", ["Repository sandbox creation is allowed after path and policy validation."], []);
    }

    return createDecision(action, "allow", "low", ["Sandbox planning is a dry-run metadata action."], []);
  }

  requireApproval(action: PolicyAction, _policy: CorePolicy, reasons: string[]): PolicyDecision {
    return createDecision(action, "require_approval", "high", reasons, []);
  }

  blockAction(action: PolicyAction, _policy: CorePolicy, violations: PolicyViolation[]): PolicyDecision {
    return createDecision(action, "block", "blocked", violations.map((violation) => violation.message), violations);
  }

  explainDecision(decision: PolicyDecision): string {
    const prefix = decision.decision === "allow" ? "Allowed" : decision.decision === "require_approval" ? "Approval required" : "Blocked";
    return `${prefix}: ${decision.reasons.join(" ")}`;
  }
}

export class DryRunSandboxManager implements SandboxManager {
  async inspectRepository(request: SandboxPlanRequest, _policy: CorePolicy): Promise<RepositoryInspection> {
    return {
      repositoryPath: request.repositoryPath,
      gitRoot: request.repositoryPath,
      currentBranch: null,
      currentCommit: request.baseRef,
      isDirty: false,
      hasRemote: false,
      remotes: [],
    };
  }

  planRepositorySandbox(request: SandboxPlanRequest, policy: CorePolicy): SandboxPlan {
    const safeRunId = request.runId.replace(/[^a-zA-Z0-9_-]/g, "-");
    return {
      id: `sandbox-plan-${safeRunId}`,
      runId: request.runId,
      taskId: request.taskId,
      repositoryPath: request.repositoryPath,
      plannedWorktreePath: `${policy.sandbox.repository.worktreePath}/${safeRunId}`,
      baseRef: request.baseRef,
      dryRun: true,
      profile: policy.sandbox,
      commands: [`git worktree add ${policy.sandbox.repository.worktreePath}/${safeRunId} ${request.baseRef}`],
      cleanupRequired: true,
    };
  }

  planWorktree(request: SandboxPlanRequest, policy: CorePolicy, inspection: RepositoryInspection): WorktreePlan {
    const plan = this.planRepositorySandbox(request, policy);
    const policyDecision = new ConservativePolicyEngine().evaluateAction(
      {
        id: `sandbox-create-${plan.id}`,
        kind: "sandbox_create",
        summary: "Create repository worktree sandbox",
        paths: [plan.plannedWorktreePath],
      },
      policy,
    );

    return {
      id: plan.id,
      runId: request.runId,
      taskId: request.taskId,
      repositoryPath: request.repositoryPath,
      gitRoot: inspection.gitRoot,
      baseRef: request.baseRef,
      branchName: `codepawl/${request.runId}-${request.taskId}`,
      worktreePath: plan.plannedWorktreePath,
      gitArgs: ["-C", inspection.gitRoot, "worktree", "add", "-b", `codepawl/${request.runId}-${request.taskId}`, plan.plannedWorktreePath, request.baseRef],
      policyDecision,
    };
  }

  async createRepositorySandbox(request: SandboxPlanRequest, policy: CorePolicy): Promise<RepositorySandbox> {
    const inspection = await this.inspectRepository(request, policy);
    return this.createWorktree(this.planWorktree(request, policy, inspection));
  }

  async createWorktree(plan: WorktreePlan): Promise<RepositorySandbox> {
    return {
      id: plan.id,
      runId: plan.runId,
      taskId: plan.taskId,
      repositoryPath: plan.repositoryPath,
      gitRoot: plan.gitRoot,
      worktreePath: plan.worktreePath,
      branchName: plan.branchName,
      baseRef: plan.baseRef,
      currentCommit: plan.baseRef,
      createdAt: new Date().toISOString(),
    };
  }

  async listSandboxes(): Promise<RepositorySandbox[]> {
    return [];
  }

  async cleanupSandboxPlan(sandboxId: string, runId?: string): Promise<SandboxCleanupPlan> {
    return {
      sandboxId,
      runId,
      dryRun: true,
      blocked: false,
      reasons: ["Dry-run sandbox manager does not own real worktrees."],
      gitArgs: [],
    };
  }
}

export function policyDecisionToSafetySnapshot(policy: CorePolicy, decision: PolicyDecision): SafetySnapshot {
  return {
    policyMode: policy.permissionMode,
    riskLevel: decision.risk,
    approvalRequired: decision.approvalRequired,
    protectedPathTouched: decision.violations.some((violation) => violation.code === "protected_path"),
    commandAllowed: decision.decision === "allow",
    reasons: decision.reasons,
  };
}

export function policyDecisionToRunEvent(policy: CorePolicy, decision: PolicyDecision, actor: Actor): RunEventDraft {
  const type = decision.decision === "allow" ? "policy_checked" : decision.decision === "require_approval" ? "approval_required" : "action_blocked";
  return {
    type,
    actor,
    payload: {
      summary: new ConservativePolicyEngine().explainDecision(decision),
      decision,
    },
    safety: policyDecisionToSafetySnapshot(policy, decision),
  };
}

export function policyViolationToRunEvent(policy: CorePolicy, violation: PolicyViolation, actor: Actor): RunEventDraft {
  return {
    type: "policy_violation",
    actor,
    payload: {
      summary: violation.message,
      violation,
    },
    safety: {
      policyMode: policy.permissionMode,
      riskLevel: "blocked",
      approvalRequired: false,
      protectedPathTouched: violation.code === "protected_path",
      commandAllowed: false,
      reasons: [violation.message],
    },
  };
}

export function appendPolicyDecisionEvent(store: RunStore, runId: string, policy: CorePolicy, decision: PolicyDecision, actor: Actor) {
  return store.appendEvent(runId, policyDecisionToRunEvent(policy, decision, actor));
}

export function sandboxPlanToArtifacts(plan: SandboxPlan): ArtifactRef[] {
  return [
    {
      id: `${plan.id}-artifact`,
      kind: "summary",
      uri: `sandbox-plan://${plan.id}`,
      label: "Dry-run repository sandbox plan",
    },
  ];
}
