import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

export type RepositoryMutationFile = {
  path: string;
  expectedHash: string;
  content: string;
};

export type RepositoryMutationRequest = {
  previewId: string;
  previewDigest: string;
  files: RepositoryMutationFile[];
};

export type RepositoryMutationReceipt = {
  transactionId: string;
  leaseToken: string;
  previewId: string;
  previewDigest: string;
  changedFiles: string[];
  afterHashes: Record<string, string>;
  state: "committed";
};

export type RepositoryMutationErrorCode =
  | "OUTSIDE_WORKSPACE"
  | "SYMLINK_ESCAPE"
  | "EDIT_CONFLICT"
  | "INVALID_WORKSPACE_EDIT"
  | "RECOVERY_REQUIRED";

export class RepositoryMutationError extends Error {
  constructor(
    readonly code: RepositoryMutationErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "RepositoryMutationError";
  }
}

type JournalFile = RepositoryMutationFile & {
  index: number;
  beforeHash: string;
  afterHash: string;
  mode: number;
  state: "pending" | "replacing" | "applied" | "restoring" | "restored";
};

type MutationJournal = {
  schemaVersion: 2;
  transactionId: string;
  previewId: string;
  previewDigest: string;
  repositoryPath: string;
  leaseToken: string;
  state:
    | "prepared"
    | "applying"
    | "committed"
    | "rolling_back"
    | "rolled_back"
    | "recovery_required";
  files: JournalFile[];
};

export type RepositoryMutationTransactionOptions = {
  repositoryPath: string;
  stateRoot: string;
  maxFiles?: number;
  maxBytes?: number;
  leaseStaleMs?: number;
};

export type RepositoryMutationRecovery = {
  transactionId: string;
  previewId: string;
  state: MutationJournal["state"];
  changedFiles: string[];
  automatic: boolean;
  reason?: string;
};

type MutationLease = {
  token: string;
  handle: FileHandle;
  heartbeat: NodeJS.Timeout;
};

export type RepositoryMutationHandle = {
  transactionId: string;
  leaseToken: string;
};

const PROTECTED_MUTATION_SEGMENTS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".orynt",
  "node_modules",
  ".venv",
  "venv",
  "vendor",
  "target",
  "dist",
  "build",
  "coverage",
  "generated",
  "gen",
]);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRelative(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\/+/u, "");
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new RepositoryMutationError(
      "OUTSIDE_WORKSPACE",
      "Mutation path must stay inside the repository.",
      { path: value },
    );
  }
  const protectedSegment = normalized.split("/").find((segment) =>
    PROTECTED_MUTATION_SEGMENTS.has(segment)
  );
  if (protectedSegment) {
    throw new RepositoryMutationError(
      "INVALID_WORKSPACE_EDIT",
      "Mutation targets may not enter metadata, dependency, vendor, or generated roots.",
      { path: value, protectedSegment },
    );
  }
  return normalized;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function durableFile(filePath: string, content: string): Promise<void> {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceFile(
  target: string,
  content: string,
  mode: number,
  transactionId: string,
): Promise<void> {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.orynt-${transactionId}-${randomUUID()}.tmp`,
  );
  await durableFile(temporary, content);
  await chmod(temporary, mode & 0o777);
  await rename(temporary, target);
  await syncDirectory(path.dirname(target));
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class RepositoryMutationTransaction {
  private root?: string;
  private storeRoot?: string;
  private active?: { transactionId: string; lease: MutationLease };

  constructor(private readonly options: RepositoryMutationTransactionOptions) {}

  async apply(
    request: RepositoryMutationRequest,
  ): Promise<RepositoryMutationReceipt> {
    if (this.active) {
      throw new RepositoryMutationError(
        "RECOVERY_REQUIRED",
        "A mutation is already awaiting verification.",
        { transactionId: this.active.transactionId },
      );
    }
    const lease = await this.acquireLease();
    let keepLease = false;
    let directory: string | undefined;
    let journal: MutationJournal | undefined;
    try {
      const unresolved = await this.recoverPendingWithLease(lease.token);
      if (unresolved.length > 0) {
        throw new RepositoryMutationError(
          "RECOVERY_REQUIRED",
          "Unresolved mutation recovery blocks new repository mutations.",
          { transactions: unresolved.map(({ transactionId }) => transactionId) },
        );
      }
      const root = await this.repositoryRoot();
      const files = await this.prepareFiles(root, request.files);
      const transactionId = `mutation-${randomUUID()}`;
      directory = await this.transactionDirectory(transactionId);
      await mkdir(directory, { recursive: false, mode: 0o700 });
      journal = {
        schemaVersion: 2,
        transactionId,
        previewId: request.previewId,
        previewDigest: request.previewDigest,
        repositoryPath: root,
        leaseToken: lease.token,
        state: "prepared",
        files,
      };
      for (const file of files) {
        const original = await readFile(path.join(root, file.path), "utf8");
        await durableFile(
          path.join(directory, `before-${String(file.index).padStart(4, "0")}`),
          original,
        );
        await durableFile(
          path.join(directory, `after-${String(file.index).padStart(4, "0")}`),
          file.content,
        );
      }
      await this.writeJournal(directory, journal);
      journal.state = "applying";
      await this.writeJournal(directory, journal);
      for (const file of journal.files) {
        const target = path.join(root, file.path);
        const current = await readFile(target);
        if (sha256(current) !== file.beforeHash) {
          throw new RepositoryMutationError(
            "EDIT_CONFLICT",
            "A mutation target changed after preview validation.",
            { path: file.path },
          );
        }
        file.state = "replacing";
        await this.writeJournal(directory, journal);
        await replaceFile(
          target,
          file.content,
          file.mode,
          transactionId,
        );
        file.state = "applied";
        await this.writeJournal(directory, journal);
      }
      journal.state = "committed";
      await this.writeJournal(directory, journal);
      this.active = { transactionId, lease };
      keepLease = true;
      return {
        transactionId,
        leaseToken: lease.token,
        previewId: request.previewId,
        previewDigest: request.previewDigest,
        changedFiles: journal.files.map(({ path: filePath }) => filePath),
        afterHashes: Object.fromEntries(
          journal.files.map(({ path: filePath, afterHash }) => [
            filePath,
            afterHash,
          ]),
        ),
        state: "committed",
      };
    } catch (error) {
      if (directory && journal) {
        const rollback = await this.rollbackJournal(directory, journal);
        if (!rollback) {
          throw new RepositoryMutationError(
            "RECOVERY_REQUIRED",
            "Mutation failed and automatic rollback was incomplete.",
            {
              transactionId: journal.transactionId,
              cause: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
      throw error;
    } finally {
      if (!keepLease) await this.releaseLease(lease);
    }
  }

  async rollback(handle: RepositoryMutationHandle): Promise<void> {
    const { transactionId } = handle;
    this.requireActiveHandle(handle);
    const directory = await this.transactionDirectory(transactionId);
    const journal = await this.readJournal(directory);
    if (!["committed", "recovery_required"].includes(journal.state)) {
      throw new RepositoryMutationError(
        "INVALID_WORKSPACE_EDIT",
        `Transaction cannot be rolled back from ${journal.state}.`,
        { transactionId },
      );
    }
    if (!await this.rollbackJournal(directory, journal)) {
      throw new RepositoryMutationError(
        "RECOVERY_REQUIRED",
        "Automatic rollback was incomplete.",
        { transactionId },
      );
    }
    await this.releaseActive(handle);
  }

  async finalize(handle: RepositoryMutationHandle): Promise<void> {
    const { transactionId } = handle;
    const directory = await this.transactionDirectory(transactionId);
    const journal = await this.readJournal(directory);
    if (!["committed", "rolled_back"].includes(journal.state)) {
      throw new RepositoryMutationError(
        "RECOVERY_REQUIRED",
        "Recovery material cannot be removed from an unresolved transaction.",
        { transactionId, state: journal.state },
      );
    }
    if (journal.state === "committed") this.requireActiveHandle(handle);
    await rm(directory, { recursive: true, force: false });
    await syncDirectory(path.dirname(directory));
    if (journal.state === "committed") await this.releaseActive(handle);
  }

  async listRecovery(): Promise<RepositoryMutationRecovery[]> {
    const root = await this.transactionStoreRoot();
    const entries = await readdir(root, { withFileTypes: true });
    const recovery: RepositoryMutationRecovery[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^mutation-[0-9a-f-]{36}$/u.test(entry.name)) {
        continue;
      }
      try {
        const journal = await this.readJournal(path.join(root, entry.name));
        recovery.push({
          transactionId: journal.transactionId,
          previewId: journal.previewId,
          state: journal.state,
          changedFiles: journal.files.filter(({ state }) =>
            ["replacing", "applied", "restoring"].includes(state)
          )
            .map(({ path: filePath }) => filePath),
          automatic: journal.state !== "recovery_required",
        });
      } catch {
        recovery.push({
          transactionId: entry.name,
          previewId: "unknown",
          state: "recovery_required",
          changedFiles: [],
          automatic: false,
        });
      }
    }
    return recovery.sort((left, right) =>
      left.transactionId.localeCompare(right.transactionId)
    );
  }

  async recoverPending(): Promise<RepositoryMutationRecovery[]> {
    const lease = await this.acquireLease();
    try {
      return await this.recoverPendingWithLease(lease.token);
    } finally {
      await this.releaseLease(lease);
    }
  }

  private async recoverPendingWithLease(
    leaseToken: string,
  ): Promise<RepositoryMutationRecovery[]> {
    const unresolved: RepositoryMutationRecovery[] = [];
    for (const item of await this.listRecovery()) {
      const directory = await this.transactionDirectory(item.transactionId);
      let journal: MutationJournal;
      try {
        journal = await this.readJournal(directory);
      } catch {
        unresolved.push(item);
        continue;
      }
      if (journal.state === "rolled_back") {
        await rm(directory, { recursive: true, force: false });
        continue;
      }
      journal.leaseToken = leaseToken;
      if (journal.state === "recovery_required") {
        unresolved.push(item);
        continue;
      }
      if (await this.rollbackJournal(directory, journal)) {
        await rm(directory, { recursive: true, force: false });
      } else {
        unresolved.push({
          ...item,
          state: "recovery_required",
          automatic: false,
        });
      }
    }
    return unresolved;
  }

  async retryRecovery(transactionId: string): Promise<void> {
    const lease = await this.acquireLease();
    try {
      const directory = await this.transactionDirectory(transactionId);
      const journal = await this.readJournal(directory);
      if (journal.state !== "recovery_required") {
        throw new RepositoryMutationError(
          "INVALID_WORKSPACE_EDIT",
          "Only unresolved transactions can be retried.",
          { transactionId, state: journal.state },
        );
      }
      journal.leaseToken = lease.token;
      if (!await this.rollbackJournal(directory, journal)) {
        throw new RepositoryMutationError(
          "RECOVERY_REQUIRED",
          "Recovery remains blocked because repository hashes no longer prove a safe rollback.",
          { transactionId },
        );
      }
      await rm(directory, { recursive: true, force: false });
    } finally {
      await this.releaseLease(lease);
    }
  }

  async assertWritable(): Promise<void> {
    const lease = await this.acquireLease();
    try {
      const unresolved = await this.recoverPendingWithLease(lease.token);
      if (unresolved.length > 0) {
        throw new RepositoryMutationError(
          "RECOVERY_REQUIRED",
          "Unresolved mutation recovery blocks new repository mutations.",
          { transactions: unresolved.map(({ transactionId }) => transactionId) },
        );
      }
    } finally {
      await this.releaseLease(lease);
    }
  }

  private async prepareFiles(
    root: string,
    requested: RepositoryMutationFile[],
  ): Promise<JournalFile[]> {
    const maximum = this.options.maxFiles ?? 100;
    if (requested.length === 0 || requested.length > maximum) {
      throw new RepositoryMutationError(
        "INVALID_WORKSPACE_EDIT",
        `Mutation must affect between 1 and ${maximum} files.`,
      );
    }
    const normalized = requested.map((file) => ({
      ...file,
      path: normalizeRelative(file.path),
    }));
    if (
      new Set(normalized.map(({ path: filePath }) => filePath)).size !==
        normalized.length
    ) {
      throw new RepositoryMutationError(
        "INVALID_WORKSPACE_EDIT",
        "Mutation contains duplicate file paths.",
      );
    }
    const totalBytes = normalized.reduce(
      (sum, { content }) => sum + Buffer.byteLength(content),
      0,
    );
    if (totalBytes > (this.options.maxBytes ?? 10 * 1024 * 1024)) {
      throw new RepositoryMutationError(
        "INVALID_WORKSPACE_EDIT",
        "Mutation exceeds the configured byte limit.",
        { totalBytes },
      );
    }
    return await Promise.all(
      normalized.map(async (file, index): Promise<JournalFile> => {
        const unresolved = path.join(root, file.path);
        const metadata = await lstat(unresolved);
        if (metadata.isSymbolicLink()) {
          throw new RepositoryMutationError(
            "SYMLINK_ESCAPE",
            "Mutation targets may not be symbolic links.",
            { path: file.path },
          );
        }
        if (!metadata.isFile()) {
          throw new RepositoryMutationError(
            "INVALID_WORKSPACE_EDIT",
            "Mutation targets must be regular files.",
            { path: file.path },
          );
        }
        const resolved = await realpath(unresolved);
        if (!inside(root, resolved)) {
          throw new RepositoryMutationError(
            "OUTSIDE_WORKSPACE",
            "Mutation target escaped the repository.",
            { path: file.path },
          );
        }
        const original = await readFile(resolved);
        const beforeHash = sha256(original);
        if (beforeHash !== file.expectedHash) {
          throw new RepositoryMutationError(
            "EDIT_CONFLICT",
            "Mutation target no longer matches its preview hash.",
            {
              path: file.path,
              expectedHash: file.expectedHash,
              actualHash: beforeHash,
            },
          );
        }
        return {
          ...file,
          index,
          beforeHash,
          afterHash: sha256(file.content),
          mode: metadata.mode,
          state: "pending",
        };
      }),
    );
  }

  private async rollbackJournal(
    directory: string,
    journal: MutationJournal,
  ): Promise<boolean> {
    journal.state = "rolling_back";
    await this.writeJournal(directory, journal);
    try {
      for (const file of [...journal.files].reverse()) {
        const target = path.join(journal.repositoryPath, file.path);
        const current = await readFile(target);
        const currentHash = sha256(current);
        if (currentHash === file.beforeHash) {
          file.state = "restored";
          await this.writeJournal(directory, journal);
          continue;
        }
        if (currentHash !== file.afterHash) {
          throw new RepositoryMutationError(
            "EDIT_CONFLICT",
            "A mutation target no longer matches either proven transaction hash.",
            {
              path: file.path,
              beforeHash: file.beforeHash,
              afterHash: file.afterHash,
              actualHash: currentHash,
            },
          );
        }
        const original = await readFile(
          path.join(
            directory,
            `before-${String(file.index).padStart(4, "0")}`,
          ),
          "utf8",
        );
        file.state = "restoring";
        await this.writeJournal(directory, journal);
        await replaceFile(
          target,
          original,
          file.mode,
          journal.transactionId,
        );
        file.state = "restored";
        await this.writeJournal(directory, journal);
      }
      journal.state = "rolled_back";
      await this.writeJournal(directory, journal);
      return true;
    } catch {
      journal.state = "recovery_required";
      await this.writeJournal(directory, journal);
      return false;
    }
  }

  private async repositoryRoot(): Promise<string> {
    this.root ??= await realpath(this.options.repositoryPath);
    return this.root;
  }

  private async transactionStoreRoot(): Promise<string> {
    if (this.storeRoot) return this.storeRoot;
    const root = path.resolve(
      this.options.stateRoot,
      "code-intel-transactions",
      sha256(await this.repositoryRoot()),
    );
    await mkdir(root, { recursive: true, mode: 0o700 });
    this.storeRoot = await realpath(root);
    return this.storeRoot;
  }

  private async transactionDirectory(transactionId: string): Promise<string> {
    if (!/^mutation-[0-9a-f-]{36}$/u.test(transactionId)) {
      throw new RepositoryMutationError(
        "INVALID_WORKSPACE_EDIT",
        "Invalid mutation transaction id.",
      );
    }
    return path.join(await this.transactionStoreRoot(), transactionId);
  }

  private async writeJournal(
    directory: string,
    journal: MutationJournal,
  ): Promise<void> {
    const target = path.join(directory, "journal.json");
    const temporary = path.join(directory, `journal-${randomUUID()}.tmp`);
    await durableFile(temporary, `${JSON.stringify(journal, null, 2)}\n`);
    await rename(temporary, target);
    await syncDirectory(directory);
  }

  private async readJournal(directory: string): Promise<MutationJournal> {
    const parsed = JSON.parse(
      await readFile(path.join(directory, "journal.json"), "utf8"),
    ) as MutationJournal | {
      schemaVersion: 1;
      transactionId: string;
      previewId: string;
      previewDigest: string;
      repositoryPath: string;
      ownerPid: number;
      state: MutationJournal["state"];
      files: Array<Omit<JournalFile, "state"> & { applied: boolean }>;
    };
    if (parsed.schemaVersion === 1 && Array.isArray(parsed.files)) {
      return {
        schemaVersion: 2,
        transactionId: parsed.transactionId,
        previewId: parsed.previewId,
        previewDigest: parsed.previewDigest,
        repositoryPath: parsed.repositoryPath,
        leaseToken: `legacy-${parsed.ownerPid}`,
        state: parsed.state,
        files: parsed.files.map(({ applied, ...file }) => ({
          ...file,
          state: applied ? "applied" : "pending",
        })),
      };
    }
    if (
      parsed.schemaVersion !== 2 ||
      !Array.isArray(parsed.files) ||
      typeof parsed.leaseToken !== "string" ||
      !parsed.leaseToken
    ) {
      throw new RepositoryMutationError(
        "RECOVERY_REQUIRED",
        "Mutation journal is invalid.",
      );
    }
    return parsed;
  }

  private async acquireLease(): Promise<MutationLease> {
    const leasePath = path.join(await this.transactionStoreRoot(), "lease.json");
    const token = randomUUID();
    const acquire = async (): Promise<FileHandle> => {
      try {
        return await open(leasePath, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const staleMs = this.options.leaseStaleMs ?? 30_000;
        let existing: { pid?: number; token?: string } = {};
        let age = 0;
        try {
          existing = JSON.parse(await readFile(leasePath, "utf8")) as typeof existing;
          age = Date.now() - (await stat(leasePath)).mtimeMs;
        } catch {
          age = staleMs + 1;
        }
        if (age <= staleMs) {
          throw new RepositoryMutationError(
            "RECOVERY_REQUIRED",
            "Another repository mutation owns the recovery lease.",
            { ownerPid: existing.pid, leaseAgeMs: age },
          );
        }
        await rm(leasePath, { force: true });
        return await open(leasePath, "wx", 0o600);
      }
    };
    const handle = await acquire();
    await handle.writeFile(`${JSON.stringify({
      schemaVersion: 1,
      token,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    })}\n`, "utf8");
    await handle.sync();
    const heartbeat = setInterval(() => {
      const now = new Date();
      void utimes(leasePath, now, now).catch(() => undefined);
    }, Math.max(1_000, Math.floor((this.options.leaseStaleMs ?? 30_000) / 3)));
    heartbeat.unref();
    return { token, handle, heartbeat };
  }

  private async releaseLease(lease: MutationLease): Promise<void> {
    clearInterval(lease.heartbeat);
    await lease.handle.close().catch(() => undefined);
    const leasePath = path.join(await this.transactionStoreRoot(), "lease.json");
    try {
      const current = JSON.parse(await readFile(leasePath, "utf8")) as {
        token?: string;
      };
      if (current.token === lease.token) await rm(leasePath, { force: true });
    } catch {
      // A missing or replaced lease must not be deleted by a stale owner.
    }
  }

  private requireActiveHandle(handle: RepositoryMutationHandle): void {
    if (
      !this.active ||
      this.active.transactionId !== handle.transactionId ||
      this.active.lease.token !== handle.leaseToken
    ) {
      throw new RepositoryMutationError(
        "RECOVERY_REQUIRED",
        "Transaction handle does not own the active repository mutation lease.",
        { transactionId: handle.transactionId },
      );
    }
  }

  private async releaseActive(handle: RepositoryMutationHandle): Promise<void> {
    this.requireActiveHandle(handle);
    const active = this.active!;
    this.active = undefined;
    await this.releaseLease(active.lease);
  }

}
