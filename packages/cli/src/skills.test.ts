import { describe, expect, it, vi } from "bun:test";

import {
  parseSkillCliArgs,
  runSkillCli,
  type SkillCliManager,
} from "./skills";

function manager(): SkillCliManager {
  return {
    scan: vi.fn(async (input) => ({ input, skills: [] })),
    list: vi.fn(async (input) => ({ input, skills: [] })),
    get: vi.fn(async (input) => ({ input, id: input.id })),
    listSources: vi.fn(async () => ({ sources: [] })),
    refresh: vi.fn(async (input) => ({ input, refreshed: true })),
    search: vi.fn(async (input) => ({ input, items: [] })),
    plan: vi.fn(async (input) => ({ id: "plan-1", ...input })),
    approve: vi.fn(async (input) => ({ ...input, approved: true })),
    execute: vi.fn(async (input) => ({ ...input, status: "completed" })),
    history: vi.fn(async () => ({ transactions: [] })),
    recover: vi.fn(async (input) => ({ ...input, recovered: true })),
  };
}

describe("skills CLI", () => {
  it("parses explicit scopes and preserves literal option-like targets after --", () => {
    expect(
      parseSkillCliArgs(
        ["install", "--scope", "project", "--repo", "./fixture", "--", "--skill-name"],
        "/repo",
      ),
    ).toMatchObject({
      command: "install",
      scope: "project",
      positionals: ["--skill-name"],
      repositoryPath: "/repo/fixture",
    });
  });

  it("keeps read-only listing headless and stable as JSON", async () => {
    const output: string[] = [];
    const exitCode = await runSkillCli(["list", "--json"], {
      cwd: "/repo",
      isTTY: false,
      manager: manager(),
      write: (value) => output.push(value),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(output[0])).toMatchObject({
      schemaVersion: 1,
      result: { skills: [] },
    });
  });

  it("requires one-operation approval for headless mutations", async () => {
    const output: string[] = [];
    const fakeManager = manager();
    const rejected = await runSkillCli(
      ["install", "openai/skills/review", "--scope", "user"],
      {
        cwd: "/repo",
        isTTY: false,
        manager: fakeManager,
        write: (value) => output.push(value),
      },
    );
    expect(rejected).toBe(1);
    expect(fakeManager.approve).not.toHaveBeenCalled();

    const approved = await runSkillCli(
      [
        "install",
        "openai/skills/review",
        "--scope",
        "user",
        "--approve-once",
      ],
      {
        cwd: "/repo",
        isTTY: false,
        manager: fakeManager,
        write: (value) => output.push(value),
      },
    );
    expect(approved).toBe(0);
    expect(fakeManager.approve).toHaveBeenCalledWith(
      expect.objectContaining({ planId: "plan-1", actor: "operator" }),
    );
    expect(fakeManager.execute).toHaveBeenCalledWith({ planId: "plan-1" });
  });

  it("prints mutation plans without applying them in dry-run mode", async () => {
    const output: string[] = [];
    const fakeManager = manager();
    const exitCode = await runSkillCli(
      ["remove", "skill-a", "--scope", "project", "--dry-run"],
      {
        cwd: "/repo",
        isTTY: false,
        manager: fakeManager,
        write: (value) => output.push(value),
      },
    );

    expect(exitCode).toBe(0);
    expect(fakeManager.plan).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "remove", target: "skill-a" }),
    );
    expect(fakeManager.approve).not.toHaveBeenCalled();
    expect(fakeManager.execute).not.toHaveBeenCalled();
  });
});
