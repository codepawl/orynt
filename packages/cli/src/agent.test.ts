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

import { afterAll, beforeAll, describe, expect, it, vi } from "bun:test";

import {
  hashPromptUnderstandingBasis,
  hashPromptUnderstandingInput,
} from "@codepawl/shared";

import {
  buildCliAgentPromptForTest,
  buildCliRepositorySnapshot,
  evaluateAgentAction,
  extractPartialJsonStringField,
  parseCodexExecTokenUsage,
  parseCliPromptUnderstandingResult,
  parseCliAgentTurnResult,
  promptRequiresRepositoryMutation,
  resolveCliNativeProviderForTest,
  runCliAgentTurn,
  shortlistCliSkillCandidates,
  turnNeedsActionGrammar,
  validateAgentTurnDispositionForUnderstanding,
  validateProposedActionForPrompt,
  type ProposedRepositoryAction,
} from "./agent";
import type { CliContextVmInvocationPort } from "./runtime";

const execFileAsync = promisify(execFile);
const previousCodexRuntime = process.env.ORYNT_CODEX_RUNTIME;

describe("agent turn disposition binding", () => {
  it("rejects a non-action response after prompt understanding is ready for repository work", () => {
    expect(() =>
      validateAgentTurnDispositionForUnderstanding(
        {
          disposition: "answer",
          reply: "I can help with that.",
          conversationSummary: "The user requested repository work.",
        },
        {
          schemaVersion: 1,
          promptId: "prompt-1",
          outcome: "repository_action",
          readiness: "ready",
          refinedBrief: "Build the requested project.",
          questions: [],
          assumptions: [],
        },
        true,
      ),
    ).toThrow(
      "Ready repository-action understanding requires an executable action disposition",
    );
  });

  it("preserves a direct answer when prompt understanding does not require repository work", () => {
    expect(() =>
      validateAgentTurnDispositionForUnderstanding(
        {
          disposition: "answer",
          reply: "This is a direct answer.",
          conversationSummary: "No repository work requested.",
        },
        {
          schemaVersion: 1,
          promptId: "prompt-2",
          outcome: "direct_answer",
          readiness: "ready",
          refinedBrief: "Answer the question.",
          questions: [],
          assumptions: [],
        },
      ),
    ).not.toThrow();
  });
});

async function waitUntil(check: () => Promise<unknown> | unknown): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch {
      await Bun.sleep(10);
    }
  }
  await check();
}

beforeAll(() => {
  process.env.ORYNT_CODEX_RUNTIME = "exec";
});

afterAll(() => {
  if (previousCodexRuntime === undefined) delete process.env.ORYNT_CODEX_RUNTIME;
  else process.env.ORYNT_CODEX_RUNTIME = previousCodexRuntime;
});

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
    taskPlan: {
      summary: "Update the bounded CLI copy.",
      requirements: [
        {
          id: "update-copy",
          text: "Update the CLI copy.",
          source: "user_prompt",
          kind: "outcome",
          required: true,
        },
      ],
      tasks: [
        {
          id: "update-cli-copy",
          title: "Update CLI copy",
          instruction: "Update the CLI copy.",
          kind: "change",
          dependencies: [],
          requirementIds: ["update-copy"],
          authority: "single_writer",
          operations: ["write"],
          readPaths: [],
          expectedPaths: ["packages/cli/src/ui.ts"],
          doneWhen: ["The requested CLI copy is updated."],
          evidence: [
            {
              id: "copy-diff",
              requirementIds: ["update-copy"],
              kind: "diff",
              description: "Inspect the CLI copy diff.",
              path: "packages/cli/src/ui.ts",
            },
          ],
        },
      ],
      allowedOperations: ["read", "write"],
    },
    ...overrides,
  };
}

describe("CLI conversational agent contract", () => {
  it("distinguishes explicit mutation requests from negative safety constraints", () => {
    expect(promptRequiresRepositoryMutation("Build a static calculator.")).toBe(true);
    expect(promptRequiresRepositoryMutation("Implement the approved plan.")).toBe(true);
    expect(promptRequiresRepositoryMutation("Do not modify repository files.")).toBe(false);
    expect(promptRequiresRepositoryMutation("Review the current implementation.")).toBe(false);

    const readOnlyAction = action({
      operations: ["read"],
      estimatedPaths: [],
      estimatedChangedFiles: 0,
    });
    readOnlyAction.taskPlan.tasks = [
      {
        ...readOnlyAction.taskPlan.tasks[0]!,
        kind: "validation",
        authority: "read_only",
        operations: ["read"],
        readPaths: ["packages/cli/src/ui.ts"],
        expectedPaths: [],
      },
    ];
    expect(() =>
      validateProposedActionForPrompt(
        readOnlyAction,
        "Build the requested CLI change.",
      )
    ).toThrow("requires at least one bounded writer task");
    expect(() =>
      validateProposedActionForPrompt(
        readOnlyAction,
        "Review the current CLI implementation.",
      )
    ).not.toThrow();
  });

  it("shortlists Agent Skills deterministically with relevant candidates first", () => {
    const candidates = [
      { id: "z-general", name: "General", description: "General guidance" },
      { id: "repo-map", name: "Repository map", description: "Explain repository architecture" },
      { id: "a-general", name: "General", description: "General guidance" },
    ];

    expect(
      shortlistCliSkillCandidates("Explain repository architecture", candidates, 2)
        .map(({ id }) => id),
    ).toEqual(["repo-map"]);
    expect(shortlistCliSkillCandidates("test", candidates, 99)).toEqual([]);
    expect(shortlistCliSkillCandidates("anything", candidates, 99)).toEqual([]);
    expect(shortlistCliSkillCandidates("anything", candidates, -1)).toEqual([]);
  });

  it("parses provider usage from the stateless exec transport", () => {
    expect(parseCodexExecTokenUsage([
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 24_224,
          cached_input_tokens: 9_984,
          output_tokens: 5,
          reasoning_output_tokens: 0,
        },
      }),
    ].join("\n"))).toEqual({
      inputTokens: 24_224,
      cachedInputTokens: 9_984,
      outputTokens: 5,
      reasoningOutputTokens: 0,
      totalTokens: 24_229,
    });
  });

  it("binds prompt-understanding output to the immutable basis and rejects replay", () => {
    const basis = {
      rawPrompt: "Update the CLI copy.",
      acceptanceCriteria: [],
      clarificationAnswers: [],
      confirmedAssumptions: [],
    };
    const result = {
      schemaVersion: 1,
      promptId: hashPromptUnderstandingBasis(basis),
      outcome: "repository_action",
      readiness: "clarification_required",
      reply: "Which wording should change?",
      refinedBrief: null,
      questions: [{
        id: "wording",
        prompt: "Which wording should change?",
        rationale: "It affects the requested outcome.",
        kind: "outcome",
        options: [],
      }],
      assumptions: [],
    };

    expect(
      parseCliPromptUnderstandingResult(JSON.stringify(result), basis),
    ).toMatchObject({ readiness: "clarification_required" });
    expect(() =>
      parseCliPromptUnderstandingResult(
        JSON.stringify({ ...result, promptId: "other-prompt" }),
        basis,
      ),
    ).toThrow("does not match");

    const context = {
      conversationSummary: "The operator is updating CLI copy.",
      recentTurns: [{ role: "user" as const, content: "Keep the change local." }],
    };
    const candidate = {
      outcome: "repository_action",
      readiness: "ready",
      reply: "The bounded copy change is ready.",
      conversationSummary: "The copy change remains repository-local.",
      refinedBrief: {
        goal: "Update the CLI copy.",
        deliverables: [],
        constraints: [],
        acceptanceCriteria: [],
        nonGoals: [],
      },
      questions: [],
      assumptions: [],
    };
    expect(
      parseCliPromptUnderstandingResult(
        JSON.stringify(candidate),
        basis,
        context,
      ),
    ).toMatchObject({
      promptId: hashPromptUnderstandingBasis(basis),
      inputId: hashPromptUnderstandingInput(basis, context),
      conversationSummary: candidate.conversationSummary,
    });
    expect(
      parseCliPromptUnderstandingResult(
        JSON.stringify({
          ...candidate,
          questions: [{
            id: "validation",
            prompt: "Which validation should define completion?",
            rationale: "It changes the completion gate.",
            kind: "validation",
            options: [],
          }],
        }),
        basis,
        context,
      ),
    ).toMatchObject({
      readiness: "clarification_required",
      questions: [expect.objectContaining({ id: "validation" })],
    });
  });

  it("extracts a streaming reply from incomplete structured JSON", () => {
    expect(
      extractPartialJsonStringField(
        '{"disposition":"answer","reply":"Hello\\nworld',
        "reply",
      ),
    ).toBe("Hello\nworld");
    expect(
      extractPartialJsonStringField(
        '{"reply":"Quote: \\"yes\\" and unicode \\u2713","action":null}',
        "reply",
      ),
    ).toBe('Quote: "yes" and unicode ✓');
    expect(extractPartialJsonStringField('{"disposition":"answer"', "reply")).toBeUndefined();
  });

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

    const actionWithCanonicalCommand = action();
    actionWithCanonicalCommand.taskPlan.tasks[0]!.evidence = [{
      id: "validation-command",
      requirementIds: ["update-copy"],
      kind: "command",
      description: "Run the managed verifier.",
      command: "  node   .codex/orynt-beta-verify.mjs ",
    }];
    expect(
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "action",
          reply: "I can update the CLI.",
          conversationSummary: "User requested a CLI copy update.",
          action: actionWithCanonicalCommand,
        }),
      ).action?.taskPlan.tasks[0]?.evidence[0]?.command,
    ).toBe("node .codex/orynt-beta-verify.mjs");

    const actionWithCompoundCommand = action();
    actionWithCompoundCommand.taskPlan.tasks[0]!.evidence = [{
      id: "validation-command",
      requirementIds: ["update-copy"],
      kind: "command",
      description: "Run a compound shell command.",
      command: "bun test && git status --short",
    }];
    expect(() =>
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "action",
          reply: "I can update the CLI.",
          conversationSummary: "User requested a CLI copy update.",
          action: actionWithCompoundCommand,
        }),
      ),
    ).toThrow("policy-allowed validation command");

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

    const actionWithDriftedEvidence = action();
    actionWithDriftedEvidence.taskPlan.tasks[0]!.evidence[0]!.requirementIds = [
      "invented-requirement",
    ];
    expect(
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "action",
          reply: "I can update the CLI.",
          conversationSummary: "User requested a CLI copy update.",
          action: actionWithDriftedEvidence,
        }),
      ).action?.taskPlan.tasks[0]?.evidence[0]?.requirementIds,
    ).toEqual(["update-copy"]);

    const actionWithCompoundEvidence = action();
    actionWithCompoundEvidence.taskPlan.tasks[0]!.evidence[0] = {
      ...actionWithCompoundEvidence.taskPlan.tasks[0]!.evidence[0]!,
      kind: "command",
      command: "git status --short && git diff --name-only",
    };
    expect(() =>
      parseCliAgentTurnResult(
        JSON.stringify({
          disposition: "action",
          reply: "I can update the CLI.",
          conversationSummary: "User requested a CLI copy update.",
          action: actionWithCompoundEvidence,
        }),
      ),
    ).toThrow("policy-allowed validation command");
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
      action({ estimatedPaths: ["bun.lock"] }),
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

  it("does not treat explicit safety constraints as capability requests", () => {
    expect(
      evaluateAgentAction(
        action({
          instruction:
            "Update the local files. Do not access secrets, credentials, tokens, the host filesystem, or the network.",
          rationale:
            "The work remains repository-only and must never run curl or git push.",
        }),
      ),
    ).toMatchObject({
      decision: "auto_allowed",
      risk: "low",
    });

    expect(
      evaluateAgentAction(
        action({
          instruction:
            "Do not inspect unrelated files, but read the API key and use curl.",
        }),
      ),
    ).toMatchObject({
      decision: "takeover_required",
      risk: "blocked",
    });
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

      expect(snapshot.length).toBeLessThanOrEqual(8_000);
      expect(snapshot).toContain("Git status summary:");
      expect(snapshot).toContain("Repository landmarks");
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

  it("keeps prompt-understanding output internal and streams only the coordinator answer", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-agent-stream-"));
    const repositoryPath = path.join(fixtureRoot, "repo");
      const binPath = path.join(fixtureRoot, "bin");
      const fakeCodexPath = path.join(binPath, "codex");
      const invocationCountPath = path.join(fixtureRoot, "invocation-count");
    const previousPath = process.env.PATH;
    try {
      await mkdir(repositoryPath, { recursive: true });
      await mkdir(binPath, { recursive: true });
      await execFileAsync("git", ["init"], { cwd: repositoryPath });
      await execFileAsync("git", ["config", "user.email", "orynt@example.test"], { cwd: repositoryPath });
      await execFileAsync("git", ["config", "user.name", "Orynt Test"], { cwd: repositoryPath });
      await writeFile(path.join(repositoryPath, "README.md"), "fixture\n");
      await execFileAsync("git", ["add", "README.md"], { cwd: repositoryPath });
      await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repositoryPath });
      const promptId = hashPromptUnderstandingBasis({
        rawPrompt: "say hello",
        acceptanceCriteria: [],
        clarificationAnswers: [],
        confirmedAssumptions: [],
      });
      await writeFile(
        fakeCodexPath,
        `#!/usr/bin/env bun
const fs = require("node:fs");
const outputIndex = process.argv.indexOf("--output-last-message");
fs.readFileSync(0, "utf8");
const invocationCountPath = ${JSON.stringify(invocationCountPath)};
const invocation = fs.existsSync(invocationCountPath)
  ? Number(fs.readFileSync(invocationCountPath, "utf8"))
  : 0;
fs.writeFileSync(invocationCountPath, String(invocation + 1));
const promptId = ${JSON.stringify(promptId)};
const finalMessage = invocation === 0 ? JSON.stringify({
  schemaVersion: 1,
  promptId,
  outcome: "answer",
  readiness: "ready",
  reply: "Hello from the streamed agent.",
  refinedBrief: null,
  questions: [],
  assumptions: [],
}) : JSON.stringify({
  disposition: "answer",
  reply: "Hello from the streamed agent.",
  conversationSummary: "Answered through the authoritative coordinator.",
  action: null,
});
fs.writeSync(1, JSON.stringify({
  type: "item.updated",
  item: { id: "message-1", type: "agent_message", text: "{\\"disposition\\":\\"answer\\",\\"reply\\":\\"Hello from" },
}) + "\\n");
fs.writeSync(1, JSON.stringify({
  type: "item.completed",
  item: { id: "message-1", type: "agent_message", text: finalMessage },
}) + "\\n");
fs.writeFileSync(process.argv[outputIndex + 1], finalMessage);
`,
      );
      await chmod(fakeCodexPath, 0o755);
      process.env.PATH = `${binPath}${path.delimiter}${previousPath ?? ""}`;
      const activities: string[] = [];
      const preparedInvocations: Array<
        Parameters<CliContextVmInvocationPort["prepare"]>[0]
      > = [];
      const contextVm: CliContextVmInvocationPort = {
        prepare: async (input) => {
          preparedInvocations.push(input);
          return {};
        },
        recordInferenceStarted: async () => "prompt-understanding-attempt",
        recordProviderResult: async () => undefined,
        checkpoint: async () => "checkpoint",
        recordMemoryExemption: async () => undefined,
        close: async () => undefined,
      };

      const result = await runCliAgentTurn({
        prompt: "say hello",
        repositoryPath,
        modelId: "gpt-5.5",
        thinkingEffort: "low",
        acceptanceCriteria: [],
        conversationSummary: "The user sent two short messages.",
        recentTurns: [
          { role: "user", content: "yo" },
          { role: "user", content: "test" },
          { role: "agent", content: "How can I help?" },
        ],
        contextVm,
        onActivity: (event) => {
          if (event.kind === "message") {
            activities.push(event.text);
          }
        },
      });

      expect(activities).toEqual([
        "Hello from",
        "Hello from the streamed agent.",
      ]);
      expect(result.reply).toBe("Hello from the streamed agent.");
      expect(preparedInvocations).toHaveLength(2);
      expect(preparedInvocations[0]).toMatchObject({
        role: "prompt_understanding",
        prompt: "say hello",
        conversationSummary: "The user sent two short messages.",
        recentTurns: [
          { role: "user", content: "yo" },
          { role: "user", content: "test" },
          { role: "agent", content: "How can I help?" },
        ],
      });
    } finally {
      process.env.PATH = previousPath;
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("repairs one invalid prompt-understanding lifecycle with the bounded previous candidate", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(os.tmpdir(), "orynt-agent-understanding-repair-"),
    );
    const repositoryPath = path.join(fixtureRoot, "repo");
    const binPath = path.join(fixtureRoot, "bin");
    const fakeCodexPath = path.join(binPath, "codex");
    const invocationLog = path.join(fixtureRoot, "invocations.jsonl");
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
      await writeFile(
        path.join(repositoryPath, "README.md"),
        "# Repair fixture\n",
      );
      await execFileAsync("git", ["add", "README.md"], { cwd: repositoryPath });
      await execFileAsync("git", ["commit", "-m", "initial"], {
        cwd: repositoryPath,
      });
      await writeFile(
        fakeCodexPath,
        `#!/usr/bin/env bun
const fs = require("node:fs");
const prompt = fs.readFileSync(0, "utf8");
const outputIndex = process.argv.indexOf("--output-last-message");
const schemaIndex = process.argv.indexOf("--output-schema");
const understanding = schemaIndex >= 0 &&
  process.argv[schemaIndex + 1].endsWith("understanding.schema.json");
const mode = prompt.includes("repeat invalid understanding")
  ? "repeated"
  : prompt.includes("assumption mismatch")
    ? "assumption"
    : prompt.includes("missing refined brief")
      ? "brief"
      : prompt.includes("empty understanding reply")
        ? "reply"
        : "corrected";
const logPath = ${JSON.stringify(invocationLog)};
const prior = fs.existsSync(logPath)
  ? fs.readFileSync(logPath, "utf8").trim().split("\\n").filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.mode === mode && entry.understanding).length
  : 0;
fs.appendFileSync(logPath, JSON.stringify({ mode, understanding, prompt }) + "\\n");
const invalid = {
  outcome: "repository_action",
  readiness: mode === "assumption"
    ? "assumption_confirmation_required"
    : mode === "brief" || mode === "reply"
      ? "ready"
      : "clarification_required",
  reply: mode === "reply" ? "" : "I need clarification.",
  conversationSummary: "Private ghp_1234567890abcdef123456 must be redacted.",
  refinedBrief: null,
  questions: [],
  assumptions: [],
};
const ready = {
  outcome: "repository_action",
  readiness: "ready",
  reply: "I can explain the repository from read-only inspection.",
  conversationSummary: "The user requested a repository explanation.",
  refinedBrief: {
    goal: "Explain the repository.",
    deliverables: ["A grounded repository explanation."],
    constraints: ["Do not modify files."],
    acceptanceCriteria: [],
    nonGoals: [],
  },
  questions: [],
  assumptions: [],
};
const finalMessage = understanding
  ? JSON.stringify(mode !== "repeated" && prior > 0 ? ready : invalid)
  : JSON.stringify({
      disposition: "answer",
      reply: "This repository contains the Orynt CLI and shared runtimes.",
      conversationSummary: "Explained the repository.",
      action: null,
    });
fs.writeSync(1, JSON.stringify({
  type: "item.completed",
  item: { id: "message-1", type: "agent_message", text: finalMessage },
}) + "\\n");
fs.writeFileSync(process.argv[outputIndex + 1], finalMessage);
`,
      );
      await chmod(fakeCodexPath, 0o755);
      process.env.PATH = `${binPath}${path.delimiter}${previousPath ?? ""}`;

      const corrected = await runCliAgentTurn({
        prompt: "explain this repo plz",
        repositoryPath,
        modelId: "gpt-5.5",
        thinkingEffort: "low",
        acceptanceCriteria: [],
        // Conversational context keeps the model-backed gate, which is the
        // repair path under test. Without it this prompt is a bounded
        // read-only question and the deterministic gate answers it directly.
        recentTurns: [{ role: "user", content: "I am reviewing this project." }],
      });
      expect(corrected).toMatchObject({
        disposition: "answer",
        reply: "This repository contains the Orynt CLI and shared runtimes.",
        promptUnderstanding: {
          readiness: "ready",
        },
      });

      for (const prompt of [
        "assumption mismatch",
        "missing refined brief",
        "empty understanding reply",
      ]) {
        await expect(
          runCliAgentTurn({
            prompt,
            repositoryPath,
            modelId: "gpt-5.5",
            thinkingEffort: "low",
            acceptanceCriteria: [],
            recentTurns: [],
          }),
        ).resolves.toMatchObject({
          promptUnderstanding: {
            readiness: "ready",
          },
        });
      }

      await expect(
        runCliAgentTurn({
          prompt: "repeat invalid understanding",
          repositoryPath,
          modelId: "gpt-5.5",
          thinkingEffort: "low",
          acceptanceCriteria: [],
          recentTurns: [],
        }),
      ).rejects.toThrow(
        "Could not complete prompt understanding after one corrective retry",
      );

      const invocations = (await Bun.file(invocationLog).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as {
          mode: string;
          understanding: boolean;
          prompt: string;
        });
      const correctedUnderstanding = invocations.filter(
        (entry) => entry.mode === "corrected" && entry.understanding,
      );
      const repeated = invocations.filter(
        (entry) => entry.mode === "repeated",
      );
      expect(correctedUnderstanding).toHaveLength(2);
      expect(correctedUnderstanding[1]?.prompt).toContain(
        "Clarification-required prompt understanding needs questions.",
      );
      expect(correctedUnderstanding[1]?.prompt).toContain(
        "<untrusted_previous_candidate>",
      );
      expect(correctedUnderstanding[1]?.prompt).toContain("[REDACTED]");
      expect(correctedUnderstanding[1]?.prompt).not.toContain(
        "ghp_1234567890abcdef123456",
      );
      expect(repeated).toHaveLength(2);
      expect(repeated.every((entry) => entry.understanding)).toBe(true);
      for (const mode of ["assumption", "brief", "reply"]) {
        expect(
          invocations.filter(
            (entry) => entry.mode === mode && entry.understanding,
          ),
        ).toHaveLength(2);
      }
    } finally {
      process.env.PATH = previousPath;
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("returns the planner's non-actionable answer when repository intent was overclassified", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(os.tmpdir(), "orynt-agent-non-actionable-"),
    );
    const repositoryPath = path.join(fixtureRoot, "repo");
    const binPath = path.join(fixtureRoot, "bin");
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
      const promptId = hashPromptUnderstandingBasis({
        rawPrompt: "Can you access this codebase?",
        acceptanceCriteria: [],
        clarificationAnswers: [],
        confirmedAssumptions: [],
      });
      await writeFile(
        fakeCodexPath,
        `#!/usr/bin/env bun
const fs = require("node:fs");
const outputIndex = process.argv.indexOf("--output-last-message");
await Bun.stdin.text();
const schemaIndex = process.argv.indexOf("--output-schema");
const understandingTurn = process.argv[schemaIndex + 1].endsWith("understanding.schema.json");
const promptId = ${JSON.stringify(promptId)};
const finalMessage = understandingTurn
  ? JSON.stringify({
      schemaVersion: 1,
      promptId,
      outcome: "repository_action",
      readiness: "ready",
      reply: "I can inspect the repository.",
      refinedBrief: {
        goal: "Answer the repository capability question.",
        deliverables: ["A direct answer."],
        constraints: [],
        acceptanceCriteria: [],
        nonGoals: ["Do not change files."],
      },
      questions: [],
      assumptions: [],
    })
  : JSON.stringify({
      disposition: "answer",
      reply: "Yes — I can read the repository snapshot.",
      conversationSummary: "Confirmed repository read access.",
      action: null,
    });
fs.writeSync(1, JSON.stringify({
  type: "item.completed",
  item: { id: "message-1", type: "agent_message", text: finalMessage },
}) + "\\n");
fs.writeFileSync(process.argv[outputIndex + 1], finalMessage);
`,
      );
      await chmod(fakeCodexPath, 0o755);
      process.env.PATH = `${binPath}${path.delimiter}${previousPath ?? ""}`;
      const activities: string[] = [];

      const result = await runCliAgentTurn({
        prompt: "Can you access this codebase?",
        repositoryPath,
        modelId: "gpt-5.5",
        thinkingEffort: "low",
        acceptanceCriteria: [],
        // Overclassification is a model-gate behavior, so this turn must reach
        // the model gate rather than the deterministic one.
        recentTurns: [{ role: "user", content: "I am reviewing this project." }],
        onActivity: (event) => {
          if (event.kind === "message") activities.push(event.text);
        },
      });

      expect(result).toMatchObject({
        disposition: "answer",
        reply: "Yes — I can read the repository snapshot.",
        promptUnderstanding: {
          outcome: "repository_action",
          readiness: "ready",
        },
      });
      expect(activities).toEqual([
        "Yes — I can read the repository snapshot.",
      ]);
    } finally {
      process.env.PATH = previousPath;
      await rm(fixtureRoot, { recursive: true, force: true });
    }
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
        `#!/usr/bin/env bun
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
      await waitUntil(() => access(markerPath));
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

describe("read-only turn prompt shaping", () => {
  const turnRequest = (
    promptUnderstanding?: {
      readiness: "ready" | "clarification_required";
      outcome: "answer" | "repository_action";
    },
  ) =>
    ({
      prompt: "What does this repository do?",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "low",
      acceptanceCriteria: [],
      recentTurns: [],
      ...(promptUnderstanding
        ? { promptUnderstanding: promptUnderstanding as never }
        : {}),
    }) as Parameters<typeof turnNeedsActionGrammar>[0];

  it("drops the action grammar once understanding resolved to a ready answer", () => {
    expect(
      turnNeedsActionGrammar(
        turnRequest({ readiness: "ready", outcome: "answer" }),
        false,
      ),
    ).toBe(false);
  });

  it("keeps the action grammar for repository work and unresolved prompts", () => {
    expect(
      turnNeedsActionGrammar(
        turnRequest({ readiness: "ready", outcome: "repository_action" }),
        false,
      ),
    ).toBe(true);
    expect(
      turnNeedsActionGrammar(
        turnRequest({
          readiness: "clarification_required",
          outcome: "answer",
        }),
        false,
      ),
    ).toBe(true);
    // No understanding means nothing has ruled an action out yet.
    expect(turnNeedsActionGrammar(turnRequest(), false)).toBe(true);
  });

  it("restores the action grammar on any retry", () => {
    // A trimmed turn that still produced an action is repaired with the full
    // instructions, so trimming can never be why an action fails to form.
    expect(
      turnNeedsActionGrammar(
        turnRequest({ readiness: "ready", outcome: "answer" }),
        true,
      ),
    ).toBe(true);
  });
});

describe("Codex prompt prefix stability", () => {
  const baseRequest = {
    prompt: "What does this repository do?",
    repositoryPath: "/work/orynt",
    modelId: "gpt-5.5",
    thinkingEffort: "low" as const,
    acceptanceCriteria: [],
    recentTurns: [],
  };

  it("keeps every unconditional instruction ahead of the turn-varying ones", () => {
    const withGrammar = buildCliAgentPromptForTest(
      baseRequest as never,
      "snapshot",
      true,
    );
    const withoutGrammar = buildCliAgentPromptForTest(
      baseRequest as never,
      "snapshot",
      false,
    );

    // Codex rebuilds the prompt each turn, so the provider can only reuse the
    // longest common prefix. A conditional line placed earlier would truncate
    // that prefix and push the stable text after it back to full price.
    const sharedPrefixLength = (() => {
      let index = 0;
      while (
        index < withGrammar.length &&
        index < withoutGrammar.length &&
        withGrammar[index] === withoutGrammar[index]
      ) index += 1;
      return index;
    })();
    const unconditionalTail =
      "Produce a compact conversation summary that preserves decisions and unresolved context without secrets.";

    expect(withGrammar.indexOf(unconditionalTail)).toBeGreaterThan(-1);
    expect(withGrammar.indexOf(unconditionalTail) + unconditionalTail.length)
      .toBeLessThanOrEqual(sharedPrefixLength);
  });

  it("still omits the action grammar it was asked to drop", () => {
    const withoutGrammar = buildCliAgentPromptForTest(
      baseRequest as never,
      "snapshot",
      false,
    );
    expect(withoutGrammar).not.toContain("adaptive 1-8 task dependency graph");
    expect(
      buildCliAgentPromptForTest(baseRequest as never, "snapshot", true),
    ).toContain("adaptive 1-8 task dependency graph");
  });
});

describe("native provider dispatch", () => {
  function withEnv(values: Record<string, string | undefined>, run: () => void) {
    const previous = Object.fromEntries(
      Object.keys(values).map((key) => [key, process.env[key]]),
    );
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      run();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("routes an OpenCode turn to the OpenCode runtime", () => {
    withEnv({ OPENCODE_API_KEY: "test-key" }, () => {
      expect(
        resolveCliNativeProviderForTest({ providerId: "opencode-api" }),
      ).toBe("opencode-api");
    });
  });

  it("does not silently fall back to Codex when the OpenCode key is absent", () => {
    // Returning a provider here would dispatch OpenCode work over the Codex
    // transport, which succeeds against the wrong service instead of failing.
    withEnv({ OPENCODE_API_KEY: undefined, ORYNT_AGENT_RUNTIME: undefined }, () => {
      expect(
        resolveCliNativeProviderForTest({ providerId: "opencode-api" }),
      ).toBeUndefined();
    });
  });

  it("keeps each provider on its own credential", () => {
    withEnv(
      {
        OPENCODE_API_KEY: undefined,
        ANTHROPIC_API_KEY: "anthropic-key",
        OPENAI_API_KEY: "openai-key",
      },
      () => {
        // An Anthropic key must not make an OpenCode turn look routable.
        expect(
          resolveCliNativeProviderForTest({ providerId: "opencode-api" }),
        ).toBeUndefined();
        expect(
          resolveCliNativeProviderForTest({ providerId: "anthropic-api" }),
        ).toBe("anthropic-api");
        expect(
          resolveCliNativeProviderForTest({ providerId: "openai-api" }),
        ).toBe("openai-api");
      },
    );
  });
});
