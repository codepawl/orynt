import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { delimiter } from "node:path";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import type {
  Actor,
  CodexAdapter,
  CodexAdapterStatus,
  CodexContract,
  CodexContractArtifact,
  CodexContractRequest,
  CodexExecutionApproval,
  CodexExecutionFailureReason,
  CodexExecutionPlan,
  CodexExecutionPolicy,
  CodexExecutionRequest,
  CodexExecutionResult,
  CodexExecutionMode,
  CodexProcessRef,
  CodexResultBundle,
  CodexResultImporter,
  CodexResultImportRequest,
  CodexRunSummary,
  CodexProvider,
  ImportedChangedFile,
  ImportedCommandLog,
  ImportedPatchSummary,
  ImportFailureReason,
  ImportRedactionResult,
  RunStore,
  VerificationPlanRequest,
} from "@codepawl/shared";
import { ConservativePolicyEngine, policyDecisionToSafetySnapshot } from "@codepawl/shared";

type LocalCodexContractAdapterOptions = {
  managedArtifactRoot?: string;
  runStore?: RunStore;
  runId?: string;
  actor?: Actor;
  pathEnv?: string;
};

type LocalManualCodexResultImporterOptions = {
  managedArtifactRoot?: string;
  runStore?: RunStore;
  actor?: Actor;
};

const execFileAsync = promisify(execFile);

export class CodexAdapterFailure extends Error {
  readonly code: "artifact_path_unsafe" | "artifact_write_failed";
  readonly evidence: string[];

  constructor(code: CodexAdapterFailure["code"], message: string, evidence: string[]) {
    super(message);
    this.name = "CodexAdapterFailure";
    this.code = code;
    this.evidence = evidence;
  }
}

export class CodexExecutionFailure extends Error {
  readonly code: CodexExecutionFailureReason;
  readonly evidence: string[];

  constructor(code: CodexExecutionFailureReason, message: string, evidence: string[]) {
    super(message);
    this.name = "CodexExecutionFailure";
    this.code = code;
    this.evidence = evidence;
  }
}

export class CodexResultImporterFailure extends Error {
  readonly code: ImportFailureReason;
  readonly evidence: string[];

  constructor(code: ImportFailureReason, message: string, evidence: string[]) {
    super(message);
    this.name = "CodexResultImporterFailure";
    this.code = code;
    this.evidence = evidence;
  }
}

const CONTRACT_PROVIDER: CodexProvider = {
  id: "codex-contract-provider",
  name: "Codex Contract Provider",
  kind: "contract_generator",
};

const LOCAL_CLI_PROVIDER: CodexProvider = {
  id: "codex-local-cli",
  name: "Local Codex CLI",
  kind: "codex_cli",
};

const SENSITIVE_KEY_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential)\b/i;
const KEY_VALUE_SECRET_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential)\b\s*[:=]\s*[^\s,;]+/gi;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const ENV_SECRET_PATTERN = /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|OTP|AUTH|COOKIE|CREDENTIAL)[A-Z0-9_]*\s*=\s*[^\s]+/gi;
const IMPORT_TEXT_EXTENSIONS = new Set([".md", ".txt", ".log"]);
const DEFAULT_EXECUTION_POLICY: CodexExecutionPolicy = {
  requireApproval: true,
  timeoutMs: 10 * 60 * 1000,
  maxOutputBytes: 200_000,
  maxExecutionSteps: 8,
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function shortHash(value: string): string {
  return sha256(value).slice(0, 10);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "codex-contract";
}

function isInsideOrEqual(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function redactText(value: string): { value: string; redacted: boolean } {
  let redacted = false;
  const next = value
    .replace(KEY_VALUE_SECRET_PATTERN, (match, key) => {
      redacted = true;
      return `${key}: [REDACTED]`;
    })
    .replace(SECRET_VALUE_PATTERN, () => {
      redacted = true;
      return "[REDACTED]";
    });

  if (SENSITIVE_KEY_PATTERN.test(value) && next === value) {
    return { value: "[REDACTED]", redacted: true };
  }

  return { value: next, redacted };
}

function redactStringList(values: string[]): { values: string[]; redacted: boolean } {
  let redacted = false;
  const redactedValues = values.map((value) => {
    const result = redactText(value);
    redacted ||= result.redacted;
    return result.value;
  });
  return { values: redactedValues, redacted };
}

function redactImportText(value: string): { value: string; redactionCount: number } {
  let redactionCount = 0;
  const next = value
    .replace(PRIVATE_KEY_PATTERN, () => {
      redactionCount += 1;
      return "[REDACTED_PRIVATE_KEY]";
    })
    .replace(ENV_SECRET_PATTERN, () => {
      redactionCount += 1;
      return "[REDACTED_ENV_SECRET]";
    })
    .replace(KEY_VALUE_SECRET_PATTERN, (match, key) => {
      redactionCount += 1;
      return `${key}: [REDACTED]`;
    })
    .replace(SECRET_VALUE_PATTERN, () => {
      redactionCount += 1;
      return "[REDACTED]";
    });

  if (SENSITIVE_KEY_PATTERN.test(value) && next === value) {
    return { value: "[REDACTED]", redactionCount: 1 };
  }

  return { value: next, redactionCount };
}

function truncateBytes(value: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxBytes))}\n[TRUNCATED ${bytes - maxBytes} bytes]`;
}

function redactExecutionText(value: string, maxBytes: number): { value: string; redactionCount: number } {
  const redacted = redactImportText(value);
  return {
    value: truncateBytes(redacted.value, maxBytes),
    redactionCount: redacted.redactionCount,
  };
}

function previewExecutionText(value: string, maxChars = 1200): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars).trimEnd()}\n[TRUNCATED]` : trimmed;
}

function visibleModelResponseText(value: string): { value?: string; redactionCount: number } {
  const redacted = redactImportText(value);
  const trimmed = redacted.value.trim();
  return {
    value: trimmed || undefined,
    redactionCount: redacted.redactionCount,
  };
}

function safeExecutionEnv(): NodeJS.ProcessEnv {
  const names = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TEMP", "TMP", "CODEX_HOME"];
  const env: NodeJS.ProcessEnv = {};
  for (const name of names) {
    const value = process.env[name];
    if (value && !SENSITIVE_KEY_PATTERN.test(name)) {
      env[name] = value;
    }
  }
  return env;
}

function bullet(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None declared.";
}

function matchesSimpleGlob(filePath: string, glob: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const normalizedGlob = glob.replace(/\\/g, "/");
  if (normalizedGlob === normalizedPath) {
    return true;
  }
  if (normalizedGlob.endsWith("/**")) {
    return normalizedPath.startsWith(normalizedGlob.slice(0, -3));
  }
  if (normalizedGlob.startsWith("**/*")) {
    return normalizedPath.toLowerCase().includes(normalizedGlob.slice(4).toLowerCase());
  }
  if (normalizedGlob.endsWith("*")) {
    return normalizedPath.startsWith(normalizedGlob.slice(0, -1));
  }
  return false;
}

function isProtectedPath(filePath: string, protectedGlobs: string[]): boolean {
  return protectedGlobs.some((glob) => matchesSimpleGlob(filePath, glob));
}

function isAllowedPath(filePath: string, allowedGlobs: string[]): boolean {
  return allowedGlobs.some((glob) => matchesSimpleGlob(filePath, glob));
}

function isExactlyAuthorizedPath(
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
      normalizedAuthorization === normalizedFile
    );
  });
}

async function executableExists(candidate: string): Promise<boolean> {
  try {
    const info = await stat(candidate);
    if (!info.isFile()) {
      return false;
    }
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export class LocalCodexContractAdapter implements CodexAdapter {
  private readonly managedArtifactRoot: string;
  private readonly runStore?: RunStore;
  private readonly defaultRunId?: string;
  private readonly actor: Actor;
  private readonly pathEnv?: string;
  private readonly policyEngine = new ConservativePolicyEngine();
  private readonly processes = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly processGroupCleanups = new WeakMap<
    ChildProcessWithoutNullStreams,
    Promise<boolean>
  >();

  constructor(options: LocalCodexContractAdapterOptions = {}) {
    this.managedArtifactRoot = path.resolve(options.managedArtifactRoot ?? path.join(tmpdir(), "orynt", "codex-artifacts"));
    this.runStore = options.runStore;
    this.defaultRunId = options.runId;
    this.actor = options.actor ?? { kind: "runtime", id: "codex-adapter", displayName: "Codex Adapter" };
    this.pathEnv = options.pathEnv;
  }

  async detectCodex(runId = this.defaultRunId): Promise<CodexAdapterStatus> {
    const pathValue = this.pathEnv ?? process.env.PATH ?? "";
    const candidates = pathValue
      .split(delimiter)
      .filter(Boolean)
      .flatMap((entry) => [path.join(entry, "codex"), path.join(entry, "codex.exe")]);

    let executablePath: string | undefined;
    for (const candidate of candidates) {
      if (await executableExists(candidate)) {
        executablePath = candidate;
        break;
      }
    }

    const status: CodexAdapterStatus = {
      provider: executablePath ? LOCAL_CLI_PROVIDER : CONTRACT_PROVIDER,
      available: Boolean(executablePath),
      executionMode: "contract_only",
      executablePath,
      detectedAt: new Date().toISOString(),
      reasons: executablePath
        ? ["Codex CLI executable was found on PATH but was not invoked."]
        : ["Codex CLI was not found on PATH; contract-only mode remains available."],
    };

    if (runId) {
      this.runStore?.appendEvent(runId, {
        type: status.available ? "codex_detected" : "codex_missing",
        actor: this.actor,
        payload: {
          summary: status.reasons.join(" "),
          status,
        },
      });
    }

    return status;
  }

  createContract(request: CodexContractRequest): CodexContract {
    this.runStore?.appendEvent(request.runId, {
      type: "codex_contract_requested",
      actor: this.actor,
      payload: {
        summary: "Codex contract generation requested",
        taskId: request.taskId,
        artifactRoot: request.artifactRoot,
      },
    });

    const goal = redactText(request.goal);
    const context = redactStringList(request.context);
    const constraints = redactStringList(request.constraints);
    const doneWhen = redactStringList(request.doneWhen);
    const validationCommands = redactStringList(request.validationCommands);
    const executionMode = request.executionMode ?? "contract_only";
    const selectedModelId = request.modelId?.trim();
    const redactionApplied = goal.redacted || context.redacted || constraints.redacted || doneWhen.redacted || validationCommands.redacted;
    const contractId = `codex-contract-${slug(request.runId)}-${slug(request.taskId)}-${shortHash(
      `${request.runId}:${request.taskId}:${request.sandbox.worktreePath}:${goal.value}`,
    )}`;
    const createdAt = new Date().toISOString();
    const allowedPaths = request.policy.sandbox.repository.allowedPaths;
    const protectedPaths = request.policy.sandbox.repository.protectedPaths;
    const blockedCommands = request.policy.sandbox.commandPolicy.blockedCommands;

    const safetyConstraints = [
      `Work only inside sandbox path: ${request.sandbox.worktreePath}`,
      `Repository source path is context only: ${request.repository.gitRoot}`,
      "Do not access secrets, credentials, tokens, passwords, cookies, OTPs, or raw sensitive values.",
      "Do not run network, dependency installation, git push/merge, destructive, privileged, or non-allowlisted commands without Orynt approval.",
      "Do not claim success; the Orynt verifier will decide success after deterministic validation.",
      `Allowed paths: ${allowedPaths.join(", ")}`,
      `Protected paths: ${protectedPaths.join(", ")}`,
      `Blocked commands: ${blockedCommands.join(", ")}`,
      ...constraints.values,
    ];

    const markdown = [
      "# Codex Work Contract",
      "",
      `Contract ID: ${contractId}`,
      `Provider: ${executionMode === "contract_only" ? CONTRACT_PROVIDER.name : LOCAL_CLI_PROVIDER.name}`,
      `Execution mode: ${executionMode}`,
      "",
      "## Goal",
      goal.value,
      "",
      "## Context",
      bullet([
        `Run ID: ${request.runId}`,
        `Task ID: ${request.taskId}`,
        ...(selectedModelId ? [`Selected model: ${request.modelLabel ?? selectedModelId} (${selectedModelId})`] : []),
        ...(request.modelRole ? [`Orchestration role: ${request.modelRole}`] : []),
        ...(request.thinkingEffort ? [`Thinking effort: ${request.thinkingEffort}`] : []),
        `Sandbox path: ${request.sandbox.worktreePath}`,
        `Sandbox branch: ${request.sandbox.branchName}`,
        `Repository root: ${request.repository.gitRoot}`,
        `Current commit: ${request.repository.currentCommit}`,
        `Current branch: ${request.repository.currentBranch ?? "detached"}`,
        `Dirty working tree before sandbox: ${request.repository.isDirty ? "yes" : "no"}`,
        `Remote configured: ${request.repository.hasRemote ? "yes" : "no"}`,
        ...context.values,
      ]),
      "",
      "## Constraints",
      bullet(safetyConstraints),
      "",
      "## Done when",
      bullet(doneWhen.values),
      "",
      "## Budget Notes",
      bullet([
        `Max steps: ${request.budget.maxSteps}`,
        `Max wall time ms: ${request.budget.maxWallTimeMs}`,
        `Max model tokens: ${request.budget.maxModelTokens}`,
        `Max USD: ${request.budget.maxUsd ?? "not set"}`,
        `Stop on budget exceeded: ${request.budget.stopOnBudgetExceeded ? "yes" : "no"}`,
      ]),
      "",
      "## Validation Expectations",
      bullet(validationCommands.values.length > 0 ? validationCommands.values : ["The Orynt verifier will select deterministic validation in a later slice."]),
      "",
      "## Execution Instructions",
      executionMode === "contract_only"
        ? "This artifact is a safe handoff contract only. Orynt has not executed Codex, spawned an external agent, or run arbitrary shell commands."
        : [
            "Implement the requested repository task directly in the sandbox.",
            "Prefer a complete, runnable vertical slice over placeholders. For fullstack web tasks, include a frontend entry, backend/API code, package.json scripts, and README run instructions.",
            "Do not stop after planning or scaffolding. Write the files needed for the app to run locally and for the Orynt verifier command to pass.",
          ].join("\n"),
      "",
    ].join("\n");

    return {
      id: contractId,
      runId: request.runId,
      taskId: request.taskId,
      provider: executionMode === "contract_only" ? CONTRACT_PROVIDER : LOCAL_CLI_PROVIDER,
      executionMode,
      goal: goal.value,
      markdown,
      metadata: {
        id: contractId,
        runId: request.runId,
        taskId: request.taskId,
        providerId: executionMode === "contract_only" ? CONTRACT_PROVIDER.id : LOCAL_CLI_PROVIDER.id,
        executionMode,
        repository: request.repository,
        sandbox: request.sandbox,
        allowedPaths,
        protectedPaths,
        blockedCommands,
        validationCommands: validationCommands.values,
        modelId: selectedModelId,
        modelLabel: selectedModelId ? request.modelLabel ?? selectedModelId : undefined,
        modelRole: request.modelRole,
        thinkingEffort: request.thinkingEffort,
        parentInvocationId: request.parentInvocationId,
        budget: request.budget,
        redactionApplied,
        createdAt,
      },
    };
  }

  async writeContractArtifact(contract: CodexContract, artifactRoot: string): Promise<CodexContractArtifact> {
    try {
      const safeArtifactRoot = await this.validateArtifactRoot(artifactRoot);
      await mkdir(safeArtifactRoot, { recursive: true });
      const markdownPath = path.join(safeArtifactRoot, "codex-contract.md");
      const metadataPath = path.join(safeArtifactRoot, "codex-contract.metadata.json");
      const metadataJson = `${JSON.stringify(contract.metadata, null, 2)}\n`;

      await writeFile(markdownPath, contract.markdown, { encoding: "utf8", flag: "wx" });
      await writeFile(metadataPath, metadataJson, { encoding: "utf8", flag: "wx" });

      const artifact: CodexContractArtifact = {
        contractId: contract.id,
        runId: contract.runId,
        taskId: contract.taskId,
        artifactRoot: safeArtifactRoot,
        markdownPath,
        metadataPath,
        markdownSha256: sha256(contract.markdown),
        metadataSha256: sha256(metadataJson),
        artifacts: [
          {
            id: `${contract.id}-markdown`,
            kind: "codex_contract",
            uri: `file://${markdownPath}`,
            label: "Codex work contract",
            sha256: sha256(contract.markdown),
          },
          {
            id: `${contract.id}-metadata`,
            kind: "codex_contract_metadata",
            uri: `file://${metadataPath}`,
            label: "Codex contract metadata",
            sha256: sha256(metadataJson),
          },
        ],
      };

      this.runStore?.appendEvent(contract.runId, {
        type: "codex_contract_created",
        actor: this.actor,
        payload: {
          summary: "Codex contract artifacts created",
          contractId: contract.id,
          artifact,
        },
        artifacts: artifact.artifacts,
      });
      this.runStore?.appendEvent(contract.runId, {
        type: "codex_manual_next_step",
        actor: this.actor,
        payload: {
          summary: "Manual next step: review the generated Codex contract before any provider execution",
          executionMode: contract.executionMode,
          markdownPath,
        },
      });

      return artifact;
    } catch (error) {
      const failure =
        error instanceof CodexAdapterFailure
          ? error
          : new CodexAdapterFailure("artifact_write_failed", error instanceof Error ? error.message : "Failed to write Codex contract artifacts.", [artifactRoot]);
      this.runStore?.appendEvent(contract.runId, {
        type: "codex_contract_write_failed",
        actor: this.actor,
        payload: {
          summary: failure.message,
          error: {
            code: failure.code,
            evidence: failure.evidence,
          },
        },
      });
      throw failure;
    }
  }

  summarizeContract(contract: CodexContract): string {
    return `Codex contract ${contract.id} for ${contract.taskId} is ready in ${contract.executionMode} mode.`;
  }

  explainExecutionMode(mode: CodexExecutionMode, status?: CodexAdapterStatus): string {
    if (mode === "contract_only") {
      return status?.available
        ? "Codex CLI was detected, but this slice only generates reviewable contract artifacts."
        : "Codex CLI is missing or unconfigured; this slice still generates reviewable contract artifacts.";
    }
    if (mode === "manual_cli") {
      return "Manual CLI mode is a future handoff path and is not executed by Orynt in this slice.";
    }
    if (mode === "app_server") {
      return "Codex App Server mode is reserved for the future provider runtime.";
    }
    return "Codex SDK mode is reserved for a future provider integration.";
  }

  async planExecution(request: CodexExecutionRequest): Promise<CodexExecutionPlan> {
    const runId = request.contract.runId;
    const taskId = request.contract.taskId;
    const executionPolicy: CodexExecutionPolicy = {
      ...DEFAULT_EXECUTION_POLICY,
      ...request.executionPolicy,
    };
    const safeArtifactRoot = await this.validateArtifactRoot(request.artifactRoot);
    await mkdir(safeArtifactRoot, { recursive: true });
    const stdoutPath = path.join(safeArtifactRoot, "codex-execution-stdout.redacted.log");
    const stderrPath = path.join(safeArtifactRoot, "codex-execution-stderr.redacted.log");
    const lastMessagePath = path.join(safeArtifactRoot, "codex-execution-last-message.redacted.md");
    const resultPath = path.join(safeArtifactRoot, "codex-execution-result.json");
    const planPath = path.join(safeArtifactRoot, "codex-execution-plan.json");
    const status = await this.detectCodex(runId);
    const failureReasons: CodexExecutionFailureReason[] = [];
    const policyDecision = this.policyEngine.evaluateAction(
      {
        id: `codex-execution-${slug(runId)}-${slug(taskId)}`,
        kind: "command",
        summary: "Run local Codex CLI against generated Orynt contract",
        command: "codex exec",
      },
      request.policy,
    );

    if (!status.available || !status.executablePath) {
      failureReasons.push("codex_missing");
    }
    if (policyDecision.decision === "block") {
      failureReasons.push("policy_blocked");
    }
    if (!request.verifierPlan) {
      failureReasons.push("verifier_plan_missing");
    }
    if (executionPolicy.maxExecutionSteps > request.budget.maxSteps) {
      failureReasons.push("budget_exceeded");
    }

    try {
      await this.validateExecutionSandbox(request.sandbox, request.policy);
    } catch (error) {
      const code = error instanceof CodexExecutionFailure ? error.code : "sandbox_missing";
      failureReasons.push(code);
    }

    try {
      await this.validateContractFile(request.contractArtifact.markdownPath, safeArtifactRoot);
    } catch (error) {
      const code = error instanceof CodexExecutionFailure ? error.code : "contract_missing";
      failureReasons.push(code);
    }

    const uniqueFailures = [...new Set(failureReasons)];
    const approvalRequired = executionPolicy.requireApproval || policyDecision.decision === "require_approval";
    const plan: CodexExecutionPlan = {
      id: `codex-execution-plan-${slug(runId)}-${slug(taskId)}-${shortHash(
        `${request.contract.id}:${request.sandbox.worktreePath}:${request.contractArtifact.markdownSha256}`,
      )}`,
      runId,
      taskId,
      status: uniqueFailures.length > 0 ? "blocked" : approvalRequired ? "approval_required" : "approved",
      provider: status.provider,
      executablePath: status.executablePath,
      argv: [
        "exec",
        "--json",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "-c",
        "model_reasoning_summary=auto",
        "--sandbox",
        "workspace-write",
        ...(request.contract.metadata.modelId ? ["-m", request.contract.metadata.modelId] : []),
        ...(request.contract.metadata.thinkingEffort
          ? [
              "-c",
              `model_reasoning_effort=${JSON.stringify(request.contract.metadata.thinkingEffort)}`,
            ]
          : []),
        "-C",
        request.sandbox.worktreePath,
        "--output-last-message",
        lastMessagePath,
        "-",
      ],
      cwd: request.sandbox.worktreePath,
      contractPath: request.contractArtifact.markdownPath,
      artifactRoot: safeArtifactRoot,
      stdoutPath,
      stderrPath,
      lastMessagePath,
      resultPath,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      executionPolicy,
      policyDecision,
      verifierPlanId: request.verifierPlan?.id,
      validationCommands: request.contract.metadata.validationCommands,
      modelRole: request.contract.metadata.modelRole,
      thinkingEffort: request.contract.metadata.thinkingEffort,
      parentInvocationId: request.contract.metadata.parentInvocationId,
      approvalRequired,
      failureReasons: uniqueFailures,
      artifacts: [
        {
          id: `${request.contract.id}-execution-plan`,
          kind: "codex_execution_plan",
          uri: `file://${planPath}`,
          label: "Codex execution plan",
        },
      ],
      createdAt: new Date().toISOString(),
    };
    const planJson = `${JSON.stringify(plan, null, 2)}\n`;
    await writeFile(planPath, planJson, { encoding: "utf8" });
    plan.artifacts[0] = {
      ...plan.artifacts[0],
      sha256: sha256(planJson),
    };
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8" });

    this.runStore?.appendEvent(runId, {
      type: "codex_execution_planned",
      actor: this.actor,
      payload: {
        summary: uniqueFailures.length > 0 ? "Controlled Codex execution plan is blocked" : "Controlled Codex execution plan created",
        planId: plan.id,
        status: plan.status,
        failureReasons: uniqueFailures,
      },
      artifacts: plan.artifacts,
      safety: policyDecisionToSafetySnapshot(request.policy, policyDecision),
    });

    if (uniqueFailures.length > 0) {
      this.runStore?.appendEvent(runId, {
        type: "codex_execution_blocked",
        actor: this.actor,
        payload: {
          summary: `Controlled Codex execution blocked: ${uniqueFailures.join(", ")}`,
          planId: plan.id,
          failureReasons: uniqueFailures,
        },
        safety: policyDecisionToSafetySnapshot(request.policy, policyDecision),
      });
      return plan;
    }

    if (approvalRequired) {
      this.runStore?.appendEvent(runId, {
        type: "codex_execution_approval_required",
        actor: this.actor,
        payload: {
          summary: "Controlled Codex execution requires explicit operator approval",
          planId: plan.id,
          policyDecision,
        },
        artifacts: plan.artifacts,
        safety: {
          ...policyDecisionToSafetySnapshot(request.policy, policyDecision),
          approvalRequired: true,
        },
      });
    }

    return plan;
  }

  requestExecutionApproval(plan: CodexExecutionPlan): CodexExecutionApproval {
    const approval: CodexExecutionApproval = {
      id: `approval-${plan.id}`,
      runId: plan.runId,
      planId: plan.id,
      status: "pending",
      approvedBy: "",
      reason: "Controlled Codex execution requires explicit operator approval.",
    };
    this.runStore?.appendEvent(plan.runId, {
      type: "codex_execution_approval_required",
      actor: this.actor,
      payload: {
        summary: approval.reason,
        approval,
      },
    });
    return approval;
  }

  async executeApprovedContract(
    plan: CodexExecutionPlan,
    approval: CodexExecutionApproval,
    options: { signal?: AbortSignal } = {},
  ): Promise<CodexExecutionResult> {
    if (plan.status === "blocked" || plan.failureReasons.length > 0) {
      return this.failExecution(plan, "policy_blocked", `Controlled Codex execution cannot start: ${plan.failureReasons.join(", ")}`);
    }
    if (approval.runId !== plan.runId || approval.planId !== plan.id) {
      return this.failExecution(plan, "approval_mismatch", "Controlled Codex execution approval does not match the execution plan.");
    }
    if (approval.status === "denied") {
      return this.failExecution(plan, "approval_denied", "Controlled Codex execution was denied by the operator.");
    }
    if (approval.status !== "approved") {
      return this.failExecution(plan, "approval_missing", "Controlled Codex execution requires explicit approved status before spawning Codex.");
    }
    if (!plan.executablePath) {
      return this.failExecution(plan, "codex_missing", "Codex executable path is missing from the execution plan.");
    }

    await this.validateExecutionSandbox(plan.sandbox, plan.policy);
    const contractPath = await this.validateContractFile(plan.contractPath, plan.artifactRoot);
    const contractMarkdown = await readFile(contractPath, "utf8");
    const processRef: CodexProcessRef = {
      id: `codex-process-${shortHash(`${plan.id}:${Date.now()}`)}`,
      runId: plan.runId,
      planId: plan.id,
      status: "running",
      startedAt: new Date().toISOString(),
    };

    this.runStore?.appendEvent(plan.runId, {
      type: "codex_execution_approved",
      actor: this.actor,
      payload: {
        summary: "Controlled Codex execution approved",
        approvalId: approval.id,
        planId: plan.id,
        approvedBy: approval.approvedBy,
        approvalSource: approval.authorizationSource ?? "operator",
      },
    });
    this.runStore?.appendEvent(plan.runId, {
      type: "codex_execution_started",
      actor: this.actor,
      payload: {
        summary: "Controlled Codex execution started",
        planId: plan.id,
        processRef,
        argv: plan.argv.map((arg) => (arg === plan.contractPath ? "<contract>" : arg)),
      },
    });

    const startedAt = processRef.startedAt ?? new Date().toISOString();
    const outcome = await this.spawnCodex(plan, contractMarkdown, processRef, options.signal);
    const completedAt = new Date().toISOString();
    processRef.status = outcome.cancelled ? "cancelled" : outcome.timedOut ? "failed" : outcome.exitCode === 0 ? "finished" : "failed";
    processRef.finishedAt = completedAt;

    const stdout = redactExecutionText(outcome.stdout, plan.executionPolicy.maxOutputBytes);
    const stderr = redactExecutionText(outcome.stderr, plan.executionPolicy.maxOutputBytes);
    const lastMessage = await this.readOptionalLastMessage(plan.lastMessagePath);
    const redactedPaths: string[] = [];
    let redactionCount = 0;
    if (stdout.redactionCount > 0) {
      redactedPaths.push("stdout");
      redactionCount += stdout.redactionCount;
    }
    if (stderr.redactionCount > 0) {
      redactedPaths.push("stderr");
      redactionCount += stderr.redactionCount;
    }
    if (lastMessage.redactionCount > 0) {
      redactedPaths.push("lastMessage");
      redactionCount += lastMessage.redactionCount;
    }
    const failureReasons: CodexExecutionFailureReason[] = [];
    if (outcome.cancelled) {
      failureReasons.push("execution_cancelled");
    } else if (outcome.timedOut) {
      failureReasons.push("execution_timeout");
    } else if (outcome.exitCode !== 0) {
      failureReasons.push("execution_failed");
    }

    await writeFile(plan.stdoutPath, stdout.value, { encoding: "utf8" });
    await writeFile(plan.stderrPath, stderr.value, { encoding: "utf8" });
    if (lastMessage.path) {
      await writeFile(plan.lastMessagePath, lastMessage.value, { encoding: "utf8" });
    }

    const result: CodexExecutionResult = {
      id: `codex-execution-result-${slug(plan.runId)}-${slug(plan.taskId)}-${shortHash(`${plan.id}:${completedAt}`)}`,
      planId: plan.id,
      runId: plan.runId,
      taskId: plan.taskId,
      status: processRef.status,
      provider: plan.provider,
      process: processRef,
      sandbox: plan.sandbox,
      policy: plan.policy,
      budget: plan.budget,
      artifactRoot: plan.artifactRoot,
      stdoutPath: plan.stdoutPath,
      stderrPath: plan.stderrPath,
      lastMessagePath: lastMessage.path,
      resultPath: plan.resultPath,
      stdoutSummary: stdout.value,
      stderrSummary: stderr.value,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      failureReasons,
      redaction: {
        applied: redactionCount > 0,
        redactedPaths,
        redactionCount,
      },
      validationCommands: plan.validationCommands,
      artifacts: [],
      startedAt,
      completedAt,
      summary: "",
    };
    result.summary = this.summarizeExecution(result);
    const lastMessagePreview = lastMessage.value || undefined;
    const resultJson = `${JSON.stringify(result, null, 2)}\n`;
    const artifacts: CodexExecutionResult["artifacts"] = [
      {
        id: `${result.id}-stdout`,
        kind: "codex_execution_log",
        uri: `file://${plan.stdoutPath}`,
        label: "Redacted Codex stdout",
        sha256: sha256(stdout.value),
      },
      {
        id: `${result.id}-stderr`,
        kind: "codex_execution_log",
        uri: `file://${plan.stderrPath}`,
        label: "Redacted Codex stderr",
        sha256: sha256(stderr.value),
      },
      ...(lastMessage.path
        ? [
            {
              id: `${result.id}-last-message`,
              kind: "summary" as const,
              uri: `file://${plan.lastMessagePath}`,
              label: "Codex final model response",
              sha256: sha256(lastMessage.value),
            },
          ]
        : []),
      {
        id: `${result.id}-json`,
        kind: "codex_execution_result",
        uri: `file://${plan.resultPath}`,
        label: "Controlled Codex execution result",
        sha256: sha256(resultJson),
      },
    ];
    result.artifacts = artifacts;
    await writeFile(plan.resultPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8" });

    this.runStore?.appendEvent(plan.runId, {
      type: "codex_execution_output_recorded",
      actor: this.actor,
      payload: {
        summary: "Controlled Codex execution output recorded and redacted",
        planId: plan.id,
        redaction: result.redaction,
        stdoutSummary: previewExecutionText(stdout.value, 600),
        stderrSummary: previewExecutionText(stderr.value, 600),
        lastMessagePreview,
      },
      artifacts,
    });

    this.runStore?.appendEvent(plan.runId, {
      type: result.status === "finished" ? "codex_execution_finished" : "codex_execution_failed",
      actor: this.actor,
      payload: {
        summary: result.summary,
        planId: plan.id,
        exitCode: result.exitCode,
        failureReasons: result.failureReasons,
        lastMessagePreview,
      },
      artifacts: result.artifacts,
    });
    if (result.status === "finished") {
      this.runStore?.appendEvent(plan.runId, {
        type: "codex_execution_result_ready",
        actor: this.actor,
        payload: {
          summary: "Controlled Codex execution result is ready for import; verification remains a separate stage",
          resultId: result.id,
          importReady: true,
        },
        artifacts: result.artifacts,
      });
    }

    return result;
  }

  async cancelExecution(ref: CodexProcessRef): Promise<CodexExecutionResult | CodexProcessRef> {
    this.runStore?.appendEvent(ref.runId, {
      type: "codex_execution_cancel_requested",
      actor: this.actor,
      payload: {
        summary: "Controlled Codex execution cancellation requested",
        processRef: ref,
      },
    });
    const child = this.processes.get(ref.id);
    if (child && !child.killed) {
      await this.terminateProcessGroup(child);
    }
    const cancelled = {
      ...ref,
      status: "cancelled" as const,
      finishedAt: new Date().toISOString(),
    };
    return cancelled;
  }

  summarizeExecution(result: CodexExecutionResult): string {
    if (result.status === "finished") {
      return `Controlled Codex execution finished with exit code ${result.exitCode}.`;
    }
    if (result.timedOut) {
      return "Controlled Codex execution timed out before producing a trusted result.";
    }
    return `Controlled Codex execution failed: ${result.failureReasons.join(", ") || "execution_failed"}.`;
  }

  createResultImportRequest(result: CodexExecutionResult): CodexResultImportRequest {
    return {
      runId: result.runId,
      taskId: result.taskId,
      sandbox: result.sandbox,
      policy: result.policy,
      budget: result.budget,
      artifactRoot: result.artifactRoot,
      manualLogPath: result.lastMessagePath ?? result.stdoutPath,
      validationCommands: result.validationCommands,
      userNotes: result.summary,
    };
  }

  private async failExecution(plan: CodexExecutionPlan, code: CodexExecutionFailureReason, message: string): Promise<never> {
    this.runStore?.appendEvent(plan.runId, {
      type: "codex_execution_blocked",
      actor: this.actor,
      payload: {
        summary: message,
        planId: plan.id,
        failureReasons: [code],
      },
    });
    throw new CodexExecutionFailure(code, message, [plan.id]);
  }

  private async spawnCodex(
    plan: CodexExecutionPlan,
    contractMarkdown: string,
    processRef: CodexProcessRef,
    signal?: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; cancelled: boolean }> {
    return new Promise((resolve) => {
      const child = spawn(plan.executablePath ?? "codex", plan.argv, {
        cwd: plan.cwd,
        env: safeExecutionEnv(),
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      processRef.pid = child.pid;
      this.processes.set(processRef.id, child);
      let stdout = "";
      let stdoutJsonlBuffer = "";
      let stderr = "";
      const lastStreamedItemText = new Map<string, string>();
      const emitCodexStreamItem = (line: string) => {
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (typeof event !== "object" || event === null || !("type" in event)) {
          return;
        }
        const eventRecord = event as { type?: unknown; item?: unknown };
        if (eventRecord.type !== "item.started" && eventRecord.type !== "item.updated" && eventRecord.type !== "item.completed") {
          return;
        }
        if (typeof eventRecord.item !== "object" || eventRecord.item === null) {
          return;
        }
        const item = eventRecord.item as { id?: unknown; type?: unknown; text?: unknown };
        if (item.type !== "reasoning" && item.type !== "agent_message") {
          return;
        }
        if (typeof item.id !== "string" || typeof item.text !== "string" || !item.text.trim()) {
          return;
        }
        const previousText = lastStreamedItemText.get(item.id);
        if (previousText === item.text) {
          return;
        }
        lastStreamedItemText.set(item.id, item.text);
        const textPreview = item.type === "agent_message" ? visibleModelResponseText(item.text).value : previewExecutionText(item.text, 1_200);
        if (!textPreview) {
          return;
        }
        this.runStore?.appendEvent(plan.runId, {
          type: item.type === "reasoning" ? "codex_reasoning_summary" : "codex_agent_message",
          actor: this.actor,
          payload: {
            summary: item.type === "reasoning" ? textPreview : "Codex agent response streamed",
            planId: plan.id,
            processId: processRef.id,
            itemId: item.id,
            streamEventType: eventRecord.type,
            status: eventRecord.type.replace("item.", ""),
            ...(item.type === "agent_message" ? { message: textPreview } : { text: textPreview }),
          },
        });
      };
      let settled = false;
      let timedOut = false;
      let cancelled = false;
      const onAbort = () => {
        if (settled || cancelled) return;
        cancelled = true;
        void this.cancelExecution(processRef);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      const timer = setTimeout(() => {
        timedOut = true;
        void this.terminateProcessGroup(child);
      }, plan.executionPolicy.timeoutMs);

      child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        stdout += text;
        stdoutJsonlBuffer += text;
        const lines = stdoutJsonlBuffer.split(/\r?\n/);
        stdoutJsonlBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            emitCodexStreamItem(trimmed);
          }
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const flushBufferedStdoutEvent = () => {
        const trimmed = stdoutJsonlBuffer.trim();
        if (trimmed) {
          emitCodexStreamItem(trimmed);
        }
        stdoutJsonlBuffer = "";
      };
      child.on("error", async (error) => {
        if (settled) {
          return;
        }
        settled = true;
        flushBufferedStdoutEvent();
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        await this.terminateProcessGroup(child);
        this.processes.delete(processRef.id);
        resolve({ stdout, stderr: `${stderr}${error.message}`, exitCode: 1, timedOut, cancelled });
      });
      child.on("close", async (code) => {
        if (settled) {
          return;
        }
        settled = true;
        flushBufferedStdoutEvent();
        for (const line of stdout.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed) emitCodexStreamItem(trimmed);
        }
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        const cleanupComplete = await this.terminateProcessGroup(child);
        this.processes.delete(processRef.id);
        resolve({
          stdout,
          stderr: cleanupComplete
            ? stderr
            : `${stderr}${stderr.endsWith("\n") || !stderr ? "" : "\n"}Controlled Codex process group did not terminate.`,
          exitCode: cleanupComplete ? code : 1,
          timedOut,
          cancelled,
        });
      });
      child.stdin.end(contractMarkdown);
    });
  }

  private terminateProcessGroup(
    child: ChildProcessWithoutNullStreams,
  ): Promise<boolean> {
    const existing = this.processGroupCleanups.get(child);
    if (existing) {
      return existing;
    }
    const cleanup = this.performProcessGroupCleanup(child);
    this.processGroupCleanups.set(child, cleanup);
    return cleanup;
  }

  private async performProcessGroupCleanup(
    child: ChildProcessWithoutNullStreams,
  ): Promise<boolean> {
    this.signalProcessGroup(child, "SIGTERM");
    if (await this.waitForProcessGroupExit(child, 150)) {
      return true;
    }
    this.signalProcessGroup(child, "SIGKILL");
    return this.waitForProcessGroupExit(child, 150);
  }

  private signalProcessGroup(
    child: ChildProcessWithoutNullStreams,
    signal: NodeJS.Signals,
  ): void {
    if (process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The process group is already gone.
      }
      return;
    }
    if (!child.killed) {
      child.kill(signal);
    }
  }

  private async waitForProcessGroupExit(
    child: ChildProcessWithoutNullStreams,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (this.processGroupExists(child)) {
      if (Date.now() >= deadline) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return true;
  }

  private processGroupExists(child: ChildProcessWithoutNullStreams): boolean {
    const pid = child.pid;
    if (!pid) {
      return false;
    }
    try {
      process.kill(process.platform === "win32" ? pid : -pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }

  private async validateExecutionSandbox(sandbox: CodexExecutionPlan["sandbox"], policy: CodexExecutionPlan["policy"]): Promise<string> {
    let worktree: string;
    try {
      worktree = await realpath(path.resolve(sandbox.worktreePath));
    } catch {
      throw new CodexExecutionFailure("sandbox_missing", "Controlled Codex execution requires an existing managed sandbox worktree.", [sandbox.worktreePath]);
    }
    const managedRoot = path.resolve(policy.sandbox.repository.worktreePath);
    const sourceRepository = path.resolve(sandbox.repositoryPath);
    const gitRoot = path.resolve(sandbox.gitRoot);
    if (!isInsideOrEqual(worktree, managedRoot)) {
      throw new CodexExecutionFailure("unmanaged_sandbox", "Controlled Codex execution sandbox is outside the Orynt-managed worktree root.", [
        worktree,
        managedRoot,
      ]);
    }
    if (worktree === sourceRepository || worktree === gitRoot) {
      throw new CodexExecutionFailure("unmanaged_sandbox", "Controlled Codex execution cannot run in the source repository.", [worktree, sourceRepository, gitRoot]);
    }
    return worktree;
  }

  private async validateContractFile(contractPath: string, artifactRoot: string): Promise<string> {
    const resolvedRoot = await realpath(path.resolve(artifactRoot));
    const resolvedFile = path.resolve(contractPath);
    if (!isInsideOrEqual(resolvedFile, resolvedRoot)) {
      throw new CodexExecutionFailure("artifact_path_unsafe", "Controlled Codex execution contract must be inside the managed artifact root.", [
        resolvedFile,
        resolvedRoot,
      ]);
    }
    try {
      const existing = await realpath(resolvedFile);
      if (!isInsideOrEqual(existing, resolvedRoot)) {
        throw new CodexExecutionFailure("artifact_path_unsafe", "Controlled Codex execution contract resolves outside the managed artifact root.", [
          existing,
          resolvedRoot,
        ]);
      }
      return existing;
    } catch (error) {
      if (error instanceof CodexExecutionFailure) {
        throw error;
      }
      throw new CodexExecutionFailure("contract_missing", "Controlled Codex execution requires the generated contract artifact.", [resolvedFile]);
    }
  }

  private async readOptionalLastMessage(filePath: string): Promise<{ path?: string; value: string; redactionCount: number }> {
    try {
      const content = await readFile(filePath, "utf8");
      const redacted = visibleModelResponseText(content);
      return {
        path: filePath,
        value: redacted.value ?? "",
        redactionCount: redacted.redactionCount,
      };
    } catch {
      return { value: "", redactionCount: 0 };
    }
  }

  private async validateArtifactRoot(artifactRoot: string): Promise<string> {
    const resolvedRoot = path.resolve(artifactRoot);
    const managedRoot = path.resolve(this.managedArtifactRoot);
    if (!isInsideOrEqual(resolvedRoot, managedRoot)) {
      throw new CodexAdapterFailure("artifact_path_unsafe", "Codex contract artifact path is outside the Orynt-managed artifact root.", [
        resolvedRoot,
        managedRoot,
      ]);
    }

    await mkdir(managedRoot, { recursive: true });
    try {
      const existing = await realpath(resolvedRoot);
      if (!isInsideOrEqual(existing, managedRoot)) {
        throw new CodexAdapterFailure("artifact_path_unsafe", "Codex contract artifact path resolves outside the managed artifact root.", [existing, managedRoot]);
      }
      return existing;
    } catch (error) {
      if (error instanceof CodexAdapterFailure) {
        throw error;
      }
      return resolvedRoot;
    }
  }
}

export class LocalManualCodexResultImporter implements CodexResultImporter {
  private readonly managedArtifactRoot: string;
  private readonly runStore?: RunStore;
  private readonly actor: Actor;

  constructor(options: LocalManualCodexResultImporterOptions = {}) {
    this.managedArtifactRoot = path.resolve(options.managedArtifactRoot ?? path.join(tmpdir(), "orynt", "codex-artifacts"));
    this.runStore = options.runStore;
    this.actor = options.actor ?? { kind: "runtime", id: "codex-result-importer", displayName: "Codex Result Importer" };
  }

  async inspectSandboxChanges(request: CodexResultImportRequest): Promise<ImportedPatchSummary> {
    const safeWorktreePath = await this.validateSandboxPath(request);
    let nameStatus = "";
    let porcelainStatus = "";
    let diffStat = "";

    try {
      nameStatus = await this.runGit(
        ["diff", "--name-status", "-z", request.sandbox.baseRef, "--"],
        safeWorktreePath,
      );
      porcelainStatus = await this.runGit(
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        safeWorktreePath,
      );
      diffStat = await this.runGit(["diff", "--stat", request.sandbox.baseRef, "--"], safeWorktreePath);
    } catch (error) {
      throw new CodexResultImporterFailure("diff_unavailable", error instanceof Error ? error.message : "Failed to inspect sandbox git diff.", [safeWorktreePath]);
    }

    const changedFiles = this.mergeChangedFiles([
      ...this.parseNameStatus(nameStatus),
      ...this.parsePorcelainStatus(porcelainStatus),
    ]);
    const changedPaths = changedFiles.map((file) => file.path);
    const protectedFiles = changedPaths.filter((filePath) => isProtectedPath(filePath, request.policy.sandbox.repository.protectedPaths));
    const allowedFiles = changedPaths.filter((filePath) => isAllowedPath(filePath, request.policy.sandbox.repository.allowedPaths));
    const unexpectedFiles = changedPaths.filter((filePath) => !isAllowedPath(filePath, request.policy.sandbox.repository.allowedPaths));
    const authorizedPaths = request.expectedPaths ?? [];
    const unauthorizedFiles = changedPaths.filter(
      (filePath) =>
        filePath !== ".codex/orynt-beta-verify.mjs" &&
        ((request.requireExpectedPaths && authorizedPaths.length === 0) ||
          (authorizedPaths.length > 0 &&
            !isExactlyAuthorizedPath(filePath, authorizedPaths))),
    );

    return {
      baseRef: request.sandbox.baseRef,
      hasChanges: changedFiles.length > 0,
      changedFiles,
      allowedFiles,
      protectedFiles,
      unexpectedFiles,
      unauthorizedFiles,
      withinAllowedScope: unexpectedFiles.length === 0 && protectedFiles.length === 0,
      protectedPathTouched: protectedFiles.length > 0,
      diffStat,
      inspectedAt: new Date().toISOString(),
    };
  }

  async importManualLog(request: CodexResultImportRequest): Promise<ImportedCommandLog | undefined> {
    return request.manualLogPath ? this.importCommandLog(request.manualLogPath, request.artifactRoot, "manual_log") : undefined;
  }

  async importResultBundle(request: CodexResultImportRequest): Promise<CodexResultBundle> {
    this.runStore?.appendEvent(request.runId, {
      type: "codex_result_import_requested",
      actor: this.actor,
      payload: {
        summary: "Manual Codex result import requested",
        taskId: request.taskId,
        artifactRoot: request.artifactRoot,
      },
    });

    try {
      const safeArtifactRoot = await this.validateArtifactRoot(request.artifactRoot, request.sandbox.worktreePath);
      const safeRequest = { ...request, artifactRoot: safeArtifactRoot };
      const patch = await this.inspectSandboxChanges(safeRequest);
      this.runStore?.appendEvent(request.runId, {
        type: "codex_sandbox_diff_inspected",
        actor: this.actor,
        payload: {
          summary: "Inspected sandbox diff for manual Codex result import",
          changedFiles: patch.changedFiles.map((file) => file.path),
          protectedFiles: patch.protectedFiles,
          unexpectedFiles: patch.unexpectedFiles,
          unauthorizedFiles: patch.unauthorizedFiles ?? [],
          hasChanges: patch.hasChanges,
        },
      });

      const failureReasons: ImportFailureReason[] = [];
      if (!patch.hasChanges) {
        failureReasons.push("no_changes");
      }
      if (patch.protectedPathTouched) {
        failureReasons.push("protected_path_touched");
      }
      if (!patch.withinAllowedScope) {
        failureReasons.push("unexpected_file_touch");
      }
      if ((patch.unauthorizedFiles?.length ?? 0) > 0) {
        failureReasons.push("unauthorized_file_touch");
      }
      if (
        patch.changedFiles.length >
          request.policy.sandbox.fileWritePolicy.maxChangedFiles &&
        !request.allowChangedFileLimitExceeded
      ) {
        failureReasons.push("changed_file_limit_exceeded");
      }
      if (
        patch.changedFiles.some((file) =>
          file.status === "deleted" || file.status === "renamed"
        ) &&
        !request.allowDestructiveChanges
      ) {
        failureReasons.push("destructive_change_detected");
      }

      const manualLog = safeRequest.manualLogPath ? await this.importCommandLog(safeRequest.manualLogPath, safeArtifactRoot, "manual_log") : undefined;
      if (manualLog) {
        if (manualLog.malformed) {
          failureReasons.push("malformed_log");
        }
        this.runStore?.appendEvent(request.runId, {
          type: "codex_manual_log_imported",
          actor: this.actor,
          payload: {
            summary: "Imported manual Codex log from managed artifact directory",
            path: manualLog.path,
            malformed: manualLog.malformed,
          },
        });
      }

      const validationTranscript = safeRequest.validationTranscriptPath
        ? await this.importCommandLog(safeRequest.validationTranscriptPath, safeArtifactRoot, "validation_transcript")
        : undefined;
      if (validationTranscript?.malformed) {
        failureReasons.push("malformed_log");
      }

      const bundleId = `codex-result-${slug(request.runId)}-${slug(request.taskId)}-${shortHash(
        `${request.runId}:${request.taskId}:${request.sandbox.worktreePath}:${patch.changedFiles.map((file) => file.path).join(",")}`,
      )}`;
      const now = new Date().toISOString();
      const bundle: CodexResultBundle = {
        id: bundleId,
        runId: request.runId,
        taskId: request.taskId,
        status: failureReasons.length > 0 ? "manual_review_required" : "imported",
        failureReasons: [...new Set(failureReasons)],
        sandbox: request.sandbox,
        policy: request.policy,
        budget: request.budget,
        artifactRoot: safeArtifactRoot,
        patch,
        manualLog,
        validationTranscript,
        userNotes: request.userNotes,
        validationCommands: request.validationCommands ?? [],
        redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
        artifacts: [],
        createdAt: now,
        summary: {
          runId: request.runId,
          taskId: request.taskId,
          status: failureReasons.length > 0 ? "manual_review_required" : "imported",
          changedFileCount: patch.changedFiles.length,
          hasManualLog: Boolean(manualLog),
          hasValidationTranscript: Boolean(validationTranscript),
          requiresManualReview: failureReasons.length > 0,
          failureReasons: [...new Set(failureReasons)],
          summary: "",
        },
      };

      bundle.redaction = this.redactImport(bundle);
      bundle.summary = this.summarizeImport(bundle);
      this.runStore?.appendEvent(request.runId, {
        type: "codex_result_redacted",
        actor: this.actor,
        payload: {
          summary: "Redacted imported Codex result content",
          redaction: bundle.redaction,
        },
      });

      const bundlePath = path.join(safeArtifactRoot, "codex-result-import.json");
      const bundleJson = `${JSON.stringify(bundle, null, 2)}\n`;
      try {
        await writeFile(bundlePath, bundleJson, { encoding: "utf8" });
      } catch (error) {
        throw new CodexResultImporterFailure(
          "artifact_write_failed",
          error instanceof Error ? error.message : "Failed to write Codex result import artifact.",
          [bundlePath],
        );
      }

      const bundleArtifact = {
        id: `${bundle.id}-json`,
        kind: "codex_result_bundle" as const,
        uri: `file://${bundlePath}`,
        label: "Imported Codex result bundle",
        sha256: sha256(bundleJson),
        path: bundlePath,
        byteLength: Buffer.byteLength(bundleJson, "utf8"),
      };
      bundle.artifacts = [bundleArtifact];
      const persistedBundleJson = `${JSON.stringify(bundle, null, 2)}\n`;
      await writeFile(bundlePath, persistedBundleJson, { encoding: "utf8" });

      this.runStore?.appendEvent(request.runId, {
        type: "codex_result_imported",
        actor: this.actor,
        payload: {
          summary: bundle.summary.summary,
          status: bundle.status,
          failureReasons: bundle.failureReasons,
          changedFileCount: bundle.patch.changedFiles.length,
        },
        artifacts: bundle.artifacts,
      });

      if (bundle.status === "manual_review_required") {
        this.runStore?.appendEvent(request.runId, {
          type: "manual_review_required",
          actor: this.actor,
          payload: {
            summary: "Manual review required for imported Codex result",
            failureReasons: bundle.failureReasons,
          },
        });
      }

      return bundle;
    } catch (error) {
      const failure =
        error instanceof CodexResultImporterFailure
          ? error
          : new CodexResultImporterFailure("artifact_write_failed", error instanceof Error ? error.message : "Failed to import manual Codex result.", [
              request.artifactRoot,
            ]);
      this.runStore?.appendEvent(request.runId, {
        type: "codex_result_import_failed",
        actor: this.actor,
        payload: {
          summary: failure.message,
          error: {
            code: failure.code,
            evidence: failure.evidence,
          },
        },
      });
      throw failure;
    }
  }

  summarizeImport(bundle: CodexResultBundle): CodexRunSummary {
    const summary =
      bundle.status === "imported"
        ? `Imported manual Codex result with ${bundle.patch.changedFiles.length} changed files.`
        : `Imported manual Codex result requires review: ${bundle.failureReasons.join(", ")}.`;

    return {
      runId: bundle.runId,
      taskId: bundle.taskId,
      status: bundle.status,
      changedFileCount: bundle.patch.changedFiles.length,
      hasManualLog: Boolean(bundle.manualLog),
      hasValidationTranscript: Boolean(bundle.validationTranscript),
      requiresManualReview: bundle.status === "manual_review_required",
      failureReasons: bundle.failureReasons,
      summary,
    };
  }

  redactImport(bundle: CodexResultBundle): ImportRedactionResult {
    const redactedPaths: string[] = [];
    let redactionCount = 0;

    const redactField = (pathLabel: string, value: string | undefined): string | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const result = redactImportText(value);
      if (result.redactionCount > 0) {
        redactedPaths.push(pathLabel);
        redactionCount += result.redactionCount;
      }
      return result.value;
    };

    if (bundle.manualLog) {
      bundle.manualLog.content = redactField("manualLog.content", bundle.manualLog.content) ?? "";
      bundle.manualLog.sha256 = sha256(bundle.manualLog.content);
      bundle.manualLog.byteLength = Buffer.byteLength(bundle.manualLog.content, "utf8");
    }
    if (bundle.validationTranscript) {
      bundle.validationTranscript.content = redactField("validationTranscript.content", bundle.validationTranscript.content) ?? "";
      bundle.validationTranscript.sha256 = sha256(bundle.validationTranscript.content);
      bundle.validationTranscript.byteLength = Buffer.byteLength(bundle.validationTranscript.content, "utf8");
    }
    bundle.userNotes = redactField("userNotes", bundle.userNotes);
    bundle.validationCommands = bundle.validationCommands.map((command, index) => redactField(`validationCommands[${index}]`, command) ?? "");

    return {
      applied: redactionCount > 0,
      redactedPaths,
      redactionCount,
    };
  }

  createVerifierInput(bundle: CodexResultBundle): VerificationPlanRequest {
    const verifierInput: VerificationPlanRequest = {
      runId: bundle.runId,
      taskId: bundle.taskId,
      sandbox: bundle.sandbox,
      policy: bundle.policy,
      budget: bundle.budget,
      commands: bundle.validationCommands,
      artifactRoot: bundle.artifactRoot,
      config: {
        requireChangedFiles: true,
        artifactRoot: bundle.artifactRoot,
      },
    };

    this.runStore?.appendEvent(bundle.runId, {
      type: "verifier_input_created",
      actor: this.actor,
      payload: {
        summary: "Created verifier input from imported Codex result",
        changedFiles: bundle.patch.changedFiles.map((file) => file.path),
        commands: verifierInput.commands ?? [],
      },
      artifacts: [
        {
          id: `${bundle.id}-verifier-input`,
          kind: "verifier_input",
          uri: `file://${path.join(bundle.artifactRoot, "verifier-input.json")}`,
          label: "Verifier input from imported Codex result",
        },
      ],
    });

    return verifierInput;
  }

  private async validateArtifactRoot(artifactRoot: string, worktreePath: string): Promise<string> {
    const resolvedRoot = path.resolve(artifactRoot);
    const managedRoot = path.resolve(this.managedArtifactRoot);
    const resolvedWorktree = path.resolve(worktreePath);
    if (!isInsideOrEqual(resolvedRoot, managedRoot)) {
      throw new CodexResultImporterFailure("artifact_path_unsafe", "Codex result artifact path is outside the Orynt-managed artifact root.", [
        resolvedRoot,
        managedRoot,
      ]);
    }
    if (isInsideOrEqual(resolvedRoot, resolvedWorktree)) {
      throw new CodexResultImporterFailure("artifact_path_unsafe", "Codex result artifact path must stay outside the sandbox worktree.", [
        resolvedRoot,
        resolvedWorktree,
      ]);
    }

    await mkdir(managedRoot, { recursive: true });
    await mkdir(resolvedRoot, { recursive: true });
    const existing = await realpath(resolvedRoot);
    if (!isInsideOrEqual(existing, managedRoot) || isInsideOrEqual(existing, resolvedWorktree)) {
      throw new CodexResultImporterFailure("artifact_path_unsafe", "Codex result artifact path resolves outside the managed artifact boundary.", [
        existing,
        managedRoot,
        resolvedWorktree,
      ]);
    }
    return existing;
  }

  private async validateSandboxPath(request: CodexResultImportRequest): Promise<string> {
    const worktree = await realpath(path.resolve(request.sandbox.worktreePath));
    const managedRoot = path.resolve(request.policy.sandbox.repository.worktreePath);
    const sourceRepository = path.resolve(request.sandbox.repositoryPath);
    const gitRoot = path.resolve(request.sandbox.gitRoot);
    if (!isInsideOrEqual(worktree, managedRoot)) {
      throw new CodexResultImporterFailure("unmanaged_sandbox", "Sandbox worktree is outside the Orynt-managed worktree root.", [worktree, managedRoot]);
    }
    if (worktree === sourceRepository || worktree === gitRoot) {
      throw new CodexResultImporterFailure("unsafe_path", "Sandbox worktree must not be the source repository or git root.", [worktree, sourceRepository, gitRoot]);
    }
    return worktree;
  }

  private async importCommandLog(logPath: string, artifactRoot: string, kind: ImportedCommandLog["kind"]): Promise<ImportedCommandLog> {
    const safePath = await this.validateArtifactFile(logPath, artifactRoot);
    const importedAt = new Date().toISOString();
    const extension = path.extname(safePath).toLowerCase();
    if (!IMPORT_TEXT_EXTENSIONS.has(extension)) {
      return {
        id: `${kind}-${shortHash(safePath)}`,
        kind,
        path: safePath,
        content: "",
        sha256: sha256(""),
        byteLength: 0,
        importedAt,
        malformed: true,
      };
    }

    const bytes = await readFile(safePath);
    const text = bytes.toString("utf8");
    const malformed = text.includes("\u0000");
    return {
      id: `${kind}-${shortHash(safePath)}`,
      kind,
      path: safePath,
      content: malformed ? "" : text,
      sha256: sha256(malformed ? "" : text),
      byteLength: malformed ? 0 : Buffer.byteLength(text, "utf8"),
      importedAt,
      malformed,
    };
  }

  private async validateArtifactFile(filePath: string, artifactRoot: string): Promise<string> {
    const resolvedRoot = await realpath(path.resolve(artifactRoot));
    const resolvedFile = path.resolve(filePath);
    if (!isInsideOrEqual(resolvedFile, resolvedRoot)) {
      throw new CodexResultImporterFailure("unsafe_path", "Imported Codex result log path is outside the Orynt-managed artifact directory.", [
        resolvedFile,
        resolvedRoot,
      ]);
    }

    try {
      const existing = await realpath(resolvedFile);
      if (!isInsideOrEqual(existing, resolvedRoot)) {
        throw new CodexResultImporterFailure("unsafe_path", "Imported Codex result log path resolves outside the managed artifact directory.", [
          existing,
          resolvedRoot,
        ]);
      }
      return existing;
    } catch (error) {
      if (error instanceof CodexResultImporterFailure) {
        throw error;
      }
      throw new CodexResultImporterFailure("log_not_found", "Imported Codex result log was not found.", [resolvedFile]);
    }
  }

  private async runGit(args: string[], cwd: string): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 2_000_000 });
    return String(stdout).trimEnd();
  }

  private parseNameStatus(output: string): ImportedChangedFile[] {
    const fields = output.split("\0").filter((field) => field.length > 0);
    const files: ImportedChangedFile[] = [];
    for (let index = 0; index < fields.length;) {
      const code = fields[index++] ?? "";
      const firstPath = fields[index++] ?? "";
      if (code.startsWith("R") || code.startsWith("C")) {
        const nextPath = fields[index++] ?? firstPath;
        files.push({
          status: code.startsWith("R") ? "renamed" : "copied",
          previousPath: firstPath,
          path: nextPath,
        });
      } else if (firstPath) {
        files.push({ status: this.mapGitStatus(code), path: firstPath });
      }
    }
    return files;
  }

  private parsePorcelainStatus(output: string): ImportedChangedFile[] {
    const records = output.split("\0").filter((record) => record.length > 0);
    const files: ImportedChangedFile[] = [];
    for (let index = 0; index < records.length;) {
      const record = records[index++] ?? "";
      const code = record.slice(0, 2);
      const filePath = record.slice(3);
      if (!filePath) continue;
      if (code.includes("R") || code.includes("C")) {
        const previousPath = records[index++] ?? "";
        files.push({
          status: code.includes("R") ? "renamed" : "copied",
          previousPath,
          path: filePath,
        });
      } else {
        files.push({
          status: code === "??" ? "untracked" : this.mapGitStatus(code),
          path: filePath,
        });
      }
    }
    return files;
  }

  private mapGitStatus(code: string): ImportedChangedFile["status"] {
    if (code.includes("A")) {
      return "added";
    }
    if (code.includes("M")) {
      return "modified";
    }
    if (code.includes("D")) {
      return "deleted";
    }
    if (code.includes("R")) {
      return "renamed";
    }
    if (code.includes("C")) {
      return "copied";
    }
    return "unknown";
  }

  private mergeChangedFiles(files: ImportedChangedFile[]): ImportedChangedFile[] {
    const byPath = new Map<string, ImportedChangedFile>();
    for (const file of files) {
      const existing = byPath.get(file.path);
      if (!existing || existing.status === "unknown" || existing.status === "untracked") {
        byPath.set(file.path, file);
      }
    }
    return [...byPath.values()].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  }
}
