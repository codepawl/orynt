import { describe, it, expect } from "vitest";
import * as path from "path";
import {
  SafetyViolationError,
  isDisallowedPath,
  isSecretFile,
  assertWriteSafe,
} from "../safety";

const FAKE_REPO = "/fake/repo";

describe("isSecretFile", () => {
  it("flags .env files", () => {
    expect(isSecretFile(".env")).toBe(true);
    expect(isSecretFile(".env.local")).toBe(true);
    expect(isSecretFile(".env.production")).toBe(true);
  });

  it("flags credential files", () => {
    expect(isSecretFile("credentials.json")).toBe(true);
    expect(isSecretFile("secrets.yaml")).toBe(true);
    expect(isSecretFile("id_rsa")).toBe(true);
    expect(isSecretFile("id_ed25519")).toBe(true);
    expect(isSecretFile("server.pem")).toBe(true);
    expect(isSecretFile("private.key")).toBe(true);
  });

  it("does not flag regular source files", () => {
    expect(isSecretFile("index.ts")).toBe(false);
    expect(isSecretFile("README.md")).toBe(false);
    expect(isSecretFile("package.json")).toBe(false);
    expect(isSecretFile("utils.py")).toBe(false);
  });
});

describe("isDisallowedPath", () => {
  it("disallows paths outside the repo root", () => {
    expect(isDisallowedPath(FAKE_REPO, "/etc/passwd")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, "/fake/other/file.ts")).toBe(true);
  });

  it("disallows .git internals", () => {
    expect(isDisallowedPath(FAKE_REPO, ".git/config")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, ".git/FETCH_HEAD")).toBe(true);
  });

  it("disallows lockfiles", () => {
    expect(isDisallowedPath(FAKE_REPO, "bun.lock")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, "package-lock.json")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, "yarn.lock")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, "Cargo.lock")).toBe(true);
  });

  it("disallows build artifact directories", () => {
    expect(isDisallowedPath(FAKE_REPO, "dist/index.js")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, "build/output.js")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, ".next/server/app.js")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, "coverage/lcov.info")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, "node_modules/react/index.js")).toBe(true);
  });

  it("disallows migration files", () => {
    expect(isDisallowedPath(FAKE_REPO, "apps/api/migrations/001_init.sql")).toBe(true);
  });

  it("disallows environment and secret files", () => {
    expect(isDisallowedPath(FAKE_REPO, ".env")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, ".env.local")).toBe(true);
    expect(isDisallowedPath(FAKE_REPO, "src/credentials.json")).toBe(true);
  });

  it("allows normal source files within the repo", () => {
    expect(isDisallowedPath(FAKE_REPO, "src/index.ts")).toBe(false);
    expect(isDisallowedPath(FAKE_REPO, "packages/core/src/runner.ts")).toBe(false);
    expect(isDisallowedPath(FAKE_REPO, "README.md")).toBe(false);
    expect(isDisallowedPath(FAKE_REPO, "docs/ARCHITECTURE.md")).toBe(false);
  });

  it("allows absolute paths within the repo", () => {
    expect(isDisallowedPath(FAKE_REPO, path.join(FAKE_REPO, "src", "utils.ts"))).toBe(false);
  });
});

describe("assertWriteSafe", () => {
  it("throws SafetyViolationError on the first disallowed path", () => {
    expect(() =>
      assertWriteSafe(FAKE_REPO, ["src/index.ts", ".env", "src/utils.ts"])
    ).toThrow(SafetyViolationError);
  });

  it("throws SafetyViolationError for out-of-repo paths", () => {
    expect(() => assertWriteSafe(FAKE_REPO, ["/etc/hosts"])).toThrow(SafetyViolationError);
  });

  it("does not throw for all-safe paths", () => {
    expect(() =>
      assertWriteSafe(FAKE_REPO, ["src/index.ts", "packages/core/src/utils.ts"])
    ).not.toThrow();
  });

  it("SafetyViolationError has violatingPath and reason", () => {
    try {
      assertWriteSafe(FAKE_REPO, ["bun.lock"]);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SafetyViolationError);
      const sve = err as SafetyViolationError;
      expect(sve.violatingPath).toBe("bun.lock");
      expect(sve.reason).toBeTruthy();
      expect(sve.message).toContain("bun.lock");
    }
  });
});
