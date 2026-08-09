import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type {
  DesktopCommand,
  DesktopCommandArguments,
} from "@codepawl/ipc-contracts";
import { atomicWriteFileDurable } from "@codepawl/local-state";

type JsonObject = Record<string, unknown>;
type Operation = (request: JsonObject) => Promise<unknown>;

export type DesktopRuntimeOptions = {
  dataRoot: string;
  repositoryRoot: string;
  runtimeSkillRoot: string;
  repositoryOperation: (
    request: JsonObject,
    hooks?: { onRunEvent?: (event: unknown) => void },
  ) => Promise<unknown>;
  memoryOperation: Operation;
  skillOperation: Operation;
  emitRunEvent?: (event: unknown) => void;
  environment?: NodeJS.ProcessEnv;
};

const defaultSettings = () => ({
  workspaceId: "workspace-local-alpha",
  permissionMode: "safe",
  thinkingEffort: "medium",
  executableSurfaces: ["repository"],
  blockedSurfaces: ["browser", "desktop", "files", "terminal"],
  defaultRepositoryPath: "",
  welcomeCompleted: false,
  modelConnection: null,
  modelConnections: [],
  modelTierConfiguration: null,
  capabilityRuntime: {
    schemaVersion: 1,
    enabledCapabilityIds: ["coding-apprentice"],
    defaultCapabilityId: "coding-apprentice",
  },
  codexConnection: null,
  retentionPolicy: {
    runHistoryDays: 30,
    artifactRetentionDays: 14,
    cleanupEnabled: false,
    summary: "Run history is retained for 30 days and artifacts for 14 days.",
  },
  operatorProfile: { fullName: "", callSign: "", workType: "engineering" },
  uiPreferences: {
    appearance: "system",
    chatFont: "orynt-sans",
    motion: "system",
    showMessageBlockMeta: false,
  },
  voicePreferences: { language: "english", style: "precise", speed: "normal" },
});

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("desktop command input must be an object");
  }
  return value as JsonObject;
}

function inputOf(args: DesktopCommandArguments): JsonObject {
  return object(args.input ?? args);
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function executableOnPath(name: string, environment: NodeJS.ProcessEnv): boolean {
  const paths = (environment.PATH ?? "").split(path.delimiter).filter(Boolean);
  return paths.some((entry) => existsSync(path.join(entry, name)));
}

function executablePath(name: string, environment: NodeJS.ProcessEnv): string | null {
  const paths = (environment.PATH ?? "").split(path.delimiter).filter(Boolean);
  return paths.map((entry) => path.join(entry, name)).find(existsSync) ?? null;
}

async function readJson<T>(filePath: string, fallback: () => T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback();
    }
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await atomicWriteFileDurable(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function mergeSettings(current: JsonObject, update: JsonObject): JsonObject {
  const nested = ["retentionPolicy", "operatorProfile", "uiPreferences", "voicePreferences"];
  const next = { ...current, ...update };
  for (const key of nested) {
    if (update[key] && typeof update[key] === "object" && !Array.isArray(update[key])) {
      next[key] = { ...(current[key] as JsonObject), ...(update[key] as JsonObject) };
    }
  }
  const retention = next.retentionPolicy as JsonObject;
  if (retention) {
    retention.summary = `Run history is retained for ${retention.runHistoryDays} days and artifacts for ${retention.artifactRetentionDays} days.`;
  }
  return next;
}

export class DesktopRuntime {
  readonly dataRoot: string;
  readonly repositoryRoot: string;
  readonly runtimeSkillRoot: string;
  readonly memoryRoot: string;
  readonly stateRoot: string;
  readonly runsRoot: string;
  readonly skillStateRoot: string;
  readonly userSkillRoot: string;
  private readonly options: DesktopRuntimeOptions;
  private skillQueue: Promise<void> = Promise.resolve();

  constructor(options: DesktopRuntimeOptions) {
    this.options = options;
    this.dataRoot = path.resolve(options.dataRoot);
    this.repositoryRoot = path.resolve(options.repositoryRoot);
    this.runtimeSkillRoot = path.resolve(options.runtimeSkillRoot);
    this.memoryRoot = path.join(this.dataRoot, "memory");
    this.stateRoot = path.join(this.memoryRoot, "desktop-runtime");
    this.runsRoot = path.join(this.dataRoot, "runs");
    this.skillStateRoot = path.join(this.dataRoot, "skills");
    this.userSkillRoot = path.join(this.dataRoot, "agent-skills");
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.dataRoot, { recursive: true }),
      mkdir(this.runsRoot, { recursive: true }),
      mkdir(this.memoryRoot, { recursive: true }),
      mkdir(this.skillStateRoot, { recursive: true }),
      mkdir(this.userSkillRoot, { recursive: true }),
    ]);
  }

  private settingsPath(): string {
    return path.join(this.dataRoot, "settings-v1.json");
  }

  private runPath(runId: string): string {
    if (!/^run-[a-z0-9][a-z0-9-]{2,127}$/i.test(runId)) throw new Error("runId is invalid");
    return path.join(this.runsRoot, `${runId}.json`);
  }

  private async settings(): Promise<JsonObject> {
    const settings = await readJson<JsonObject>(this.settingsPath(), defaultSettings);
    const override = this.options.environment?.ORYNT_REPOSITORY_PATH?.trim();
    return override ? { ...settings, defaultRepositoryPath: override } : settings;
  }

  private async repositoryPath(raw: unknown): Promise<string> {
    const requested = typeof raw === "string" && raw.trim()
      ? raw.trim()
      : String((await this.settings()).defaultRepositoryPath ?? "");
    if (!requested) throw new Error("Choose a repository before continuing.");
    const resolved = await realpath(requested);
    const details = await stat(resolved);
    if (!details.isDirectory() || path.parse(resolved).root === resolved) {
      throw new Error("Repository path must be a non-root directory.");
    }
    await access(path.join(resolved, ".git"));
    return resolved;
  }

  private async repositoryRequest(input: JsonObject, operation: string): Promise<JsonObject> {
    const settings = await this.settings();
    const repositoryPath = await this.repositoryPath(input.repositoryPath);
    return {
      ...input,
      operation,
      repositoryPath,
      workspaceId: input.workspaceId ?? settings.workspaceId,
      memoryRoot: this.memoryRoot,
      stateRoot: this.stateRoot,
      sandboxRoot: path.join(this.dataRoot, "sandboxes"),
      artifactRoot: path.join(this.dataRoot, "artifacts"),
      modelConnection: settings.modelConnection,
      modelConnections: settings.modelConnections,
      modelTierConfiguration: settings.modelTierConfiguration,
      thinkingEffort: settings.thinkingEffort,
    };
  }

  private emit(event: unknown): void {
    this.options.emitRunEvent?.(event);
  }

  private async repositoryOperation(request: JsonObject): Promise<unknown> {
    return this.options.repositoryOperation(request, { onRunEvent: (event) => this.emit(event) });
  }

  private async persistRun(input: JsonObject, output: JsonObject): Promise<void> {
    const now = new Date().toISOString();
    const runId = stringValue(output.runId, "runId");
    await writeJson(this.runPath(runId), {
      ...output,
      runId,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      goal: input.goal,
      repositoryPath: input.repositoryPath,
      createdAt: now,
      updatedAt: now,
    });
  }

  private modelPreflight(input: JsonObject): JsonObject {
    const environment = this.options.environment ?? process.env;
    const providerId = String(input.providerId ?? "codex-cli");
    const checkedAt = new Date().toISOString();
    if (providerId === "openai-api") {
      const envKey = typeof input.envKey === "string" && input.envKey.trim()
        ? input.envKey.trim()
        : "OPENAI_API_KEY";
      const ready = Boolean(environment[envKey]?.trim());
      return {
        checkedProviderId: providerId,
        checkedModelId: String(input.modelId ?? ""),
        status: ready ? "ready" : "authRequired",
        ready,
        checkedAt,
        executablePath: null,
        authMode: "apiKeyEnv",
        reasons: ready ? [] : [`${envKey} is not set in the Orynt process environment.`],
        warnings: [],
      };
    }
    const installedPath = executablePath(
      process.platform === "win32" ? "codex.exe" : "codex",
      environment,
    );
    return {
      checkedProviderId: "codex-cli",
      checkedModelId: String(input.modelId ?? ""),
      status: installedPath ? "ready" : "missing",
      ready: Boolean(installedPath),
      checkedAt,
      executablePath: installedPath,
      authMode: "codexCliSession",
      reasons: installedPath ? [] : ["Codex CLI was not found on PATH."],
      warnings: installedPath
        ? ["Executable discovery passed; Codex verifies session authentication when a run starts."]
        : [],
    };
  }

  private async listModels(input: JsonObject): Promise<JsonObject> {
    const providerId = String(input.providerId ?? "");
    if (providerId !== "openai-api") {
      return {
        providerId: "codex-cli",
        fetchedAt: new Date().toISOString(),
        source: "live",
        models: [],
        warnings: ["Codex CLI owns model discovery; enter an exact supported model ID."],
      };
    }
    const envKey = typeof input.envKey === "string" && input.envKey.trim()
      ? input.envKey.trim()
      : "OPENAI_API_KEY";
    const token = (this.options.environment ?? process.env)[envKey];
    if (!token) throw new Error(`${envKey} is not set in the Orynt process environment.`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OpenAI model discovery failed (${response.status}).`);
      const payload = object(await response.json());
      const models = (Array.isArray(payload.data) ? payload.data : [])
        .map((entry) => object(entry))
        .filter((entry) => typeof entry.id === "string")
        .map((entry) => ({
          id: entry.id,
          label: entry.id,
          ownedBy: entry.owned_by ?? null,
          source: "openai-api",
        }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
      return {
        providerId,
        fetchedAt: new Date().toISOString(),
        source: "live",
        models,
        warnings: [],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async memory(operation: string, args: DesktopCommandArguments): Promise<unknown> {
    return this.options.memoryOperation({
      operation,
      memoryRoot: this.memoryRoot,
      input: inputOf(args),
    });
  }

  private async skill(operation: string, args: DesktopCommandArguments): Promise<unknown> {
    const pending = this.skillQueue.then(() => this.options.skillOperation({
        operation,
        input: inputOf(args),
        managerRoot: this.skillStateRoot,
        userSkillRoot: this.userSkillRoot,
        runtimeSkillRoot: this.runtimeSkillRoot,
      }));
    this.skillQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async hasActiveRuns(): Promise<boolean> {
    const entries = await readdir(this.runsRoot).catch(() => []);
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      const run = await readJson<JsonObject>(path.join(this.runsRoot, entry), () => ({}));
      if (!["completed", "blocked", "failed", "cancelled"].includes(String(run.status))) return true;
    }
    return false;
  }

  async execute(command: DesktopCommand, args: DesktopCommandArguments = {}): Promise<unknown> {
    await this.initialize();
    const input = inputOf(args);
    switch (command) {
      case "settings_get":
        return this.settings();
      case "settings_update": {
        const current = await this.settings();
        const next = mergeSettings(current, input);
        await writeJson(this.settingsPath(), next);
        return next;
      }
      case "repository_detect_current_path": {
        const candidate = this.options.environment?.ORYNT_REPOSITORY_PATH ?? process.cwd();
        return this.repositoryPath(candidate).catch(() => null);
      }
      case "prompt_understand":
        return this.repositoryOperation(await this.repositoryRequest(input, "understand_prompt"));
      case "run_create": {
        const request = await this.repositoryRequest(input, "plan_and_start");
        const output = object(await this.repositoryOperation(request));
        await this.persistRun(request, output);
        for (const event of Array.isArray(output.events) ? output.events : []) this.emit(event);
        return output;
      }
      case "run_list": {
        const entries = await readdir(this.runsRoot);
        const runs = await Promise.all(entries.filter((name) => name.endsWith(".json")).map(
          (name) => readJson<JsonObject>(path.join(this.runsRoot, name), () => ({})),
        ));
        return runs.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      }
      case "run_open":
        return readJson(this.runPath(stringValue(args.runId, "runId")), () => {
          throw new Error("run was not found");
        });
      case "run_status":
      case "run_recover":
      case "run_mark_failed":
      case "run_cancel":
      case "approval_respond": {
        const operation = command === "run_status" ? "status"
          : command === "run_recover" ? "recover"
          : command === "run_mark_failed" ? "mark_failed"
          : command === "run_cancel" ? "cancel"
          : "resume";
        const request: JsonObject = {
          ...input,
          operation,
          memoryRoot: this.memoryRoot,
          stateRoot: this.stateRoot,
        };
        if (command === "approval_respond") {
          request.decision = input.decision === "approved" ? "approved" : "rejected";
        }
        const output = object(await this.repositoryOperation(request));
        const stored = await readJson<JsonObject>(this.runPath(String(output.runId)), () => ({}));
        await writeJson(this.runPath(String(output.runId)), { ...stored, ...output, updatedAt: new Date().toISOString() });
        return output;
      }
      case "artifact_list": {
        const run = object(await this.execute("run_open", { runId: args.runId }));
        return run.artifacts ?? [];
      }
      case "artifact_read": {
        const run = object(await this.execute("run_open", { runId: input.runId }));
        const artifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
        const artifact = artifacts.find((value) => object(value).id === input.artifactId);
        if (!artifact) throw new Error("artifact was not found");
        const artifactPath = await realpath(stringValue(object(artifact).path, "artifact path"));
        const root = await realpath(stringValue(run.artifactRoot, "artifact root"));
        if (artifactPath !== root && !artifactPath.startsWith(`${root}${path.sep}`)) {
          throw new Error("artifact escaped its managed root");
        }
        const details = await stat(artifactPath);
        if (details.size > 1_048_576) throw new Error("artifact is too large to display");
        return { ...object(artifact), content: await readFile(artifactPath, "utf8") };
      }
      case "memory_list_episodes": return this.memory("episode.list", args);
      case "memory_list_candidate_rules": return this.memory("rule.list", args);
      case "memory_update_candidate_rule_status": return this.memory("rule.status", args);
      case "memory_list_semantic": return this.memory("semantic.list", args);
      case "memory_update_semantic_status": return this.memory("semantic.status", args);
      case "memory_edit_semantic": return this.memory("semantic.edit", args);
      case "memory_delete_semantic": return this.memory("semantic.delete", args);
      case "memory_restore_semantic": return this.memory("semantic.restore", args);
      case "memory_purge_semantic": return this.memory("semantic.purge", args);
      case "memory_retrieve": return this.memory("memory.retrieve", args);
      case "memory_summary": return this.memory("summary", args);
      case "memory_snapshot": return this.memory("snapshot", args);
      case "skill_list": {
        const snapshot = object(await this.skill("learned.list", args));
        return snapshot.skills ?? [];
      }
      case "skill_snapshot": return this.skill("learned.list", args);
      case "skill_create_candidate": return this.skill("learned.create", args);
      case "skill_promote_manual":
      case "skill_reject":
      case "skill_supersede":
      case "skill_archive":
        return this.skill("learned.status", {
          ...args,
          input: {
            ...input,
            decision: command.replace("skill_", "").replace("_manual", ""),
          },
        });
      case "skill_create_replay_plan": return this.skill("learned.replay", args);
      case "skill_inventory_scan": return this.skill("inventory.scan", args);
      case "skill_inventory_list": return this.skill("inventory.list", args);
      case "skill_inventory_get": return this.skill("inventory.get", args);
      case "skill_hub_list_sources": return this.skill("hub.listSources", args);
      case "skill_hub_refresh": return this.skill("hub.refresh", args);
      case "skill_hub_search": return this.skill("hub.search", args);
      case "skill_hub_get": return this.skill("hub.get", args);
      case "skill_mutation_plan": return this.skill("mutation.plan", args);
      case "skill_mutation_approve": return this.skill("mutation.approve", args);
      case "skill_mutation_execute": return this.skill("mutation.execute", args);
      case "skill_mutation_history": return this.skill("mutation.history", args);
      case "skill_mutation_recover": return this.skill("mutation.recover", args);
      case "skill_context_snapshot": return this.skill("context.snapshot", args);
      case "trace_export":
        return `trace://local-alpha/${stringValue(args.runId, "runId")}`;
      case "codex_connection_save": {
        const settings = await this.settings();
        const connection = {
          connectionId: input.connectionId ?? "codex-cli",
          label: input.label ?? "Local Codex CLI",
          status: "authRequired",
          lastPreflight: null,
        };
        await writeJson(this.settingsPath(), { ...settings, codexConnection: connection });
        return connection;
      }
      case "codex_connection_preflight": {
        const installed = executableOnPath(
          process.platform === "win32" ? "codex.exe" : "codex",
          this.options.environment ?? process.env,
        );
        return {
          checkedConnectionId: "codex-cli",
          status: installed ? "ready" : "missing",
          ready: installed,
          checkedAt: new Date().toISOString(),
          executablePath: executablePath(
            process.platform === "win32" ? "codex.exe" : "codex",
            this.options.environment ?? process.env,
          ),
          authMode: "codexCliSession",
          reasons: installed ? [] : ["Codex CLI was not found on PATH."],
          warnings: installed
            ? ["Codex verifies the current login session when a run starts."]
            : [],
        };
      }
      case "codex_connection_login": {
        const executable = executablePath(
          process.platform === "win32" ? "codex.exe" : "codex",
          this.options.environment ?? process.env,
        );
        if (!executable) throw new Error("Codex CLI was not found on PATH.");
        const method = input.method === "deviceCode" ? "deviceCode" : "browser";
        const commandArgs = method === "deviceCode" ? ["login", "--device-auth"] : ["login"];
        const child = spawn(executable, commandArgs, {
          detached: true,
          stdio: "ignore",
          shell: false,
          env: this.options.environment ?? process.env,
        });
        child.unref();
        return {
          method,
          command: `codex ${commandArgs.join(" ")}`,
          message: "Codex login opened outside Orynt. Return here and run the connection check.",
          loginUrl: null,
        };
      }
      case "codex_connection_delete": {
        const settings = await this.settings();
        await writeJson(this.settingsPath(), { ...settings, codexConnection: null });
        return undefined;
      }
      case "model_connection_save": {
        const settings = await this.settings();
        const connection = {
          ...input,
          connectionId: input.connectionId ?? randomUUID(),
          status: "ready",
          lastPreflight: null,
        };
        const connections = [
          ...(Array.isArray(settings.modelConnections) ? settings.modelConnections : []).filter(
            (value) => object(value).connectionId !== connection.connectionId,
          ),
          connection,
        ];
        await writeJson(this.settingsPath(), { ...settings, modelConnection: connection, modelConnections: connections });
        return connection;
      }
      case "model_provider_preflight":
        return this.modelPreflight(input);
      case "model_connection_preflight": {
        const settings = await this.settings();
        if (!settings.modelConnection) throw new Error("Choose a provider and model before running the provider check.");
        const result = this.modelPreflight(object(settings.modelConnection));
        const connection = { ...object(settings.modelConnection), status: result.status, lastPreflight: result };
        await writeJson(this.settingsPath(), { ...settings, modelConnection: connection });
        return result;
      }
      case "model_connection_list_models":
        return this.listModels(input);
      case "model_connection_delete": {
        const settings = await this.settings();
        await writeJson(this.settingsPath(), { ...settings, modelConnection: null });
        return undefined;
      }
      case "codex_execution_approve":
      case "codex_execution_blocked_preview": {
        const runId = stringValue(input.runId, "runId");
        const checkpoint = await readJson<JsonObject>(
          path.join(this.stateRoot, "runs", runId, "checkpoint.json"),
          () => { throw new Error("active repository checkpoint was not found"); },
        );
        const approval = object(checkpoint.approval);
        if (command === "codex_execution_approve") {
          const output = object(await this.repositoryOperation({
            operation: "resume",
            runId,
            approvalId: approval.id,
            approvalNonce: approval.nonce,
            expectedRevision: checkpoint.revision,
            decision: "approved",
            memoryRoot: this.memoryRoot,
            stateRoot: this.stateRoot,
          }));
          const stored = await readJson<JsonObject>(this.runPath(runId), () => ({}));
          await writeJson(this.runPath(runId), { ...stored, ...output, updatedAt: new Date().toISOString() });
          return output;
        }
        return {
          runId,
          planId: input.planId ?? approval.planId ?? `codex-execution-plan-${runId}`,
          status: "blocked",
          command: "codex exec --json --ephemeral --sandbox workspace-write",
          contractArtifact: "",
          artifactRoot: checkpoint.artifactRoot ?? "",
          blockedReasons: ["Execution has not been approved."],
          approvalRequired: true,
          resultReady: false,
          verificationSeparate: true,
          summary: "Codex execution is blocked pending operator approval.",
        };
      }
    }
  }
}
