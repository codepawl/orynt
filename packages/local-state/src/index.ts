import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

export class LocalStateError extends Error {
  readonly code:
    | "invalid_json"
    | "invalid_schema"
    | "revision_conflict"
    | "lock_timeout";

  constructor(code: LocalStateError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalStateError";
    this.code = code;
  }
}

export type VersionedState = {
  schemaVersion: number;
  revision: number;
};

export type ExclusiveLockOptions = {
  timeoutMs?: number;
  retryDelayMs?: number;
};

export type LoadVersionedJsonOptions<T extends VersionedState> = {
  filePath: string;
  schemaVersion: number;
  validate: (value: unknown) => value is T;
  initialize: () => T;
  migrate?: (value: unknown) => T;
};

export type CompareAndSwapJsonOptions<T extends VersionedState, R> =
  LoadVersionedJsonOptions<T> & {
    expectedRevision?: number;
    mutate: (state: T) => R;
    updatedAt?: (state: T) => void;
    lock?: ExclusiveLockOptions;
  };

const DEFAULT_LOCK_TIMEOUT_MS = 2_000;
const DEFAULT_RETRY_DELAY_MS = 25;

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function clone<T>(value: T): T {
  return typeof globalThis.structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export async function atomicWriteFileDurable(
  targetPath: string,
  content: string | Uint8Array,
): Promise<void> {
  const resolved = path.resolve(targetPath);
  const parent = path.dirname(resolved);
  const temporaryPath = `${resolved}.tmp-${process.pid}-${randomUUID()}`;
  let temporaryFile: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const parentHandle = await open(parent, "r").catch(async (error: unknown) => {
      if (!isMissing(error)) {
        throw error;
      }
      const { mkdir } = await import("node:fs/promises");
      await mkdir(parent, { recursive: true });
      return open(parent, "r");
    });
    await parentHandle.close();

    temporaryFile = await open(temporaryPath, "wx", 0o600);
    await temporaryFile.writeFile(content);
    await temporaryFile.sync();
    await temporaryFile.close();
    temporaryFile = undefined;
    await rename(temporaryPath, resolved);

    const parentDirectory = await open(parent, "r");
    try {
      await parentDirectory.sync();
    } finally {
      await parentDirectory.close();
    }
  } finally {
    await temporaryFile?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

type LockRecord = {
  pid: number;
  acquiredAt: string;
  token: string;
};

function parseLockRecord(value: string): LockRecord | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<LockRecord>;
    if (
      Number.isSafeInteger(parsed.pid) &&
      Number(parsed.pid) > 0 &&
      typeof parsed.acquiredAt === "string" &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0
    ) {
      return {
        pid: Number(parsed.pid),
        acquiredAt: parsed.acquiredAt,
        token: parsed.token,
      };
    }
  } catch {
    // An unreadable owner cannot be proven absent, so the lock must time out.
  }
  return undefined;
}

function isProcessAbsent(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "ESRCH");
  }
}

async function recoverLockIfOwnerAbsent(lockPath: string): Promise<boolean> {
  let record: LockRecord | undefined;
  try {
    record = parseLockRecord(await readFile(lockPath, "utf8"));
  } catch (error) {
    return isMissing(error);
  }
  if (!record || !isProcessAbsent(record.pid)) {
    return false;
  }
  await rm(lockPath, { force: true });
  return true;
}

export async function withExclusiveFileLock<T>(
  targetPath: string,
  work: () => Promise<T>,
  options: ExclusiveLockOptions = {},
): Promise<T> {
  const resolvedTarget = path.resolve(targetPath);
  await mkdir(path.dirname(resolvedTarget), { recursive: true });
  const lockPath = `${resolvedTarget}.lock`;
  const acquisitionGuardPath = `${lockPath}.acquire`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const record: LockRecord = {
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    token: randomUUID(),
  };

  while (true) {
    let acquisitionGuard: Awaited<ReturnType<typeof open>> | undefined;
    try {
      acquisitionGuard = await open(acquisitionGuardPath, "wx", 0o600);
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      if (acquisitionGuard && await recoverLockIfOwnerAbsent(lockPath)) {
        continue;
      }
      if (Date.now() >= deadline) {
        throw new LocalStateError(
          "lock_timeout",
          `timed out acquiring local-state lock: ${lockPath}`,
        );
      }
      await sleep(Math.max(1, retryDelayMs));
    } finally {
      await acquisitionGuard?.close().catch(() => undefined);
      if (acquisitionGuard) {
        await rm(acquisitionGuardPath, { force: true }).catch(() => undefined);
      }
    }
  }

  try {
    return await work();
  } finally {
    const current = await readFile(lockPath, "utf8").then(parseLockRecord).catch(() => undefined);
    if (current?.token === record.token) {
      await rm(lockPath, { force: true });
    }
  }
}

export async function loadVersionedJson<T extends VersionedState>(
  options: LoadVersionedJsonOptions<T>,
): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path.resolve(options.filePath), "utf8");
  } catch (error) {
    if (isMissing(error)) {
      return clone(options.initialize());
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new LocalStateError("invalid_json", `invalid JSON state: ${options.filePath}`, {
      cause: error,
    });
  }
  if (options.validate(parsed) && parsed.schemaVersion === options.schemaVersion) {
    return clone(parsed);
  }
  if (options.migrate) {
    const migrated = options.migrate(parsed);
    if (options.validate(migrated) && migrated.schemaVersion === options.schemaVersion) {
      return clone(migrated);
    }
  }
  throw new LocalStateError(
    "invalid_schema",
    `invalid versioned state schema: ${options.filePath}`,
  );
}

export async function compareAndSwapVersionedJson<T extends VersionedState, R>(
  options: CompareAndSwapJsonOptions<T, R>,
): Promise<{ result: R; state: T }> {
  return withExclusiveFileLock(
    options.filePath,
    async () => {
      const state = await loadVersionedJson(options);
      if (
        options.expectedRevision !== undefined &&
        state.revision !== options.expectedRevision
      ) {
        throw new LocalStateError(
          "revision_conflict",
          `state revision conflict: expected ${options.expectedRevision}, current ${state.revision}`,
        );
      }
      const result = options.mutate(state);
      state.revision += 1;
      options.updatedAt?.(state);
      await atomicWriteFileDurable(
        options.filePath,
        `${JSON.stringify(state, null, 2)}\n`,
      );
      return { result: clone(result), state: clone(state) };
    },
    options.lock,
  );
}
