import { execFile, spawn } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { AgentFunctionTool, AgentToolCall, AgentToolResult } from "./index.js";

const execFileAsync = promisify(execFile);
const MAX_TOOL_OUTPUT = 32_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const SENSITIVE_PATH = /(^|\/)(?:\.env(?:\..*)?|\.npmrc|auth\.json|credentials?|secrets?|[^/]*\.(?:key|pem|p12|pfx))($|\/)/i;

export type RepositoryToolExecutorOptions = {
  repositoryPath: string;
  mode: "read-only" | "workspace-write";
  protectedPaths?: string[];
  /**
   * Exact files a task-bound writer may modify with repo_apply_patch.
   * Supplying this scope also removes repo_exec because an arbitrary command
   * cannot be proven to keep its writes inside an exact path set.
   */
  allowedWritePaths?: string[];
  allowedCommands?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function bounded(value: string, max: number): string {
  if (Buffer.byteLength(value) <= max) return value;
  return `${Buffer.from(value).subarray(0, max).toString("utf8")}\n… output truncated …`;
}

function normalizeRelative(value: unknown): string {
  if (typeof value !== "string") throw new Error("path must be a string");
  const normalized = value.replaceAll("\\", "/").replace(/^\.\/+/u, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error("path must stay inside the repository");
  }
  return normalized;
}

async function runFile(
  command: string,
  args: string[],
  cwd: string,
  options: RepositoryToolExecutorOptions,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: options.maxOutputBytes ?? MAX_TOOL_OUTPUT,
      signal: options.signal,
      windowsHide: true,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const candidate = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: candidate.stdout ?? "",
      stderr: candidate.stderr ?? candidate.message,
      exitCode: typeof candidate.code === "number" ? candidate.code : 1,
    };
  }
}

export const REPOSITORY_AGENT_TOOLS: AgentFunctionTool[] = [
  {
    type: "function",
    name: "repo_list",
    description: "List repository files, optionally filtered by an rg glob.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["glob"],
      properties: { glob: { type: ["string", "null"] } },
    },
  },
  {
    type: "function",
    name: "repo_read",
    description: "Read a UTF-8 repository file with bounded output.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: { path: { type: "string" } },
    },
  },
  {
    type: "function",
    name: "repo_search",
    description: "Search repository text using a literal or regular expression.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query", "glob"],
      properties: {
        query: { type: "string" },
        glob: { type: ["string", "null"] },
      },
    },
  },
  {
    type: "function",
    name: "repo_status",
    description: "Return concise git status.",
    strict: true,
    parameters: { type: "object", additionalProperties: false, required: [], properties: {} },
  },
  {
    type: "function",
    name: "repo_diff",
    description: "Return the current repository diff.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: { path: { type: ["string", "null"] } },
    },
  },
  {
    type: "function",
    name: "repo_apply_patch",
    description: "Apply a unified git patch inside the managed worktree.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["patch"],
      properties: { patch: { type: "string" } },
    },
  },
  {
    type: "function",
    name: "repo_exec",
    description: "Run one exact, policy-allowlisted non-interactive command using a structured argv array.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["argv", "cwd"],
      properties: {
        argv: { type: "array", minItems: 1, maxItems: 64, items: { type: "string" } },
        cwd: { type: ["string", "null"] },
      },
    },
  },
];

export class RepositoryAgentToolExecutor {
  private root?: string;
  private readonly protectedPaths: Set<string>;
  private readonly allowedWritePaths?: Set<string>;

  constructor(private readonly options: RepositoryToolExecutorOptions) {
    this.protectedPaths = new Set((options.protectedPaths ?? []).map((item) => item.replaceAll("\\", "/").replace(/^\.\/+/u, "")));
    if (options.allowedWritePaths !== undefined) {
      this.allowedWritePaths = new Set(
        options.allowedWritePaths.map((item) => {
          const normalized = normalizeRelative(item);
          if (/[*?\[\]]/u.test(normalized)) {
            throw new Error("allowed write paths must be exact repository paths");
          }
          return normalized;
        }),
      );
      if (this.allowedWritePaths.size !== options.allowedWritePaths.length) {
        throw new Error("allowed write paths must be unique");
      }
    }
  }

  tools(): AgentFunctionTool[] {
    if (this.options.mode === "read-only") {
      return REPOSITORY_AGENT_TOOLS.filter((tool) => !["repo_apply_patch", "repo_exec"].includes(tool.name));
    }
    if (this.allowedWritePaths !== undefined) {
      return REPOSITORY_AGENT_TOOLS.filter((tool) => tool.name !== "repo_exec");
    }
    return REPOSITORY_AGENT_TOOLS;
  }

  async execute(call: AgentToolCall): Promise<AgentToolResult> {
    const args = record(call.arguments);
    switch (call.name) {
      case "repo_list":
        return this.list(args);
      case "repo_read":
        return this.read(args);
      case "repo_search":
        return this.search(args);
      case "repo_status":
        return this.command("git", ["status", "--short"], await this.repositoryRoot());
      case "repo_diff":
        return this.diff(args);
      case "repo_apply_patch":
        return this.applyPatch(args);
      case "repo_exec":
        return this.exec(args);
      default:
        return { output: JSON.stringify({ error: `unknown tool: ${call.name}` }), isError: true };
    }
  }

  private async repositoryRoot(): Promise<string> {
    this.root ??= await realpath(this.options.repositoryPath);
    return this.root;
  }

  private async safeExistingPath(input: unknown): Promise<string> {
    const relative = normalizeRelative(input);
    this.assertReadable(relative);
    const root = await this.repositoryRoot();
    const resolved = await realpath(path.join(root, relative));
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("resolved path escaped repository");
    return resolved;
  }

  private assertReadable(relative: string): void {
    if (SENSITIVE_PATH.test(relative)) throw new Error(`access denied for sensitive path: ${relative}`);
  }

  private assertWritable(relative: string): void {
    if (this.options.mode !== "workspace-write") throw new Error("repository tool executor is read-only");
    this.assertReadable(relative);
    if (this.isProtected(relative)) throw new Error(`write denied for protected path: ${relative}`);
    if (this.allowedWritePaths && !this.allowedWritePaths.has(relative)) {
      throw new Error(`write denied outside the task-owned path scope: ${relative}`);
    }
  }

  private isProtected(relative: string): boolean {
    return [...this.protectedPaths].some((protectedPath) =>
      relative === protectedPath || relative.startsWith(`${protectedPath}/`));
  }

  private async list(args: Record<string, unknown>): Promise<AgentToolResult> {
    const commandArgs = ["--files", "--hidden", "-g", "!.git"];
    if (typeof args.glob === "string" && args.glob.trim()) commandArgs.push("-g", args.glob.trim());
    return this.command("rg", commandArgs, await this.repositoryRoot());
  }

  private async read(args: Record<string, unknown>): Promise<AgentToolResult> {
    const file = await this.safeExistingPath(args.path);
    const stat = await lstat(file);
    if (!stat.isFile()) throw new Error("repo_read only supports regular files");
    const content = await readFile(file, "utf8");
    return { output: bounded(content, this.options.maxOutputBytes ?? MAX_TOOL_OUTPUT) };
  }

  private async search(args: Record<string, unknown>): Promise<AgentToolResult> {
    if (typeof args.query !== "string" || !args.query) throw new Error("query must be a non-empty string");
    const commandArgs = ["-n", "--hidden", "-g", "!.git"];
    if (typeof args.glob === "string" && args.glob.trim()) commandArgs.push("-g", args.glob.trim());
    commandArgs.push("--", args.query, ".");
    return this.command("rg", commandArgs, await this.repositoryRoot());
  }

  private async diff(args: Record<string, unknown>): Promise<AgentToolResult> {
    const commandArgs = ["diff", "--"];
    if (typeof args.path === "string" && args.path) {
      const relative = normalizeRelative(args.path);
      this.assertReadable(relative);
      commandArgs.push(relative);
    }
    return this.command("git", commandArgs, await this.repositoryRoot());
  }

  private async applyPatch(args: Record<string, unknown>): Promise<AgentToolResult> {
    if (this.options.mode !== "workspace-write") throw new Error("repository tool executor is read-only");
    if (typeof args.patch !== "string" || !args.patch.trim()) throw new Error("patch must be a non-empty string");
    const paths = [...args.patch.matchAll(/^(?:\+\+\+|---) [ab]\/(.+)$/gmu)].map((match) => normalizeRelative(match[1]));
    if (paths.length === 0) throw new Error("patch has no repository file headers");
    for (const relative of paths) this.assertWritable(relative);
    const root = await this.repositoryRoot();
    const checked = await this.spawnWithInput("git", ["apply", "--check", "--whitespace=nowarn", "-"], args.patch, root);
    if (checked.exitCode !== 0) return { output: JSON.stringify(checked), isError: true };
    const applied = await this.spawnWithInput("git", ["apply", "--whitespace=nowarn", "-"], args.patch, root);
    return { output: JSON.stringify(applied), isError: applied.exitCode !== 0 };
  }

  private async exec(args: Record<string, unknown>): Promise<AgentToolResult> {
    if (this.options.mode !== "workspace-write") throw new Error("repository tool executor is read-only");
    if (!Array.isArray(args.argv) || args.argv.length === 0 || args.argv.some((item) => typeof item !== "string")) {
      throw new Error("argv must be a non-empty string array");
    }
    const argv = args.argv as string[];
    const executable = argv[0];
    if (!/^[a-zA-Z0-9._+-]+$/u.test(executable)) throw new Error("executable must be a bare command name");
    const allowed = (this.options.allowedCommands ?? [])
      .map((command) => command.trim().split(/\s+/u))
      .filter((command) => command.length > 0 && command[0]);
    if (!allowed.some((command) =>
      command.length === argv.length && command.every((token, index) => token === argv[index]))) {
      throw new Error(`command is not allowlisted: ${argv.join(" ")}`);
    }
    const root = await this.repositoryRoot();
    const cwd = args.cwd === null || args.cwd === undefined
      ? root
      : await this.safeExistingPath(args.cwd);
    return this.command(executable, argv.slice(1), cwd);
  }

  private async command(command: string, args: string[], cwd: string): Promise<AgentToolResult> {
    const result = await runFile(command, args, cwd, this.options);
    return {
      output: bounded(JSON.stringify(result), this.options.maxOutputBytes ?? MAX_TOOL_OUTPUT),
      isError: result.exitCode !== 0,
    };
  }

  private spawnWithInput(
    command: string,
    args: string[],
    input: string,
    cwd: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      let stdout = "";
      let stderr = "";
      const max = this.options.maxOutputBytes ?? MAX_TOOL_OUTPUT;
      child.stdout.on("data", (chunk) => { stdout = bounded(`${stdout}${String(chunk)}`, max); });
      child.stderr.on("data", (chunk) => { stderr = bounded(`${stderr}${String(chunk)}`, max); });
      child.once("error", reject);
      child.once("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
      const timeout = setTimeout(() => {
        if (process.platform !== "win32") {
          try { process.kill(-child.pid!, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        } else {
          child.kill("SIGKILL");
        }
      }, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      child.once("close", () => clearTimeout(timeout));
      if (this.options.signal) {
        const abort = () => child.kill("SIGKILL");
        this.options.signal.addEventListener("abort", abort, { once: true });
        child.once("close", () => this.options.signal?.removeEventListener("abort", abort));
      }
      child.stdin.end(input);
    });
  }
}
