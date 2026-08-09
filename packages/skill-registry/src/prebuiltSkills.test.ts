import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import type { SkillSourceDescriptor } from "@codepawl/shared";

import {
  fingerprintSkillDirectory,
  LocalSkillPackageManager,
  parseAgentSkillDocument,
} from "./index";

const builtinSkillNames = [
  "auto-improve",
  "browser-cdp",
  "bug-fixer",
  "change-planner",
  "code-reviewer",
  "product-ui-design",
  "release-readiness",
  "repository-onboarding",
] as const;
const builtinRoot = path.resolve(process.cwd(), "builtins");
const builtinSource: SkillSourceDescriptor = {
  id: "orynt-builtin",
  kind: "runtime",
  label: "Orynt built-ins",
  uri: "orynt://builtins",
  trustTier: "builtin",
  enabled: true,
  readOnly: true,
};

describe("Orynt prebuilt skills", () => {
  it("ships the exact core engineering and product UI pack", async () => {
    const directories = (await readdir(builtinRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual(builtinSkillNames);

    for (const name of builtinSkillNames) {
      const skillRoot = path.join(builtinRoot, name);
      const topLevel = (await readdir(skillRoot)).sort();
      expect(topLevel).toEqual(["SKILL.md", "agents"]);
      expect(await readdir(path.join(skillRoot, "agents"))).toEqual([
        "openai.yaml",
      ]);

      const document = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
      const parsed = parseAgentSkillDocument(document);
      expect(parsed.manifest.name).toBe(name);
      expect(parsed.manifest.description).not.toMatch(/TODO/i);
      expect(parsed.instructions.trim().length).toBeGreaterThan(100);
      if (name === "product-ui-design") {
        expect(parsed.instructions).toContain(
          "Keep every authored line at or below 400 characters.",
        );
        expect(parsed.instructions).toContain(
          "Remove decorative eyebrows, dots, badges, menus, avatars, and status chrome",
        );
        expect(parsed.instructions).toContain(
          "Start greenfield workflows with empty user data.",
        );
        expect(parsed.instructions).toContain(
          "running the first readability preflight.",
        );
      }

      const interfaceDocument = await readFile(
        path.join(skillRoot, "agents", "openai.yaml"),
        "utf8",
      );
      expect(interfaceDocument).toContain(`Use $${name}`);
      expect(interfaceDocument).toContain(
        name === "product-ui-design"
          ? "allow_implicit_invocation: true"
          : "allow_implicit_invocation: false",
      );

      const fingerprint = await fingerprintSkillDirectory(skillRoot);
      expect(fingerprint.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(fingerprint.files.map((file) => file.path)).toEqual([
        "SKILL.md",
        "agents/openai.yaml",
      ]);
    }
  });

  it("exposes built-ins as eligible runtime skills and preserves local precedence", async () => {
    const temporary = await mkdtemp(
      path.join(os.tmpdir(), "orynt-builtins-"),
    );
    const repositoryPath = path.join(temporary, "repo");
    const userSkillRoot = path.join(temporary, "user-skills");
    await mkdir(repositoryPath, { recursive: true });

    const manager = new LocalSkillPackageManager({
      repositoryPath,
      userSkillRoot,
      stateRoot: path.join(temporary, "state"),
      runtimeRoots: [
        {
          path: builtinRoot,
          scope: "runtime",
          source: builtinSource,
        },
      ],
    });

    const inventory = await manager.scan();
    const builtins = inventory.installed.filter(
      (skill) => skill.source.id === builtinSource.id,
    );
    expect(builtins.map((skill) => skill.name).sort()).toEqual(
      builtinSkillNames,
    );
    expect(builtins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "orynt-builtin:code-reviewer",
          scope: "runtime",
          receiptOwned: false,
          enabled: true,
          eligible: true,
          health: "healthy",
        }),
      ]),
    );

    expect((await manager.createContextSnapshot("empty", [])).skills).toEqual(
      [],
    );
    const context = await manager.createContextSnapshot("review", [
      "orynt-builtin:code-reviewer",
    ]);
    expect(context.skills[0]).toMatchObject({
      skillId: "orynt-builtin:code-reviewer",
      instructions: expect.stringContaining("Prioritize actionable defects"),
    });

    const overrideRoot = path.join(userSkillRoot, "code-reviewer");
    await mkdir(overrideRoot, { recursive: true });
    await writeFile(
      path.join(overrideRoot, "SKILL.md"),
      [
        "---",
        "name: code-reviewer",
        "description: User-owned review instructions.",
        "---",
        "",
        "# User reviewer",
        "",
        "Follow the user's review contract.",
        "",
      ].join("\n"),
      "utf8",
    );

    const overridden = await manager.scan();
    expect(
      overridden.installed.find((skill) => skill.id === "user:code-reviewer"),
    ).toMatchObject({ scope: "user", eligible: true });
    expect(
      overridden.installed.find(
        (skill) => skill.id === "orynt-builtin:code-reviewer",
      ),
    ).toMatchObject({
      scope: "runtime",
      eligible: false,
      shadowedBy: "user:code-reviewer",
    });
  });
});
