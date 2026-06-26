import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  appendPolicyDecisionEvent,
  ConservativePolicyEngine,
  policyDecisionToSafetySnapshot,
  type Actor,
  type CorePolicy,
  type PolicyDecision,
  type RepositoryInspection,
  type RepositorySandbox,
  type RepositorySandboxError,
  type RunStore,
  type SandboxCleanupPlan,
  type SandboxManager,
  type SandboxPlan,
  type SandboxPlanRequest,
  type WorktreePlan,
} from "@codepawl/shared";

const execFileAsync = promisify(execFile);

type GitRepositorySandboxManagerOptions = {
  sandboxRoot?: string;
  runStore?: RunStore;
  actor?: Actor;
};

export class RepositorySandboxFailure extends Error {
  readonly details: RepositorySandboxError;

  constructor(details: RepositorySandboxError) {
    super(details.message);
    this.name = "RepositorySandboxFailure";
    this.details = details;
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "sandbox";
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function isInsideOrEqual(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function existingRealpath(value: string): Promise<string> {
  return realpath(path.resolve(value));
}

function fail(details: RepositorySandboxError): never {
  throw new RepositorySandboxFailure(details);
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 2_000_000,
    timeout: 30_000,
  });
  return String(stdout).trim();
}

export class GitRepositorySandboxManager implements SandboxManager {
  private readonly sandboxRoot: string;
  private readonly runStore?: RunStore;
  private readonly actor: Actor;
  private readonly createdSandboxes = new Map<string, RepositorySandbox>();
  private readonly policyEngine = new ConservativePolicyEngine();

  constructor(options: GitRepositorySandboxManagerOptions = {}) {
    this.sandboxRoot = path.resolve(options.sandboxRoot ?? path.join(tmpdir(), "codepawl", "repository-sandboxes"));
    this.runStore = options.runStore;
    this.actor = options.actor ?? { kind: "runtime", id: "repository-sandbox", displayName: "Repository Sandbox" };
  }

  async inspectRepository(request: SandboxPlanRequest, policy: CorePolicy): Promise<RepositoryInspection> {
    const repositoryPath = await this.validateRepositoryPath(request.repositoryPath, policy);

    let gitRoot: string;
    try {
      gitRoot = await existingRealpath(await runGit(["-C", repositoryPath, "rev-parse", "--show-toplevel"]));
    } catch {
      fail({
        code: "repository_not_git",
        message: "Repository path is not inside a git repository.",
        evidence: [repositoryPath],
      });
    }

    const scopeRoot = await this.resolveScopeRoot(policy);
    if (!isInsideOrEqual(gitRoot, scopeRoot)) {
      fail({
        code: "repository_out_of_scope",
        message: "Git repository root is outside the allowed repository scope.",
        evidence: [gitRoot, scopeRoot],
      });
    }

    const [branch, commit, statusOutput, remoteOutput] = await Promise.all([
      runGit(["-C", gitRoot, "branch", "--show-current"]).catch(() => ""),
      runGit(["-C", gitRoot, "rev-parse", "HEAD"]),
      runGit(["-C", gitRoot, "status", "--porcelain"]),
      runGit(["-C", gitRoot, "remote"]).catch(() => ""),
    ]);

    const inspection: RepositoryInspection = {
      repositoryPath,
      gitRoot,
      currentBranch: branch || null,
      currentCommit: commit,
      isDirty: statusOutput.length > 0,
      hasRemote: remoteOutput.length > 0,
      remotes: remoteOutput ? remoteOutput.split("\n").filter(Boolean) : [],
    };

    this.runStore?.appendEvent(request.runId, {
      type: "sandbox_inspected",
      actor: this.actor,
      payload: {
        summary: inspection.isDirty ? "Repository inspected with uncommitted changes" : "Repository inspected with clean working tree",
        inspection,
      },
    });

    return inspection;
  }

  planRepositorySandbox(request: SandboxPlanRequest, policy: CorePolicy): SandboxPlan {
    const safeRunId = slug(request.runId);
    const plannedWorktreePath = path.join(this.sandboxRoot, "dry-run", safeRunId);

    return {
      id: `sandbox-plan-${safeRunId}`,
      runId: request.runId,
      taskId: request.taskId,
      repositoryPath: request.repositoryPath,
      plannedWorktreePath,
      baseRef: request.baseRef,
      dryRun: true,
      profile: policy.sandbox,
      commands: [`git -C <repo> worktree add -b <branch> ${plannedWorktreePath} ${request.baseRef}`],
      cleanupRequired: true,
    };
  }

  planWorktree(request: SandboxPlanRequest, policy: CorePolicy, inspection: RepositoryInspection): WorktreePlan {
    const repoSlug = slug(path.basename(inspection.gitRoot));
    const repoHash = shortHash(inspection.gitRoot);
    const shortCommit = inspection.currentCommit.slice(0, 12);
    const runSlug = slug(`${request.runId}-${request.taskId}-${shortCommit}`);
    const branchName = `codepawl/${slug(request.runId)}-${slug(request.taskId)}-${shortCommit}`;
    const worktreePath = path.join(this.sandboxRoot, `${repoSlug}-${repoHash}`, runSlug);
    const policyDecision = this.policyEngine.evaluateAction(
      {
        id: `sandbox-create-${runSlug}`,
        kind: "sandbox_create",
        summary: "Create isolated git worktree for Coding Apprentice",
        paths: [worktreePath],
      },
      policy,
    );

    return {
      id: `sandbox-${repoSlug}-${repoHash}-${runSlug}`,
      runId: request.runId,
      taskId: request.taskId,
      repositoryPath: inspection.repositoryPath,
      gitRoot: inspection.gitRoot,
      baseRef: request.baseRef,
      branchName,
      worktreePath,
      gitArgs: ["-C", inspection.gitRoot, "worktree", "add", "-b", branchName, worktreePath, request.baseRef],
      policyDecision,
    };
  }

  async createRepositorySandbox(request: SandboxPlanRequest, policy: CorePolicy): Promise<RepositorySandbox> {
    this.runStore?.appendEvent(request.runId, {
      type: "sandbox_create_requested",
      actor: this.actor,
      payload: {
        summary: "Repository sandbox creation requested",
        request,
      },
    });

    try {
      const inspection = await this.inspectRepository(request, policy);
      const plan = this.planWorktree(request, policy, inspection);

      if (plan.policyDecision.decision !== "allow") {
        appendPolicyDecisionEvent(this.requireRunStore(), request.runId, policy, plan.policyDecision, this.actor);
        fail({
          code: plan.policyDecision.decision === "require_approval" ? "approval_required" : "policy_denied",
          message: "Repository sandbox creation was not allowed by policy.",
          evidence: plan.policyDecision.reasons,
        });
      }

      this.runStore?.appendEvent(request.runId, {
        type: "sandbox_create_allowed",
        actor: this.actor,
        payload: {
          summary: "Repository sandbox creation allowed by policy",
          plan,
        },
        safety: policyDecisionToSafetySnapshot(policy, plan.policyDecision),
      });

      const sandbox = await this.createWorktree(plan);
      this.runStore?.appendEvent(request.runId, {
        type: "sandbox_created",
        actor: this.actor,
        payload: {
          summary: "Repository worktree sandbox created",
          sandbox,
        },
      });
      return sandbox;
    } catch (error) {
      const details =
        error instanceof RepositorySandboxFailure
          ? error.details
          : {
              code: "worktree_create_failed" as const,
              message: error instanceof Error ? error.message : "Repository sandbox creation failed.",
              evidence: [],
            };

      this.runStore?.appendEvent(request.runId, {
        type: "sandbox_create_failed",
        actor: this.actor,
        payload: {
          summary: details.message,
          error: details,
        },
      });
      throw error;
    }
  }

  async createWorktree(plan: WorktreePlan): Promise<RepositorySandbox> {
    if (plan.policyDecision.decision !== "allow") {
      fail({
        code: plan.policyDecision.decision === "require_approval" ? "approval_required" : "policy_denied",
        message: "Cannot create worktree without an allow policy decision.",
        evidence: plan.policyDecision.reasons,
      });
    }

    if (!isInsideOrEqual(path.resolve(plan.worktreePath), this.sandboxRoot)) {
      fail({
        code: "unsafe_repository_path",
        message: "Planned worktree path is outside the CodePawl sandbox root.",
        evidence: [plan.worktreePath, this.sandboxRoot],
      });
    }

    try {
      await stat(plan.worktreePath);
      fail({
        code: "worktree_create_failed",
        message: "Planned worktree path already exists.",
        evidence: [plan.worktreePath],
      });
    } catch (error) {
      if (error instanceof RepositorySandboxFailure) {
        throw error;
      }
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") {
        fail({
          code: "worktree_create_failed",
          message: error instanceof Error ? error.message : "Could not inspect planned worktree path.",
          evidence: [plan.worktreePath],
        });
      }
    }

    await mkdir(path.dirname(plan.worktreePath), { recursive: true });
    try {
      await runGit(plan.gitArgs);
    } catch (error) {
      fail({
        code: "worktree_create_failed",
        message: error instanceof Error ? error.message : "Git worktree creation failed.",
        evidence: [plan.gitArgs.join(" ")],
      });
    }

    const sandbox: RepositorySandbox = {
      id: plan.id,
      runId: plan.runId,
      taskId: plan.taskId,
      repositoryPath: plan.repositoryPath,
      gitRoot: plan.gitRoot,
      worktreePath: plan.worktreePath,
      branchName: plan.branchName,
      baseRef: plan.baseRef,
      currentCommit: await runGit(["-C", plan.worktreePath, "rev-parse", "HEAD"]),
      createdAt: new Date().toISOString(),
    };

    this.createdSandboxes.set(sandbox.id, sandbox);
    return sandbox;
  }

  async listSandboxes(): Promise<RepositorySandbox[]> {
    return [...this.createdSandboxes.values()].map((sandbox) => ({ ...sandbox }));
  }

  async cleanupSandboxPlan(sandboxId: string, runId?: string): Promise<SandboxCleanupPlan> {
    const sandbox = this.createdSandboxes.get(sandboxId);
    if (!sandbox) {
      const blockedPlan: SandboxCleanupPlan = {
        sandboxId,
        runId,
        dryRun: true,
        blocked: true,
        reasons: ["Sandbox is not managed by this RepositorySandboxManager instance."],
        gitArgs: [],
      };

      if (runId) {
        this.runStore?.appendEvent(runId, {
          type: "sandbox_cleanup_blocked",
          actor: this.actor,
          payload: {
            summary: "Repository sandbox cleanup blocked for unmanaged sandbox",
            cleanupPlan: blockedPlan,
          },
        });
      }

      return blockedPlan;
    }

    const plan: SandboxCleanupPlan = {
      sandboxId,
      runId: sandbox.runId,
      worktreePath: sandbox.worktreePath,
      branchName: sandbox.branchName,
      dryRun: true,
      blocked: false,
      reasons: ["Cleanup is dry-run only in this slice; no files or branches were deleted."],
      gitArgs: [
        ["-C", sandbox.gitRoot, "worktree", "remove", sandbox.worktreePath],
        ["-C", sandbox.gitRoot, "branch", "-D", sandbox.branchName],
      ],
    };

    this.runStore?.appendEvent(sandbox.runId, {
      type: "sandbox_cleanup_planned",
      actor: this.actor,
      payload: {
        summary: "Repository sandbox cleanup planned as a dry run",
        cleanupPlan: plan,
      },
    });

    return plan;
  }

  private async validateRepositoryPath(repositoryPath: string, policy: CorePolicy): Promise<string> {
    const resolved = path.resolve(repositoryPath);
    const root = path.parse(resolved).root;
    if (resolved === root || resolved === path.resolve(homedir()) || path.basename(resolved) === ".git") {
      fail({
        code: "unsafe_repository_path",
        message: "Repository path is too broad or unsafe.",
        evidence: [resolved],
      });
    }

    let info;
    try {
      info = await stat(resolved);
    } catch {
      fail({
        code: "path_not_found",
        message: "Repository path does not exist.",
        evidence: [resolved],
      });
    }
    if (!info.isDirectory()) {
      fail({
        code: "path_not_directory",
        message: "Repository path must be a directory.",
        evidence: [resolved],
      });
    }

    const repositoryRealpath = await existingRealpath(resolved);
    const scopeRoot = await this.resolveScopeRoot(policy);
    if (!isInsideOrEqual(repositoryRealpath, scopeRoot)) {
      fail({
        code: "repository_out_of_scope",
        message: "Repository path is outside the allowed RepositoryScope.",
        evidence: [repositoryRealpath, scopeRoot],
      });
    }

    return repositoryRealpath;
  }

  private async resolveScopeRoot(policy: CorePolicy): Promise<string> {
    try {
      return await existingRealpath(policy.sandbox.repository.repositoryPath);
    } catch {
      return path.resolve(policy.sandbox.repository.repositoryPath);
    }
  }

  private requireRunStore(): RunStore {
    if (!this.runStore) {
      fail({
        code: "policy_denied",
        message: "RunStore is required to append policy decision events.",
        evidence: [],
      });
    }
    return this.runStore;
  }
}
