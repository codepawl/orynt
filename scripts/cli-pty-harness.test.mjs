import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "bun:test";

import { runOrderedPty } from "./cli-pty-harness.mjs";

const fixtureRoots = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("ordered PTY steps ignore historical prompt matches", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-pty-harness-"));
  fixtureRoots.push(root);
  const fixture = path.join(root, "fixture.cjs");
  await writeFile(
    fixture,
    `#!/usr/bin/env bun
const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin });
let state = "await-go";
process.stdout.write("You › historical\\nREADY\\n");
input.on("line", (line) => {
  if (state === "await-go" && line === "go") {
    state = "await-exit";
    process.stdout.write("ANSWER\\n");
    setTimeout(() => process.stdout.write("You › "), 25);
    return;
  }
  if (state === "await-exit" && line === "/exit") {
    process.stdout.write("Session ended\\n");
    input.close();
    return;
  }
  process.stderr.write("unexpected input:" + line + "\\n");
  process.exitCode = 2;
  input.close();
});
`,
    { mode: 0o755 },
  );
  await chmod(fixture, 0o755);

  const result = await runOrderedPty({
    wrapperPath: fixture,
    transcriptPath: path.join(root, "transcript.typescript"),
    cwd: root,
    env: { ...process.env, TERM: "xterm-256color" },
    timeoutMs: 5_000,
    steps: [
      { id: "ready", waitFor: /READY/u, send: "go\n" },
      { id: "answer", waitFor: /ANSWER/u },
      { id: "new-prompt", waitFor: /You ›/u, send: "/exit\n" },
      { id: "ended", waitFor: /Session ended/u },
    ],
  });

  assert.equal(result.code, 0, result.visible);
  assert.deepEqual(Object.keys(result.timings), [
    "ready",
    "answer",
    "new-prompt",
    "ended",
  ]);
});

test("ordered PTY timeout identifies the pending stage", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-pty-timeout-"));
  fixtureRoots.push(root);
  const fixture = path.join(root, "fixture.cjs");
  await writeFile(
    fixture,
    "#!/usr/bin/env bun\nprocess.stdout.write('READY\\n'); setInterval(() => {}, 1_000);\n",
    { mode: 0o755 },
  );
  await chmod(fixture, 0o755);

  await assert.rejects(
    runOrderedPty({
      wrapperPath: fixture,
      transcriptPath: path.join(root, "transcript.typescript"),
      cwd: root,
      env: { ...process.env, TERM: "xterm-256color" },
      timeoutMs: 150,
      steps: [
        { id: "ready", waitFor: /READY/u },
        { id: "waiting-for-answer", waitFor: /ANSWER/u },
      ],
    }),
    (error) =>
      error instanceof Error &&
      error.stage === "waiting-for-answer" &&
      /waiting-for-answer/u.test(error.message),
  );
});

test("full-screen composer emits one clean frame for every PTY resize", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-pty-resize-"));
  fixtureRoots.push(root);
  const fixture = path.join(root, "resize-fixture.mjs");
  const composerUrl = new URL(
    "../packages/cli/dist/composer.js",
    import.meta.url,
  ).href;
  await writeFile(
    fixture,
    `#!/usr/bin/env bun
import { TtyComposer } from ${JSON.stringify(composerUrl)};
Object.defineProperty(process.stdout, "columns", { value: 100, writable: true, configurable: true });
Object.defineProperty(process.stdout, "rows", { value: 12, writable: true, configurable: true });
const composer = new TtyComposer({
  input: process.stdin,
  output: process.stdout,
  color: false,
  motion: false,
  viewportMode: "fullscreen",
  onInterrupt: () => {},
});
composer.compose("You › ");
for (const [columns, rows, marker] of [[60, 10, "RESIZE60"], [20, 5, "RESIZE20"], [100, 12, "RESIZE100"]]) {
  process.stdout.columns = columns;
  process.stdout.rows = rows;
  process.stdout.emit("resize");
  composer.write(marker);
}
composer.close();
`,
    { mode: 0o755 },
  );
  await chmod(fixture, 0o755);

  const result = await runOrderedPty({
    wrapperPath: fixture,
    transcriptPath: path.join(root, "resize.typescript"),
    cwd: root,
    env: { ...process.env, TERM: "xterm-256color" },
    timeoutMs: 5_000,
    steps: [
      { id: "narrow", waitFor: /RESIZE60/u },
      { id: "tiny", waitFor: /RESIZE20/u },
      { id: "wide", waitFor: /RESIZE100/u },
    ],
  });

  assert.equal(result.code, 0, result.visible);
  const frames = result.raw
    .split("\u001b[?2026h")
    .slice(1)
    .map((frame) => frame.split("\u001b[?2026l")[0])
    .filter((frame) => frame.includes('Try "explain this repo"'));
  assert.ok(frames.length >= 3, result.visible);
  for (const frame of frames) {
    assert.equal(
      frame.match(/Try "explain this repo"/gu)?.length,
      1,
      frame,
    );
  }
  assert.match(result.raw, /\u001b\[\?1049h/u);
  assert.match(result.raw, /\u001b\[\?1049l/u);
});

test("inline composer reflows only its active frame across PTY resize", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-pty-inline-resize-"));
  fixtureRoots.push(root);
  const fixture = path.join(root, "inline-resize-fixture.mjs");
  const composerUrl = new URL(
    "../packages/cli/dist/composer.js",
    import.meta.url,
  ).href;
  await writeFile(
    fixture,
    `#!/usr/bin/env bun
import { TtyComposer } from ${JSON.stringify(composerUrl)};
Object.defineProperty(process.stdout, "columns", { value: 80, writable: true, configurable: true });
Object.defineProperty(process.stdout, "rows", { value: 12, writable: true, configurable: true });
const composer = new TtyComposer({
  input: process.stdin,
  output: process.stdout,
  color: false,
  motion: false,
  viewportMode: "inline",
  onInterrupt: () => {},
});
composer.compose("You › ", "a deliberately long inline draft that must survive every resize");
for (const [columns, rows, marker] of [[42, 8, "INLINE42"], [20, 5, "INLINE20"], [72, 12, "INLINE72"]]) {
  process.stdout.columns = columns;
  process.stdout.rows = rows;
  process.stdout.emit("resize");
  await new Promise((resolve) => setTimeout(resolve, 100));
  composer.notify(marker);
}
composer.close();
`,
    { mode: 0o755 },
  );
  await chmod(fixture, 0o755);

  const result = await runOrderedPty({
    wrapperPath: fixture,
    transcriptPath: path.join(root, "inline-resize.typescript"),
    cwd: root,
    env: { ...process.env, TERM: "xterm-256color" },
    timeoutMs: 5_000,
    steps: [
      { id: "narrow", waitFor: /INLINE42/u },
      { id: "tiny", waitFor: /INLINE20/u },
      { id: "wide", waitFor: /INLINE72/u },
    ],
  });

  assert.equal(result.code, 0, result.visible);
  assert.match(result.visible, /inline draft that must survive/u);
  assert.doesNotMatch(result.raw, /\u001bc/u);
  assert.match(result.raw, /\u001b\[0J/u);
  assert.doesNotMatch(result.raw, /\u001b\[\?1049[hl]/u);
});

test("full-screen composer routes wheel input by visible region", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-pty-wheel-"));
  fixtureRoots.push(root);
  const fixture = path.join(root, "wheel-fixture.mjs");
  const composerUrl = new URL(
    "../packages/cli/dist/composer.js",
    import.meta.url,
  ).href;
  await writeFile(
    fixture,
    `#!/usr/bin/env bun
import { TtyComposer } from ${JSON.stringify(composerUrl)};
Object.defineProperty(process.stdout, "columns", { value: 40, writable: true, configurable: true });
Object.defineProperty(process.stdout, "rows", { value: 12, writable: true, configurable: true });
const composer = new TtyComposer({
  input: process.stdin,
  output: process.stdout,
  color: false,
  motion: false,
  viewportMode: "fullscreen",
  onInterrupt: () => {},
});
composer.remember("older prompt");
composer.remember("newest prompt");
const pending = composer.compose("You › ", "working draft");
composer.write(Array.from({ length: 20 }, (_, index) => "history " + index).join("\\n"));
const value = await pending;
composer.close();
process.stdout.write("RESULT=" + JSON.stringify(value) + "\\n");
`,
    { mode: 0o755 },
  );
  await chmod(fixture, 0o755);

  const result = await runOrderedPty({
    wrapperPath: fixture,
    transcriptPath: path.join(root, "wheel.typescript"),
    cwd: root,
    env: { ...process.env, TERM: "xterm-256color" },
    timeoutMs: 5_000,
    steps: [
      {
        id: "composer",
        waitFor: /working draft/u,
        send:
          "\u001b[<64;4;1M\u001b[<64;4;12M\u001b[<64;4;12M\r",
      },
      {
        id: "result",
        waitFor: /RESULT="older prompt"/u,
      },
    ],
  });

  assert.equal(result.code, 0, result.visible);
  assert.match(result.raw, /3 newer lines · Ctrl\+End to follow/u);
  assert.match(result.raw, /\u001b\[\?1002h/u);
  assert.match(result.raw, /\u001b\[\?1006h/u);
  assert.match(result.raw, /\u001b\[\?1002l/u);
  assert.match(result.raw, /\u001b\[\?1006l/u);
});

test("xterm composer accepts multiline and modified selection sequences", {
  skip: process.platform !== "linux" ? "Linux util-linux PTY gate" : false,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-pty-editor-"));
  fixtureRoots.push(root);
  const fixture = path.join(root, "editor-fixture.mjs");
  const composerUrl = new URL(
    "../packages/cli/dist/composer.js",
    import.meta.url,
  ).href;
  await writeFile(
    fixture,
    `#!/usr/bin/env bun
import { TtyComposer } from ${JSON.stringify(composerUrl)};
const composer = new TtyComposer({
  input: process.stdin,
  output: process.stdout,
  color: true,
  motion: false,
  viewportMode: "inline",
  onInterrupt: () => {},
});
const value = await composer.compose("You › ");
composer.close();
process.stdout.write("RESULT=" + JSON.stringify(value) + "\\n");
`,
    { mode: 0o755 },
  );
  await chmod(fixture, 0o755);

  const result = await runOrderedPty({
    wrapperPath: fixture,
    transcriptPath: path.join(root, "editor.typescript"),
    cwd: root,
    env: { ...process.env, TERM: "xterm-256color" },
    timeoutMs: 5_000,
    steps: [
      {
        id: "composer",
        waitFor: /explain this repo/u,
        send:
          "alpha beta\u001b[1;6Dgamma\u001b[1;5DX\u001b[1;5CY\u001b\rsecond line\r",
      },
      {
        id: "result",
        waitFor: /RESULT="alpha XgammaY\\nsecond line"/u,
      },
    ],
  });

  assert.equal(result.code, 0, result.visible);
  assert.match(result.raw, /\u001b\[7m/u);
});
