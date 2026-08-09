import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "bun:test";

import {
  builtCli,
  cliEnvironment,
  createControlledCodex,
  createFixtureRepository,
} from "./cli-e2e-lib.mjs";
import {
  createNodeCliWrapper,
  runOrderedPty,
} from "./cli-pty-harness.mjs";
import {
  FileCliPreferencesStore,
  FileCliSessionStore,
  createSessionSnapshot,
} from "../packages/cli/dist/state.js";

const fixtureRoots = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function wrapper(root, repositoryPath, resume = false) {
  return createNodeCliWrapper({
    root,
    name: resume ? "resume-cli.cjs" : "launch-cli.cjs",
    entry: builtCli,
    args: [
      "--screen",
      "inline",
      ...(resume
        ? ["--resume", typeof resume === "string" ? resume : "latest"]
        : []),
      "-C",
      repositoryPath,
    ],
  });
}

test("fullscreen enables regional wheel reporting and restores native terminal state", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
  timeout: 40_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-selection-"));
  fixtureRoots.push(root);
  const stateHome = path.join(root, "state");
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  const env = cliEnvironment({
    stateHome,
    binRoot,
    mode: "answer",
    invocationLog: path.join(root, "codex-invocations.jsonl"),
    extra: {
      TERM: "xterm-256color",
      COLUMNS: "100",
      LINES: "30",
    },
  });
  const wrapperPath = await createNodeCliWrapper({
    root,
    name: "fullscreen-cli.cjs",
    entry: builtCli,
    args: ["--screen", "fullscreen", "-C", repositoryPath],
  });
  const run = await runOrderedPty({
    wrapperPath,
    transcriptPath: path.join(root, "fullscreen-selection.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      { id: "update-consent", waitFor: /Check for updates at startup/u, send: "n\n" },
      { id: "retention-consent", waitFor: /Clean up old sessions automatically/u, send: "n\n" },
      { id: "safety-prompt", waitFor: /Continue in this repository/u, send: "y\n" },
      {
        id: "composer",
        waitFor: /Try "explain this repo"/u,
        send: "/exit\n",
      },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });

  assert.equal(run.code, 0, run.visible);
  assert.match(run.raw, /\u001b\[\?1049h/u);
  assert.match(run.raw, /\u001b\[\?1049l/u);
  assert.match(run.raw, /\u001b\[\?1002h/u);
  assert.match(run.raw, /\u001b\[\?1006h/u);
  assert.match(run.raw, /\u001b\[\?1002l/u);
  assert.match(run.raw, /\u001b\[\?1006l/u);
});

test("Orca auto mode keeps native scrollback unless fullscreen is explicit", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
  timeout: 40_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-orca-auto-"));
  fixtureRoots.push(root);
  const stateHome = path.join(root, "state");
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  const env = cliEnvironment({
    stateHome,
    binRoot,
    mode: "answer",
    invocationLog: path.join(root, "codex-invocations.jsonl"),
    extra: {
      TERM: "xterm-256color",
      TERM_PROGRAM: "Orca",
      COLUMNS: "100",
      LINES: "30",
    },
  });
  const wrapperPath = await createNodeCliWrapper({
    root,
    name: "orca-auto-cli.cjs",
    entry: builtCli,
    args: ["-C", repositoryPath],
  });
  const run = await runOrderedPty({
    wrapperPath,
    transcriptPath: path.join(root, "orca-auto.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      { id: "update-consent", waitFor: /Check for updates at startup/u, send: "n\n" },
      { id: "retention-consent", waitFor: /Clean up old sessions automatically/u, send: "n\n" },
      { id: "safety-prompt", waitFor: /Continue in this repository/u, send: "y\n" },
      {
        id: "composer",
        waitFor: /Try "explain this repo"/u,
        send: "/exit\n",
      },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });

  assert.equal(run.code, 0, run.visible);
  assert.doesNotMatch(run.raw, /\u001b\[\?1049[hl]/u);
  assert.doesNotMatch(run.raw, /\u001b\[\?1002[hl]/u);
  assert.doesNotMatch(run.raw, /\u001b\[\?1006[hl]/u);
});

test("narrow inline terminal reflows long command surfaces", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
  timeout: 40_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-responsive-"));
  fixtureRoots.push(root);
  const stateHome = path.join(root, "state");
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  const env = cliEnvironment({
    stateHome,
    binRoot,
    mode: "answer",
    invocationLog: path.join(root, "codex-invocations.jsonl"),
    extra: {
      TERM: "xterm-256color",
      COLUMNS: "40",
      LINES: "30",
    },
  });
  const run = await runOrderedPty({
    wrapperPath: await wrapper(root, repositoryPath),
    transcriptPath: path.join(root, "responsive.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      { id: "update-consent", waitFor: /Check for updates at startup/u, send: "n\n" },
      { id: "retention-consent", waitFor: /Clean up old sessions automatically/u, send: "n\n" },
      { id: "safety-prompt", waitFor: /Continue in this repository/u, send: "y\n" },
      { id: "composer", waitFor: /Try "explain this repo"/u, send: "/help\n" },
      {
        id: "help",
        waitFor: /More help/u,
        send: "/help shortcuts\n",
      },
      {
        id: "shortcut-help",
        waitFor: /Control active work/u,
        send: "/help getting-started\n",
      },
      {
        id: "getting-started-help",
        waitFor: /Start a conversation/u,
        send: "/settings show\n",
      },
      { id: "settings", waitFor: /Activity/u, send: "/status\n" },
      { id: "status", waitFor: /Boundary/u, send: "/exit\n" },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });

  assert.equal(run.code, 0, run.visible);
  assert.match(run.visible, /Commands/u);
  assert.match(run.visible, /Shortcuts/u);
  assert.match(run.visible, /Getting started/u);
  assert.match(run.visible, /Settings/u);
  assert.match(run.visible, /Session/u);
});

test("real Linux TTY covers onboarding, commands, a model turn, exit, and resume", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
  timeout: 150_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-pty-e2e-"));
  fixtureRoots.push(root);
  const stateHome = path.join(root, "state");
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  const env = cliEnvironment({
    stateHome,
    binRoot,
    mode: "action",
    invocationLog: path.join(root, "codex-invocations.jsonl"),
    extra: {
      TERM: "xterm-256color",
      COLUMNS: "100",
      LINES: "30",
    },
  });

  const first = await runOrderedPty({
    wrapperPath: await wrapper(root, repositoryPath),
    transcriptPath: path.join(root, "first.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 120_000,
    steps: [
      { id: "update-consent", waitFor: /Check for updates at startup/u, send: "n\n" },
      { id: "retention-consent", waitFor: /Clean up old sessions automatically/u, send: "n\n" },
      { id: "safety-prompt", waitFor: /Continue in this repository/u, send: "y\n" },
      { id: "safety-acknowledged", waitFor: /Safety boundary acknowledged/u, send: "/help\n" },
      {
        id: "help",
        waitFor: /More help/u,
        send: "/status\n",
      },
      {
        id: "status",
        waitFor: /Turns\s+0/u,
        send: "say hello\n",
      },
      { id: "answer", waitFor: /Controlled CLI answer/u },
      {
        id: "answer-completed",
        waitFor: /custom · next[^\n]*gpt-5\.5\/high/u,
        send: "edit only packages/value.txt so it contains exactly deterministic cli e2e pass, then run bun run scripts/pass.mjs\n",
      },
      {
        id: "action-approval",
        waitFor: /Run this sensitive action\? \[y\/N\]/u,
        send: "y\n",
      },
      {
        id: "change-summary",
        waitFor: /Changes · 1 file · \+1\/-1/u,
      },
      {
        id: "action-completed",
        waitFor: /custom · next[^\n]*gpt-5\.5\/high/u,
        send: "/diff packages/value.txt\n",
      },
      { id: "diff-heading", waitFor: /Diff · Verified · 1 file · \+1\/-1/u },
      { id: "diff-content", waitFor: /\+deterministic cli e2e pass/u },
      {
        id: "composer-after-diff",
        waitFor: /❯/u,
        send: "/exit\n",
      },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });
  assert.equal(first.code, 0, first.visible);
  assert.match(first.visible, /Safety boundary acknowledged/);
  assert.match(first.visible, /More help/u);
  assert.match(first.visible, /0k\/[0-9]+k/u);
  assert.match(first.visible, /Controlled CLI answer/);
  assert.match(first.visible, /Diff · Verified · 1 file · \+1\/-1/);
  assert.match(first.visible, /\+deterministic cli e2e pass/);
  assert.match(first.visible, /Session ended/);

  const resumed = await runOrderedPty({
    wrapperPath: await wrapper(root, repositoryPath, true),
    transcriptPath: path.join(root, "resume.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      { id: "welcome", waitFor: /An agent that just works\./u, send: "/status\n" },
      { id: "status", waitFor: /Turns\s+[0-9]+/u },
      { id: "composer-returned", waitFor: /❯/u, send: "/exit\n" },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });
  assert.equal(resumed.code, 0, resumed.visible);
  assert.match(resumed.visible, /Session ended/);
  assert.doesNotMatch(resumed.visible, /Continue in this repository/);
});

test("real Linux TTY resumes the newest active session instead of Trash", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
  timeout: 50_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-latest-active-"));
  fixtureRoots.push(root);
  const stateHome = path.join(root, "state");
  const stateRoot = path.join(stateHome, "orynt");
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  const preferences = new FileCliPreferencesStore(stateRoot);
  await preferences.saveUpdateCheckConsent("disabled");
  await preferences.saveSessionRetention(
    "audit_only",
    "2026-08-04T00:00:00.000Z",
  );
  await preferences.acknowledgeStartupBoundary(
    "2026-08-04T00:00:00.000Z",
  );
  const sessions = new FileCliSessionStore(stateRoot);
  const active = createSessionSnapshot({
    sessionId: "session-active",
    repositoryPath,
    modelId: "gpt-5.5",
    thinkingEffort: "high",
    now: "2026-08-03T00:00:00.000Z",
  });
  active.turnCount = 2;
  active.title = "Active fallback";
  const trashed = createSessionSnapshot({
    sessionId: "session-trashed",
    repositoryPath,
    modelId: "gpt-5.5",
    thinkingEffort: "high",
    now: "2026-08-04T00:00:00.000Z",
  });
  trashed.turnCount = 9;
  trashed.title = "Newest but trashed";
  await sessions.save(active);
  await sessions.save(trashed);
  await sessions.trash(trashed.sessionId);

  const env = cliEnvironment({
    stateHome,
    binRoot,
    mode: "answer",
    invocationLog: path.join(root, "codex-invocations.jsonl"),
    extra: {
      TERM: "xterm-256color",
      COLUMNS: "100",
      LINES: "30",
    },
  });
  const fallback = await runOrderedPty({
    wrapperPath: await wrapper(root, repositoryPath, true),
    transcriptPath: path.join(root, "latest-active.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      { id: "welcome", waitFor: /An agent that just works\./u, send: "/status\n" },
      { id: "active-turn-count", waitFor: /Turns\s+2/u },
      { id: "composer-returned", waitFor: /❯/u, send: "/exit\n" },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });
  assert.equal(fallback.code, 0, fallback.visible);
  assert.doesNotMatch(fallback.visible, /Session is in Trash/u);
  assert.doesNotMatch(fallback.visible, /Continue in this repository/u);

  const explicitTrash = await runOrderedPty({
    wrapperPath: await wrapper(
      root,
      repositoryPath,
      "session-trashed",
    ),
    transcriptPath: path.join(root, "explicit-trash.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 10_000,
    steps: [{
      id: "trash-rejected",
      waitFor: /Session is in Trash: session-trashed/u,
    }],
  });
  assert.equal(explicitTrash.code, 2, explicitTrash.visible);
  assert.match(
    explicitTrash.visible.replace(/[\r\n]/gu, ""),
    /orynt sessions restore session-trashed/u,
  );
});

test("real Linux TTY shows live loading, updates current, and queues FIFO Next", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
  timeout: 55_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-live-input-e2e-"));
  fixtureRoots.push(root);
  const stateHome = path.join(root, "state");
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  const env = cliEnvironment({
    stateHome,
    binRoot,
    mode: "answer",
    invocationLog: path.join(root, "codex-invocations.jsonl"),
    extra: {
      TERM: "xterm-256color",
      COLUMNS: "100",
      LINES: "30",
      ORYNT_E2E_CODEX_DELAY_MS: "750",
    },
  });

  const result = await runOrderedPty({
    wrapperPath: await wrapper(root, repositoryPath),
    transcriptPath: path.join(root, "live-input.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 45_000,
    steps: [
      { id: "update-consent", waitFor: /Check for updates at startup/u, send: "n\n" },
      { id: "retention-consent", waitFor: /Clean up old sessions automatically/u, send: "n\n" },
      { id: "safety-prompt", waitFor: /Continue in this repository/u, send: "y\n" },
      {
        id: "first-prompt",
        waitFor: /Safety boundary acknowledged/u,
        send: "say hello\n",
      },
      {
        id: "live-loading",
        waitFor: /Coordinate gpt-5\.5 · high/u,
        send: "also greet\n",
      },
      {
        id: "current-updated",
        waitFor: /Current request updated · restarting with 2 messages/u,
        send: "keep it concise\n",
      },
      {
        id: "current-updated-again",
        waitFor: /Current request updated · restarting with 3 messages/u,
        send: "/next follow up separately\n",
      },
      {
        id: "pending-confirmed",
        waitFor: /Next · 1 pending/u,
      },
      {
        id: "second-answer",
        waitFor: /custom · next[^\n]*gpt-5\.5\/high/u,
        send: "/exit\n",
      },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });

  assert.equal(result.code, 0, result.visible);
  assert.match(result.visible, /Coordinate gpt-5\.5 · high/u);
  assert.match(
    result.visible,
    /Current request updated · restarting with 2 messages/u,
  );
  assert.match(
    result.visible,
    /Current request updated · restarting with 3 messages/u,
  );
  assert.doesNotMatch(result.visible, /Agent turn failed:/u);
  assert.match(result.visible, /Next · 1 pending/u);
  assert.match(result.visible, /Controlled CLI answer[\s\S]*Controlled CLI answer/u);
  assert.match(result.visible, /Session ended/u);
});

test("real Linux TTY persists Appearance themes and honors a one-launch override", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
  timeout: 100_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-theme-e2e-"));
  fixtureRoots.push(root);
  const stateHome = path.join(root, "state");
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  const env = cliEnvironment({
    stateHome,
    binRoot,
    mode: "answer",
    invocationLog: path.join(root, "codex-invocations.jsonl"),
    extra: {
      TERM: "xterm-256color",
      COLUMNS: "100",
      LINES: "30",
    },
  });
  delete env.NO_COLOR;
  const launch = async (name, args = []) =>
    createNodeCliWrapper({
      root,
      name,
      entry: builtCli,
      args: ["--screen", "inline", ...args, "-C", repositoryPath],
    });

  const selected = await runOrderedPty({
    wrapperPath: await launch("theme-select.cjs"),
    transcriptPath: path.join(root, "theme-select.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      { id: "update-consent", waitFor: /Check for updates at startup/u, send: "n\n" },
      { id: "retention-consent", waitFor: /Clean up old sessions automatically/u, send: "n\n" },
      { id: "safety-prompt", waitFor: /Continue in this repository/u, send: "y\n" },
      {
        id: "safety-acknowledged",
        waitFor: /Safety boundary acknowledged/u,
        send: "/settings appearance theme monochrome\n",
      },
      {
        id: "theme-selected",
        waitFor: /Saved · Theme Monochrome/u,
        send: "/settings show\n",
      },
      {
        id: "theme-visible",
        waitFor: /Appearance\s+Screen auto · effective inline \(--screen\) · Theme Monochrome/u,
        send: "/exit\n",
      },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });
  assert.equal(selected.code, 0, selected.visible);
  assert.match(selected.raw, /\u001b\[1m❯\u001b\[0m/u);

  const persisted = await runOrderedPty({
    wrapperPath: await launch("theme-persisted.cjs"),
    transcriptPath: path.join(root, "theme-persisted.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      {
        id: "welcome",
        waitFor: /An agent that just works\./u,
        send: "/settings show\n",
      },
      {
        id: "persisted-theme",
        waitFor: /Appearance\s+Screen auto · effective inline \(--screen\) · Theme Monochrome/u,
        send: "/exit\n",
      },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });
  assert.equal(persisted.code, 0, persisted.visible);

  const overridden = await runOrderedPty({
    wrapperPath: await launch(
      "theme-override.cjs",
      ["--theme", "quiet-studio"],
    ),
    transcriptPath: path.join(root, "theme-override.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      {
        id: "welcome",
        waitFor: /An agent that just works\./u,
        send: "/settings show\n",
      },
      {
        id: "effective-theme",
        waitFor: /effective Quiet Studio \(--theme\)/u,
        send: "/exit\n",
      },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });
  assert.equal(overridden.code, 0, overridden.visible);
  assert.match(
    overridden.raw,
    /\u001b\[38;2;143;182;232m❯\u001b\[0m/u,
  );
});

test("real Linux TTY completes tier arguments and opens the no-argument picker", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
  timeout: 40_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-tier-assist-"));
  fixtureRoots.push(root);
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  const env = cliEnvironment({
    stateHome: path.join(root, "state"),
    binRoot,
    mode: "answer",
    invocationLog: path.join(root, "codex-invocations.jsonl"),
    extra: {
      TERM: "xterm-256color",
      COLUMNS: "100",
      LINES: "30",
    },
  });

  const result = await runOrderedPty({
    wrapperPath: await wrapper(root, repositoryPath),
    transcriptPath: path.join(root, "tier-assist.typescript"),
    cwd: repositoryPath,
    env,
    timeoutMs: 30_000,
    steps: [
      { id: "update-consent", waitFor: /Check for updates at startup/u, send: "n\n" },
      { id: "retention-consent", waitFor: /Clean up old sessions automatically/u, send: "n\n" },
      { id: "safety-prompt", waitFor: /Continue in this repository/u, send: "y\n" },
      {
        id: "composer",
        waitFor: /Safety boundary acknowledged/u,
        send: "/tier h",
      },
      {
        id: "argument-suggestion",
        waitFor: /heavy\s+Use at least the strongest review tier/u,
        send: "\t\n",
      },
      {
        id: "argument-applied",
        waitFor: /Next request minimum model tier set to heavy/u,
        send: "/tier\n",
      },
      {
        id: "picker-opened",
        waitFor: /Next request tier ›/u,
        send: "medium\n",
      },
      {
        id: "picker-applied",
        waitFor: /Next request minimum model tier set to medium/u,
        send: "/exit\n",
      },
      { id: "session-ended", waitFor: /Session ended/u },
    ],
  });

  assert.equal(result.code, 0, result.visible);
  assert.match(result.visible, /Next request minimum model tier set to heavy/u);
  assert.match(result.visible, /Next request minimum model tier set to medium/u);
});
