import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  AgentState,
  AgentNode,
  RepoScanResult,
  ScopeAnalysisResult,
  FileSelectionResult,
  PatchPlan,
  ValidationResult,
  ReportResult,
} from "../state/schema";
import { LlmProvider } from "../providers/llm";
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

    const systemPrompt = `You are an expert repository scope analyzer. Analyze the repository structure and user query to identify which files must be modified or created.
Respond ONLY with a JSON object matching this schema:
{
  "rationale": "Explanation of the scope analysis",
  "affectedModules": ["list of affected module paths or names"],
  "proposedFilesToModify": ["list of relative file paths to modify"],
  "proposedFilesToCreate": ["list of relative file paths to create"]
}`;
    const userMessage = `User Query: ${state.query}
Repository Scan Result:
Root: ${state.repoScanResult?.rootDir}
Files:
${JSON.stringify(state.repoScanResult?.files.map((f) => ({ path: f.path, isDir: f.isDir })))}`;

    if (ledger) {
      ledger.recordEvent("llm_call", "scope_analysis", "info", { prompt: userMessage });
    }

    const completion = await llm.generateCompletion(
      [
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
      ],
      { responseFormat: { type: "json_object" }, temperature: state.context.temperature }
    );

    if (ledger) {
      ledger.recordEvent("tool_response", "scope_analysis_response", "info", {
        response: completion.content,
      });
      if (completion.usage) {
        ledger.addTokenUsage(completion.usage.inputTokens, completion.usage.outputTokens);
      }
    }

    let scopeAnalysisResult: ScopeAnalysisResult;
    try {
      scopeAnalysisResult = JSON.parse(completion.content) as ScopeAnalysisResult;
    } catch {
      const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scopeAnalysisResult = JSON.parse(jsonMatch[0]) as ScopeAnalysisResult;
      } else {
        throw new Error(`Failed to parse scope analysis JSON response: ${completion.content}`);
      }
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

      const fullPath = path.join(state.context.workspaceDir, relPath);
      let content = "";
      try {
        const stat = await fs.stat(fullPath);
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
      } catch { /* file may not exist yet (new file creation) */ }

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

    const systemPrompt = `You are an expert programmer. Generate a precise patch plan (list of creations, modifications, and deletions of files) to solve the user query based on the selected files and validation errors if any.
For modifications, provide 'targetContent' (the exact block of lines to search for) and 'content' (the replacement code). Make targetContent unique and precise.
Respond ONLY with a JSON object matching this schema:
{
  "rationale": "Explanation of the patch plan",
  "chunks": [
    {
      "type": "create" | "modify" | "delete",
      "path": "relative/path/to/file",
      "content": "new or replacement content",
      "targetContent": "exact original block of code to search and replace (only required for modify type)",
      "description": "Short explanation of this chunk change"
    }
  ]
}`;
    const userMessage = `User Query: ${state.query}
Selected Files Content:
${JSON.stringify(state.fileSelectionResult?.selectedFiles)}
Validation Result from previous run (if any):
${JSON.stringify(state.validationResult)}`;

    if (ledger) {
      ledger.recordEvent("llm_call", "patch_plan", "info", { prompt: userMessage });
    }

    const completion = await llm.generateCompletion(
      [
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
      ],
      { responseFormat: { type: "json_object" }, temperature: state.context.temperature }
    );

    if (ledger) {
      ledger.recordEvent("tool_response", "patch_plan_response", "info", {
        response: completion.content,
      });
      if (completion.usage) {
        ledger.addTokenUsage(completion.usage.inputTokens, completion.usage.outputTokens);
      }
    }

    let patchPlan: PatchPlan;
    try {
      patchPlan = JSON.parse(completion.content) as PatchPlan;
    } catch {
      const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        patchPlan = JSON.parse(jsonMatch[0]) as PatchPlan;
      } else {
        throw new Error(`Failed to parse patch plan JSON response: ${completion.content}`);
      }
    }

    // Defensive: ensure chunks is always an array
    if (!Array.isArray(patchPlan.chunks)) {
      patchPlan = { rationale: patchPlan.rationale ?? "No rationale.", chunks: [] };
    }

    return {
      patchPlan,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Patch Plan:\nRationale: ${patchPlan.rationale}\nChunks:\n${patchPlan.chunks.map((c) => `- ${c.type.toUpperCase()} ${c.path}: ${c.description}`).join("\n")}`,
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
    const allPaths = patchPlan.chunks.map((c) => c.path);
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

    for (const chunk of patchPlan.chunks) {
      const fullPath = path.join(state.context.workspaceDir, chunk.path);
      if (chunk.type === "create") {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, chunk.content ?? "", "utf-8");
        if (ledger) {
          ledger.recordEvent("tool_call", `create_file:${chunk.path}`, "info", {
            description: chunk.description,
          });
        }
      } else if (chunk.type === "modify") {
        let currentContent = "";
        try {
          currentContent = await fs.readFile(fullPath, "utf-8");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to read file for modification: ${chunk.path}. Error: ${msg}`);
        }

        if (chunk.targetContent) {
          if (currentContent.includes(chunk.targetContent)) {
            const newContent = currentContent.replace(chunk.targetContent, chunk.content ?? "");
            await fs.writeFile(fullPath, newContent, "utf-8");
            if (ledger) {
              ledger.recordEvent("tool_call", `modify_file:${chunk.path}`, "info", {
                description: chunk.description,
              });
            }
          } else {
            throw new Error(`Target content not found in file: ${chunk.path}`);
          }
        } else {
          await fs.writeFile(fullPath, chunk.content ?? "", "utf-8");
          if (ledger) {
            ledger.recordEvent("tool_call", `modify_file_overwrite:${chunk.path}`, "warning", {
              description: chunk.description,
            });
          }
        }
      } else if (chunk.type === "delete") {
        try {
          await fs.unlink(fullPath);
          if (ledger) {
            ledger.recordEvent("tool_call", `delete_file:${chunk.path}`, "info", {
              description: chunk.description,
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (ledger) {
            ledger.recordEvent("system", `delete_file_failed:${chunk.path}`, "warning", {
              error: msg,
            });
          }
        }
      }
    }

    return {};
  };
}

export function createValidationNode(): AgentNode {
  return async (state) => {
    const testCommand = state.context.testCommand ?? detectTestCommand();
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

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

/** Detect which test command is available in the current environment. */
function detectTestCommand(): string {
  // Default to bun test; a more sophisticated version could check package.json scripts
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

    const filesModified = state.patchPlan?.chunks.map((c) => c.path) ?? [];
    const validationSuccess = state.validationResult?.success ?? false;
    const patchApplied = !state.context.dryRun && (state.patchPlan?.chunks.length ?? 0) > 0;

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
            (cmd) =>
              `**Command:** \`${cmd.command}\`\n` +
              `- Exit Code: ${cmd.exitCode}\n` +
              `- Duration: ${cmd.durationMs}ms\n` +
              (cmd.stdout ? `- Stdout:\n\`\`\`\n${cmd.stdout.slice(0, 2000)}\n\`\`\`\n` : "") +
              (cmd.stderr ? `- Stderr:\n\`\`\`\n${cmd.stderr.slice(0, 2000)}\n\`\`\`\n` : "")
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

| # | Type | File | Description |
|---|------|------|-------------|
${state.patchPlan.chunks.map((c, i) => `| ${i + 1} | \`${c.type}\` | \`${c.path}\` | ${c.description} |`).join("\n")}

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
      : "1. This was a dry-run. Review the patch plan in \`.codepawl/runs/${runId}/patch-plan.json\`.\n2. Re-run with \`--write\` to apply the patch."
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
