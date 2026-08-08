import { describe, expect, it } from "bun:test";

import {
  MANAGED_REPOSITORY_VALIDATION_COMMAND,
  normalizeRepositoryValidationCommand,
} from "./repositoryValidationCommands";

describe("repository validation command contract", () => {
  it("accepts and canonicalizes the managed verifier and bounded test commands", () => {
    expect(normalizeRepositoryValidationCommand(
      "  node   .codex/orynt-beta-verify.mjs ",
    )).toBe(MANAGED_REPOSITORY_VALIDATION_COMMAND);
    expect(normalizeRepositoryValidationCommand("bun test")).toBe("bun test");
    expect(normalizeRepositoryValidationCommand(
      "bun test tests/board.test.ts",
    )).toBe("bun test tests/board.test.ts");
    expect(normalizeRepositoryValidationCommand("bun run test")).toBe(
      "bun run test",
    );
    expect(normalizeRepositoryValidationCommand("npm test")).toBe("npm test");
  });

  it("rejects placeholders, prose, Git inspection, shell control, and unsafe arguments", () => {
    for (const command of [
      "[exact available local validation command selected after inspection]",
      "Use the repository's existing local validation command",
      "git status --short",
      "bun test && git status",
      "bun test ../outside",
      "node scripts/test.mjs",
    ]) {
      expect(normalizeRepositoryValidationCommand(command)).toBeUndefined();
    }
  });
});
