#!/usr/bin/env bun
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CodeIntelService } from "../packages/code-intel-runtime/dist/index.js";

const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};
const measure = async (operation) => {
  const started = performance.now();
  const result = await operation();
  return { ms: performance.now() - started, result };
};
const threshold = (name, fallback) => Number(process.env[name] ?? fallback);

const root = await mkdtemp(path.join(os.tmpdir(), "orynt-lsp-bench-"));
const service = new CodeIntelService();
try {
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "tsconfig.json"), '{"include":["src/**/*.ts"]}\n');
  await writeFile(
    path.join(root, "src", "main.ts"),
    [
      "export function benchmark(value: string): string { return value; }",
      "export const companion = benchmark('ok');",
      ...Array.from({ length: 20 }, (_, index) =>
        `export const warmSymbol${index} = benchmark('${index}');`
      ),
      "export const concurrentTarget = benchmark('concurrent');",
      "",
    ].join("\n"),
  );
  const spawnBaselineSamples = [];
  for (let index = 0; index < 5; index += 1) {
    const isolated = new CodeIntelService();
    const sample = await measure(async () => {
      await isolated.open(root);
      await isolated.search({ query: "benchmark", path: "src/main.ts" });
      await isolated.close();
    });
    spawnBaselineSamples.push(sample.ms);
  }
  const opened = await measure(() => service.open(root));
  const cold = await measure(() =>
    service.search({ query: "benchmark", path: "src/main.ts" })
  );
  const warmUncachedSamples = [];
  for (let index = 0; index < 20; index += 1) {
    warmUncachedSamples.push((await measure(() =>
      service.search({ query: `warmSymbol${index}`, path: "src/main.ts" })
    )).ms);
  }
  await service.search({ query: "companion", path: "src/main.ts" });
  const cachedSamples = [];
  for (let index = 0; index < 50; index += 1) {
    cachedSamples.push((await measure(() =>
      service.search({ query: "companion", path: "src/main.ts" })
    )).ms);
  }
  const requestsBefore = (await service.status()).data.sessions
    .reduce((sum, session) => sum + session.requestCount, 0);
  const concurrent = await measure(() => Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      service.search({
        query: "concurrentTarget",
        path: "src/main.ts",
      })
    ),
  ));
  const requestsAfter = (await service.status()).data.sessions
    .reduce((sum, session) => sum + session.requestCount, 0);
  const spawnBaselineP50Ms = percentile(spawnBaselineSamples, 0.50);
  const warmUncachedP50Ms = percentile(warmUncachedSamples, 0.50);
  const report = {
    schemaVersion: 2,
    samples: {
      spawnBaseline: spawnBaselineSamples.length,
      warmUncached: warmUncachedSamples.length,
      cached: cachedSamples.length,
      concurrent: 16,
    },
    openedMs: opened.ms,
    coldMs: cold.ms,
    spawnBaselineP50Ms,
    warmUncachedP50Ms,
    warmSpeedup: spawnBaselineP50Ms / Math.max(0.001, warmUncachedP50Ms),
    cachedP50Ms: percentile(cachedSamples, 0.50),
    cachedP95Ms: percentile(cachedSamples, 0.95),
    concurrentMs: concurrent.ms,
    concurrentDownstreamRequests: requestsAfter - requestsBefore,
    memory: process.memoryUsage(),
    cacheStatus: cold.result.metrics.cache,
    thresholds: {
      coldMs: threshold("ORYNT_LSP_BENCH_COLD_MS", 5_000),
      cachedP95Ms: threshold("ORYNT_LSP_BENCH_CACHED_P95_MS", 20),
      concurrentMs: threshold("ORYNT_LSP_BENCH_CONCURRENT_MS", 500),
    },
  };
  const failures = Object.entries(report.thresholds).filter(([metric, limit]) =>
    report[metric] > limit
  );
  if (report.warmSpeedup < 5) failures.push(["warmSpeedup", 5]);
  if (report.concurrentDownstreamRequests !== 1) {
    failures.push(["concurrentDownstreamRequests", 1]);
  }
  process.stdout.write(`${JSON.stringify({ ...report, passed: failures.length === 0, failures }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await service.close();
  await rm(root, { recursive: true, force: true });
}
