import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { delimiter } from "node:path";
import path from "node:path";
import { tmpdir } from "node:os";

import type {
  Actor,
  CodexAdapter,
  CodexAdapterStatus,
  CodexContract,
  CodexContractArtifact,
  CodexContractRequest,
  CodexExecutionMode,
  CodexProvider,
  RunStore,
} from "@codepawl/shared";

type LocalCodexContractAdapterOptions = {
  managedArtifactRoot?: string;
  runStore?: RunStore;
  runId?: string;
  actor?: Actor;
  pathEnv?: string;
};

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

const CONTRACT_PROVIDER: CodexProvider = {
  id: "codex-contract-provider",
  name: "Codex Contract Provider",
  kind: "contract_generator",
};

const SENSITIVE_KEY_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential)\b/i;
const KEY_VALUE_SECRET_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential)\b\s*[:=]\s*[^\s,;]+/gi;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;

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

function bullet(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None declared.";
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

  constructor(options: LocalCodexContractAdapterOptions = {}) {
    this.managedArtifactRoot = path.resolve(options.managedArtifactRoot ?? path.join(tmpdir(), "codepawl", "codex-artifacts"));
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
      provider: CONTRACT_PROVIDER,
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
      "Do not run network, dependency installation, git push/merge, destructive, privileged, or non-allowlisted commands without CodePawl approval.",
      "Do not claim success; CodePawl verifier will decide success after deterministic validation.",
      `Allowed paths: ${allowedPaths.join(", ")}`,
      `Protected paths: ${protectedPaths.join(", ")}`,
      `Blocked commands: ${blockedCommands.join(", ")}`,
      ...constraints.values,
    ];

    const markdown = [
      "# Codex Work Contract",
      "",
      `Contract ID: ${contractId}`,
      `Provider: ${CONTRACT_PROVIDER.name}`,
      "Execution mode: contract_only",
      "",
      "## Goal",
      goal.value,
      "",
      "## Context",
      bullet([
        `Run ID: ${request.runId}`,
        `Task ID: ${request.taskId}`,
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
      bullet(validationCommands.values.length > 0 ? validationCommands.values : ["CodePawl verifier will select deterministic validation in a later slice."]),
      "",
      "## Provider Boundary",
      "This artifact is a safe handoff contract only. CodePawl has not executed Codex, spawned an external agent, or run arbitrary shell commands.",
      "",
    ].join("\n");

    return {
      id: contractId,
      runId: request.runId,
      taskId: request.taskId,
      provider: CONTRACT_PROVIDER,
      executionMode: "contract_only",
      goal: goal.value,
      markdown,
      metadata: {
        id: contractId,
        runId: request.runId,
        taskId: request.taskId,
        providerId: CONTRACT_PROVIDER.id,
        executionMode: "contract_only",
        repository: request.repository,
        sandbox: request.sandbox,
        allowedPaths,
        protectedPaths,
        blockedCommands,
        validationCommands: validationCommands.values,
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
      return "Manual CLI mode is a future handoff path and is not executed by CodePawl in this slice.";
    }
    if (mode === "app_server") {
      return "Codex App Server mode is reserved for the future provider runtime.";
    }
    return "Codex SDK mode is reserved for a future provider integration.";
  }

  private async validateArtifactRoot(artifactRoot: string): Promise<string> {
    const resolvedRoot = path.resolve(artifactRoot);
    const managedRoot = path.resolve(this.managedArtifactRoot);
    if (!isInsideOrEqual(resolvedRoot, managedRoot)) {
      throw new CodexAdapterFailure("artifact_path_unsafe", "Codex contract artifact path is outside the CodePawl-managed artifact root.", [
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
