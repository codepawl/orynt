import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SkillCliManager } from "./skills.js";

type SkillSidecarResponse = {
  result?: unknown;
  events?: unknown[];
};

function repositoryRoot(): string {
  const configured = process.env.ORYNT_RUNTIME_ROOT?.trim();
  const executableRoot = path.dirname(process.execPath);
  const moduleUrl = (
    globalThis as typeof globalThis & { __oryntModuleUrl?: string }
  ).__oryntModuleUrl;
  const moduleRoot = typeof moduleUrl === "string"
    ? path.dirname(fileURLToPath(moduleUrl))
    : undefined;
  const candidates = [
    configured,
    executableRoot,
    moduleRoot,
    process.cwd(),
    moduleRoot ? path.resolve(moduleRoot, "../../..") : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const root = candidates.find((candidate) =>
    existsSync(path.join(candidate, "scripts", "desktop-skill-manager.mjs"))
  );
  if (!root) {
    throw new Error(
      "Orynt skill runtime resources are missing. Reinstall the complete CLI release.",
    );
  }
  return root;
}

export class LocalSkillCliManager implements SkillCliManager {
  constructor(private readonly stateRoot: string) {}

  private async invoke(
    operation: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const root = repositoryRoot();
    const child = Bun.spawn(
      [
        process.execPath,
        path.join(root, "scripts", "desktop-skill-manager.mjs"),
      ],
      {
        env: process.env,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    child.stdin.write(
      JSON.stringify({
        schemaVersion: 1,
        operation,
        input,
        managerRoot: path.join(this.stateRoot, "skills"),
        userSkillRoot: path.join(os.homedir(), ".agents", "skills"),
      }),
    );
    child.stdin.end();
    const [code, stdoutText, stderrText] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0) {
      throw new Error(
        stderrText.trim() ||
          stdoutText.trim() ||
          `skill manager exited with status ${code}`,
      );
    }
    try {
      const response = JSON.parse(stdoutText) as SkillSidecarResponse;
      return response.result;
    } catch (error) {
      throw new Error(
        `could not parse skill manager response: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  scan(input: Record<string, unknown>) {
    return this.invoke("inventory.scan", input);
  }

  list(input: Record<string, unknown>) {
    return this.invoke("inventory.list", input);
  }

  get(input: Record<string, unknown>) {
    return this.invoke("inventory.get", {
      ...input,
      skillId: input.id,
    });
  }

  listSources(input: Record<string, unknown>) {
    return this.invoke("hub.listSources", input);
  }

  refresh(input: Record<string, unknown>) {
    return this.invoke("hub.refresh", input);
  }

  search(input: Record<string, unknown>) {
    return this.invoke("hub.search", {
      query: input.query,
      sourceIds:
        typeof input.sourceId === "string" ? [input.sourceId] : undefined,
    });
  }

  plan(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.invoke("mutation.plan", {
      kind: input.kind,
      skillId: input.target,
      scope: input.scope,
      repositoryPath: input.repositoryPath,
      ...(input.kind === "import" ? { sourcePath: input.target } : {}),
    }) as Promise<Record<string, unknown>>;
  }

  approve(input: Record<string, unknown>) {
    return this.invoke("mutation.approve", input);
  }

  execute(input: Record<string, unknown>) {
    return this.invoke("mutation.execute", input);
  }

  history(input: Record<string, unknown>) {
    return this.invoke("mutation.history", input);
  }

  recover(input: Record<string, unknown>) {
    return this.invoke("mutation.recover", input);
  }

  snapshotContext(input: {
    repositoryPath: string;
    runId: string;
    skillIds: string[];
  }) {
    return this.invoke("context.snapshot", input);
  }
}
