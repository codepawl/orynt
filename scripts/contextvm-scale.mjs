import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { LocalSqliteContextVmStore } from "../packages/memory/dist/index.js";
import {
  contextVmSessionId,
  contextVmTaskId,
} from "../packages/shared/dist/index.js";

const root = await mkdtemp(path.join(os.tmpdir(), "orynt-contextvm-scale-"));
const store = new LocalSqliteContextVmStore({ root });
const sessionId = contextVmSessionId("contextvm-scale-100k");
const taskId = contextVmTaskId("contextvm-scale-task");
const total = 100_000;
const batchSize = 1_000;
const started = performance.now();

try {
  await store.initialize();
  for (let offset = 0; offset < total; offset += batchSize) {
    await store.appendEvents(
      Array.from({ length: Math.min(batchSize, total - offset) }, (_, index) => {
        const sequence = offset + index + 1;
        return {
          sessionId,
          taskId,
          source: { kind: "test_fixture", id: `scale-${sequence}` },
          occurredAt: new Date(1_700_000_000_000 + sequence).toISOString(),
          actor: { kind: "runtime", id: "contextvm-scale" },
          kind: "state_transition",
          payload: { sequence },
          sensitivity: "internal",
        };
      }),
    );
  }
  let scanned = 0;
  while (scanned < total) {
    const page = await store.scanSession({
      sessionId,
      afterSequence: scanned,
      limit: 10_000,
    });
    if (page.length === 0) throw new Error(`scan stopped at ${scanned}`);
    scanned += page.length;
  }
  const checkpointStarted = performance.now();
  const checkpoint = await store.createStateCheckpoint({
    sessionId,
    reason: "event_threshold",
  });
  const checkpointDurationMs = performance.now() - checkpointStarted;
  const recoveryStarted = performance.now();
  const recovery = await store.recoverSessionState(sessionId);
  const recoveryDurationMs = performance.now() - recoveryStarted;
  const report = await store.verify();
  if (
    scanned !== total ||
    report.status !== "pass" ||
    checkpoint.capturedThroughSequence !== total ||
    !recovery.state ||
    recovery.state.throughSequence !== total + 1
  ) {
    throw new Error(
      `ContextVM scale gate failed: scanned=${scanned}; checkpoint=${checkpoint.capturedThroughSequence}; recovered=${recovery.state?.throughSequence}; verify=${report.status}`,
    );
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    eventCount: total,
    scanned,
    durationMs: Math.round(performance.now() - started),
    checkpointDurationMs: Math.round(checkpointDurationMs),
    recoveryDurationMs: Math.round(recoveryDurationMs),
    recoveryStatus: recovery.status,
    verification: report.status,
  })}\n`);
} finally {
  store.close();
  await rm(root, { recursive: true, force: true });
}
