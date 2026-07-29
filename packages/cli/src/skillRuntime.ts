import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SkillCliManager } from "./skills.js";

type SkillSidecarResponse = {
  result?: unknown;
  events?: unknown[];
};

function repositoryRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

export class LocalSkillCliManager implements SkillCliManager {
  constructor(private readonly stateRoot: string) {}

  private invoke(operation: string, input: Record<string, unknown>): Promise<unknown> {
    const root = repositoryRoot();
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          path.join(root, "scripts", "register-extensionless-esm-loader.mjs"),
          path.join(root, "scripts", "desktop-skill-manager.mjs"),
        ],
        {
          cwd: root,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          const stderrText = Buffer.concat(stderr).toString("utf8").trim();
          const stdoutText = Buffer.concat(stdout).toString("utf8").trim();
          reject(
            new Error(
              stderrText ||
                stdoutText ||
                `skill manager exited with status ${code}`,
            ),
          );
          return;
        }
        try {
          const response = JSON.parse(
            Buffer.concat(stdout).toString("utf8"),
          ) as SkillSidecarResponse;
          resolve(response.result);
        } catch (error) {
          reject(
            new Error(
              `could not parse skill manager response: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
        }
      });
      child.stdin.end(
        JSON.stringify({
          schemaVersion: 1,
          operation,
          input,
          managerRoot: path.join(this.stateRoot, "skills"),
          userSkillRoot: path.join(os.homedir(), ".agents", "skills"),
        }),
      );
    });
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
