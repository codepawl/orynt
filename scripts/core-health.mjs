import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { runDesktopRepositoryBeta } from "../packages/coding-apprentice/dist/index.js";
import { buildRepositoryTaskPlan } from "../packages/cognitive-kernel/dist/index.js";

const execFileAsync = promisify(execFile);

async function git(args, cwd) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout).trim();
}

async function createCoreHealthRepository(root) {
  const repositoryPath = path.join(root, "repo");
  await mkdir(path.join(repositoryPath, "packages"), { recursive: true });
  await mkdir(path.join(repositoryPath, "scripts"), { recursive: true });
  await git(["init"], repositoryPath);
  await git(["config", "user.email", "orynt-core-health@example.test"], repositoryPath);
  await git(["config", "user.name", "Orynt Core Health"], repositoryPath);
  await writeFile(path.join(repositoryPath, "README.md"), "# Orynt core health fixture\n", "utf8");
  await writeFile(path.join(repositoryPath, "packages", "value.txt"), "initial\n", "utf8");
  await writeFile(path.join(repositoryPath, "scripts", "pass.mjs"), "console.log('core health verification ok');\n", "utf8");
  await git(["add", "README.md", "packages/value.txt", "scripts/pass.mjs"], repositoryPath);
  await git(["commit", "-m", "initial"], repositoryPath);
  return repositoryPath;
}

async function createFakeCodexBinary(root) {
  const binDir = path.join(root, "bin");
  const fakeCodex = path.join(binDir, "codex");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
if (!fs.existsSync(path.join(cwd, ".codex", "orynt-beta-verify.mjs"))) {
  console.error("missing verifier script before execution");
  process.exit(2);
}
fs.writeFileSync(path.join(cwd, "packages", "value.txt"), "controlled codex core health pass\\n");
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex >= 0) fs.writeFileSync(process.argv[outputIndex + 1], "Fake Codex core health completed\\n");
console.log("fake codex core health finished");
`,
    "utf8",
  );
  await chmod(fakeCodex, 0o755);
  return binDir;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-core-health-"));
  const preserve = process.argv.includes("--preserve");
  const useControlledCodex = process.argv.includes("--controlled-codex");
  const previousPath = process.env.PATH;
  try {
    const repositoryPath = await createCoreHealthRepository(tempRoot);
    if (useControlledCodex) {
      const codexBin = await createFakeCodexBinary(tempRoot);
      process.env.PATH = `${codexBin}${path.delimiter}${previousPath ?? ""}`;
    }

    const streamedEvents = [];
    const goal = useControlledCodex
      ? "Update packages/value.txt through the verified Orynt core health task"
      : "Inspect the repository and verify the supervised Orynt core health path";
    const taskPlan = useControlledCodex
      ? buildRepositoryTaskPlan({
          goal,
          sourcePrompt: goal,
          maxModelTokens: 4_000,
          maxWallTimeMs: 60_000,
          maxRecoveryAttempts: 0,
          candidate: {
            summary: "Apply one bounded core-health fixture change.",
            requirements: [{
              id: "core-health-outcome",
              source: "user_prompt",
              kind: "outcome",
              text: goal,
              required: true,
            }],
            tasks: [{
              id: "core-health-change",
              kind: "change",
              title: "Update the core health fixture",
              instruction: goal,
              dependencies: [],
              authority: "single_writer",
              expectedPaths: ["packages/value.txt"],
              readPaths: [],
              operations: ["read", "write"],
              requirementIds: ["core-health-outcome"],
              doneWhen: [
                "packages/value.txt contains the controlled core health result.",
              ],
              evidence: [{
                id: "core-health-path-scope",
                kind: "path_scope",
                requirementIds: ["core-health-outcome"],
                description:
                  "Verify the controlled change remains inside the approved fixture path.",
                path: "packages/value.txt",
              }],
            }],
            allowedOperations: ["read", "write"],
          },
        })
      : undefined;
    const result = await runDesktopRepositoryBeta({
      goal,
      taskId: useControlledCodex ? "core-health-controlled-codex" : "core-health-supervised-local",
      workspaceId: "workspace-core-health",
      repositoryPath,
      sandboxRoot: path.join(tempRoot, "sandboxes"),
      artifactRoot: path.join(tempRoot, "artifacts"),
      memoryRoot: path.join(tempRoot, "memory"),
      modelConnection: useControlledCodex
        ? {
            providerId: "codex-cli",
            providerLabel: "Codex CLI",
            modelId: "core-health-fake-codex",
            modelLabel: "Core Health Fake Codex",
            authMethod: "codexCliSession",
          }
        : {
            providerId: "local-supervised",
            providerLabel: "Local Supervised Harness",
            modelId: "deterministic-core-health",
            modelLabel: "Deterministic Core Health",
            authMethod: "none",
          },
      thinkingEffort: "high",
      ...(taskPlan
        ? {
            taskPlan,
            authorization: {
              source: "operator",
              reason: "The core-health mutation is bound to its verified fixture plan.",
              expectedPaths: [...taskPlan.pathEnvelope],
              planId: taskPlan.id,
              planRevision: taskPlan.revision,
              planDigest: taskPlan.digest,
            },
            createExecutionApproval: ({ plan, run }) => ({
              id: `approval-${plan.id}`,
              runId: run.id,
              planId: plan.id,
              status: "approved",
              approvedBy: "core-health-fixture",
              reason: "Controlled fixture approval for the digest-bound health task.",
              approvedAt: new Date().toISOString(),
            }),
          }
        : {}),
      onRunEvent: (event) => streamedEvents.push(event),
    });

    const manifest = JSON.parse(await readFile(result.artifactManifestPath, "utf8"));
    const eventTypes = manifest.eventTypes ?? [];
    const artifactRefs = manifest.artifactRefs ?? [];
    assertCondition(result.status === "pass", `expected pass status, got ${result.status}`);
    assertCondition(eventTypes.includes("run_started"), "expected run_started event");
    assertCondition(eventTypes.includes("verification_passed"), "expected verification_passed event");
    assertCondition(eventTypes.includes("memory_extraction_finished"), "expected memory_extraction_finished event");
    assertCondition(eventTypes.at(-1) === "run_finished", "expected run_finished final event");
    assertCondition(manifest.budgetedAgent?.compactWorkingState?.hardConstraints?.includes("supervised repository run"), "expected compact working state hard constraint");
    assertCondition(typeof manifest.budgetedAgent?.cost?.costPerSuccessfulTask === "number", "expected budgeted cost-per-success estimate");
    assertCondition(manifest.memory?.episodeCount > 0, "expected memory episodes");
    assertCondition(artifactRefs.some((artifact) => artifact.kind === "validation_report"), "expected validation_report artifact ref");
    assertCondition(manifest.artifacts?.verificationResult, "expected verification result artifact path");
    assertCondition(streamedEvents.length === result.eventCount, "expected streamed event count to match output event count");

    const summary = {
      status: result.status,
      mode: useControlledCodex ? "controlled_codex" : "supervised_local",
      runId: result.runId,
      eventCount: result.eventCount,
      budgetedMode: manifest.budgetedAgent.mode,
      selectedOptionId: manifest.budgetedAgent.selectedOptionId,
      costPerSuccessfulTask: manifest.budgetedAgent.cost.costPerSuccessfulTask,
      memoryEpisodeCount: manifest.memory.episodeCount,
      artifactManifestPath: result.artifactManifestPath,
      eventLogPath: manifest.artifacts.eventLog,
      verificationResultPath: manifest.artifacts.verificationResult,
      preservedTempRoot: preserve ? tempRoot : null,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    process.env.PATH = previousPath;
    if (!preserve) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

await main();
