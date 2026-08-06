#!/usr/bin/env bun

import { PassThrough } from "node:stream";
import { performance } from "node:perf_hooks";

import { TerminalScreen } from "../packages/cli/src/terminal-screen.ts";

const output = new PassThrough();
output.columns = 120;
output.rows = 40;
output.resume();

const screen = new TerminalScreen(output);
const frame = {
  composer: ["❯ benchmark"],
  composerCursorRow: 0,
  composerCursorColumn: 2,
};
const history = "a".repeat(4 * 1024 * 1024 - 1);

screen.enter();
screen.appendHistory(history);
const initialStart = performance.now();
screen.render(frame);
const initialMs = performance.now() - initialStart;
const initial = screen.debugState();

const steadyStart = performance.now();
for (let index = 0; index < 20; index += 1) screen.render(frame);
const steadyMs = performance.now() - steadyStart;
const steady = screen.debugState();

output.columns = 80;
const resizeStart = performance.now();
screen.render(frame);
const resizeMs = performance.now() - resizeStart;
const resized = screen.debugState();
screen.leave();

const failures = [];
if (steady.wrapCount !== initial.wrapCount) {
  failures.push("steady renders rewrapped stable history");
}
if (steadyMs > 250) {
  failures.push(`20 steady renders exceeded 250ms (${steadyMs.toFixed(2)}ms)`);
}
if (resizeMs > 250) {
  failures.push(`4MiB ASCII resize exceeded 250ms (${resizeMs.toFixed(2)}ms)`);
}
if (resized.historyBytes > 4 * 1024 * 1024) {
  failures.push("display history exceeded 4MiB");
}
if (resized.retainedRows > 50_000) {
  failures.push("display history exceeded 50,000 rendered rows");
}

process.stdout.write(
  `${JSON.stringify({
    schemaVersion: 1,
    historyBytes: resized.historyBytes,
    retainedRows: resized.retainedRows,
    initialMs: Number(initialMs.toFixed(2)),
    steady20Ms: Number(steadyMs.toFixed(2)),
    resizeMs: Number(resizeMs.toFixed(2)),
    initialWraps: initial.wrapCount,
    steadyWraps: steady.wrapCount,
    resizedWraps: resized.wrapCount,
    status: failures.length === 0 ? "pass" : "fail",
    failures,
  }, null, 2)}\n`,
);

if (failures.length > 0) process.exitCode = 1;
