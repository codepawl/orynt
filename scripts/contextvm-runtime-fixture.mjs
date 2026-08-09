import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalSqliteContextVmStore } from "../packages/memory/dist/index.js";
import {
  contextVmSessionId,
  contextVmTaskId,
} from "../packages/shared/dist/index.js";

const root = await mkdtemp(path.join(os.tmpdir(), "orynt-contextvm-parity-"));
const runtime = new LocalSqliteContextVmStore({ root });

try {
  await runtime.initialize();
  const sessionId = contextVmSessionId("runtime-parity");
  await runtime.appendEvent({
    sessionId,
    taskId: contextVmTaskId("runtime-parity-task"),
    source: { kind: "test_fixture", id: "runtime-parity-source" },
    occurredAt: "2026-08-04T00:00:00.000Z",
    actor: { kind: "runtime", id: "runtime-parity" },
    kind: "user_message",
    payload: { goal: "Inspect packages/cli/src/intelligence.ts" },
    sensitivity: "internal",
  });
  const extraction = await runtime.extractSession(sessionId, "runtime-parity");
  const checkpoint = await runtime.createStateCheckpoint({
    sessionId,
    reason: "explicit",
  });
  const recovery = await runtime.recoverSessionState(sessionId);
  const consolidation = await runtime.consolidateSession({
    sessionId,
    namespace: "runtime-parity",
    trigger: "explicit_save",
  });
  const retrieval = await runtime.retrieveMemoryPages({
    namespace: "runtime-parity",
    query: "packages/cli/src/intelligence.ts",
    topK: 4,
  });
  const rebuilt = await runtime.rebuildRetrievalIndex();
  const verified = await runtime.verify();
  const status = await runtime.status();
  const result = JSON.stringify({
    schemaVersion: status.databaseSchemaVersion,
    eventCount: status.eventCount,
    admitted: extraction.candidates.filter(({ status }) => status === "admitted").length,
    summaries: retrieval.candidates.map(({ page }) => page.summary),
    indexedMemoryPages: rebuilt.indexedMemoryPages,
    checkpointSequence: checkpoint.capturedThroughSequence,
    recoveryStatus: recovery.status,
    recoverySource: recovery.source,
    recoveredThroughSequence: recovery.state?.throughSequence,
    consolidatedPages: consolidation.outputMemoryIds.length,
    verification: verified.status,
    failedChecks: verified.checks
      .filter(({ status }) => status === "fail")
      .map(({ id, summary }) => ({ id, summary })),
  });
  if (process.env.CONTEXTVM_PARITY_OUTPUT) {
    await writeFile(process.env.CONTEXTVM_PARITY_OUTPUT, `${result}\n`, "utf8");
  } else {
    process.stdout.write(`${result}\n`);
  }
} finally {
  runtime.close();
  await rm(root, { recursive: true, force: true });
}
