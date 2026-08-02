import { describe, expect, it } from "vitest";

import {
  RunPresenter,
  SLASH_COMMANDS,
  filterSlashCommands,
  parseInteractiveInput,
  renderCommandHelp,
  renderRunCompletion,
  renderTreeRows,
  renderWelcome,
  terminalSafeMultilineText,
  terminalSafeText,
  type InteractiveCommand,
} from "./ui";

function expectCommand(input: string, expected: InteractiveCommand) {
  expect(parseInteractiveInput(input)).toEqual(expected);
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/gu, "");
}

describe("Orynt terminal UI", () => {
  it("renders stable tree connectors for structured sibling rows", () => {
    expect(renderTreeRows(["coordinator sol", "implementer terra", "budgets advisory"]))
      .toEqual([
        "  ├─ coordinator sol",
        "  ├─ implementer terra",
        "  └─ budgets advisory",
      ]);
  });

  it("treats natural-language input as a conversational prompt and parses operator commands", () => {
    expectCommand("fix the failing tests", { kind: "prompt", value: "fix the failing tests" });
    expectCommand("  ", { kind: "empty" });
    expectCommand("/repo ./packages/shared", { kind: "repo", value: "./packages/shared" });
    expectCommand("/model", { kind: "model", value: "" });
    expectCommand("/model gpt-5.5", { kind: "model", value: "gpt-5.5" });
    expectCommand("/effort high", { kind: "effort", value: "high" });
    expectCommand("/goal audit repository safety", { kind: "goal", value: "audit repository safety" });
    expectCommand("/goal", { kind: "goal", value: "" });
    expectCommand("/goal --clear", { kind: "goal", value: "--clear" });
    expectCommand("/criteria tests pass; no secrets persisted", {
      kind: "criteria",
      value: "tests pass; no secrets persisted",
    });
    expectCommand("/plan", { kind: "plan" });
    expectCommand("/state", { kind: "state" });
    expectCommand("/evidence", { kind: "evidence" });
    expectCommand("/verify", { kind: "verify" });
    expectCommand("/cost", { kind: "cost" });
    expectCommand("/doctor", { kind: "doctor" });
    expectCommand("/resume latest", { kind: "resume", value: "latest" });
    expectCommand("/status", { kind: "status" });
    expectCommand("/help", { kind: "help" });
    expectCommand("/clear", { kind: "clear" });
    expectCommand("/exit", { kind: "exit" });
    expectCommand("/quit", { kind: "exit" });
    expectCommand("/unknown", { kind: "unknown", value: "/unknown" });
  });

  it("keeps slash parsing, help, aliases, and palette filtering in one registry", () => {
    const help = renderCommandHelp();
    for (const definition of SLASH_COMMANDS) {
      if (definition.hidden) {
        expect(help).not.toContain(definition.usage);
      } else {
        expect(help).toContain(definition.usage);
        expect(help).toContain(definition.description);
      }
    }
    expect(help).toContain("Customize");
    expect(help).toContain("Workspace");
    expect(help).toContain("Inspect");
    expect(help).toContain("Session");
    expect(filterSlashCommands("/do").map(({ command }) => command)).toEqual(["/doctor"]);
    expect(filterSlashCommands("/mode")).toEqual([]);
    expect(filterSlashCommands("/q").map(({ command }) => command)).toEqual(["/exit"]);
    expect(filterSlashCommands("/repo ")).toEqual([]);
    expect(filterSlashCommands("goal /repo")).toEqual([]);
  });

  it("renders a calm, safety-explicit startup surface without requiring color", () => {
    const welcome = renderWelcome(
      {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
      },
      { color: false, width: 100 },
    );

    expect(welcome).toContain("ORYNT");
    expect(welcome).toContain("perceive → remember → plan → act → verify → improve");
    expect(welcome).toContain("/work/orynt");
    expect(welcome).toContain("gpt-5.5 · high");
    expect(welcome).toContain("Read-only chat · policy-gated repository actions");
    expect(welcome).not.toContain("\u001b[");
  });

  it("adds only minimal semantic styling without changing welcome text", () => {
    const state = {
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high" as const,
      providerReady: true,
    };
    const plain = renderWelcome(state, { color: false, width: 100 });
    const colored = renderWelcome(state, { color: true, width: 100 });

    expect(stripAnsi(colored)).toBe(plain);
    expect(colored).toContain("\u001b[1mORYNT\u001b[0m");
    expect(colored).toContain(
      "\u001b[38;2;212;169;79mSafety\u001b[0m",
    );
    expect(colored).not.toContain(
      "\u001b[38;2;143;182;232m/work/orynt",
    );
  });

  it("escapes terminal controls and bidi overrides in dynamic UI values", () => {
    expect(terminalSafeText("safe\u001b[2J\r\n\u061c\u200e\u200f\u202eunsafe")).toBe(
      "safe\\u001b[2J\\r\\n\\u061c\\u200e\\u200f\\u202eunsafe",
    );
    const welcome = renderWelcome(
      {
        repositoryPath: "/work\u001b[2J/orynt",
        modelId: "gpt\nspoof",
        thinkingEffort: "high",
        providerReady: true,
      },
      { color: false },
    );
    expect(welcome).not.toContain("\u001b");
    expect(welcome).toContain("\\u001b");
    expect(welcome).toContain("\\n");

    const colored = renderWelcome(
      {
        repositoryPath: "/work\u001b]52;c;owned\u0007/orynt",
        modelId: "gpt\u001b[0mspoof",
        thinkingEffort: "high",
        providerReady: true,
      },
      { color: true },
    );
    const stripped = stripAnsi(colored);
    expect(stripped).not.toContain("\u001b");
    expect(stripped).not.toContain("\u0007");
    expect(stripped).toContain("\\u001b]52;c;owned\\u0007");
    expect(stripped).toContain("gpt\\u001b[0mspoof");
  });

  it("turns an oscillating runtime trace into monotonic milestones and one final report", () => {
    const presenter = new RunPresenter({ color: false });
    const events = [
      { type: "run_started", payload: { summary: "started" } },
      { type: "sandbox_create_allowed", payload: { summary: "allowed" } },
      { type: "verification_planned", payload: { summary: "planned early" } },
      { type: "codex_execution_approval_required", payload: { summary: "audit approval" } },
      { type: "codex_execution_started", payload: { summary: "running" } },
      {
        type: "codex_reasoning_summary",
        payload: {
          itemId: "reason-1",
          status: "completed",
          text: "Inspecting the repository",
        },
      },
      {
        type: "codex_tool_activity",
        payload: {
          itemId: "tool-1",
          status: "completed",
          toolKind: "command",
          detail: "pnpm test",
        },
      },
      {
        type: "codex_agent_message",
        payload: { message: "Interim update", streamEventType: "item.updated" },
      },
      {
        type: "codex_execution_finished",
        payload: {
          summary: "finished",
          lastMessagePreview: "Updated the CLI.\n\nValidation passed.",
        },
      },
      { type: "codex_result_import_requested", payload: { summary: "import" } },
      {
        type: "codex_sandbox_diff_inspected",
        payload: {
          changedFiles: [
            "packages/cli/src/ui.ts",
            ".codex/orynt-beta-verify.mjs",
            ".codex\\orynt-beta-verify.mjs",
          ],
        },
      },
      { type: "verification_started", payload: { summary: "verify" } },
      { type: "approval_required", payload: { summary: "internal audit" } },
      { type: "verification_passed", payload: { summary: "All checks passed" } },
      { type: "memory_extraction_started", payload: { summary: "memory" } },
    ] as const;

    const progress = events.flatMap((event) => presenter.present(event));

    expect(progress).toEqual([
      "  ◇ Prepare   Creating isolated worktree and contract",
      "  ◇ Run       Codex working inside repository sandbox",
      "  ◇ Think     Inspecting the repository",
      "  ◇ Tool      pnpm test",
      "  ◇ Verify    Running policy and verifier checks",
    ]);
    expect(progress.join("\n")).not.toContain("Approval");
    expect(progress.join("\n")).not.toContain("Interim update");

    const completion = renderRunCompletion(
      {
        runId: "run-1",
        status: "pass",
        summary: "All checks passed",
        verification: "passed",
        evidenceCount: 4,
        artifactManifestPath: "/artifacts/manifest.json",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(completion).toContain("✓ Done");
    expect(completion).toContain("Agent report");
    expect(completion).toContain("  Updated the CLI.\n  \n  Validation passed.");
    expect(completion).toContain("Changes · 2 files");
    expect(completion).toContain("packages/cli/src/ui.ts");
    expect(completion).not.toContain(".codex/orynt-beta-verify.mjs");
    expect(completion).toContain(".codex\\\\orynt-beta-verify.mjs");
    expect(completion).toContain("Passed · All checks passed");
    expect(completion).toContain("4 artifacts · /artifacts/manifest.json");
  });

  it("preserves multiline report layout and printable punctuation while escaping controls", () => {
    expect(terminalSafeMultilineText('quote "x" and path C:\\tmp\r\nnext')).toBe(
      'quote "x" and path C:\\tmp\nnext',
    );
    const presenter = new RunPresenter({ color: false });
    presenter.present({
      type: "codex_execution_finished",
      payload: {
        lastMessagePreview:
          "agent\u001b]52;c;owned\u0007\r\n\u061c\u200e\u200f\u202espoof",
      },
    });
    presenter.present({
      type: "verification_failed",
      payload: { summary: "failed\u001b[H\nverify" },
    });

    const rendered = renderRunCompletion(
      {
        status: "fail",
        verification: "failed",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(rendered).not.toContain("\u001b");
    expect(rendered).not.toContain("\r");
    expect(rendered).not.toContain("\u061c");
    expect(rendered).not.toContain("\u200e");
    expect(rendered).not.toContain("\u200f");
    expect(rendered).not.toContain("\u202e");
    expect(rendered).toContain("agent\\u001b]52;c;owned\\u0007");
    expect(rendered).toContain("\\u061c\\u200e\\u200f\\u202espoof");
    expect(rendered).toContain("Agent report · unverified");
    expect(rendered).toContain("Use /verify and /evidence");
  });

  it("does not repeat an agent report that was already streamed", () => {
    const presenter = new RunPresenter({ color: false });
    presenter.present({
      type: "codex_execution_finished",
      payload: { lastMessagePreview: "Already streamed." },
    });
    presenter.markAgentResponseStreamed();

    const completion = renderRunCompletion(
      {
        runId: "run-streamed",
        status: "pass",
        verification: "passed",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(completion).not.toContain("Agent report");
    expect(completion).not.toContain("Already streamed.");
  });

  it("never renders a success state when review or a failure event is present", () => {
    const reviewPresenter = new RunPresenter({ color: false });
    reviewPresenter.present({
      type: "manual_review_required",
      payload: { summary: "Changed paths require operator review" },
    });
    const reviewCompletion = renderRunCompletion(
      {
        status: "pass",
        verification: "passed",
        interactive: true,
      },
      reviewPresenter.snapshot(),
      { color: false },
    );

    expect(reviewCompletion).toContain("! Done");
    expect(reviewCompletion).not.toContain("✓ Done");
    expect(reviewCompletion).toContain("Changed paths require operator review");

    const failedPresenter = new RunPresenter({ color: false });
    failedPresenter.present({
      type: "policy_violation",
      payload: { summary: "Managed verifier integrity check failed" },
    });
    const failedCompletion = renderRunCompletion(
      {
        status: "pass",
        verification: "passed",
        interactive: false,
      },
      failedPresenter.snapshot(),
      { color: false },
    );

    expect(failedCompletion).toContain("✕ Done");
    expect(failedCompletion).not.toContain("✓ Done");
    expect(failedCompletion).toContain("Managed verifier integrity check failed");
  });

  it("clears a verifier-only failure after a bounded recovery passes", () => {
    const presenter = new RunPresenter({ color: false });
    presenter.present({
      type: "verification_failed",
      payload: { summary: "Initial verifier failed" },
    });
    presenter.present({
      type: "verification_passed",
      payload: { summary: "Recovery verifier passed" },
    });

    const rendered = renderRunCompletion(
      {
        runId: "run-recovered",
        status: "pass",
        verification: "passed",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(rendered).toContain("✓ Done");
    expect(rendered).toContain("Recovery verifier passed");
    expect(rendered).not.toContain("Initial verifier failed");
  });

  it("renders verification failure before an earlier manual-review warning", () => {
    const presenter = new RunPresenter({ color: false });
    presenter.present({
      type: "manual_review_required",
      payload: { summary: "Changed paths require operator review" },
    });
    presenter.present({
      type: "verification_failed",
      payload: { summary: "Verification command failed" },
    });

    const completion = renderRunCompletion(
      {
        status: "fail",
        verification: "failed",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(completion).toContain("✕ Done");
    expect(completion).toContain("Verification command failed");
    expect(completion).not.toContain("! Done");
  });

  it("colors only the completion icon while preserving exact plain output", () => {
    const cases = [
      {
        completion: {
          status: "pass",
          verification: "passed",
          interactive: true,
        },
        presentation: {},
        sequence: "\u001b[38;2;120;201;155m✓\u001b[0m Done",
      },
      {
        completion: {
          status: "manual_review_required",
          verification: "passed",
          interactive: true,
        },
        presentation: { manualReviewSummary: "Review required" },
        sequence: "\u001b[38;2;212;169;79m!\u001b[0m Done",
      },
      {
        completion: {
          status: "fail",
          verification: "failed",
          interactive: true,
        },
        presentation: { failureSummary: "Verification failed" },
        sequence: "\u001b[38;2;223;114;114m✕\u001b[0m Done",
      },
    ] as const;

    for (const testCase of cases) {
      const plain = renderRunCompletion(
        testCase.completion,
        testCase.presentation,
        { color: false },
      );
      const colored = renderRunCompletion(
        testCase.completion,
        testCase.presentation,
        { color: true },
      );

      expect(stripAnsi(colored)).toBe(plain);
      expect(colored).toContain(testCase.sequence);
    }
  });
});
