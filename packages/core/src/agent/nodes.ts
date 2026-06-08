import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  AgentState,
  AgentMessage,
  AgentNode,
  RepoScanResult,
  ScopeAnalysisResult,
  FileSelectionResult,
  PatchPlan,
  ValidationResult,
  ReportResult,
} from "../state/schema";
import { LlmCompletionResult, LlmProvider } from "../providers/llm";
import {
  ProviderJsonOutputError,
  parsePatchPlanResponse,
  parseScopeAnalysisResponse,
} from "../providers/json-output";
import { TraceLedger } from "../ledger/trace";
import {
  SafetyViolationError,
  assertWriteSafe,
  isSecretFile,
  SCAN_IGNORED_DIRS,
  SCAN_MAX_FILES,
  SCAN_MAX_BYTES,
} from "../safety";

const execAsync = promisify(exec);

export const activeLedgers = new Map<string, TraceLedger>();

const BINARY_FILE_EXTENSION_RE =
  /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|otf|mp4|webm|mp3|pdf|zip|tar|gz|rar|bin|exe|dll|so|dylib)$/i;

const PLACEHOLDER_VALIDATION_COMMAND = "echo placeholder validation skipped";
const DEFAULT_SCOPE_ANALYSIS_MAX_TOKENS = 1200;
const DEFAULT_PATCH_PLAN_MAX_TOKENS = 1600;
const SCOPE_ANALYSIS_JSON_SCHEMA = `{"rationale":"string","affectedModules":["string"],"proposedFilesToModify":["relative/path"],"proposedFilesToCreate":["relative/path"]}`;
const PATCH_PLAN_JSON_SCHEMA = `{"rationale":"string","chunks":[{"type":"create|modify|delete","file":"relative/path","description":"string"}]}`;

function isBinaryFilePath(filePath: string): boolean {
  return BINARY_FILE_EXTENSION_RE.test(filePath);
}

function isReviewOnlyTask(query: string): boolean {
  const normalized = query.toLowerCase();
  const hasReviewIntent = /\b(review|analyse|analyze|inspect|audit)\b/.test(normalized);
  const hasChangeIntent = /\b(add|create|implement|fix|modify|update|delete|remove|refactor|write|generate)\b/.test(normalized);
  return hasReviewIntent && !hasChangeIntent;
}

function shouldUsePlaceholderValidation(state: AgentState): boolean {
  return state.context.dryRun && !state.context.testCommand;
}

function isPlaceholderValidationCommand(command: string): boolean {
  return command === PLACEHOLDER_VALIDATION_COMMAND;
}

function promptMetadata(messages: ReadonlyArray<{ content: string }>): { messageCount: number; totalChars: number } {
  return {
    messageCount: messages.length,
    totalChars: messages.reduce((sum, message) => sum + message.content.length, 0),
  };
}

function providerPayload(
  state: AgentState,
  llm: LlmProvider,
  purpose: string,
  messages?: ReadonlyArray<{ content: string }>,
  responseFormat: "json_object" | "text" = "json_object",
  maxTokens?: number
): Record<string, unknown> {
  return {
    provider: llm.providerName,
    model: llm.modelName,
    purpose,
    responseFormat,
    responseFormatRequested: responseFormat === "json_object",
    maxTokens: maxTokens ?? null,
    ...(state.context.includePromptMetadata && messages
      ? { promptMetadata: promptMetadata(messages) }
      : {}),
  };
}

function providerErrorPayload(
  llm: LlmProvider,
  purpose: string,
  err: unknown,
  tokenUsage?: { readonly inputTokens: number; readonly outputTokens: number },
  finishReason?: string,
  contentLength?: number,
  responseFormatRequested: boolean = true
): Record<string, unknown> {
  return {
    provider: llm.providerName,
    model: llm.modelName,
    purpose,
    parseCategory: err instanceof ProviderJsonOutputError ? err.category : "unknown",
    schemaValidationPath: err instanceof ProviderJsonOutputError ? err.schemaValidationPath : null,
    validationStatus: err instanceof ProviderJsonOutputError && err.category === "schema_validation"
      ? "schema_invalid"
      : "parse_invalid",
    contentPreview: err instanceof ProviderJsonOutputError ? err.preview : null,
    finishReason: finishReason ?? (err instanceof ProviderJsonOutputError ? err.finishReason ?? null : null),
    contentLength: contentLength ?? (err instanceof ProviderJsonOutputError ? err.contentLength : null),
    responseFormatRequested,
    error: err instanceof Error ? err.message : String(err),
    tokenUsage: tokenUsage ?? null,
  };
}

function isStructuredRetryable(err: unknown): err is ProviderJsonOutputError {
  return err instanceof ProviderJsonOutputError &&
    (err.category === "malformed_json" || err.category === "schema_validation");
}

function compactStructuredMessages(purpose: string, schema: string, previousError: ProviderJsonOutputError, taskSummary: unknown): AgentMessage[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      role: "system",
      content: `Return JSON object only. No markdown. No prose. Match this schema exactly: ${schema}`,
      timestamp: now,
    },
    {
      id: crypto.randomUUID(),
      role: "user",
      content: `Structured Output Retry\n${JSON.stringify({
        purpose,
        previousError: {
          category: previousError.category,
          schemaValidationPath: previousError.schemaValidationPath,
        },
        taskSummary,
      })}`,
      timestamp: now,
    },
  ];
}

async function generateStructuredWithRetry<T>(
  state: AgentState,
  llm: LlmProvider,
  purpose: "scope_analysis" | "patch_plan",
  messages: AgentMessage[],
  maxTokens: number,
  schema: string,
  retryTaskSummary: unknown,
  parse: (completion: LlmCompletionResult) => T
): Promise<{ parsed: T; completion: LlmCompletionResult; retryAttempt: number }> {
  const ledger = activeLedgers.get(state.context.sessionId);
  const options = { responseFormat: { type: "json_object" as const }, temperature: state.context.temperature, maxTokens };
  const firstCompletion = await llm.generateCompletion(messages, options);
  if (ledger && firstCompletion.usage) {
    ledger.addTokenUsage(firstCompletion.usage.inputTokens, firstCompletion.usage.outputTokens);
  }

  try {
    return { parsed: parse(firstCompletion), completion: firstCompletion, retryAttempt: 0 };
  } catch (err: unknown) {
    if (!isStructuredRetryable(err)) {
      throw err;
    }

    const retryMessages = compactStructuredMessages(purpose, schema, err, retryTaskSummary);
    if (ledger) {
      ledger.recordEvent("system", "provider_structured_retry", "warning", {
        ...providerErrorPayload(
          llm,
          purpose,
          err,
          firstCompletion.usage,
          firstCompletion.finishReason,
          firstCompletion.content.length
        ),
        retryAttempt: 1,
        retryPrompt: {
          messageCount: retryMessages.length,
          totalChars: retryMessages.reduce((sum, message) => sum + message.content.length, 0),
        },
      });
    }

    const retryCompletion = await llm.generateCompletion(retryMessages, options);
    if (ledger && retryCompletion.usage) {
      ledger.addTokenUsage(retryCompletion.usage.inputTokens, retryCompletion.usage.outputTokens);
    }
    return { parsed: parse(retryCompletion), completion: retryCompletion, retryAttempt: 1 };
  }
}

export function createIntakeNode(): AgentNode {
  return async (state) => {
    const messages = [...state.messages];
    if (messages.length === 0) {
      messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: state.query,
        timestamp: new Date().toISOString(),
      });
    }
    return {
      messages,
    };
  };
}

export function createRepoScanNode(): AgentNode {
  return async (state) => {
    const workspaceDir = state.context.workspaceDir;
    const ledger = activeLedgers.get(state.context.sessionId);

    let fileCount = 0;

    async function scanDirectory(
      dir: string,
      rootDir: string
    ): Promise<{ path: string; sizeBytes: number; isDir: boolean }[]> {
      if (fileCount >= SCAN_MAX_FILES) return [];
      const results: { path: string; sizeBytes: number; isDir: boolean }[] = [];
      let entries: ReturnType<typeof Object.create> = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return results;
      }
      for (const entry of entries) {
        if (fileCount >= SCAN_MAX_FILES) break;
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootDir, fullPath);

        if (SCAN_IGNORED_DIRS.has(entry.name)) {
          continue;
        }

        // Skip secret files during scan
        if (!entry.isDirectory() && isSecretFile(entry.name)) {
          if (ledger) {
            ledger.recordEvent("system", `skipped_secret_file:${relativePath}`, "warning", {
              reason: "secret file excluded from scan",
            });
          }
          continue;
        }

        if (entry.isDirectory()) {
          results.push({
            path: relativePath,
            sizeBytes: 0,
            isDir: true,
          });
          const subResults = await scanDirectory(fullPath, rootDir);
          results.push(...subResults);
        } else if (entry.isFile()) {
          let size = 0;
          try {
            const stat = await fs.stat(fullPath);
            size = stat.size;
          } catch { /* ignore stat errors */ }
          results.push({
            path: relativePath,
            sizeBytes: size,
            isDir: false,
          });
          fileCount++;
        }
      }
      return results;
    }

    const files = await scanDirectory(workspaceDir, workspaceDir);

    if (ledger) {
      ledger.recordEvent("system", "repo_scan_complete", "info", {
        fileCount: files.filter((f) => !f.isDir).length,
        dirCount: files.filter((f) => f.isDir).length,
        cappedAt: fileCount >= SCAN_MAX_FILES ? SCAN_MAX_FILES : null,
      });
    }

    const extMap: Record<string, string> = {
      ".ts": "TypeScript",
      ".tsx": "TypeScript",
      ".js": "JavaScript",
      ".jsx": "JavaScript",
      ".py": "Python",
      ".rs": "Rust",
      ".go": "Go",
      ".java": "Java",
      ".cpp": "C++",
      ".c": "C",
      ".h": "C/C++",
      ".cs": "C#",
      ".sh": "Shell",
    };

    const detectedLanguagesSet = new Set<string>();
    for (const file of files) {
      if (file.isDir) continue;
      const ext = path.extname(file.path);
      const lang = extMap[ext];
      if (lang) {
        detectedLanguagesSet.add(lang);
      }
    }
    const detectedLanguages = Array.from(detectedLanguagesSet);

    const packageConfigs: { type: "npm" | "pip" | "cargo" | "other"; path: string }[] = [];
    for (const file of files) {
      if (file.isDir) continue;
      const filename = path.basename(file.path);
      if (filename === "package.json") {
        packageConfigs.push({ type: "npm", path: file.path });
      } else if (
        filename === "pyproject.toml" ||
        filename === "requirements.txt" ||
        filename === "Pipfile"
      ) {
        packageConfigs.push({ type: "pip", path: file.path });
      } else if (filename === "Cargo.toml") {
        packageConfigs.push({ type: "cargo", path: file.path });
      }
    }

    const repoScanResult: RepoScanResult = {
      rootDir: workspaceDir,
      files,
      detectedLanguages,
      packageConfigs,
    };

    return {
      repoScanResult,
    };
  };
}

export function createScopeAnalysisNode(llm: LlmProvider): AgentNode {
  return async (state) => {
    const ledger = activeLedgers.get(state.context.sessionId);

    if (isReviewOnlyTask(state.query)) {
      const changedFiles = process.env["CODEPAWL_CHANGED_FILES"]
        ?.split(/\r?\n/)
        .map((file) => file.trim())
        .filter(Boolean) ?? [];
      const scopeAnalysisResult: ScopeAnalysisResult = {
        rationale: changedFiles.length > 0
          ? "Review-only task detected. Scope is limited to changed files provided by the current context."
          : "Review-only task detected. No changed files available in current context.",
        affectedModules: changedFiles.length > 0 ? changedFiles : ["No changed files available in current context"],
        proposedFilesToModify: changedFiles,
        proposedFilesToCreate: [],
      };

      if (ledger) {
        ledger.recordEvent("system", "review_only_scope", "info", {
          changedFileCount: changedFiles.length,
        });
      }

      return {
        scopeAnalysisResult,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Scope Analysis:\nRationale: ${scopeAnalysisResult.rationale}\nProposed Files to Modify: ${scopeAnalysisResult.proposedFilesToModify.join(", ")}\nProposed Files to Create: `,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    const systemPrompt = `Return JSON object only. No markdown. No prose.
Schema: ${SCOPE_ANALYSIS_JSON_SCHEMA}
Example: {"rationale":"Add focused tests for trace ledger behavior.","affectedModules":["packages/core"],"proposedFilesToModify":[],"proposedFilesToCreate":["packages/core/src/__tests__/trace-ledger.test.ts"]}`;
    const repoFiles = state.repoScanResult?.files.map((f) => ({ path: f.path, isDir: f.isDir })).slice(0, SCAN_MAX_FILES) ?? [];
    const userMessage = `Repository Scan Result Summary:
${JSON.stringify({
  task: state.query,
  root: state.repoScanResult?.rootDir,
  files: repoFiles,
})}`;

    const messages: AgentMessage[] = [
      ...state.messages,
      {
        id: crypto.randomUUID(),
        role: "system",
        content: systemPrompt,
        timestamp: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    ];

    const maxTokens = state.context.scopeAnalysisMaxTokens ?? DEFAULT_SCOPE_ANALYSIS_MAX_TOKENS;

    if (ledger) {
      ledger.recordEvent(
        "llm_call",
        "scope_analysis",
        "info",
        providerPayload(state, llm, "scope_analysis", messages, "json_object", maxTokens)
      );
    }

    let scopeAnalysisResult: ScopeAnalysisResult;
    let completion: LlmCompletionResult | undefined;
    let retryAttempt = 0;
    try {
      const structured = await generateStructuredWithRetry(
        state,
        llm,
        "scope_analysis",
        messages,
        maxTokens,
        SCOPE_ANALYSIS_JSON_SCHEMA,
        {
          task: state.query,
          fileCount: repoFiles.length,
          detectedLanguages: state.repoScanResult?.detectedLanguages ?? [],
        },
        (candidate) => parseScopeAnalysisResponse(candidate.content, {
          provider: llm.providerName,
          model: llm.modelName,
          purpose: "scope_analysis",
          finishReason: candidate.finishReason,
        })
      );
      scopeAnalysisResult = structured.parsed;
      completion = structured.completion;
      retryAttempt = structured.retryAttempt;
      if (ledger) {
        ledger.recordEvent("tool_response", "scope_analysis_response", "info", {
          provider: llm.providerName,
          model: llm.modelName,
          purpose: "scope_analysis",
          parseCategory: "ok",
          schemaValidationPath: null,
          validationStatus: "valid",
          finishReason: completion.finishReason ?? null,
          contentLength: completion.content.length,
          responseFormatRequested: true,
          retryAttempt,
          tokenUsage: completion.usage ?? null,
        });
      }
    } catch (err: unknown) {
      if (ledger) {
        ledger.recordEvent(
          "tool_response",
          "scope_analysis_response",
          "error",
          providerErrorPayload(
            llm,
            "scope_analysis",
            err,
            completion?.usage,
            completion?.finishReason,
            completion?.content.length
          )
        );
      }
      throw err;
    }

    return {
      scopeAnalysisResult,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Scope Analysis:\nRationale: ${scopeAnalysisResult.rationale}\nProposed Files to Modify: ${scopeAnalysisResult.proposedFilesToModify.join(", ")}\nProposed Files to Create: ${scopeAnalysisResult.proposedFilesToCreate.join(", ")}`,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  };
}

export function createFileSelectionNode(): AgentNode {
  return async (state) => {
    const selectedFiles: { path: string; reason: string; content: string }[] = [];
    const filesToRead = [
      ...(state.scopeAnalysisResult?.proposedFilesToModify ?? []),
      ...(state.scopeAnalysisResult?.proposedFilesToCreate ?? []),
    ];

    let totalBytesRead = 0;
    const ledger = activeLedgers.get(state.context.sessionId);

    for (const relPath of filesToRead) {
      // Skip secret files during selection
      if (isSecretFile(relPath)) {
        if (ledger) {
          ledger.recordEvent("system", `skipped_secret_file:${relPath}`, "warning", {
            reason: "secret file excluded from file selection",
          });
        }
        continue;
      }

      if (isBinaryFilePath(relPath)) {
        if (ledger) {
          ledger.recordEvent("system", `skipped_binary_file:${relPath}`, "warning", {
            reason: "binary file excluded from file selection",
          });
        }
        continue;
      }

      const fullPath = path.join(state.context.workspaceDir, relPath);
      let content = "";
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) {
          if (ledger) {
            ledger.recordEvent("system", `skipped_non_file:${relPath}`, "warning", {
              reason: "path is not a regular file",
            });
          }
          continue;
        }
        if (totalBytesRead + stat.size > SCAN_MAX_BYTES) {
          if (ledger) {
            ledger.recordEvent("system", `skipped_file_byte_cap:${relPath}`, "warning", {
              reason: "byte cap reached",
              totalBytesRead,
              fileSize: stat.size,
            });
          }
          break;
        }
        content = await fs.readFile(fullPath, "utf-8");
        totalBytesRead += stat.size;
      } catch (err: unknown) {
        const errorCode = typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : null;
        if (errorCode !== "ENOENT") {
          if (ledger) {
            ledger.recordEvent("system", `skipped_unreadable_file:${relPath}`, "warning", {
              reason: "file could not be read",
              error: err instanceof Error ? err.message : String(err),
            });
          }
          continue;
        }
        // File may not exist yet because the patch plan will create it.
      }

      selectedFiles.push({
        path: relPath,
        reason: "Selected for task execution",
        content,
      });
    }

    const fileSelectionResult: FileSelectionResult = {
      selectedFiles,
    };

    return {
      fileSelectionResult,
    };
  };
}

export function createPatchPlanNode(llm: LlmProvider): AgentNode {
  return async (state) => {
    const ledger = activeLedgers.get(state.context.sessionId);

    if (isReviewOnlyTask(state.query)) {
      const patchPlan: PatchPlan = {
        rationale: "Review-only dry-run: no file changes are proposed by the deterministic mock provider.",
        chunks: [],
      };

      if (ledger) {
        ledger.recordEvent("system", "review_only_patch_plan", "info", {
          chunkCount: 0,
        });
      }

      return {
        patchPlan,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Patch Plan:\nRationale: ${patchPlan.rationale}\nChunks:\n`,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    const systemPrompt = `Return JSON object only. No markdown. No prose.
Schema: ${PATCH_PLAN_JSON_SCHEMA}
Example: {"rationale":"Add trace ledger tests.","chunks":[{"type":"create","file":"packages/core/src/__tests__/trace-ledger.test.ts","description":"Create focused trace ledger tests."}]}
Rules:
- Do not include code, diffs, content, targetContent, markdown, or extra fields.
- Use at most 5 chunks.
- If no file changes are appropriate, return {"rationale":"...","chunks":[]}.`;
    const selectedFilesSummary = (state.fileSelectionResult?.selectedFiles ?? []).map((file) => ({
      file: file.path,
      reason: file.reason,
      chars: file.content.length,
    }));
    const userMessage = `Selected Files Content Summary:
${JSON.stringify({
  task: state.query,
  selectedFiles: selectedFilesSummary,
  validationSuccess: state.validationResult?.success ?? null,
  validationErrors: state.validationResult?.errors.slice(0, 3) ?? [],
})}`;

    const messages: AgentMessage[] = [
      ...state.messages,
      {
        id: crypto.randomUUID(),
        role: "system",
        content: systemPrompt,
        timestamp: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    ];

    const maxTokens = state.context.patchPlanMaxTokens ?? DEFAULT_PATCH_PLAN_MAX_TOKENS;

    if (ledger) {
      ledger.recordEvent(
        "llm_call",
        "patch_plan",
        "info",
        providerPayload(state, llm, "patch_plan", messages, "json_object", maxTokens)
      );
    }

    let patchPlan: PatchPlan;
    let completion: LlmCompletionResult | undefined;
    let retryAttempt = 0;
    try {
      const structured = await generateStructuredWithRetry(
        state,
        llm,
        "patch_plan",
        messages,
        maxTokens,
        PATCH_PLAN_JSON_SCHEMA,
        {
          task: state.query,
          selectedFiles: selectedFilesSummary.map((file) => file.file),
        },
        (candidate) => parsePatchPlanResponse(candidate.content, {
          provider: llm.providerName,
          model: llm.modelName,
          purpose: "patch_plan",
          finishReason: candidate.finishReason,
        })
      );
      const parsedPatchPlan = structured.parsed;
      completion = structured.completion;
      retryAttempt = structured.retryAttempt;
      patchPlan = parsedPatchPlan.patchPlan;
      if (ledger && parsedPatchPlan.repairs.length > 0) {
        ledger.recordEvent("system", "provider_schema_repaired", "warning", {
          provider: llm.providerName,
          model: llm.modelName,
          purpose: "patch_plan",
          repairs: parsedPatchPlan.repairs,
        });
      }
      if (ledger) {
        ledger.recordEvent("tool_response", "patch_plan_response", "info", {
          provider: llm.providerName,
          model: llm.modelName,
          purpose: "patch_plan",
          parseCategory: "ok",
          schemaValidationPath: null,
          validationStatus: "valid",
          finishReason: completion.finishReason ?? null,
          contentLength: completion.content.length,
          responseFormatRequested: true,
          retryAttempt,
          schemaRepairCount: parsedPatchPlan.repairs.length,
          tokenUsage: completion.usage ?? null,
        });
      }
    } catch (err: unknown) {
      if (ledger) {
        ledger.recordEvent(
          "tool_response",
          "patch_plan_response",
          "error",
          providerErrorPayload(
            llm,
            "patch_plan",
            err,
            completion?.usage,
            completion?.finishReason,
            completion?.content.length
          )
        );
      }
      throw err;
    }

    return {
      patchPlan,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Patch Plan:\nRationale: ${patchPlan.rationale}\nChunks:\n${patchPlan.chunks.map((c) => `- ${c.type.toUpperCase()} ${c.file}: ${c.description}`).join("\n")}`,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  };
}

export function createOptionalPatchApplyNode(): AgentNode {
  return async (state) => {
    const ledger = activeLedgers.get(state.context.sessionId);
    const dryRun = state.context.dryRun;
    const patchPlan = state.patchPlan;

    if (!patchPlan || !patchPlan.chunks || patchPlan.chunks.length === 0) {
      return {};
    }

    if (dryRun) {
      if (ledger) {
        ledger.recordEvent("system", "dry_run_patch_apply", "info", {
          rationale: patchPlan.rationale,
          chunks: patchPlan.chunks,
          message: "Dry-run mode: no files modified.",
        });
      }
      return {};
    }

    // Safety check: validate ALL paths before any writes
    const allPaths = patchPlan.chunks.map((c) => c.file);
    try {
      assertWriteSafe(state.context.workspaceDir, allPaths);
    } catch (err: unknown) {
      if (err instanceof SafetyViolationError) {
        if (ledger) {
          ledger.recordEvent("system", "safety_violation_abort", "error", {
            violatingPath: err.violatingPath,
            reason: err.reason,
          });
        }
        // Re-throw to abort the run
        throw err;
      }
      throw err;
    }

    throw new Error(
      "Patch application is disabled for metadata-only patch plans in the current Openpawl MVP. " +
      "Run with --dry-run to review planning metadata."
    );
  };
}

export function createValidationNode(): AgentNode {
  return async (state) => {
    const testCommand = shouldUsePlaceholderValidation(state)
      ? PLACEHOLDER_VALIDATION_COMMAND
      : state.context.testCommand ?? detectTestCommand();
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    if (isPlaceholderValidationCommand(testCommand)) {
      stdout = "placeholder validation skipped\n";
    } else {
      try {
        const result = await execAsync(testCommand, { cwd: state.context.workspaceDir });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (err: unknown) {
        const execErr = err as { code?: number; stdout?: string; stderr?: string };
        exitCode = execErr.code ?? 1;
        stdout = execErr.stdout ?? "";
        stderr = execErr.stderr ?? "";
      }
    }

    const durationMs = Date.now() - startTime;
    const validationResult: ValidationResult = {
      success: exitCode === 0,
      commandsRun: [
        {
          command: testCommand,
          stdout,
          stderr,
          exitCode,
          durationMs,
        },
      ],
      errors: exitCode !== 0 ? [stderr || stdout || "Test command failed"] : [],
    };

    return {
      validationResult,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: `Validation Results:\nSuccess: ${validationResult.success}\nExit Code: ${exitCode}\nStdout: ${stdout}\nStderr: ${stderr}`,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  };
}

/** Detect which validation command is available for write mode when no explicit command is provided. */
function detectTestCommand(): string {
  return "bun test";
}

export function createTraceExportNode(): AgentNode {
  return async (state) => {
    const runId = state.context.sessionId;
    const ledger = activeLedgers.get(runId);

    const runDir = state.context.outputDir;
    await fs.mkdir(runDir, { recursive: true });

    // Write patch-plan.json
    const patchPlan = state.patchPlan ?? { chunks: [], rationale: "No patch plan generated." };
    await fs.writeFile(
      path.join(runDir, "patch-plan.json"),
      JSON.stringify(patchPlan, null, 2),
      "utf-8"
    );

    // Write selected-files.json
    const selectedFiles = state.fileSelectionResult ?? { selectedFiles: [] };
    await fs.writeFile(
      path.join(runDir, "selected-files.json"),
      JSON.stringify(selectedFiles, null, 2),
      "utf-8"
    );

    if (ledger) {
      const summary = ledger.getSummary();
      await fs.writeFile(
        path.join(runDir, "trace.json"),
        JSON.stringify(summary, null, 2),
        "utf-8"
      );
    }

    return {};
  };
}

export function createReportExportNode(): AgentNode {
  return async (state) => {
    const runId = state.context.sessionId;
    const ledger = activeLedgers.get(runId);

    const filesModified = state.patchPlan?.chunks.map((c) => c.file) ?? [];
    const validationSuccess = state.validationResult?.success ?? false;
    const patchApplied = !state.context.dryRun && (state.patchPlan?.chunks.length ?? 0) > 0;
    const patchPlanPath = `.codepawl/runs/${runId}/patch-plan.json`;

    let durationMs = 0;
    let tokenUsage = { input: 0, output: 0, total: 0 };

    if (ledger) {
      const summary = ledger.getSummary();
      durationMs = summary.totalDurationMs;
      tokenUsage = {
        input: summary.tokenUsage.input,
        output: summary.tokenUsage.output,
        total: summary.tokenUsage.total,
      };
    }

    const reportResult: ReportResult = {
      summary: `Agent run finished with status: ${validationSuccess ? "success" : "failed"}.`,
      filesModified,
      patchApplied,
      validationSuccess,
      durationMs,
      tokenUsage,
    };

    const runDir = state.context.outputDir;
    await fs.mkdir(runDir, { recursive: true });

    // Risk notes
    const riskNotes: string[] = [];
    if (!state.context.dryRun && filesModified.length > 0) {
      riskNotes.push("Write mode was active — files may have been modified.");
    }
    if (state.error) {
      riskNotes.push(`Agent encountered an error: ${state.error}`);
    }
    if (!validationSuccess) {
      riskNotes.push("Validation failed — review errors before merging.");
    }

    // GitHub-ready Markdown report
    const validationSection = state.validationResult
      ? state.validationResult.commandsRun
          .map(
            (cmd) => {
              const label = isPlaceholderValidationCommand(cmd.command)
                ? "Placeholder validation"
                : "Validation command";
              return `**${label}:** \`${cmd.command}\`\n` +
              `- Exit Code: ${cmd.exitCode}\n` +
              `- Duration: ${cmd.durationMs}ms\n` +
              (cmd.stdout ? `- Stdout:\n\`\`\`\n${cmd.stdout.slice(0, 2000)}\n\`\`\`\n` : "") +
              (cmd.stderr ? `- Stderr:\n\`\`\`\n${cmd.stderr.slice(0, 2000)}\n\`\`\`\n` : "");
            }
          )
          .join("\n")
      : "_No validation commands run._";

    const traceTimeline = ledger
      ? ledger
          .getSummary()
          .events.slice(-20)
          .map((e) => `| ${e.timestamp} | ${e.type} | ${e.name} | ${e.severity} |`)
          .join("\n")
      : "_No trace events._";

    const reportMd = `# 🐾 Openpawl Agent Run Report

> **Run ID:** \`${runId}\`
> **Mode:** ${state.context.dryRun ? "🔍 Dry-run (no files modified)" : "✏️ Write mode"}
> **Status:** ${validationSuccess ? "✅ SUCCESS" : "❌ FAILED"}
> **Duration:** ${durationMs}ms
> **Tokens Used:** ${tokenUsage.total} (in: ${tokenUsage.input}, out: ${tokenUsage.output})

---

## 📋 Task Summary

**Task:** ${state.query}

${state.scopeAnalysisResult ? `**Scope Rationale:** ${state.scopeAnalysisResult.rationale}` : ""}

---

## 📁 Scope Summary

${
  state.scopeAnalysisResult
    ? `**Affected Modules:**
${state.scopeAnalysisResult.affectedModules.map((m) => `- ${m}`).join("\n")}

**Proposed Modifications:**
${state.scopeAnalysisResult.proposedFilesToModify.map((f) => `- \`${f}\``).join("\n") || "_None_"}

**Proposed Creations:**
${state.scopeAnalysisResult.proposedFilesToCreate.map((f) => `- \`${f}\``).join("\n") || "_None_"}`
    : "_Scope analysis not available._"
}

---

## 📂 Selected Files

${
  state.fileSelectionResult && state.fileSelectionResult.selectedFiles.length > 0
    ? state.fileSelectionResult.selectedFiles
        .map((f) => `- \`${f.path}\` — ${f.reason}`)
        .join("\n")
    : "_No files selected._"
}

---

## 🔧 Patch Plan

${
  state.patchPlan
    ? `**Rationale:** ${state.patchPlan.rationale}

Patch plans are metadata-only in the current MVP. They describe intended file-level work and do not include code diffs or replacement content.

| # | Type | File | Description |
|---|------|------|-------------|
${state.patchPlan.chunks.map((c, i) => `| ${i + 1} | \`${c.type}\` | \`${c.file}\` | ${c.description} |`).join("\n")}

**Applied:** ${patchApplied ? "✅ Yes" : "⏭️ No (dry-run or no chunks)"}`
    : "_No patch plan generated._"
}

---

## ✅ Validation Result

**Overall:** ${validationSuccess ? "✅ PASSED" : "❌ FAILED"}

${validationSection}

---

## 📊 Trace Timeline (last 20 events)

| Timestamp | Type | Name | Severity |
|-----------|------|------|----------|
${traceTimeline}

---

## ⚠️ Risk Notes

${riskNotes.length > 0 ? riskNotes.map((n) => `- ${n}`).join("\n") : "_No risk notes._"}

---

## 🚀 Next Suggested Human Action

${
  state.error
      ? `1. Review the error: \`${state.error}\`\n2. Fix the underlying issue and re-run.`
      : validationSuccess
        ? patchApplied
          ? "1. Review the applied patch in the run artifacts.\n2. Run your full test suite.\n3. Open a pull request if satisfied."
          : `1. This was a dry-run. Review the patch plan in \`${patchPlanPath}\`.\n2. Re-run with \`--write\` to apply the patch.`
        : "1. Review validation errors above.\n2. Inspect the patch plan and adjust if needed.\n3. Re-run after fixing the issues."
}

---
_Generated by [Openpawl](https://github.com/codepawl/codepawl) — server-side coding-agent workflow_
`;

    await fs.writeFile(path.join(runDir, "report.md"), reportMd, "utf-8");
    await fs.writeFile(
      path.join(runDir, "run.json"),
      JSON.stringify(reportResult, null, 2),
      "utf-8"
    );

    return {
      reportResult,
      isComplete: true,
      nextNode: null,
    };
  };
}
