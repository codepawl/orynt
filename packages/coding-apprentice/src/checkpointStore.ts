import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  parseCognitiveRunCheckpointV1,
  type CognitiveRunCheckpointV1,
  type CognitiveRuntimeCheckpointSinkV1,
} from "@codepawl/cognitive-kernel";
import {
  atomicWriteFileDurable,
  LocalStateError,
  loadVersionedJson,
  withExclusiveFileLock,
} from "@codepawl/local-state";

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]{1,160}$/;

function clone<T>(value: T): T {
  return typeof globalThis.structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function isCheckpoint(value: unknown): value is CognitiveRunCheckpointV1 {
  try {
    parseCognitiveRunCheckpointV1(value);
    return true;
  } catch {
    return false;
  }
}

function missing(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT",
  );
}

export class LocalJsonCognitiveCheckpointStore
  implements CognitiveRuntimeCheckpointSinkV1
{
  readonly stateRoot: string;

  constructor(options: { stateRoot: string }) {
    this.stateRoot = path.resolve(options.stateRoot);
  }

  checkpointPath(runId: string): string {
    if (!RUN_ID_PATTERN.test(runId)) {
      throw new Error("checkpoint runId is invalid");
    }
    return path.join(this.stateRoot, "runs", runId, "checkpoint.json");
  }

  async create(checkpoint: CognitiveRunCheckpointV1): Promise<void> {
    const parsed = parseCognitiveRunCheckpointV1(checkpoint);
    if (parsed.revision !== 0) {
      throw new Error("initial cognitive checkpoint is invalid");
    }
    const filePath = this.checkpointPath(checkpoint.runId);
    await withExclusiveFileLock(filePath, async () => {
      try {
        await readFile(filePath, "utf8");
        throw new LocalStateError(
          "revision_conflict",
          `cognitive checkpoint already exists: ${checkpoint.runId}`,
        );
      } catch (error) {
        if (!missing(error)) {
          throw error;
        }
      }
      await atomicWriteFileDurable(
        filePath,
        `${JSON.stringify(parsed, null, 2)}\n`,
      );
    });
  }

  async compareAndSwap(
    checkpoint: CognitiveRunCheckpointV1,
    expectedRevision: number,
  ): Promise<void> {
    const parsed = parseCognitiveRunCheckpointV1(checkpoint);
    if (parsed.revision !== expectedRevision + 1) {
      throw new Error(
        "checkpoint CAS requires exactly one persisted revision advance",
      );
    }
    const filePath = this.checkpointPath(parsed.runId);
    await withExclusiveFileLock(filePath, async () => {
      const current = await this.load(checkpoint.runId);
      if (current.revision !== expectedRevision) {
        throw new LocalStateError(
          "revision_conflict",
          `cognitive checkpoint revision conflict: expected ${expectedRevision}, current ${current.revision}`,
        );
      }
      await atomicWriteFileDurable(
        filePath,
        `${JSON.stringify(parsed, null, 2)}\n`,
      );
    });
  }

  async load(runId: string): Promise<CognitiveRunCheckpointV1> {
    const filePath = this.checkpointPath(runId);
    return loadVersionedJson({
      filePath,
      schemaVersion: 1,
      validate: isCheckpoint,
      initialize: () => {
        throw new Error(`cognitive checkpoint not found: ${runId}`);
      },
    }).then(clone);
  }
}
