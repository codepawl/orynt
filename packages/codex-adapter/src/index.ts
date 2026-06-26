import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
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
  CodexExecutionMode,
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

const SENSITIVE_KEY_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential)\b/i;
const KEY_VALUE_SECRET_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential)\b\s*[:=]\s*[^\s,;]+/gi;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const ENV_SECRET_PATTERN = /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|OTP|AUTH|COOKIE|CREDENTIAL)[A-Z0-9_]*\s*=\s*[^\s]+/gi;
const IMPORT_TEXT_EXTENSIONS = new Set([".md", ".txt", ".log"]);

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

export class LocalManualCodexResultImporter implements CodexResultImporter {
  private readonly managedArtifactRoot: string;
  private readonly runStore?: RunStore;
  private readonly actor: Actor;

  constructor(options: LocalManualCodexResultImporterOptions = {}) {
    this.managedArtifactRoot = path.resolve(options.managedArtifactRoot ?? path.join(tmpdir(), "codepawl", "codex-artifacts"));
    this.runStore = options.runStore;
    this.actor = options.actor ?? { kind: "runtime", id: "codex-result-importer", displayName: "Codex Result Importer" };
  }

  async inspectSandboxChanges(request: CodexResultImportRequest): Promise<ImportedPatchSummary> {
    const safeWorktreePath = await this.validateSandboxPath(request);
    let nameStatus = "";
    let porcelainStatus = "";
    let diffStat = "";

    try {
      nameStatus = await this.runGit(["diff", "--name-status", request.sandbox.baseRef, "--"], safeWorktreePath);
      porcelainStatus = await this.runGit(["status", "--porcelain"], safeWorktreePath);
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

    return {
      baseRef: request.sandbox.baseRef,
      hasChanges: changedFiles.length > 0,
      changedFiles,
      allowedFiles,
      protectedFiles,
      unexpectedFiles,
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
      throw new CodexResultImporterFailure("artifact_path_unsafe", "Codex result artifact path is outside the CodePawl-managed artifact root.", [
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
      throw new CodexResultImporterFailure("unmanaged_sandbox", "Sandbox worktree is outside the CodePawl-managed worktree root.", [worktree, managedRoot]);
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
      throw new CodexResultImporterFailure("unsafe_path", "Imported Codex result log path is outside the CodePawl-managed artifact directory.", [
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
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line): ImportedChangedFile => {
        const parts = line.split(/\s+/);
        const code = parts[0] ?? "";
        if (code.startsWith("R")) {
          return { status: "renamed", previousPath: parts[1] ?? "", path: parts[2] ?? parts[1] ?? "" };
        }
        if (code.startsWith("C")) {
          return { status: "copied", previousPath: parts[1] ?? "", path: parts[2] ?? parts[1] ?? "" };
        }
        return {
          status: this.mapGitStatus(code),
          path: parts[1] ?? "",
        };
      })
      .filter((file) => Boolean(file.path));
  }

  private parsePorcelainStatus(output: string): ImportedChangedFile[] {
    return output
      .split("\n")
      .filter(Boolean)
      .map((line): ImportedChangedFile => {
        const code = line.slice(0, 2);
        const rawPath = line.slice(3).trim();
        const renameSeparator = " -> ";
        if (rawPath.includes(renameSeparator)) {
          const [previousPath, nextPath] = rawPath.split(renameSeparator);
          return { status: "renamed", previousPath, path: nextPath };
        }
        return {
          status: code === "??" ? "untracked" : this.mapGitStatus(code.trim()),
          path: rawPath,
        };
      })
      .filter((file) => Boolean(file.path));
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
