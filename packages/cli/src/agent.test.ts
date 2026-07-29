import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import {
  buildCliRepositorySnapshot,
  evaluateAgentAction,
  parseCliAgentTurnResult,
  runCliAgentTurn,
  type ProposedRepositoryAction,
} from "./agent";

const execFileAsync = promisify(execFile);

function action(
  overrides: Partial<ProposedRepositoryAction> = {},
): ProposedRepositoryAction {
  return {
    instruction: "Update the CLI copy",
    rationale: "The user requested a small repository change.",
    operations: ["write"],
    estimatedPaths: ["packages/cli/src/ui.ts"],
    estimatedChangedFiles: 1,
    helperTasks: [],
    ...overrides,
  };
}

describe("CLI conversational agent contract", () => {
  it("parses bounded answers and action proposals", () => {
    expect(
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "answer",
          reply: "The CLI opens with `make cli`.",
          conversationSummary: "Explained how to open the CLI.",
          action: null,
        }),
      ),
    ).toEqual({
      disposition: "answer",
      reply: "The CLI opens with `make cli`.",
      conversationSummary: "Explained how to open the CLI.",
    });

    expect(
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "action",
          reply: "I can update the CLI.",
          conversationSummary: "User requested a CLI copy update.",
          action: action(),
        }),
      ),
    ).toMatchObject({
      disposition: "action",
      action: {
        operations: ["write"],
        estimatedPaths: ["packages/cli/src/ui.ts"],
      },
    });

    expect(
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "action",
          reply: "I can update it.",
          conversationSummary: "Update requested.",
          action: action({
            estimatedPaths: ["packages\\cli\\src\\ui.ts"],
          }),
        }),
      ).action?.estimatedPaths,
    ).toEqual(["packages/cli/src/ui.ts"]);
  });

  it("fails closed for malformed dispositions and missing action plans", () => {
    expect(() => parseCliAgentTurnResult("{")).toThrow();
    expect(() =>
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "maybe",
          reply: "No",
          conversationSummary: "No",
          action: null,
        }),
      ),
    ).toThrow("invalid disposition");
    expect(() =>
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "action",
          reply: "I will do it.",
          conversationSummary: "Action requested.",
          action: null,
        }),
      ),
    ).toThrow("missing an action plan");
  });

  it("auto-authorizes only small repository-local writes", () => {
    expect(evaluateAgentAction(action())).toMatchObject({
      decision: "auto_allowed",
      risk: "low",
    });
  });

  it("requires approval for destructive, dependency, broad, or unknown work", () => {
    for (const proposed of [
      action({ operations: ["delete"] }),
      action({ operations: ["dependency"] }),
      action({ operations: ["unknown"] }),
      action({ operations: ["read"], estimatedPaths: [], estimatedChangedFiles: 0 }),
      action({ operations: ["read", "write"] }),
      action({ estimatedChangedFiles: 13 }),
      action({ estimatedPaths: ["pnpm-lock.yaml"] }),
      action({ estimatedPaths: ["package.json"] }),
      action({ estimatedPaths: ["packages\\package.json"] }),
      action({ estimatedPaths: [".codex\\state.json"] }),
      action({ estimatedPaths: ["packages/**"] }),
      action({ estimatedPaths: ["packages/cli/src"] }),
      action({ estimatedPaths: [] }),
      action({ estimatedChangedFiles: 0 }),
    ]) {
      expect(evaluateAgentAction(proposed).decision).toBe("approval_required");
    }
  });

  it("requires unavailable takeover for host, secret, or outside-repository work", () => {
    for (const proposed of [
      action({ operations: ["host"] }),
      action({ operations: ["secret"] }),
      action({ estimatedPaths: ["/etc/hosts"] }),
      action({ estimatedPaths: ["../outside.txt"] }),
      action({ estimatedPaths: [".env.production"] }),
      action({ estimatedPaths: ["packages\\.git\\config"] }),
    ]) {
      expect(evaluateAgentAction(proposed)).toMatchObject({
        decision: "takeover_required",
        risk: "blocked",
      });
    }
  });

  it("builds a bounded repository snapshot without sensitive or outside-symlink contents", async () => {
    const repositoryPath = await mkdtemp(
      path.join(os.tmpdir(), "orynt-agent-snapshot-"),
    );
    try {
      await execFileAsync("git", ["init"], { cwd: repositoryPath });
      await execFileAsync("git", ["config", "user.email", "orynt@example.test"], {
        cwd: repositoryPath,
      });
      await execFileAsync("git", ["config", "user.name", "Orynt Test"], {
        cwd: repositoryPath,
      });
      await writeFile(
        path.join(repositoryPath, "README.md"),
        "Open the CLI with make cli.\nAccidental token: sk-supersecretvalue123\n",
      );
      await execFileAsync("git", ["add", "README.md"], { cwd: repositoryPath });
      await execFileAsync("git", ["commit", "-m", "initial"], {
        cwd: repositoryPath,
      });
      await writeFile(path.join(repositoryPath, ".env"), "TOP_SECRET=value\n");
      await writeFile(
        path.join(repositoryPath, "operator.pem"),
        "PRIVATE MATERIAL\n",
      );
      await symlink("/etc/hosts", path.join(repositoryPath, "outside-link.md"));

      const snapshot = await buildCliRepositorySnapshot(
        repositoryPath,
        "Read README.md, .env, operator.pem, and outside-link.md",
      );

      expect(snapshot).toContain("Open the CLI with make cli.");
      expect(snapshot).not.toContain("sk-supersecretvalue123");
      expect(snapshot).not.toContain("TOP_SECRET");
      expect(snapshot).not.toContain("PRIVATE MATERIAL");
      expect(snapshot).not.toContain("127.0.0.1");
      expect(snapshot).not.toContain(".env");
      expect(snapshot).not.toContain("operator.pem");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("does not inspect or spawn Codex for a pre-aborted advisory turn", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCliAgentTurn({
        prompt: "inspect",
        repositoryPath: "/path/that/does/not/exist",
        modelId: "gpt-5.5",
        thinkingEffort: "low",
        acceptanceCriteria: [],
        recentTurns: [],
        signal: controller.signal,
      }),
    ).rejects.toThrow("agent turn cancelled");
  });

  it("rejects mid-flight advisory aborts and timeouts even when Codex exits zero", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(os.tmpdir(), "orynt-agent-cancel-"),
    );
    const repositoryPath = path.join(fixtureRoot, "repo");
    const binPath = path.join(fixtureRoot, "bin");
    const markerPath = path.join(fixtureRoot, "started");
    const fakeCodexPath = path.join(binPath, "codex");
    const previousPath = process.env.PATH;
    try {
      await mkdir(repositoryPath, { recursive: true });
      await mkdir(binPath, { recursive: true });
      await execFileAsync("git", ["init"], { cwd: repositoryPath });
      await execFileAsync("git", ["config", "user.email", "orynt@example.test"], {
        cwd: repositoryPath,
      });
      await execFileAsync("git", ["config", "user.name", "Orynt Test"], {
        cwd: repositoryPath,
      });
      await writeFile(path.join(repositoryPath, "README.md"), "fixture\n");
      await execFileAsync("git", ["add", "README.md"], { cwd: repositoryPath });
      await execFileAsync("git", ["commit", "-m", "initial"], {
        cwd: repositoryPath,
      });
      await writeFile(
        fakeCodexPath,
        `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(markerPath)}, "started");
const outputIndex = process.argv.indexOf("--output-last-message");
process.on("SIGTERM", () => {
  if (outputIndex >= 0) {
    fs.writeFileSync(process.argv[outputIndex + 1], JSON.stringify({
      disposition: "answer",
      reply: "should not be accepted",
      conversationSummary: "should not be accepted",
      action: null,
    }));
  }
  process.exit(0);
});
setInterval(() => {}, 1000);
`,
      );
      await chmod(fakeCodexPath, 0o755);
      process.env.PATH = `${binPath}${path.delimiter}${previousPath ?? ""}`;

      const request = {
        prompt: "inspect",
        repositoryPath,
        modelId: "gpt-5.5",
        thinkingEffort: "low" as const,
        acceptanceCriteria: [],
        recentTurns: [],
      };
      const controller = new AbortController();
      const abortedTurn = runCliAgentTurn({
        ...request,
        signal: controller.signal,
      });
      await vi.waitFor(() => access(markerPath));
      controller.abort();
      await expect(abortedTurn).rejects.toThrow("agent turn cancelled");

      await rm(markerPath, { force: true });
      await expect(
        runCliAgentTurn({
          ...request,
          advisoryTimeoutMs: 25,
        }),
      ).rejects.toThrow("agent turn timed out");
    } finally {
      process.env.PATH = previousPath;
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
