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
} from "node:fs/promises";
import path from "node:path";

import {
  computeMutationPreviewDigest,
  type StoredMutationPreview,
} from "./mutation.js";

export interface MutationPreviewStore {
  open(repositoryPath: string): Promise<void>;
  get(previewId: string): StoredMutationPreview | undefined;
  put(preview: StoredMutationPreview): Promise<void>;
  consumeApproval(previewId: string, approvalDigest: string): Promise<boolean>;
  delete(previewId: string): Promise<void>;
  close(): Promise<void>;
}

export class MemoryMutationPreviewStore implements MutationPreviewStore {
  protected readonly previews = new Map<string, StoredMutationPreview>();
  protected readonly consumedApprovals = new Map<string, Set<string>>();
  async open(_repositoryPath: string): Promise<void> {
    this.previews.clear();
    this.consumedApprovals.clear();
  }
  get(id: string): StoredMutationPreview | undefined {
    const value = this.previews.get(id);
    return value ? structuredClone(value) : undefined;
  }
  async put(value: StoredMutationPreview): Promise<void> {
    this.previews.set(value.previewId, structuredClone(value));
    this.consumedApprovals.set(value.previewId, new Set());
  }
  async consumeApproval(id: string, approvalDigest: string): Promise<boolean> {
    const consumed = this.consumedApprovals.get(id);
    if (!consumed || consumed.has(approvalDigest)) return false;
    consumed.add(approvalDigest);
    return true;
  }
  async delete(id: string): Promise<void> {
    this.previews.delete(id);
    this.consumedApprovals.delete(id);
  }
  async close(): Promise<void> {
    this.previews.clear();
    this.consumedApprovals.clear();
  }
}

export type FileMutationPreviewStoreOptions = {
  stateRoot: string;
  maxEntries?: number;
  maxBytes?: number;
};

type PreviewRecord = {
  schemaVersion: 2;
  repositoryPath: string;
  preview: StoredMutationPreview;
  consumedApprovalDigests: string[];
};

const key = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const validId = (value: string): boolean =>
  /^preview_[0-9a-f-]{36}$/u.test(value);
const validDigest = (value: string): boolean => /^[0-9a-f]{64}$/u.test(value);
const approvalMarkerName = (previewId: string, approvalDigest: string): string =>
  `${previewId}.${approvalDigest}.used`;
const approvalMarkerPattern =
  /^(preview_[0-9a-f-]{36})\.([0-9a-f]{64})\.used$/u;

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function durableReplace(
  directory: string,
  target: string,
  temporary: string,
  content: string,
): Promise<void> {
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
  await syncDirectory(directory);
}

export class FileMutationPreviewStore extends MemoryMutationPreviewStore {
  private repositoryPath = "";
  private directory = "";

  constructor(private readonly options: FileMutationPreviewStoreOptions) {
    super();
  }

  override async open(repositoryPath: string): Promise<void> {
    await super.open(repositoryPath);
    this.repositoryPath = await realpath(repositoryPath);
    const stateMetadata = await lstat(this.options.stateRoot);
    if (stateMetadata.isSymbolicLink() || !stateMetadata.isDirectory()) {
      throw new Error("Mutation preview state root must be a real directory.");
    }
    const stateRoot = await realpath(this.options.stateRoot);
    this.directory = path.resolve(
      stateRoot,
      "code-intel-previews",
      key(this.repositoryPath),
    );
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!await this.insideStateRoot(stateRoot, this.directory)) {
      throw new Error("Mutation preview directory escaped the state root.");
    }
    await chmod(this.directory, 0o700);
    const directoryEntries = await readdir(this.directory, {
      withFileTypes: true,
    });
    for (const entry of directoryEntries) {
      if (entry.isFile() && entry.name.startsWith(".") && entry.name.endsWith(".tmp")) {
        await rm(path.join(this.directory, entry.name), { force: true });
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = path.join(this.directory, entry.name);
      try {
        const metadata = await lstat(filePath);
        if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > 10 * 1024 * 1024) {
          await rm(filePath, { force: true });
          continue;
        }
        const record = JSON.parse(await readFile(filePath, "utf8")) as PreviewRecord;
        if (
          record.schemaVersion !== 2 ||
          record.repositoryPath !== this.repositoryPath ||
          !validId(record.preview?.previewId ?? "") ||
          entry.name !== `${record.preview.previewId}.json` ||
          Date.parse(record.preview.expiresAt) <= Date.now() ||
          !this.validPreview(record.preview) ||
          !Array.isArray(record.consumedApprovalDigests)
        ) {
          await rm(filePath, { force: true });
          continue;
        }
        this.previews.set(record.preview.previewId, record.preview);
        this.consumedApprovals.set(
          record.preview.previewId,
          new Set(record.consumedApprovalDigests.filter((value) =>
            typeof value === "string" && /^[0-9a-f]{64}$/u.test(value)
          )),
        );
      } catch {
        await rm(filePath, { force: true });
      }
    }
    for (const entry of directoryEntries) {
      const match = entry.isFile()
        ? approvalMarkerPattern.exec(entry.name)
        : null;
      if (!match) continue;
      const [, previewId, approvalDigest] = match;
      const consumed = this.consumedApprovals.get(previewId!);
      if (!consumed) {
        await rm(path.join(this.directory, entry.name), { force: true });
        continue;
      }
      consumed.add(approvalDigest!);
    }
    await this.enforceBounds();
  }

  override async put(preview: StoredMutationPreview): Promise<void> {
    if (!this.directory || !validId(preview.previewId) || !this.validPreview(preview)) {
      throw new Error("Mutation preview store is not open or the preview id is invalid.");
    }
    const serialized = this.serialize(preview, []);
    if (Buffer.byteLength(serialized) > (this.options.maxBytes ?? 10 * 1024 * 1024)) {
      throw new Error("Mutation preview exceeds the durable store byte limit.");
    }
    const target = path.join(this.directory, `${preview.previewId}.json`);
    const temporary = path.join(this.directory, `.${preview.previewId}-${randomUUID()}.tmp`);
    await durableReplace(this.directory, target, temporary, serialized);
    await super.put(preview);
    await this.enforceBounds();
  }

  override async consumeApproval(
    previewId: string,
    approvalDigest: string,
  ): Promise<boolean> {
    if (!validDigest(approvalDigest)) return false;
    const preview = this.previews.get(previewId);
    const consumed = this.consumedApprovals.get(previewId);
    if (!preview || !consumed || consumed.has(approvalDigest)) return false;
    const marker = path.join(
      this.directory,
      approvalMarkerName(previewId, approvalDigest),
    );
    let handle;
    try {
      handle = await open(marker, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
    try {
      await handle.writeFile(
        `${JSON.stringify({
          schemaVersion: 1,
          repositoryPath: this.repositoryPath,
          previewId,
          approvalDigest,
          consumedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(marker, { force: true });
      throw error;
    }
    await handle.close();
    await syncDirectory(this.directory);
    consumed.add(approvalDigest);
    return true;
  }

  override async delete(previewId: string): Promise<void> {
    await super.delete(previewId);
    if (this.directory && validId(previewId)) {
      await rm(path.join(this.directory, `${previewId}.json`), { force: true });
      for (const entry of await readdir(this.directory)) {
        if (
          entry.startsWith(`${previewId}.`) &&
          approvalMarkerPattern.test(entry)
        ) {
          await rm(path.join(this.directory, entry), { force: true });
        }
      }
      await syncDirectory(this.directory);
    }
  }

  private async enforceBounds(): Promise<void> {
    const markerBytes = new Map<string, number>();
    for (const entry of await readdir(this.directory, { withFileTypes: true })) {
      const match = entry.isFile()
        ? approvalMarkerPattern.exec(entry.name)
        : null;
      if (!match) continue;
      const filePath = path.join(this.directory, entry.name);
      markerBytes.set(
        match[1]!,
        (markerBytes.get(match[1]!) ?? 0) + (await stat(filePath)).size,
      );
    }
    const entries = await Promise.all([...this.previews.values()].map(async (preview) => {
      const filePath = path.join(this.directory, `${preview.previewId}.json`);
      return {
        preview,
        size:
          (await stat(filePath)).size +
          (markerBytes.get(preview.previewId) ?? 0),
      };
    }));
    entries.sort((a, b) => Date.parse(a.preview.expiresAt) - Date.parse(b.preview.expiresAt));
    let bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    const maxBytes = this.options.maxBytes ?? 10 * 1024 * 1024;
    while (entries.length > (this.options.maxEntries ?? 128) || bytes > maxBytes) {
      const removed = entries.shift();
      if (!removed) break;
      bytes -= removed.size;
      await this.delete(removed.preview.previewId);
    }
  }

  private serialize(
    preview: StoredMutationPreview,
    consumedApprovalDigests: string[],
  ): string {
    return `${JSON.stringify({
      schemaVersion: 2,
      repositoryPath: this.repositoryPath,
      preview,
      consumedApprovalDigests,
    } satisfies PreviewRecord)}\n`;
  }

  private validPreview(preview: StoredMutationPreview): boolean {
    if (
      !preview ||
      !Array.isArray(preview.files) ||
      !Array.isArray(preview.affectedFiles) ||
      preview.files.length === 0 ||
      preview.previewDigest !== computeMutationPreviewDigest(preview)
    ) return false;
    return JSON.stringify(preview.affectedFiles) === JSON.stringify(
      preview.files.map(({ content: _content, ...file }) => file),
    );
  }

  private async insideStateRoot(root: string, candidate: string): Promise<boolean> {
    const resolved = await realpath(candidate);
    const relative = path.relative(root, resolved);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }
}
