import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";

import { LspSession, type LspSessionOptions } from "./session.js";
import {
  LspAdapterRegistry,
  type LanguageServerAdapter,
} from "./adapters.js";
import type {
  LspDetectedRoot,
  LspSessionSnapshot,
} from "./types.js";

type ManagedSession = {
  key: string;
  session: LspSession;
  usedAt: number;
};

export type LspManagerOptions = {
  maxSessions?: number;
  sessionFactory?: (options: LspSessionOptions) => LspSession;
  registry?: LspAdapterRegistry;
};

export class LspManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly registry: LspAdapterRegistry;
  private closed = false;

  constructor(private readonly options: LspManagerOptions = {}) {
    this.registry = options.registry ?? new LspAdapterRegistry();
  }

  async acquireTypeScript(workspacePath: string): Promise<LspSession> {
    return await this.acquire("typescript", workspacePath);
  }

  adapters(): LanguageServerAdapter[] {
    return this.registry.list();
  }

  async detect(repositoryPath: string): Promise<LspDetectedRoot[]> {
    return await this.registry.detect(repositoryPath);
  }

  async acquire(adapterId: string, workspacePath: string): Promise<LspSession> {
    if (this.closed) throw new Error("LSP manager is closed.");
    const root = await realpath(workspacePath);
    const adapter = this.registry.get(adapterId);
    if (!adapter) throw new Error(`Unknown LSP adapter: ${adapterId}`);
    const probe = await adapter.probe(root);
    if (!["bundled", "ready", "unverified"].includes(probe.availability)) {
      throw new Error(
        probe.detail ??
          `LSP adapter ${adapterId} is ${probe.availability}.`,
      );
    }
    const command = await adapter.command(root);
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          root,
          adapter: adapterId,
          profile: command.fingerprint,
        }),
      )
      .digest("hex");
    const existing = this.sessions.get(key);
    if (
      existing &&
      ["ready", "warming"].includes(existing.session.snapshot().state)
    ) {
      existing.usedAt = Date.now();
      return existing.session;
    }
    if (existing) {
      await existing.session.close().catch(() => undefined);
      this.sessions.delete(key);
    }
    await this.evictIfNeeded();
    const sessionOptions: LspSessionOptions = {
      workspacePath: root,
      adapterId,
      command,
    };
    const session =
      this.options.sessionFactory?.(sessionOptions) ??
      new LspSession(sessionOptions);
    await session.start();
    this.sessions.set(key, { key, session, usedAt: Date.now() });
    return session;
  }

  async restart(adapterId: string): Promise<LspSessionSnapshot[]> {
    const targets = [...this.sessions.values()].filter(
      ({ session }) => session.snapshot().adapterId === adapterId,
    );
    return await Promise.all(targets.map(({ session }) => session.restart()));
  }

  async release(adapterId: string, workspacePath: string): Promise<void> {
    const root = await realpath(workspacePath);
    const targets = [...this.sessions.entries()].filter(
      ([, { session }]) => {
        const snapshot = session.snapshot();
        return snapshot.adapterId === adapterId && snapshot.workspacePath === root;
      },
    );
    for (const [key, { session }] of targets) {
      this.sessions.delete(key);
      await session.close().catch(() => undefined);
    }
  }

  snapshots(): LspSessionSnapshot[] {
    return [...this.sessions.values()].map(({ session }) => session.snapshot());
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(
      sessions.map(({ session }) => session.close().catch(() => undefined)),
    );
  }

  private async evictIfNeeded(): Promise<void> {
    const maximum = this.options.maxSessions ?? 8;
    while (this.sessions.size >= maximum) {
      const oldest = [...this.sessions.values()].sort(
        (left, right) => left.usedAt - right.usedAt,
      )[0];
      if (!oldest) return;
      this.sessions.delete(oldest.key);
      await oldest.session.close().catch(() => undefined);
    }
  }
}
