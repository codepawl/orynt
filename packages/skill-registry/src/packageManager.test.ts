import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { SkillSourceDescriptor } from "@codepawl/shared";

import {
  FileSkillManagerStore,
  JsonCatalogProvider,
  LocalSkillPackageManager,
  assessSkillAutoUpdate,
  parseAgentSkillDocument,
  parseClaudeMarketplace,
  parseGitHubSkillTree,
  scanAgentSkillRoots,
  searchSkillCatalog,
  SkillPackageFailure,
  validateRemoteCatalogUrl,
} from "./index";

const trustedSource: SkillSourceDescriptor = {
  id: "fixture",
  kind: "local",
  label: "Fixture",
  uri: "fixture://skills",
  trustTier: "trusted",
  enabled: true,
  readOnly: false,
};

function skillDocument(name: string, description = "A fixture skill") {
  return `---
name: ${name}
description: >
  ${description}
  for tests
license: MIT
compatibility: orynt >= 0.1
allowed-tools: [Read, Search]
metadata:
  owner: fixture
---
# ${name}

Follow the repository policy.
`;
}

async function createSkill(root: string, name: string) {
  const directory = path.join(root, name);
  await mkdir(path.join(directory, "references"), { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), skillDocument(name), "utf8");
  await writeFile(path.join(directory, "references", "guide.md"), "bounded resource\n", "utf8");
  return directory;
}

describe("Agent Skill parsing and inventory", () => {
  it("parses portable frontmatter including folded text, nested metadata, and allowed tools", () => {
    const parsed = parseAgentSkillDocument(skillDocument("review-scope"));
    expect(parsed.manifest).toMatchObject({
      schemaVersion: 1,
      name: "review-scope",
      description: "A fixture skill for tests",
      license: "MIT",
      compatibility: "orynt >= 0.1",
      allowedTools: ["Read", "Search"],
      metadata: { owner: "fixture" },
    });
    expect(parsed.instructions).toContain("Follow the repository policy.");
    expect(
      parseAgentSkillDocument(
        "---\nname: folded-skill\ndescription: >-\n  Folded description used by\n  OS-user skills.\n---\n\n# Folded\n",
      ).manifest.description,
    ).toBe("Folded description used by OS-user skills.");
  });

  it("rejects unbounded YAML features and malformed manifests", () => {
    expect(() => parseAgentSkillDocument("---\nname: bad\ndescription: *alias\n---\ntext")).toThrow(SkillPackageFailure);
    expect(() => parseAgentSkillDocument("# no frontmatter")).toThrow("must start with YAML frontmatter");
  });

  it("uses project-over-user precedence and blocks symlinks inside bundles", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "orynt-scan-"));
    const projectRoot = path.join(temporary, "repo", ".agents", "skills");
    const userRoot = path.join(temporary, "home", ".agents", "skills");
    await createSkill(projectRoot, "same-name");
    await createSkill(userRoot, "same-name");
    const unsafe = await createSkill(projectRoot, "unsafe");
    await symlink("/tmp", path.join(unsafe, "references", "escape"));

    const result = await scanAgentSkillRoots({
      roots: [
        { path: projectRoot, scope: "project", source: { ...trustedSource, id: "project" } },
        { path: userRoot, scope: "user", source: { ...trustedSource, id: "user" } },
      ],
    });
    expect(result.collisions).toEqual([
      expect.objectContaining({ name: "same-name", winnerId: "project:same-name", shadowedIds: ["user:same-name"] }),
    ]);
    expect(result.installed.find((skill) => skill.id === "user:same-name")?.eligible).toBe(false);
    expect(result.installed.find((skill) => skill.name === "unsafe")).toMatchObject({
      health: "blocked",
      eligible: false,
    });
  });
});

describe("catalog providers", () => {
  const source: SkillSourceDescriptor = {
    id: "community",
    kind: "well_known",
    label: "Community",
    uri: "https://example.com/.well-known/skills/index.json",
    trustTier: "community",
    enabled: true,
    readOnly: true,
  };

  it("parses portable catalogs and ranks search deterministically", async () => {
    const provider = new JsonCatalogProvider(source);
    const refreshed = await provider.refresh({
      async fetch() {
        return {
          status: 200,
          finalUrl: source.uri,
          body: JSON.stringify({
            publisher: "example",
            skills: [
              { name: "review", description: "Review code", version: "1.0.0", revision: "abc", tags: ["code"] },
              { name: "write", description: "Write docs", version: "1.0.0", revision: "def", tags: ["docs"] },
            ],
          }),
        };
      },
    });
    expect(searchSkillCatalog(refreshed.items, "review").map((item) => item.name)).toEqual(["review"]);
    expect(refreshed.items[0]).toMatchObject({ id: "community:example/review", trustTier: "community" });
  });

  it("marks non-skill Claude plugins unsupported and parses GitHub trees without network access", () => {
    const items = parseClaudeMarketplace(
      JSON.stringify({
        name: "anthropic",
        plugins: [
          { name: "pure", description: "skill only", skills: ["skills/pure/SKILL.md"] },
          { name: "hooked", description: "has hooks", skills: ["skills/hooked/SKILL.md"], hooks: "./hooks.json" },
        ],
      }),
      { source },
    );
    expect(items.map((item) => [item.name, item.supported, item.unsupportedReason])).toEqual([
      ["pure", true, undefined],
      ["hooked", false, "Requires Plugin Manager"],
    ]);
    expect(
      parseGitHubSkillTree(source, "openai", "abcdef1234567890", [
        { path: "skills/a/SKILL.md", type: "blob", sha: "sha-1" },
        { path: "skills/a/references/a.md", type: "blob", sha: "sha-2" },
      ])[0]?.releases[0]?.files,
    ).toHaveLength(2);
  });

  it("blocks non-HTTPS and local catalog endpoints", () => {
    expect(() => validateRemoteCatalogUrl("http://example.com/catalog.json")).toThrow("must use HTTPS");
    expect(() => validateRemoteCatalogUrl("https://127.0.0.1/catalog.json")).toThrow("disallowed host");
  });
});

describe("LocalSkillPackageManager", () => {
  it("only auto-qualifies trusted content-only updates with immutable integrity", () => {
    const manifest = parseAgentSkillDocument(skillDocument("scope-review")).manifest;
    const baseRelease = {
      id: "r1",
      version: "1.0.0",
      revision: "commit-1",
      digest: "a".repeat(64),
      manifest,
      files: [{ path: "SKILL.md" }],
      capabilities: ["Read"],
      dependencies: [],
    };
    const installed = {
      id: "fixture:scope-review",
      name: "scope-review",
      scope: "project" as const,
      path: "/repo/.agents/skills/scope-review",
      source: trustedSource,
      manifest,
      digest: baseRelease.digest,
      receiptOwned: true,
      enabled: true,
      eligible: true,
      health: "healthy" as const,
      warnings: [],
      pinned: false,
      drifted: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      assessSkillAutoUpdate(installed, baseRelease, {
        ...baseRelease,
        id: "r2",
        version: "1.0.1",
        revision: "commit-2",
        digest: "b".repeat(64),
      }),
    ).toEqual({ eligible: true, reasons: [] });
    expect(
      assessSkillAutoUpdate(installed, baseRelease, {
        ...baseRelease,
        id: "r3",
        version: "2.0.0",
        revision: "commit-3",
        digest: "c".repeat(64),
        files: [{ path: "SKILL.md" }, { path: "install.sh" }],
        capabilities: ["Read", "Terminal"],
      }),
    ).toMatchObject({ eligible: false, reasons: ["release adds capabilities", "release contains executable or package-manager content"] });
  });

  it("requires plan approval, installs atomically with a receipt, snapshots context, and moves removal to Trash", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "orynt-manager-"));
    const sourcePath = await createSkill(path.join(temporary, "source"), "scope-review");
    await mkdir(path.join(temporary, "repo"), { recursive: true });
    const manager = new LocalSkillPackageManager({
      repositoryPath: path.join(temporary, "repo"),
      userSkillRoot: path.join(temporary, "user-skills"),
      stateRoot: path.join(temporary, "state"),
      now: (() => {
        let tick = 0;
        return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
      })(),
    });
    const plan = await manager.planMutation({
      kind: "install",
      skillId: "fixture:scope-review",
      scope: "project",
      name: "scope-review",
      source: trustedSource,
      sourcePath,
    });
    await expect(manager.executeMutation(plan.id)).rejects.toThrow("not approved");
    await manager.approveMutation(plan.id);
    const receipt = await manager.executeMutation(plan.id);
    expect(receipt).toMatchObject({
      skillId: "fixture:scope-review",
      scope: "project",
      source: trustedSource,
    });
    expect(await readFile(path.join(manager.projectSkillRoot, "scope-review", "SKILL.md"), "utf8")).toContain("scope-review");

    const inventory = await manager.scan();
    expect(inventory.installed[0]).toMatchObject({
      id: "fixture:scope-review",
      receiptOwned: true,
      drifted: false,
      enabled: false,
      eligible: false,
    });
    const enable = await manager.planMutation({
      kind: "enable",
      skillId: "fixture:scope-review",
      scope: "project",
      name: "scope-review",
    });
    await manager.approveMutation(enable.id);
    await manager.executeMutation(enable.id);
    await expect(manager.executeMutation(enable.id)).rejects.toThrow(
      "already consumed",
    );
    const context = await manager.createContextSnapshot("run-1", ["fixture:scope-review"]);
    expect(context.skills[0]).toMatchObject({ skillId: "fixture:scope-review", instructions: expect.stringContaining("repository policy") });
    expect(context.digest).toMatch(/^[a-f0-9]{64}$/);

    const remove = await manager.planMutation({
      kind: "remove",
      skillId: "fixture:scope-review",
      scope: "project",
      name: "scope-review",
    });
    await manager.approveMutation(remove.id);
    const removed = await manager.executeMutation(remove.id);
    expect(removed?.trashPath).toContain(`${path.sep}trash${path.sep}`);
    await expect(readFile(path.join(manager.projectSkillRoot, "scope-review", "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const restore = await manager.planMutation({
      kind: "restore",
      skillId: "fixture:scope-review",
      scope: "project",
      name: "scope-review",
    });
    await manager.approveMutation(restore.id);
    await manager.executeMutation(restore.id);
    expect(
      await readFile(
        path.join(manager.projectSkillRoot, "scope-review", "SKILL.md"),
        "utf8",
      ),
    ).toContain("scope-review");

    const removeAgain = await manager.planMutation({
      kind: "remove",
      skillId: "fixture:scope-review",
      scope: "project",
      name: "scope-review",
    });
    await manager.approveMutation(removeAgain.id);
    await manager.executeMutation(removeAgain.id);
    const purge = await manager.planMutation({
      kind: "purge",
      skillId: "fixture:scope-review",
      scope: "project",
      name: "scope-review",
    });
    await manager.approveMutation(purge.id);
    await manager.executeMutation(purge.id);
    expect(
      (await manager.store.receipts()).some(
        (candidate) => candidate.skillId === "fixture:scope-review",
      ),
    ).toBe(false);
  });

  it("rejects project skill roots that traverse a symbolic link", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "orynt-manager-symlink-"));
    const repositoryPath = path.join(temporary, "repo");
    const outside = path.join(temporary, "outside");
    await mkdir(repositoryPath, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, path.join(repositoryPath, ".agents"));
    const manager = new LocalSkillPackageManager({
      repositoryPath,
      userSkillRoot: path.join(temporary, "user-skills"),
      stateRoot: path.join(temporary, "state"),
    });

    await expect(
      manager.planMutation({
        kind: "import",
        skillId: "fixture:escaped",
        scope: "project",
        name: "escaped",
        sourcePath: await createSkill(path.join(temporary, "source"), "escaped"),
      }),
    ).rejects.toThrow("symbolic link");
  });

  it("marks interrupted transactions failed during startup recovery", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "orynt-store-"));
    const store = new FileSkillManagerStore(temporary);
    await store.withLock(async (state) => {
      state.transactions.push({
        id: "tx-1",
        planId: "plan-1",
        kind: "install",
        skillId: "fixture:a",
        status: "approved",
        startedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    expect(await store.recoverInterruptedTransactions()).toEqual([
      expect.objectContaining({ id: "tx-1", status: "failed", error: "interrupted before commit" }),
    ]);
  });
});
