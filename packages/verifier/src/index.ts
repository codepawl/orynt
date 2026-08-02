import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  ConservativePolicyEngine,
  policyDecisionToSafetySnapshot,
  type Actor,
  type CorePolicy,
  type PolicyDecision,
  type RunStore,
  type VerificationCommand,
  type VerificationEvidence,
  type VerificationFailureClass,
  type VerificationPlan,
  type VerificationPlanRequest,
  type VerificationResult,
  type VerificationStatus,
  type Verifier,
  type VerifierConfig,
  type DiffScopeResult,
} from "@codepawl/shared";

import { parsePorcelainStatusPaths } from "./gitStatus";

type LocalRepositoryVerifierOptions = {
  managedArtifactRoot?: string;
  runStore?: RunStore;
  actor?: Actor;
  trustedCommandOverrides?: Readonly<
    Record<
      string,
      {
        command: string;
        args: readonly string[];
        stdin?: string;
        afterExecution?: () => Promise<
          string | TrustedCommandPostExecution | undefined
        >;
      }
    >
  >;
};

type TrustedCommandPostExecution = {
  failure?: string;
  stdout?: string;
  source?: "process_stdio" | "trusted_report";
  artifactRefs?: VerificationEvidence["artifactRefs"];
  trustedEvidenceValid?: boolean;
};

type ExecOutcome = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export class VerifierFailure extends Error {
  readonly code: "sandbox_path_unsafe" | "artifact_path_unsafe" | "verification_failed";
  readonly evidence: string[];

  constructor(code: VerifierFailure["code"], message: string, evidence: string[]) {
    super(message);
    this.name = "VerifierFailure";
    this.code = code;
    this.evidence = evidence;
  }
}

export class VerificationCancelledError extends Error {
  constructor() {
    super("Repository verification cancelled.");
    this.name = "VerificationCancelledError";
  }
}

const DEFAULT_COMMANDS = ["pnpm test", "pnpm test:contracts", "pnpm test:desktop", "pnpm build:desktop"];
const SHELL_CONTROL_PATTERN = /[|;&<>`$(){}[\]*?~]/;
const SENSITIVE_KEY_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential)\b/i;
const KEY_VALUE_SECRET_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential)\b\s*[:=]\s*[^\s,;]+/gi;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "verifier";
}

function isInsideOrEqual(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function redact(value: string): string {
  const next = value
    .replace(KEY_VALUE_SECRET_PATTERN, (_match, key) => `${key}: [REDACTED]`)
    .replace(SECRET_VALUE_PATTERN, "[REDACTED]");
  return SENSITIVE_KEY_PATTERN.test(value) && next === value ? "[REDACTED]" : next;
}

function truncate(value: string, maxBytes: number): string {
  const redacted = redact(value);
  const bytes = Buffer.byteLength(redacted, "utf8");
  if (bytes <= maxBytes) {
    return redacted;
  }
  return `${redacted.slice(0, Math.max(0, maxBytes))}\n[TRUNCATED ${bytes - maxBytes} bytes]`;
}

function commandToParts(command: string): { command: string; args: string[] } {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  return {
    command: parts[0] ?? "",
    args: parts.slice(1),
  };
}

function hasShellControl(command: string): boolean {
  return SHELL_CONTROL_PATTERN.test(command);
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function pathLooksProtected(filePath: string, protectedGlobs: string[]): boolean {
  return protectedGlobs.some((glob) => {
    const normalizedGlob = glob.replaceAll("**/", "").replaceAll("/**", "");
    return filePath === normalizedGlob || filePath.includes(normalizedGlob.replaceAll("*", ""));
  });
}

function pathMatchesAllowed(filePath: string, allowedGlobs: string[]): boolean {
  return allowedGlobs.some((glob) => {
    if (glob.endsWith("/**")) {
      return filePath.startsWith(glob.slice(0, -3));
    }
    if (glob.includes("*")) {
      return filePath.startsWith(glob.replaceAll("*", "").replaceAll("/", ""));
    }
    return filePath === glob || filePath.startsWith(`${glob}/`);
  });
}

function pathMatchesExactAuthorization(
  filePath: string,
  authorizedPaths: string[],
): boolean {
  const normalizedFile = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return authorizedPaths.some((authorizedPath) => {
    const normalizedAuthorization = authorizedPath
      .replaceAll("\\", "/")
      .replace(/^\.\//, "");
    return (
      normalizedAuthorization.length > 0 &&
      !normalizedAuthorization.includes("*") &&
      !normalizedAuthorization.includes("?") &&
      normalizedFile === normalizedAuthorization
    );
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeCommand).filter(Boolean))];
}

async function runExecFile(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  stdin?: string,
  signal?: AbortSignal,
): Promise<ExecOutcome> {
  if (signal?.aborted) throw new VerificationCancelledError();
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    let cleanupPromise: Promise<void> | undefined;
    let timedOut = false;
    let settled = false;
    let stdout = "";
    let stderr = "";
    const signalGroup = (terminationSignal: NodeJS.Signals) => {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, terminationSignal);
        } catch {
          // The verifier process group is already gone.
        }
      } else if (!child.killed) {
        child.kill(terminationSignal);
      }
    };
    const groupExists = () => {
      if (!child.pid) return false;
      try {
        process.kill(process.platform === "win32" ? child.pid : -child.pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const waitForGroupExit = async (waitMs: number) => {
      const deadline = Date.now() + waitMs;
      while (groupExists() && Date.now() < deadline) {
        await new Promise((waitResolve) => setTimeout(waitResolve, 10));
      }
      return !groupExists();
    };
    const cleanupGroup = () => {
      cleanupPromise ??= (async () => {
        signalGroup("SIGTERM");
        if (await waitForGroupExit(200)) return;
        signalGroup("SIGKILL");
        await waitForGroupExit(200);
      })();
      return cleanupPromise;
    };
    const onAbort = () => {
      void cleanupGroup();
    };
    const finish = async (exitCode: number | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      await cleanupGroup();
      if (signal?.aborted) {
        reject(new VerificationCancelledError());
        return;
      }
      resolve({
        exitCode: error ? 1 : exitCode,
        stdout,
        stderr: error
          ? [stderr.trimEnd(), error.message].filter(Boolean).join("\n")
          : stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    };
    child = spawn(
      command,
      [...args],
      {
        cwd,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-2_000_000);
    });
    child.once("error", (error) => {
      void finish(1, error);
    });
    child.once("close", (exitCode) => {
      void finish(exitCode);
    });
    child.once("exit", () => {
      void cleanupGroup();
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const timer = setTimeout(() => {
      timedOut = true;
      void cleanupGroup();
    }, timeoutMs);
    child.stdin.end(stdin);
  });
}

async function runGit(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  const outcome = await runExecFile("git", args, cwd, 30_000, undefined, signal);
  if (outcome.exitCode !== 0) {
    throw new Error(outcome.stderr || "git command failed");
  }
  return outcome.stdout.trimEnd();
}

export class LocalRepositoryVerifier implements Verifier {
  private readonly managedArtifactRoot: string;
  private readonly runStore?: RunStore;
  private readonly actor: Actor;
  private readonly trustedCommandOverrides: ReadonlyMap<
    string,
    {
      command: string;
      args: readonly string[];
      stdin?: string;
      afterExecution?: () => Promise<
        string | TrustedCommandPostExecution | undefined
      >;
    }
  >;
  private readonly policyEngine = new ConservativePolicyEngine();

  constructor(options: LocalRepositoryVerifierOptions = {}) {
    this.managedArtifactRoot = path.resolve(options.managedArtifactRoot ?? path.join(tmpdir(), "orynt", "verification-artifacts"));
    this.runStore = options.runStore;
    this.actor = options.actor ?? { kind: "verifier", id: "local-repository-verifier", displayName: "Local Repository Verifier" };
    this.trustedCommandOverrides = new Map(
      Object.entries(options.trustedCommandOverrides ?? {}).map(([displayName, command]) => [
        normalizeCommand(displayName),
        command,
      ]),
    );
  }

  createPlan(request: VerificationPlanRequest): VerificationPlan {
    const config: VerifierConfig = {
      defaultCommands: request.config?.defaultCommands ?? DEFAULT_COMMANDS,
      commandTimeoutMs: request.config?.commandTimeoutMs ?? 30_000,
      maxOutputBytes: request.config?.maxOutputBytes ?? request.policy.sandbox.budget.maxOutputBytes,
      requireChangedFiles: request.config?.requireChangedFiles ?? false,
      authorizedChangedPaths: request.config?.authorizedChangedPaths,
      requireAuthorizedChangedPaths:
        request.config?.requireAuthorizedChangedPaths ?? false,
      allowDestructiveChanges: request.config?.allowDestructiveChanges ?? false,
      allowChangedFileLimitExceeded:
        request.config?.allowChangedFileLimitExceeded ?? false,
      artifactRoot: request.config?.artifactRoot ?? request.artifactRoot,
    };
    const commands = unique([...(request.commands ?? []), ...config.defaultCommands]).map((command, index) => {
      const parts = commandToParts(command);
      return {
        id: `verification-command-${index + 1}-${slug(command)}`,
        command: parts.command,
        args: parts.args,
        displayName: command,
        timeoutMs: config.commandTimeoutMs,
        allowed: false,
      } satisfies VerificationCommand;
    });
    const plan: VerificationPlan = {
      id: `verification-plan-${slug(request.runId)}-${slug(request.taskId)}-${sha256(`${request.sandbox.worktreePath}:${commands.map((item) => item.displayName).join(",")}`).slice(0, 10)}`,
      runId: request.runId,
      taskId: request.taskId,
      sandbox: request.sandbox,
      policyId: request.policy.id,
      commands,
      budget: request.budget,
      config,
      createdAt: new Date().toISOString(),
    };

    this.runStore?.appendEvent(request.runId, {
      type: "verification_planned",
      actor: this.actor,
      payload: {
        summary: "Verification plan created",
        plan,
      },
    });

    return this.checkPolicy(plan, request.policy);
  }

  checkPolicy(plan: VerificationPlan, policy: CorePolicy): VerificationPlan {
    const commands = plan.commands.map((command) => {
      const displayName = normalizeCommand(command.displayName);
      let decision: PolicyDecision;
      if (hasShellControl(displayName)) {
        decision = this.policyEngine.blockAction(
          {
            id: `verification-policy-${command.id}`,
            kind: "command",
            summary: `Verify command ${displayName}`,
            command: displayName,
          },
          policy,
          [{ code: "blocked_command", message: "Verifier commands cannot contain shell control syntax.", evidence: [displayName] }],
        );
      } else {
        decision = this.policyEngine.evaluateAction(
          {
            id: `verification-policy-${command.id}`,
            kind: "command",
            summary: `Verify command ${displayName}`,
            command: displayName,
          },
          policy,
        );
      }
      return {
        ...command,
        allowed: decision.decision === "allow",
        policyDecision: decision,
      };
    });
    const checkedPlan = { ...plan, commands };

    this.runStore?.appendEvent(plan.runId, {
      type: "verification_policy_checked",
      actor: this.actor,
      payload: {
        summary: "Verification commands checked against CorePolicy",
        allowedCommands: commands.filter((command) => command.allowed).map((command) => command.displayName),
        blockedCommands: commands.filter((command) => !command.allowed).map((command) => command.displayName),
      },
      safety: policyDecisionToSafetySnapshot(
        policy,
        commands.find((command) => command.policyDecision?.decision !== "allow")?.policyDecision ??
          commands[0]?.policyDecision ??
          this.policyEngine.evaluateAction({ id: "verification-empty", kind: "sandbox_plan", summary: "No verification commands" }, policy),
      ),
    });

    return checkedPlan;
  }

  async runVerification(
    plan: VerificationPlan,
    policy: CorePolicy,
    options: { signal?: AbortSignal } = {},
  ): Promise<VerificationResult> {
    if (options.signal?.aborted) throw new VerificationCancelledError();
    const startedAt = new Date().toISOString();
    const worktreePath = await this.validateSandboxPath(plan);
    if (options.signal?.aborted) throw new VerificationCancelledError();
    const evidence: VerificationEvidence[] = [];
    const allowedCommands = plan.commands.filter((command) => command.allowed);

    this.runStore?.appendEvent(plan.runId, {
      type: "verification_started",
      actor: this.actor,
      payload: {
        summary: "Verification started",
        planId: plan.id,
        worktreePath,
      },
    });

    for (const command of allowedCommands) {
      if (options.signal?.aborted) throw new VerificationCancelledError();
      const trustedCommand = this.trustedCommandOverrides.get(
        normalizeCommand(command.displayName),
      );
      this.runStore?.appendEvent(plan.runId, {
        type: "verification_command_started",
        actor: this.actor,
        payload: {
          summary: `Started verification command: ${command.displayName}`,
          command,
          executionSource: trustedCommand
            ? {
                kind: "trusted_process_input",
                command: trustedCommand.command,
                args: trustedCommand.args,
                stdinSha256:
                  trustedCommand.stdin === undefined
                    ? undefined
                    : sha256(trustedCommand.stdin),
              }
            : {
                kind: "verification_plan",
              },
        },
      });

      let outcome = await runExecFile(
        trustedCommand?.command ?? command.command,
        trustedCommand?.args ?? command.args,
        worktreePath,
        command.timeoutMs,
        trustedCommand?.stdin,
        options.signal,
      );
      if (options.signal?.aborted) throw new VerificationCancelledError();
      const trustedCommandPostExecution =
        await trustedCommand?.afterExecution?.();
      const trustedCommandResult =
        typeof trustedCommandPostExecution === "string"
          ? { failure: trustedCommandPostExecution }
          : trustedCommandPostExecution;
      if (
        trustedCommandResult?.failure ||
        trustedCommandResult?.trustedEvidenceValid === false
      ) {
        outcome = {
          ...outcome,
          exitCode: 1,
          stderr: [
            outcome.stderr.trimEnd(),
            trustedCommandResult.failure ??
              "Trusted verification evidence was invalid.",
          ]
            .filter(Boolean)
            .join("\n"),
        };
      }
      const commandEvidence: VerificationEvidence = {
        id: `${command.id}-evidence`,
        kind: "command",
        label: command.displayName,
        commandId: command.id,
        command: command.displayName,
        exitCode: outcome.exitCode,
        durationMs: outcome.durationMs,
        timedOut: outcome.timedOut,
        stdout: truncate(
          trustedCommandResult?.stdout ?? outcome.stdout,
          plan.config.maxOutputBytes,
        ),
        stderr: truncate(outcome.stderr, plan.config.maxOutputBytes),
        source:
          trustedCommandResult?.source ??
          (trustedCommand ? "process_stdio" : undefined),
        artifactRefs: trustedCommandResult?.artifactRefs,
        trustedEvidenceValid: trustedCommandResult?.trustedEvidenceValid,
      };
      evidence.push(commandEvidence);
      this.runStore?.appendEvent(plan.runId, {
        type: "verification_command_finished",
        actor: this.actor,
        payload: {
          summary: `Finished verification command: ${command.displayName}`,
          evidence: commandEvidence,
        },
      });
    }

    for (const command of plan.commands.filter((item) => !item.allowed && item.policyDecision)) {
      evidence.push({
        id: `${command.id}-policy-evidence`,
        kind: "policy",
        label: `Policy decision for ${command.displayName}`,
        commandId: command.id,
        command: command.displayName,
        policyDecision: command.policyDecision,
      });
    }

    let diffScope: DiffScopeResult;
    try {
      if (options.signal?.aborted) throw new VerificationCancelledError();
      diffScope = await this.checkDiffScope(
        plan,
        policy,
        worktreePath,
        options.signal,
      );
    } catch (error) {
      diffScope = {
        baseRef: plan.sandbox.baseRef,
        changedFiles: [],
        allowedFiles: [],
        protectedFiles: [],
        unexpectedFiles: [],
        unauthorizedFiles: [],
        destructiveFiles: [],
        hasChanges: false,
        withinAllowedScope: false,
        protectedPathTouched: false,
        changedFileLimitExceeded: false,
      };
      evidence.push({
        id: `${plan.id}-diff-error`,
        kind: "diff_scope",
        label: "Diff scope unavailable",
        stderr: error instanceof Error ? error.message : "Diff scope unavailable",
        diffScope,
      });
    }
    evidence.push({
      id: `${plan.id}-diff-scope`,
      kind: "diff_scope",
      label: "Diff scope result",
      diffScope,
    });

    this.runStore?.appendEvent(plan.runId, {
      type: "verification_diff_checked",
      actor: this.actor,
      payload: {
        summary: "Verification diff scope checked",
        diffScope,
      },
    });

    if (options.signal?.aborted) throw new VerificationCancelledError();
    const result = await this.createResult(plan, policy, evidence, diffScope, startedAt);
    if (options.signal?.aborted) throw new VerificationCancelledError();
    this.runStore?.appendEvent(plan.runId, {
      type: "verification_recorded",
      actor: this.actor,
      payload: {
        summary: this.summarizeResult(result),
        result,
      },
      artifacts: result.artifacts,
      verdict: {
        status: result.verdict.status,
        reason: result.verdict.reason,
        confidence: result.verdict.confidence,
      },
    });
    this.runStore?.appendEvent(plan.runId, {
      type: result.status === "pass" ? "verification_passed" : "verification_failed",
      actor: this.actor,
      payload: {
        summary: this.summarizeResult(result),
        verdict: result.verdict,
      },
    });

    return result;
  }

  summarizeResult(result: VerificationResult): string {
    return `Verification ${result.status}: ${result.verdict.reason}`;
  }

  classifyFailure(result: VerificationResult): VerificationFailureClass | undefined {
    if (result.status === "pass") {
      return undefined;
    }
    return result.verdict.failureClass;
  }

  private async validateSandboxPath(plan: VerificationPlan): Promise<string> {
    const worktreePath = await realpath(path.resolve(plan.sandbox.worktreePath));
    const sourcePath = path.resolve(plan.sandbox.repositoryPath);
    if (worktreePath === sourcePath) {
      throw new VerifierFailure("sandbox_path_unsafe", "Verifier must target a sandbox worktree, not the source repository path.", [worktreePath]);
    }
    return worktreePath;
  }

  private async checkDiffScope(
    plan: VerificationPlan,
    policy: CorePolicy,
    worktreePath: string,
    signal?: AbortSignal,
  ): Promise<DiffScopeResult> {
    const committedDiff = await runGit(
      ["diff", "--name-only", "-z", plan.sandbox.baseRef, "--"],
      worktreePath,
      signal,
    );
    const committedDestructiveDiff = await runGit(
      ["diff", "--name-only", "--diff-filter=DR", "-z", plan.sandbox.baseRef, "--"],
      worktreePath,
      signal,
    );
    const statusOutput = await runGit(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      worktreePath,
      signal,
    );
    const committedFiles = committedDiff
      .split("\0")
      .filter((filePath) => filePath.length > 0);
    const {
      changedFiles: statusFiles,
      destructiveFiles: destructiveStatusFiles,
    } = parsePorcelainStatusPaths(statusOutput);
    const changedFiles = unique([...committedFiles, ...statusFiles]);
    const destructiveFiles = unique([
      ...committedDestructiveDiff.split("\0").filter(Boolean),
      ...destructiveStatusFiles,
    ]);
    const protectedFiles = changedFiles.filter((file) => pathLooksProtected(file, policy.sandbox.repository.protectedPaths));
    const unexpectedFiles = changedFiles.filter((file) => !pathMatchesAllowed(file, policy.sandbox.repository.allowedPaths));
    const authorizedPaths = plan.config.authorizedChangedPaths ?? [];
    const unauthorizedFiles = changedFiles.filter(
      (file) =>
        file !== ".codex/orynt-beta-verify.mjs" &&
        ((plan.config.requireAuthorizedChangedPaths &&
          authorizedPaths.length === 0) ||
          (authorizedPaths.length > 0 &&
            !pathMatchesExactAuthorization(file, authorizedPaths))),
    );
    const allowedFiles = changedFiles.filter((file) => !unexpectedFiles.includes(file) && !protectedFiles.includes(file));

    return {
      baseRef: plan.sandbox.baseRef,
      changedFiles,
      allowedFiles,
      protectedFiles,
      unexpectedFiles,
      unauthorizedFiles,
      destructiveFiles,
      hasChanges: changedFiles.length > 0,
      withinAllowedScope: unexpectedFiles.length === 0,
      protectedPathTouched: protectedFiles.length > 0,
      changedFileLimitExceeded:
        changedFiles.length > policy.sandbox.fileWritePolicy.maxChangedFiles,
    };
  }

  private async createResult(
    plan: VerificationPlan,
    policy: CorePolicy,
    evidence: VerificationEvidence[],
    diffScope: DiffScopeResult,
    startedAt: string,
  ): Promise<VerificationResult> {
    const commandEvidence = evidence.filter((item) => item.kind === "command");
    const blockedEvidence = evidence.filter((item) => item.kind === "policy");
    const timedOut = commandEvidence.some((item) => item.timedOut);
    const failedCommand = commandEvidence.find((item) => item.exitCode !== 0);
    const failureClass = this.determineFailureClass(plan, commandEvidence, blockedEvidence, diffScope);
    const status: VerificationStatus = failureClass ? "fail" : commandEvidence.length === 0 ? "inconclusive" : "pass";
    const reason =
      status === "pass"
        ? "All policy-allowed verification commands passed and diff scope is allowed."
        : timedOut
          ? "A verification command timed out."
          : failureClass === "trusted_evidence_invalid"
            ? "Trusted verification evidence was missing or invalid."
          : failedCommand
            ? `Verification command failed: ${failedCommand.command}`
            : failureClass === "protected_path_touched"
              ? "Diff touched protected paths."
              : failureClass === "unexpected_file_touch"
                ? "Diff touched files outside allowed scope."
                : failureClass === "unauthorized_file_touch"
                  ? "Diff touched files outside the authorized action scope."
                : failureClass === "changed_file_limit_exceeded"
                  ? "Diff exceeded the automatic changed-file limit."
                  : failureClass === "destructive_change_detected"
                    ? "Diff contains deletion or rename operations."
                : failureClass === "no_changes"
                  ? "No changed files were detected."
                  : blockedEvidence.length > 0
                    ? "One or more verification commands were blocked by policy."
                    : "No policy-allowed verification commands ran.";
    const verdict = {
      status,
      reason,
      confidence: status === "pass" ? 1 : status === "inconclusive" ? 0.3 : 0.9,
      failureClass,
    };
    const result: VerificationResult = {
      id: `verification-result-${slug(plan.runId)}-${sha256(`${plan.id}:${Date.now()}`).slice(0, 10)}`,
      planId: plan.id,
      runId: plan.runId,
      taskId: plan.taskId,
      status,
      verdict,
      evidence,
      diffScope,
      artifacts: [],
      startedAt,
      completedAt: new Date().toISOString(),
    };
    const artifactRoot = await this.validateArtifactRoot(plan.config.artifactRoot);
    await mkdir(artifactRoot, { recursive: true });
    const artifactPath = path.join(artifactRoot, "verification-result.json");
    const artifactJson = `${JSON.stringify(result, null, 2)}\n`;
    await writeFile(artifactPath, artifactJson, { encoding: "utf8", flag: "w" });
    result.artifacts = [
      {
        id: `${result.id}-artifact`,
        kind: "validation_report",
        uri: `file://${artifactPath}`,
        label: "Verification result",
        sha256: sha256(artifactJson),
      },
    ];
    const artifactJsonWithRefs = `${JSON.stringify(result, null, 2)}\n`;
    await writeFile(artifactPath, artifactJsonWithRefs, { encoding: "utf8", flag: "w" });
    result.artifacts[0].sha256 = sha256(artifactJsonWithRefs);
    return result;
  }

  private determineFailureClass(
    plan: VerificationPlan,
    commandEvidence: VerificationEvidence[],
    blockedEvidence: VerificationEvidence[],
    diffScope: DiffScopeResult,
  ): VerificationFailureClass | undefined {
    if (blockedEvidence.length > 0 && commandEvidence.length === 0) {
      return "policy_blocked";
    }
    if (commandEvidence.some((item) => item.timedOut)) {
      return "command_timeout";
    }
    if (commandEvidence.some((item) => item.trustedEvidenceValid === false)) {
      return "trusted_evidence_invalid";
    }
    if (commandEvidence.some((item) => item.exitCode !== 0)) {
      return "command_failed";
    }
    if (diffScope.protectedPathTouched) {
      return "protected_path_touched";
    }
    if (!diffScope.withinAllowedScope) {
      return "unexpected_file_touch";
    }
    if (diffScope.unauthorizedFiles.length > 0) {
      return "unauthorized_file_touch";
    }
    if (
      diffScope.changedFileLimitExceeded &&
      !plan.config.allowChangedFileLimitExceeded
    ) {
      return "changed_file_limit_exceeded";
    }
    if (
      diffScope.destructiveFiles.length > 0 &&
      !plan.config.allowDestructiveChanges
    ) {
      return "destructive_change_detected";
    }
    if (plan.config.requireChangedFiles && !diffScope.hasChanges) {
      return "no_changes";
    }
    return undefined;
  }

  private async validateArtifactRoot(artifactRoot: string): Promise<string> {
    const resolvedRoot = path.resolve(artifactRoot);
    const managedRoot = path.resolve(this.managedArtifactRoot);
    if (!isInsideOrEqual(resolvedRoot, managedRoot)) {
      throw new VerifierFailure("artifact_path_unsafe", "Verification artifact path is outside the Orynt-managed artifact root.", [resolvedRoot, managedRoot]);
    }
    await mkdir(managedRoot, { recursive: true });
    return resolvedRoot;
  }
}
