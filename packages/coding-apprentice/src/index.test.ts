import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalCodingApprenticeDemoOrchestrator } from "./index";

const execFileAsync = promisify(execFile);

let tempRoot = "";

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout).trim();
}

async function createFixtureRepository(name = "repo") {
  const repositoryPath = path.join(tempRoot, name);
  await mkdir(path.join(repositoryPath, "packages"), { recursive: true });
  await mkdir(path.join(repositoryPath, "scripts"), { recursive: true });
  await git(["init"], repositoryPath);
  await git(["config", "user.email", "codepawl@example.test"], repositoryPath);
  await git(["config", "user.name", "CodePawl Test"], repositoryPath);
  await writeFile(path.join(repositoryPath, "README.md"), "# Fixture\n");
  await writeFile(path.join(repositoryPath, "packages", "value.txt"), "initial\n");
  await writeFile(path.join(repositoryPath, "scripts", "pass.mjs"), "console.log('verification ok apiKey=sk-shouldberedacted123');\n");
  await git(["add", "README.md", "packages/value.txt", "scripts/pass.mjs"], repositoryPath);
  await git(["commit", "-m", "initial"], repositoryPath);
  return repositoryPath;
}

function demoRequest(repositoryPath: string, overrides: Partial<Parameters<LocalCodingApprenticeDemoOrchestrator["runDemo"]>[0]> = {}) {
  return {
    goal: "Import a manual Codex result and verify it",
    taskId: "task-import-verify",
    workspaceId: "workspace-test",
    repositoryPath,
    sandboxRoot: path.join(tempRoot, "sandboxes"),
    artifactRoot: path.join(tempRoot, "artifacts"),
    validationCommands: ["node scripts/pass.mjs"],
    allowedVerificationCommands: ["node scripts/pass.mjs"],
    ...overrides,
  };
}

describe("LocalCodingApprenticeDemoOrchestrator", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "codepawl-coding-apprentice-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("runs an imported manual change through verifier and records a complete ordered timeline", async () => {
    const repositoryPath = await createFixtureRepository();
    const orchestrator = new LocalCodingApprenticeDemoOrchestrator();

    const result = await orchestrator.runDemo(
      demoRequest(repositoryPath, {
        applyManualChange: async ({ sandbox, artifactRoot }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
          await writeFile(path.join(artifactRoot, "codex-log.md"), "Manual Codex fixture result with token=sk-importsecret123\n");
          return { manualLogPath: path.join(artifactRoot, "codex-log.md") };
        },
      }),
    );

    expect(result.importBundle.status).toBe("imported");
    expect(result.verificationResult.status).toBe("pass");
    expect(result.importBundle.manualLog?.content).not.toContain("sk-importsecret123");
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(["codex_contract", "codex_contract_metadata", "codex_result_bundle", "verifier_input", "validation_report"]),
    );
    expect(JSON.parse(await readFile(result.verifierInputPath, "utf8"))).toMatchObject({
      runId: result.run.id,
      taskId: result.run.taskId,
      config: { requireChangedFiles: true },
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "run_started",
      "goal_received",
      "sandbox_inspected",
      "sandbox_create_requested",
      "sandbox_create_allowed",
      "sandbox_created",
      "codex_contract_requested",
      "codex_contract_created",
      "codex_manual_next_step",
      "codex_result_import_requested",
      "codex_sandbox_diff_inspected",
      "codex_manual_log_imported",
      "codex_result_redacted",
      "codex_result_imported",
      "verifier_input_created",
      "verification_planned",
      "verification_policy_checked",
      "verification_started",
      "verification_command_started",
      "verification_command_finished",
      "verification_diff_checked",
      "verification_recorded",
      "verification_passed",
      "memory_extraction_started",
      "memory_redaction_applied",
      "memory_episode_written",
      "memory_episode_written",
      "memory_episode_written",
      "memory_extraction_finished",
      "run_finished",
    ]);
    expect(result.memoryExtractionResult.episodes.map((episode) => episode.kind)).toEqual(
      expect.arrayContaining(["run_episode", "command_observation", "allowed_scope_pattern"]),
    );
  });

  it("returns a verifier no-change failure when imported result has no changed files", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(demoRequest(repositoryPath));

    expect(result.importBundle.status).toBe("manual_review_required");
    expect(result.importBundle.failureReasons).toContain("no_changes");
    expect(result.verificationResult.status).toBe("fail");
    expect(result.verificationResult.verdict.failureClass).toBe("no_changes");
    expect(result.memoryExtractionResult.episodes.map((episode) => episode.kind)).toContain("run_episode");
    expect(result.events.map((event) => event.type)).toContain("manual_review_required");
    expect(result.events.at(-1)?.verdict?.status).toBe("fail");
  });

  it("does not execute blocked verification commands", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        allowedVerificationCommands: [],
        applyManualChange: async ({ sandbox }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
        },
      }),
    );

    expect(result.verificationResult.status).toBe("fail");
    expect(result.verificationResult.verdict.failureClass).toBe("policy_blocked");
    expect(result.verificationResult.evidence.filter((item) => item.kind === "command")).toHaveLength(0);
  });

  it("fails verification when imported changes touch paths outside policy scope", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        applyManualChange: async ({ sandbox }) => {
          await writeFile(path.join(sandbox.worktreePath, "outside.txt"), "unexpected\n");
        },
      }),
    );

    expect(result.importBundle.status).toBe("manual_review_required");
    expect(result.importBundle.failureReasons).toContain("unexpected_file_touch");
    expect(result.verificationResult.status).toBe("fail");
    expect(result.verificationResult.verdict.failureClass).toBe("unexpected_file_touch");
  });

  it("preserves artifact references for import and verification handoff", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        applyManualChange: async ({ sandbox, artifactRoot }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
          await writeFile(path.join(artifactRoot, "validation.log"), "node scripts/pass.mjs\nPASS\n");
          return { validationTranscriptPath: path.join(artifactRoot, "validation.log") };
        },
      }),
    );

    const artifactIds = result.events.flatMap((event) => event.artifacts.map((artifact) => artifact.id));
    expect(artifactIds).toContain(`${result.importBundle.id}-json`);
    expect(artifactIds).toContain(`${result.importBundle.id}-verifier-input`);
    expect(result.verificationResult.artifacts.map((artifact) => artifact.kind)).toEqual(["validation_report"]);
    expect(result.summary).toContain("Verification pass");
  });
});
