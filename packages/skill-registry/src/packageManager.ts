import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  InstalledSkillRecord,
  SkillRelease,
  SkillManagerEvent,
  SkillManagerSnapshot,
  SkillMutationKind,
  SkillMutationPlan,
  SkillReceipt,
  SkillScope,
  SkillSourceDescriptor,
  SkillTransaction,
} from "@codepawl/shared";
import { redactSensitivePayload } from "@codepawl/shared";

import {
  fingerprintSkillDirectory,
  scanAgentSkillRoots,
  SkillPackageFailure,
  type SkillScanOptions,
  type SkillScanRoot,
} from "./packageScanner";

type ManagerState = {
  schemaVersion: 1;
  receipts: SkillReceipt[];
  plans: SkillMutationPlan[];
  transactions: SkillTransaction[];
  events: SkillManagerEvent[];
  sources: SkillSourceDescriptor[];
  enabled: Record<string, boolean>;
  pins: Record<string, boolean>;
};

const EMPTY_STATE: ManagerState = {
  schemaVersion: 1,
  receipts: [],
  plans: [],
  transactions: [],
  events: [],
  sources: [],
  enabled: {},
  pins: {},
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function timestamp() {
  return new Date().toISOString();
}

function ownedPath(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new SkillPackageFailure("unsafe_path", `path escapes managed root: ${candidate}`);
  }
  return resolved;
}

function storageKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function assertNoSymlinkComponents(candidate: string): Promise<void> {
  const resolved = path.resolve(candidate);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const component of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        throw new SkillPackageFailure("unsafe_path", `managed path contains a symbolic link: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

type PinnedManagedRoot = {
  path: string;
  close: () => Promise<void>;
};

async function pinManagedRoot(
  root: string,
  projectRepositoryPath?: string,
): Promise<PinnedManagedRoot> {
  await assertNoSymlinkComponents(root);
  if (process.platform !== "linux") {
    if (projectRepositoryPath) {
      throw new SkillPackageFailure(
        "unsafe_path",
        "secure project-scope skill mutation is unavailable on this platform",
      );
    }
    await mkdir(root, { recursive: true, mode: 0o700 });
    await assertNoSymlinkComponents(root);
    return { path: root, close: async () => undefined };
  }

  const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  let repositoryHandle: FileHandle | undefined;
  let rootHandle: FileHandle | undefined;
  try {
    let pathToOpen = root;
    let canonicalBoundary: string | undefined;
    if (projectRepositoryPath) {
      repositoryHandle = await open(projectRepositoryPath, flags);
      const pinnedRepository = `/proc/self/fd/${repositoryHandle.fd}`;
      canonicalBoundary = await realpath(pinnedRepository);
      pathToOpen = path.join(pinnedRepository, ".agents", "skills");
      await mkdir(pathToOpen, { recursive: true, mode: 0o700 });
    } else {
      await mkdir(pathToOpen, { recursive: true, mode: 0o700 });
    }
    rootHandle = await open(pathToOpen, flags);
    const pinnedRoot = `/proc/self/fd/${rootHandle.fd}`;
    const canonicalRoot = await realpath(pinnedRoot);
    if (
      canonicalBoundary &&
      canonicalRoot !== canonicalBoundary &&
      !canonicalRoot.startsWith(`${canonicalBoundary}${path.sep}`)
    ) {
      throw new SkillPackageFailure(
        "unsafe_path",
        "project skill root escaped the pinned repository",
      );
    }
    return {
      path: pinnedRoot,
      close: async () => {
        await rootHandle?.close();
        await repositoryHandle?.close();
      },
    };
  } catch (error) {
    await rootHandle?.close().catch(() => undefined);
    await repositoryHandle?.close().catch(() => undefined);
    throw error;
  }
}

async function pinChildDirectory(
  pinnedParent: string,
  components: string[],
): Promise<PinnedManagedRoot> {
  if (process.platform !== "linux") {
    throw new SkillPackageFailure(
      "unsafe_path",
      "secure nested state mutation is unavailable on this platform",
    );
  }
  const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  const handles: FileHandle[] = [];
  let current = pinnedParent;
  try {
    for (const component of components) {
      if (!/^[a-zA-Z0-9._-]{1,128}$/.test(component)) {
        throw new SkillPackageFailure("unsafe_path", "state path component is invalid");
      }
      const candidate = path.join(current, component);
      await mkdir(candidate, { mode: 0o700 }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      });
      const handle = await open(candidate, flags);
      handles.push(handle);
      current = `/proc/self/fd/${handle.fd}`;
    }
    return {
      path: current,
      close: async () => {
        for (const handle of handles.reverse()) await handle.close();
      },
    };
  } catch (error) {
    for (const handle of handles.reverse()) {
      await handle.close().catch(() => undefined);
    }
    throw error;
  }
}

export function resolveSkillManagerStateRoot(environment: NodeJS.ProcessEnv = process.env, homeDirectory = os.homedir()): string {
  if (environment.ORYNT_STATE_HOME) return path.resolve(environment.ORYNT_STATE_HOME, "skills");
  if (environment.XDG_STATE_HOME) return path.resolve(environment.XDG_STATE_HOME, "orynt", "skills");
  return path.resolve(homeDirectory, ".local", "state", "orynt", "skills");
}

export function resolveUserSkillRoot(homeDirectory = os.homedir()): string {
  return path.resolve(homeDirectory, ".agents", "skills");
}

export function resolveProjectSkillRoot(repositoryPath: string): string {
  return path.resolve(repositoryPath, ".agents", "skills");
}

export type SkillAutoUpdateAssessment = {
  eligible: boolean;
  reasons: string[];
};

/**
 * Auto-update is only content automation during an operator-triggered refresh.
 * The caller still has to create and execute a normal mutation plan.
 */
export function assessSkillAutoUpdate(
  installed: InstalledSkillRecord,
  current: SkillRelease,
  next: SkillRelease,
): SkillAutoUpdateAssessment {
  const reasons: string[] = [];
  if (!["builtin", "trusted"].includes(installed.source.trustTier)) reasons.push("publisher is not trusted");
  if (installed.pinned) reasons.push("skill is pinned");
  if (installed.drifted) reasons.push("installed files have local drift");
  if (!next.revision || next.revision === current.revision) reasons.push("release does not identify a new immutable revision");
  if (!next.digest || !/^[a-f0-9]{64}$/i.test(next.digest)) reasons.push("release digest is missing or invalid");
  const currentCapabilities = new Set(current.capabilities);
  const currentDependencies = new Set(current.dependencies);
  if (next.capabilities.some((capability) => !currentCapabilities.has(capability))) reasons.push("release adds capabilities");
  if (next.dependencies.some((dependency) => !currentDependencies.has(dependency))) reasons.push("release adds dependencies");
  if (next.files.some((file) => /(^|\/)(package\.json|[^/]*\.(?:sh|bash|zsh|ps1|bat|cmd|exe|dll|so|dylib))$/i.test(file.path))) {
    reasons.push("release contains executable or package-manager content");
  }
  return { eligible: reasons.length === 0, reasons };
}

export class FileSkillManagerStore {
  private readonly statePath: string;
  private readonly lockPath: string;

  constructor(readonly root: string) {
    this.root = path.resolve(root);
    this.statePath = path.join(this.root, "manager.json");
    this.lockPath = path.join(this.root, "manager.lock");
  }

  async load(): Promise<ManagerState> {
    try {
      const value = JSON.parse(await readFile(this.statePath, "utf8")) as Partial<ManagerState>;
      if (value.schemaVersion !== 1) throw new Error("unsupported skill manager state schema");
      return {
        schemaVersion: 1,
        receipts: Array.isArray(value.receipts) ? value.receipts : [],
        plans: Array.isArray(value.plans) ? value.plans : [],
        transactions: Array.isArray(value.transactions) ? value.transactions : [],
        events: Array.isArray(value.events) ? value.events : [],
        sources: Array.isArray(value.sources) ? value.sources : [],
        enabled: value.enabled && typeof value.enabled === "object" ? value.enabled : {},
        pins: value.pins && typeof value.pins === "object" ? value.pins : {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return clone(EMPTY_STATE);
      throw error;
    }
  }

  async save(state: ManagerState): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.root, `.manager-${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.statePath);
  }

  async withLock<T>(operation: (state: ManagerState) => Promise<T>): Promise<T> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    let handle;
    try {
      handle = await open(this.lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new SkillPackageFailure("collision", "another skill-manager mutation is in progress");
      }
      throw error;
    }
    try {
      const state = await this.load();
      try {
        const result = await operation(state);
        await this.save(state);
        return result;
      } catch (error) {
        await this.save(state);
        throw error;
      }
    } finally {
      await handle.close();
      await rm(this.lockPath, { force: true });
    }
  }

  async events(): Promise<SkillManagerEvent[]> {
    return clone((await this.load()).events);
  }

  async receipts(): Promise<SkillReceipt[]> {
    return clone((await this.load()).receipts);
  }

  async recoverInterruptedTransactions(): Promise<SkillTransaction[]> {
    return this.withLock(async (state) => {
      const recovered: SkillTransaction[] = [];
      for (const transaction of state.transactions) {
        if (transaction.status !== "planned" && transaction.status !== "approved") continue;
        transaction.status = "failed";
        transaction.error = "interrupted before commit";
        transaction.completedAt = timestamp();
        recovered.push(clone(transaction));
        state.events.push({
          id: randomUUID(),
          type: "transaction_recovered",
          timestamp: transaction.completedAt,
          transactionId: transaction.id,
          planId: transaction.planId,
          skillId: transaction.skillId,
          detail: { action: "marked_failed" },
        });
      }
      return recovered;
    });
  }
}

export type LocalSkillPackageManagerOptions = {
  repositoryPath: string;
  userSkillRoot?: string;
  runtimeRoots?: SkillScanRoot[];
  stateRoot?: string;
  now?: () => string;
  planTtlMs?: number;
  scanLimits?: Omit<SkillScanOptions, "roots" | "now">;
};

export type PlanSkillMutationInput = {
  kind: SkillMutationKind;
  skillId: string;
  scope: Exclude<SkillScope, "runtime">;
  name: string;
  source?: SkillSourceDescriptor;
  sourcePath?: string;
  expectedFingerprint?: string;
};

async function copyBundle(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new SkillPackageFailure("unsafe_path", `symbolic link is not allowed: ${entry.name}`);
    if (entry.isDirectory()) await copyBundle(sourcePath, destinationPath);
    else if (entry.isFile()) await copyFile(sourcePath, destinationPath);
    else throw new SkillPackageFailure("unsafe_path", `special file is not allowed: ${entry.name}`);
  }
}

export class LocalSkillPackageManager {
  readonly store: FileSkillManagerStore;
  readonly projectSkillRoot: string;
  readonly userSkillRoot: string;
  private readonly runtimeRoots: SkillScanRoot[];
  private readonly now: () => string;
  private readonly planTtlMs: number;
  private readonly scanLimits: LocalSkillPackageManagerOptions["scanLimits"];

  constructor(private readonly options: LocalSkillPackageManagerOptions) {
    this.projectSkillRoot = resolveProjectSkillRoot(options.repositoryPath);
    this.userSkillRoot = path.resolve(options.userSkillRoot ?? resolveUserSkillRoot());
    this.store = new FileSkillManagerStore(options.stateRoot ?? resolveSkillManagerStateRoot());
    this.runtimeRoots = options.runtimeRoots ?? [];
    this.now = options.now ?? timestamp;
    this.planTtlMs = options.planTtlMs ?? 10 * 60 * 1_000;
    this.scanLimits = options.scanLimits;
  }

  roots(): SkillScanRoot[] {
    return [
      {
        path: this.projectSkillRoot,
        scope: "project",
        source: {
          id: "project",
          kind: "local",
          label: "Project skills",
          uri: this.projectSkillRoot,
          trustTier: "untrusted",
          enabled: true,
          readOnly: false,
        },
      },
      {
        path: this.userSkillRoot,
        scope: "user",
        source: {
          id: "user",
          kind: "local",
          label: "User skills",
          uri: this.userSkillRoot,
          trustTier: "trusted",
          enabled: true,
          readOnly: false,
        },
      },
      ...this.runtimeRoots.filter((root) => root.source.enabled).map((root) => ({
        ...root,
        scope: "runtime" as const,
        source: { ...root.source, readOnly: true },
      })),
    ];
  }

  async scan(): Promise<SkillManagerSnapshot> {
    const state = await this.store.load();
    const result = await scanAgentSkillRoots({ roots: this.roots(), now: this.now, ...this.scanLimits });
    const receiptsByPath = new Map(state.receipts.filter((receipt) => !receipt.trashedAt).map((receipt) => [path.resolve(receipt.installPath), receipt]));
    for (const record of result.installed) {
      const receipt = receiptsByPath.get(path.resolve(record.path));
      if (receipt) {
        record.id = receipt.skillId;
        record.receiptOwned = true;
        record.version = receipt.version;
        record.revision = receipt.revision;
        record.drifted = record.digest !== receipt.digest;
        record.health = record.drifted ? "warning" : record.health;
        record.warnings = record.drifted ? [...record.warnings, "local files differ from install receipt"] : record.warnings;
      }
      record.enabled = state.enabled[record.id] ?? record.enabled;
      record.pinned = state.pins[record.id] ?? false;
      record.eligible = record.enabled && !record.shadowedBy && record.health !== "blocked";
    }
    const snapshot: SkillManagerSnapshot = {
      schemaVersion: 1,
      generatedAt: this.now(),
      installed: result.installed,
      sources: state.sources,
      receipts: state.receipts,
      transactions: state.transactions,
      collisions: result.collisions,
    };
    await this.store.withLock(async (next) => {
      next.events.push({
        id: randomUUID(),
        type: "inventory_scanned",
        timestamp: snapshot.generatedAt,
        detail: { installedCount: snapshot.installed.length, collisionCount: snapshot.collisions.length },
      });
    });
    return snapshot;
  }

  async planMutation(input: PlanSkillMutationInput): Promise<SkillMutationPlan> {
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(input.name)) {
      throw new SkillPackageFailure("unsafe_path", "skill install name contains unsupported characters");
    }
    const root = input.scope === "project" ? this.projectSkillRoot : this.userSkillRoot;
    await assertNoSymlinkComponents(root);
    const destinationPath = ownedPath(root, path.join(root, input.name));
    let expectedFingerprint = input.expectedFingerprint;
    if (input.sourcePath && !expectedFingerprint) expectedFingerprint = (await fingerprintSkillDirectory(input.sourcePath, this.scanLimits)).digest;
    const createdAt = this.now();
    const plan: SkillMutationPlan = {
      id: randomUUID(),
      kind: input.kind,
      skillId: input.skillId,
      scope: input.scope,
      sourcePath: input.sourcePath,
      source: input.source,
      destinationPath,
      expectedFingerprint,
      fileDiff: { added: [], changed: [], removed: [] },
      capabilityDiff: { added: [], removed: [] },
      dependencyDiff: { added: [], removed: [] },
      trustDecision: input.source?.trustTier ?? "untrusted",
      approvalRequired: true,
      expiresAt: new Date(new Date(createdAt).getTime() + this.planTtlMs).toISOString(),
      createdAt,
    };
    await this.store.withLock(async (state) => {
      state.plans.push(plan);
      if (input.source && !state.sources.some((source) => source.id === input.source!.id)) state.sources.push(input.source);
      state.events.push({
        id: randomUUID(),
        type: "mutation_planned",
        timestamp: createdAt,
        skillId: input.skillId,
        planId: plan.id,
        detail: { kind: input.kind, scope: input.scope, destinationPath },
      });
    });
    return clone(plan);
  }

  async approveMutation(planId: string): Promise<SkillMutationPlan> {
    return this.store.withLock(async (state) => {
      const plan = state.plans.find((candidate) => candidate.id === planId);
      if (!plan) throw new SkillPackageFailure("skill_not_found", `mutation plan not found: ${planId}`);
      if (Date.parse(plan.expiresAt) <= Date.parse(this.now())) throw new SkillPackageFailure("stale_plan", "mutation plan expired");
      plan.approvedAt = this.now();
      state.events.push({
        id: randomUUID(),
        type: "mutation_approved",
        timestamp: plan.approvedAt,
        skillId: plan.skillId,
        planId,
        detail: { kind: plan.kind },
      });
      return clone(plan);
    });
  }

  async executeMutation(planId: string): Promise<SkillReceipt | undefined> {
    return this.store.withLock(async (state) => {
      const plan = state.plans.find((candidate) => candidate.id === planId);
      if (!plan) throw new SkillPackageFailure("skill_not_found", `mutation plan not found: ${planId}`);
      if (!plan.approvedAt || Date.parse(plan.expiresAt) <= Date.parse(this.now())) {
        throw new SkillPackageFailure("stale_plan", "plan is not approved or expired");
      }
      if (state.transactions.some((candidate) => candidate.planId === planId)) {
        throw new SkillPackageFailure("stale_plan", "mutation plan was already consumed");
      }
      const managedRoot =
        plan.scope === "project" ? this.projectSkillRoot : this.userSkillRoot;
      ownedPath(managedRoot, plan.destinationPath);
      const pinnedRoot = await pinManagedRoot(
        managedRoot,
        plan.scope === "project" ? this.options.repositoryPath : undefined,
      );
      let pinnedStateRoot: PinnedManagedRoot;
      try {
        pinnedStateRoot = await pinManagedRoot(this.store.root);
      } catch (error) {
        await pinnedRoot.close();
        throw error;
      }
      let pinnedStagingRoot: PinnedManagedRoot | undefined;
      let pinnedBackupRoot: PinnedManagedRoot | undefined;
      let pinnedTrashRoot: PinnedManagedRoot | undefined;
      try {
        pinnedStagingRoot = await pinChildDirectory(pinnedStateRoot.path, ["staging"]);
        pinnedBackupRoot = await pinChildDirectory(pinnedStateRoot.path, [
          "backups",
          storageKey(plan.skillId),
        ]);
        pinnedTrashRoot = await pinChildDirectory(pinnedStateRoot.path, [
          "trash",
          storageKey(plan.skillId),
        ]);
      } catch (error) {
        await pinnedTrashRoot?.close();
        await pinnedBackupRoot?.close();
        await pinnedStagingRoot?.close();
        await pinnedStateRoot.close();
        await pinnedRoot.close();
        throw error;
      }
      if (!pinnedStagingRoot || !pinnedBackupRoot || !pinnedTrashRoot) {
        await pinnedStateRoot.close();
        await pinnedRoot.close();
        throw new SkillPackageFailure("unsafe_path", "could not pin skill-manager state directories");
      }
      const mutationDestinationPath = ownedPath(
        pinnedRoot.path,
        path.join(pinnedRoot.path, path.basename(plan.destinationPath)),
      );
      const transaction: SkillTransaction = {
        id: randomUUID(),
        planId,
        kind: plan.kind,
        skillId: plan.skillId,
        status: "approved",
        startedAt: this.now(),
      };
      state.transactions.push(transaction);
      let stagingPath: string | undefined;
      let backupPath: string | undefined;
      try {
        const existingReceipt = state.receipts.find((receipt) => receipt.skillId === plan.skillId && !receipt.trashedAt);
        if (existingReceipt) {
          if (
            existingReceipt.scope !== plan.scope ||
            path.resolve(existingReceipt.installPath) !== path.resolve(plan.destinationPath)
          ) {
            throw new SkillPackageFailure("collision", "receipt identity does not match the mutation destination");
          }
          ownedPath(managedRoot, existingReceipt.installPath);
        }
        let receipt: SkillReceipt | undefined;
        if (["install", "import", "update"].includes(plan.kind)) {
          if ((plan.kind === "install" || plan.kind === "import") && existingReceipt) {
            throw new SkillPackageFailure("collision", "skill is already installed; create an update plan");
          }
          if (plan.kind === "update" && !existingReceipt) {
            throw new SkillPackageFailure("not_receipt_owned", "update requires an installed receipt");
          }
          if (!plan.sourcePath || !plan.expectedFingerprint) throw new SkillPackageFailure("stale_plan", "source path and fingerprint are required");
          const sourceFingerprint = await fingerprintSkillDirectory(plan.sourcePath, this.scanLimits);
          if (sourceFingerprint.digest !== plan.expectedFingerprint) {
            throw new SkillPackageFailure("digest_mismatch", "source changed after the mutation plan was created");
          }
          if (plan.kind === "update" && existingReceipt) {
            const installedFingerprint = await fingerprintSkillDirectory(mutationDestinationPath, this.scanLimits);
            if (installedFingerprint.digest !== existingReceipt.digest) throw new SkillPackageFailure("local_drift", "installed skill has local changes");
          }
          const stagingRoot = pinnedStagingRoot.path;
          stagingPath = ownedPath(stagingRoot, path.join(stagingRoot, transaction.id));
          await copyBundle(plan.sourcePath, stagingPath);
          const stagedFingerprint = await fingerprintSkillDirectory(stagingPath, this.scanLimits);
          if (stagedFingerprint.digest !== plan.expectedFingerprint) throw new SkillPackageFailure("digest_mismatch", "staged copy failed integrity check");
          try {
            await stat(mutationDestinationPath);
            if (!existingReceipt) throw new SkillPackageFailure("collision", "destination already exists and is not receipt-owned");
            const backupRoot = pinnedBackupRoot.path;
            backupPath = ownedPath(backupRoot, path.join(backupRoot, transaction.id));
            await rename(mutationDestinationPath, backupPath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          await rename(stagingPath, mutationDestinationPath);
          stagingPath = undefined;
          const source =
            plan.source ??
            ({
              id: "local-import",
              kind: "local",
              label: "Local import",
              uri: plan.sourcePath,
              trustTier: plan.trustDecision,
              enabled: true,
              readOnly: false,
            } satisfies SkillSourceDescriptor);
          const created = this.now();
          receipt = {
            schemaVersion: 1,
            skillId: plan.skillId,
            scope: plan.scope,
            installPath: plan.destinationPath,
            source,
            digest: stagedFingerprint.digest,
            files: stagedFingerprint.files,
            installedAt: existingReceipt?.installedAt ?? created,
            updatedAt: created,
          };
          state.receipts = state.receipts.filter((candidate) => candidate !== existingReceipt);
          state.receipts.push(receipt);
          if (!existingReceipt && (plan.kind === "install" || plan.kind === "import")) {
            state.enabled[plan.skillId] = false;
          }
        } else if (plan.kind === "enable" || plan.kind === "disable") {
          state.enabled[plan.skillId] = plan.kind === "enable";
        } else if (plan.kind === "pin" || plan.kind === "unpin") {
          state.pins[plan.skillId] = plan.kind === "pin";
        } else if (plan.kind === "remove") {
          if (!existingReceipt) throw new SkillPackageFailure("not_receipt_owned", "only receipt-owned skills can be removed");
          const installedFingerprint = await fingerprintSkillDirectory(mutationDestinationPath, this.scanLimits);
          if (installedFingerprint.digest !== existingReceipt.digest) throw new SkillPackageFailure("local_drift", "installed skill has local changes");
          const trashRoot = pinnedTrashRoot.path;
          const actualTrashPath = ownedPath(trashRoot, path.join(trashRoot, transaction.id));
          const logicalTrashPath = ownedPath(
            path.join(this.store.root, "trash"),
            path.join(this.store.root, "trash", storageKey(plan.skillId), transaction.id),
          );
          await mkdir(path.dirname(actualTrashPath), { recursive: true, mode: 0o700 });
          await rename(mutationDestinationPath, actualTrashPath);
          existingReceipt.trashedAt = this.now();
          existingReceipt.trashPath = logicalTrashPath;
          existingReceipt.updatedAt = existingReceipt.trashedAt;
          receipt = existingReceipt;
        } else if (plan.kind === "restore") {
          const trashed = state.receipts.find((candidate) => candidate.skillId === plan.skillId && candidate.trashedAt && candidate.trashPath);
          if (!trashed?.trashPath) throw new SkillPackageFailure("skill_not_found", "trashed skill receipt was not found");
          ownedPath(managedRoot, trashed.installPath);
          const logicalTrashRoot = path.join(
            this.store.root,
            "trash",
            storageKey(plan.skillId),
          );
          const logicalTrashPath = ownedPath(logicalTrashRoot, trashed.trashPath);
          if (path.dirname(logicalTrashPath) !== path.resolve(logicalTrashRoot)) {
            throw new SkillPackageFailure("unsafe_path", "receipt Trash identity is invalid");
          }
          const actualTrashPath = ownedPath(
            pinnedTrashRoot.path,
            path.join(pinnedTrashRoot.path, path.basename(logicalTrashPath)),
          );
          const trashFingerprint = await fingerprintSkillDirectory(actualTrashPath, this.scanLimits);
          if (trashFingerprint.digest !== trashed.digest) throw new SkillPackageFailure("digest_mismatch", "trashed skill no longer matches its receipt");
          await rename(actualTrashPath, mutationDestinationPath);
          delete trashed.trashedAt;
          delete trashed.trashPath;
          trashed.updatedAt = this.now();
          receipt = trashed;
        } else if (plan.kind === "purge") {
          const trashed = state.receipts.find((candidate) => candidate.skillId === plan.skillId && candidate.trashedAt && candidate.trashPath);
          if (!trashed?.trashPath) throw new SkillPackageFailure("skill_not_found", "trashed skill receipt was not found");
          const logicalTrashRoot = path.join(
            this.store.root,
            "trash",
            storageKey(plan.skillId),
          );
          const logicalTrashPath = ownedPath(logicalTrashRoot, trashed.trashPath);
          if (path.dirname(logicalTrashPath) !== path.resolve(logicalTrashRoot)) {
            throw new SkillPackageFailure("unsafe_path", "receipt Trash identity is invalid");
          }
          const actualTrashPath = ownedPath(
            pinnedTrashRoot.path,
            path.join(pinnedTrashRoot.path, path.basename(logicalTrashPath)),
          );
          await rm(actualTrashPath, { recursive: true });
          state.receipts = state.receipts.filter((candidate) => candidate !== trashed);
        }
        transaction.status = "committed";
        transaction.completedAt = this.now();
        state.events.push({
          id: randomUUID(),
          type: "mutation_committed",
          timestamp: transaction.completedAt,
          skillId: plan.skillId,
          planId,
          transactionId: transaction.id,
          detail: { kind: plan.kind },
        });
        return receipt ? clone(receipt) : undefined;
      } catch (error) {
        let rollbackError: string | undefined;
        try {
          if (stagingPath) await rm(stagingPath, { recursive: true, force: true });
          if (backupPath) {
            try {
              await stat(mutationDestinationPath);
            } catch (statError) {
              if ((statError as NodeJS.ErrnoException).code === "ENOENT") await rename(backupPath, mutationDestinationPath);
              else throw statError;
            }
          }
        } catch (rollbackFailure) {
          rollbackError = rollbackFailure instanceof Error ? rollbackFailure.message : String(rollbackFailure);
        }
        transaction.status = "failed";
        transaction.completedAt = this.now();
        transaction.error = `${error instanceof Error ? error.message : String(error)}${rollbackError ? `; rollback failed: ${rollbackError}` : ""}`;
        state.events.push({
          id: randomUUID(),
          type: "mutation_failed",
          timestamp: transaction.completedAt,
          skillId: plan.skillId,
          planId,
          transactionId: transaction.id,
          detail: { kind: plan.kind, error: transaction.error },
        });
        throw error;
      } finally {
        await pinnedTrashRoot.close();
        await pinnedBackupRoot.close();
        await pinnedStagingRoot.close();
        await pinnedRoot.close();
        await pinnedStateRoot.close();
      }
    });
  }

  async createContextSnapshot(runId: string, selectedSkillIds: string[]) {
    const snapshot = await this.scan();
    const skills = [];
    const pinnedStateRoot = await pinManagedRoot(this.store.root);
    let pinnedContextRoot: PinnedManagedRoot | undefined;
    try {
      pinnedContextRoot = await pinChildDirectory(pinnedStateRoot.path, [
        "context-staging",
      ]);
      for (const id of selectedSkillIds) {
        const record = snapshot.installed.find((candidate) => candidate.id === id);
        if (!record?.manifest || !record.eligible) throw new SkillPackageFailure("skill_not_found", `eligible skill not found: ${id}`);
        const contextStagingRoot = pinnedContextRoot.path;
        const stagedPath = ownedPath(
          contextStagingRoot,
          path.join(contextStagingRoot, `${storageKey(runId)}-${randomUUID()}`),
        );
        try {
          await copyBundle(record.path, stagedPath);
          const current = await fingerprintSkillDirectory(stagedPath, this.scanLimits);
          if (current.digest !== record.digest) throw new SkillPackageFailure("local_drift", `skill changed during snapshot: ${id}`);
          const document = await readFile(path.join(stagedPath, "SKILL.md"), "utf8");
          const instructions = document.slice(document.indexOf("\n---\n", 4) + 5);
          const resources = [];
          for (const file of current.files) {
            if (
              file.path === "SKILL.md" ||
              !file.path.startsWith("references/") ||
              /(^|\/)(?:\.env|credentials?|secrets?|tokens?)(?:\.|$)/i.test(file.path) ||
              file.size > 256 * 1024 ||
              resources.length >= 20
            ) continue;
            const content = await readFile(path.join(stagedPath, file.path), "utf8").catch(() => undefined);
            if (content === undefined || content.includes("\0")) continue;
            const redacted = redactSensitivePayload(content).payload;
            resources.push({
              path: file.path,
              content: typeof redacted === "string" ? redacted : "[REDACTED]",
              sha256: file.sha256,
            });
          }
          skills.push({ skillId: id, manifest: record.manifest, instructions, resources, digest: current.digest });
        } finally {
          await rm(stagedPath, { recursive: true, force: true });
        }
      }
    } finally {
      await pinnedContextRoot?.close();
      await pinnedStateRoot.close();
    }
    const createdAt = this.now();
    const digest = createHash("sha256").update(JSON.stringify(skills)).digest("hex");
    const context = { schemaVersion: 1 as const, runId, createdAt, skills, digest };
    await this.store.withLock(async (state) => {
      state.events.push({
        id: randomUUID(),
        type: "skill_context_snapshot_created",
        timestamp: createdAt,
        detail: { runId, skillIds: selectedSkillIds, digest },
      });
    });
    return context;
  }
}
