#!/usr/bin/env bun
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CodeIntelService } from "../packages/code-intel-runtime/dist/index.js";

const flag = process.argv.indexOf("--duration-ms");
const durationMs = flag >= 0 ? Number(process.argv[flag + 1]) : 30 * 60_000;
if (!Number.isFinite(durationMs) || durationMs < 1_000) {
  throw new Error("--duration-ms must be at least 1000.");
}
const maxRssBytes = Number(process.env.ORYNT_LSP_SOAK_MAX_RSS_BYTES ?? 512 * 1024 * 1024);
const maxRetryRate = Number(process.env.ORYNT_LSP_SOAK_MAX_RETRY_RATE ?? 0.05);
const convergenceAttempts = 50;
const convergenceDelayMs = 100;
const root = await mkdtemp(path.join(os.tmpdir(), "orynt-lsp-soak-"));
const service = new CodeIntelService();
let queries = 0;
let edits = 0;
let restarts = 0;
let failures = 0;
let retries = 0;
let peakRssBytes = process.memoryUsage().rss;
const failureMessages = [];
try {
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "tsconfig.json"), '{"include":["src/**/*.ts"]}\n');
  await writeFile(
    path.join(root, "pyproject.toml"),
    "[project]\nname='soak-fixture'\nversion='0.0.0'\n",
  );
  await writeFile(
    path.join(root, "Cargo.toml"),
    "[package]\nname='soak_fixture'\nversion='0.1.0'\nedition='2021'\n",
  );
  const fixtures = [
    {
      adapterId: "typescript",
      path: "src/main.ts",
      query: "typescriptSoakValue",
      content: (value) => `export const typescriptSoakValue = ${value};\n`,
    },
    {
      adapterId: "python",
      path: "main.py",
      query: "python_soak_value",
      content: (value) => `python_soak_value: int = ${value}\n`,
    },
    {
      adapterId: "rust",
      path: "src/lib.rs",
      query: "rust_soak_value",
      content: (value) => `pub const rust_soak_value: i32 = ${value};\n`,
    },
  ];
  const adapterStats = Object.fromEntries(
    fixtures.map(({ adapterId }) => [
      adapterId,
      { queries: 0, edits: 0, restarts: 0 },
    ]),
  );
  for (const fixture of fixtures) {
    await writeFile(path.join(root, fixture.path), fixture.content(0));
  }
  await service.open(root);
  for (const fixture of fixtures) {
    let ready = false;
    for (let attempt = 0; attempt < convergenceAttempts && !ready; attempt += 1) {
      try {
        const result = await service.search({
          query: fixture.query,
          path: fixture.path,
        });
        ready = result.data.symbols.length > 0;
      } catch {
        // Tier A servers may still be indexing immediately after initialize.
      }
      if (!ready) {
        await new Promise((resolve) => setTimeout(resolve, convergenceDelayMs));
      }
    }
    if (!ready) throw new Error(`Tier A soak fixture did not warm: ${fixture.adapterId}`);
  }
  const started = Date.now();
  while (Date.now() - started < durationMs) {
    try {
      const fixture = fixtures[queries % fixtures.length];
      adapterStats[fixture.adapterId].queries += 1;
      let found = false;
      for (
        let attempt = 0;
        attempt < convergenceAttempts && !found;
        attempt += 1
      ) {
        try {
          const result = await service.search({
            query: fixture.query,
            path: fixture.path,
          });
          found = result.data.symbols.length > 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/SERVER_WARMING|STALE_|Workspace changed/u.test(message)) throw error;
        }
        if (!found) {
          retries += 1;
          await new Promise((resolve) =>
            setTimeout(resolve, convergenceDelayMs)
          );
        }
      }
      if (!found) {
        failures += 1;
        if (failureMessages.length < 20) {
          failureMessages.push(`Symbol disappeared after retries: ${fixture.adapterId}`);
        }
      }
      queries += 1;
      if (queries % 30 === 0) {
        edits += 1;
        for (const target of fixtures) {
          await writeFile(path.join(root, target.path), target.content(edits));
          adapterStats[target.adapterId].edits += 1;
        }
      }
      if (queries % 150 === 0) {
        const restarted = fixtures[restarts % fixtures.length].adapterId;
        await service.restart(restarted);
        adapterStats[restarted].restarts += 1;
        restarts += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/SERVER_WARMING|STALE_|Workspace changed/u.test(message)) {
        retries += 1;
      } else {
        failures += 1;
        if (failureMessages.length < 20) failureMessages.push(message);
      }
    }
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const status = await service.status();
  const memory = process.memoryUsage();
  const sessionHealthy = status.data.sessions.every(({ crashCount, lastFailure, state }) =>
    crashCount === 0 && !lastFailure && state === "ready"
  );
  const retryRate = retries / Math.max(1, queries);
  const fullDurationCoverage = durationMs < 30 * 60_000 ||
    Object.values(adapterStats).every(({ queries, edits, restarts }) =>
      queries > 0 && edits > 0 && restarts > 0
    );
  const passed =
    failures === 0 &&
    queries > 0 &&
    edits > 0 &&
    sessionHealthy &&
    peakRssBytes <= maxRssBytes &&
    retryRate <= maxRetryRate &&
    fullDurationCoverage;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 2,
    sourceDigest:
      process.env.ORYNT_SOURCE_DIGEST ??
      process.env.GITHUB_SHA ??
      "local-unbound",
    durationMs,
    queries,
    edits,
    restarts,
    failures,
    retries,
    retryRate,
    adapterStats,
    failureMessages,
    sessionHealthy,
    sessions: status.data.sessions,
    memory,
    peakRssBytes,
    maxRssBytes,
    maxRetryRate,
    fullDurationCoverage,
    passed,
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  await service.close();
  await rm(root, { recursive: true, force: true });
}
