import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { watch, type FSWatcher } from "chokidar";

import { LspRuntimeError } from "./types.js";

export type WorkspaceChangeSource =
  | "external_watcher"
  | "orynt_mutation"
  | "initial_read";

export type WorkspaceDocumentRevision = {
  path: string;
  revision: number;
  contentHash?: string;
  content?: string;
  deleted: boolean;
  source: WorkspaceChangeSource;
};

export type WorkspaceRevisionSnapshot = {
  revision: number;
  contentHash: string;
  dirty: boolean;
};

type WorkspaceRevisionSubscriber = (
  event: WorkspaceDocumentRevision,
) => Promise<void>;

function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function relativeInside(root: string, candidate: string): string | undefined {
  const relative = path.relative(root, candidate);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    /(^|[/\\])(?:\.git|node_modules|dist)([/\\]|$)/u.test(relative)
  ) {
    return undefined;
  }
  return relative.replaceAll("\\", "/");
}

/**
 * One repository-scoped source of truth for filesystem revisions.
 *
 * Language sessions keep their own LSP document versions, but every session
 * observes changes through this authority and therefore shares one revision
 * number and deterministic content-hash domain.
 */
export class WorkspaceRevisionAuthority {
  private readonly documents = new Map<string, WorkspaceDocumentRevision>();
  private readonly subscribers = new Set<WorkspaceRevisionSubscriber>();
  private readonly events = new EventEmitter();
  private watcher?: FSWatcher;
  private tail: Promise<void> = Promise.resolve();
  private revision = 1;
  private closed = false;

  private constructor(readonly root: string) {}

  static async open(repositoryPath: string): Promise<WorkspaceRevisionAuthority> {
    const authority = new WorkspaceRevisionAuthority(
      await realpath(repositoryPath),
    );
    authority.watcher = watch(authority.root, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 40, pollInterval: 10 },
      ignored: [
        /(^|[/\\])\.git([/\\]|$)/u,
        /(^|[/\\])node_modules([/\\]|$)/u,
        /(^|[/\\])dist([/\\]|$)/u,
      ],
    });
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        authority.watcher?.off("error", failed);
        resolve();
      };
      const failed = (error: unknown) => {
        authority.watcher?.off("ready", ready);
        reject(error);
      };
      authority.watcher!.once("ready", ready);
      authority.watcher!.once("error", failed);
    });
    authority.watcher.on("all", (event, filePath) => {
      if (authority.closed) return;
      authority.tail = authority.tail
        .then(() =>
          authority.recordFilesystemEvent(
            event,
            path.resolve(filePath),
            "external_watcher",
          )
        )
        .catch(() => undefined);
    });
    return authority;
  }

  subscribe(subscriber: WorkspaceRevisionSubscriber): () => void {
    this.assertOpen();
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  async observeFile(
    relativeOrAbsolutePath: string,
  ): Promise<WorkspaceDocumentRevision> {
    this.assertOpen();
    await this.tail;
    const filePath = await this.safeExistingFile(relativeOrAbsolutePath);
    const content = await readFile(filePath, "utf8");
    const relative = relativeInside(this.root, filePath)!;
    const current = this.documents.get(relative);
    const contentHash = digest(content);
    if (current?.contentHash === contentHash && !current.deleted) {
      return structuredClone(current);
    }
    if (current) {
      this.revision += 1;
    }
    const observed: WorkspaceDocumentRevision = {
      path: relative,
      revision: this.revision,
      contentHash,
      content,
      deleted: false,
      source: "initial_read",
    };
    this.documents.set(relative, observed);
    if (current) {
      await this.notify(observed);
      this.events.emit("revision", this.revision);
    }
    return structuredClone(observed);
  }

  async publishMutation(
    changes: Array<{ path: string; content?: string; deleted?: boolean }>,
  ): Promise<number> {
    this.assertOpen();
    await this.tail;
    if (changes.length === 0) return this.revision;
    const ordered = [...changes].sort((left, right) =>
      left.path.localeCompare(right.path)
    );
    const effective: Array<{
      relative: string;
      content?: string;
      deleted: boolean;
    }> = [];
    for (const change of ordered) {
      const absolute = path.resolve(this.root, change.path);
      const relative = relativeInside(this.root, absolute);
      if (!relative) {
        throw new LspRuntimeError(
          "OUTSIDE_WORKSPACE",
          "Mutation event escaped the workspace boundary.",
          false,
          { path: change.path },
        );
      }
      const deleted = change.deleted === true;
      const current = this.documents.get(relative);
      const contentHash =
        deleted || change.content === undefined
          ? undefined
          : digest(change.content);
      if (
        current &&
        current.deleted === deleted &&
        current.contentHash === contentHash
      ) {
        continue;
      }
      effective.push({
        relative,
        ...(change.content === undefined ? {} : { content: change.content }),
        deleted,
      });
    }
    if (effective.length === 0) return this.revision;
    this.revision += 1;
    const revision = this.revision;
    for (const change of effective) {
      const event: WorkspaceDocumentRevision = {
        path: change.relative,
        revision,
        ...(change.deleted || change.content === undefined
          ? {}
          : {
              content: change.content,
              contentHash: digest(change.content),
            }),
        deleted: change.deleted,
        source: "orynt_mutation",
      };
      this.documents.set(change.relative, event);
      await this.notify(event);
    }
    this.events.emit("revision", revision);
    return revision;
  }

  async idle(): Promise<void> {
    await this.tail;
  }

  currentRevision(): number {
    return this.revision;
  }

  snapshot(): WorkspaceRevisionSnapshot {
    const documents = [...this.documents.values()]
      .map(({ path: filePath, contentHash, deleted }) => ({
        path: filePath,
        contentHash: contentHash ?? null,
        deleted,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    return {
      revision: this.revision,
      contentHash: createHash("sha256")
        .update(JSON.stringify({ revision: this.revision, documents }))
        .digest("hex"),
      dirty: this.revision > 1,
    };
  }

  async waitForRevision(minimum: number, timeoutMs = 2_000): Promise<number> {
    if (this.revision >= minimum) return this.revision;
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Workspace revision ${minimum} was not observed.`));
      }, timeoutMs);
      timer.unref();
      const onRevision = (revision: number) => {
        if (revision < minimum) return;
        cleanup();
        resolve(revision);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.events.off("revision", onRevision);
      };
      this.events.on("revision", onRevision);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.watcher?.close();
    await this.tail;
    this.subscribers.clear();
    this.events.removeAllListeners();
  }

  private async recordFilesystemEvent(
    eventName: string,
    absolutePath: string,
    source: WorkspaceChangeSource,
  ): Promise<void> {
    const relative = relativeInside(this.root, absolutePath);
    if (!relative) return;
    let content: string | undefined;
    let deleted = eventName === "unlink";
    if (!deleted) {
      try {
        content = await readFile(absolutePath, "utf8");
      } catch {
        deleted = true;
      }
    }
    const contentHash = content === undefined ? undefined : digest(content);
    const previous = this.documents.get(relative);
    if (
      previous &&
      previous.deleted === deleted &&
      previous.contentHash === contentHash
    ) {
      return;
    }
    this.revision += 1;
    const revision = this.revision;
    const event: WorkspaceDocumentRevision = {
      path: relative,
      revision,
      ...(content === undefined ? {} : { content, contentHash }),
      deleted,
      source,
    };
    this.documents.set(relative, event);
    await this.notify(event);
    this.events.emit("revision", revision);
  }

  private async notify(event: WorkspaceDocumentRevision): Promise<void> {
    await Promise.allSettled(
      [...this.subscribers].map((subscriber) =>
        subscriber(structuredClone(event))
      ),
    );
  }

  private async safeExistingFile(input: string): Promise<string> {
    const candidate = path.resolve(this.root, input);
    const resolved = await realpath(candidate);
    if (!relativeInside(this.root, resolved)) {
      throw new LspRuntimeError(
        "OUTSIDE_WORKSPACE",
        "Code-intelligence path escaped the workspace boundary.",
        false,
      );
    }
    return resolved;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Workspace revision authority is closed.");
  }
}
