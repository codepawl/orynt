import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "bun:test";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function runSidecar(input: Record<string, unknown>, environment: NodeJS.ProcessEnv = process.env) {
  const repositoryRoot = path.resolve(process.cwd(), "../..");
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "scripts", "desktop-repository-run.mjs"),
    ],
    {
      cwd: repositoryRoot,
      env: environment,
      input: JSON.stringify(input),
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "desktop repository sidecar failed");
  }
  return JSON.parse(result.stdout) as {
    runId: string;
    status: string;
    checkpointRevision: number;
    approval: { id: string; status: string } | null;
  };
}

async function installPromptUnderstandingCodexFixture(root: string): Promise<string> {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "codex");
  await writeFile(
    executable,
    `#!/usr/bin/env bun
import readline from "node:readline";
const output = JSON.stringify({
  outcome: "answer",
  readiness: "ready",
  reply: "The selected repository is ready for a bounded request.",
  conversationSummary: "The operator asked what the selected repository does.",
  refinedBrief: null,
  questions: [],
  assumptions: [],
});
const lines = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
setInterval(() => {}, 1_000);
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { codexHome: "/tmp", platformFamily: "unix", platformOs: "linux", userAgent: "fixture" } });
  } else if (message.method === "thread/start") {
    send({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-1" } } });
  } else if (message.method === "turn/start") {
    const threadId = message.params.threadId;
    const turnId = "turn-1";
    send({ jsonrpc: "2.0", id: message.id, result: { turn: { id: turnId } } });
    send({ jsonrpc: "2.0", method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "item-1", delta: output } });
    send({ jsonrpc: "2.0", method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
  } else if (message.method === "turn/interrupt") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
  }
});
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

describe("desktop repository sidecar v2", () => {
  it("returns an understanding result without creating runtime state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-sidecar-understanding-"));
    roots.push(root);
    const bin = await installPromptUnderstandingCodexFixture(root);
    const stateRoot = path.join(root, "state-that-must-not-exist");

    const result = runSidecar(
      {
        operation: "understand_prompt",
        promptBasis: {
          rawPrompt: "What does this repository do?",
          acceptanceCriteria: [],
          clarificationAnswers: [],
          confirmedAssumptions: [],
        },
        repositoryPath: root,
        stateRoot,
        modelConnection: {
          providerId: "codex-cli",
          providerLabel: "Codex CLI",
          modelId: "gpt-test",
          modelLabel: "GPT Test",
          authMethod: "codexCliSession",
        },
      },
      { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
    );

    expect(result).toMatchObject({
      schemaVersion: 1,
      outcome: "answer",
      readiness: "ready",
      reply: "The selected repository is ready for a bounded request.",
    });
    expect(result).not.toHaveProperty("runId");
    expect(result).not.toHaveProperty("checkpointRevision");
    await expect(access(stateRoot)).rejects.toThrow();
  });

  it("fails closed when a bare request has no ready planning model", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-sidecar-v2-"));
    roots.push(root);
    const memoryRoot = path.join(root, "memory");
    const baseRequest = {
      goal: "Prepare a supervised repository task",
      taskId: "task-sidecar-v2",
      workspaceId: "workspace-sidecar-v2",
      repositoryPath: path.join(root, "repository"),
      sandboxRoot: path.join(root, "sandboxes"),
      artifactRoot: path.join(root, "artifacts"),
      memoryRoot,
    };

    expect(() => runSidecar(baseRequest)).toThrow(
      "Desktop task planning requires a ready model connection.",
    );
  });

  it("blocks an exact tier binding when its provider connection is unavailable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-sidecar-tier-block-"));
    roots.push(root);
    const tier = (providerId: string, modelId: string, maxTokens: number, maxWallTimeMs: number) => ({
      providerId,
      modelId,
      thinkingEffort: "medium",
      maxTokens,
      maxWallTimeMs,
    });
    expect(() =>
      runSidecar({
        operation: "understand_prompt",
        promptBasis: {
          rawPrompt: "Explain this repository.",
          acceptanceCriteria: [],
          clarificationAnswers: [],
          confirmedAssumptions: [],
        },
        repositoryPath: root,
        modelConnection: {
          providerId: "codex-cli",
          providerLabel: "Codex CLI",
          modelId: "gpt-light",
          modelLabel: "GPT Light",
          authMethod: "codexCliSession",
        },
        modelConnections: [
          {
            providerId: "codex-cli",
            providerLabel: "Codex CLI",
            modelId: "gpt-light",
            modelLabel: "GPT Light",
            authMethod: "codexCliSession",
          },
        ],
        modelTierConfiguration: {
          schemaVersion: 1,
          policyVersion: "deterministic_v1",
          tiers: {
            light: tier("codex-cli", "gpt-light", 8_000, 300_000),
            medium: tier("openai-api", "gpt-medium", 20_000, 900_000),
            heavy: tier("openai-api", "gpt-heavy", 30_000, 1_200_000),
          },
          roles: {
            coordinator: "medium",
            implementer: "medium",
            helper: "light",
            reviewer: "heavy",
          },
          fallbackPolicy: "block",
          manualOverridePolicy: "raise_only",
          maxReadOnlyHelpers: 2,
          maxDepth: 2,
          maxRecoveryAttempts: 1,
        },
      }),
    ).toThrow("MODEL_TIER_UNAVAILABLE: medium provider is not ready");
  });
});
