#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createBrowserPromotionTasks,
  createBrowserSmokeTasks,
  evaluateBrowserPromotionGate,
  evaluateBrowserV2PromotionGate,
} from "../packages/eval-harness/dist/browserBench.js";

const argv = process.argv.slice(2);
const runsIndex = argv.indexOf("--runs");
const promotion = argv.includes("--promotion");
const browserV2 = argv.includes("--v2");
if (runsIndex < 0 || !argv[runsIndex + 1]) {
  process.stderr.write("Usage: bun bench:browser -- --runs <result.json> [--promotion|--v2]\n");
  process.exitCode = 2;
} else {
  const inputPath = path.resolve(argv[runsIndex + 1]);
  const payload = JSON.parse(await readFile(inputPath, "utf8"));
  if (!Array.isArray(payload)) {
    throw new Error("Browser benchmark input must be a JSON array of BrowserBenchRun records");
  }
  const result = browserV2
    ? evaluateBrowserV2PromotionGate(payload)
    : evaluateBrowserPromotionGate(payload, {
        requirePromotionFloor: promotion,
      });
  const expectedTasks = promotion || browserV2
    ? createBrowserPromotionTasks().length
    : createBrowserSmokeTasks().length;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    expectedTasks,
    mode: browserV2 ? "v2-promotion" : promotion ? "promotion" : "smoke",
    ...result,
  }, null, 2)}\n`);
  process.exitCode = result.gate.passed ? 0 : 1;
}
