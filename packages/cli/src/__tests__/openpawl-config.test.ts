import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  loadOpenPawlConfig,
  parseOpenPawlConfig,
  resolveRunTestCommand,
} from "../openpawl-config";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpawl-config-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("Openpawl config loading", () => {
  it("returns null config when the repo-root config file is missing", async () => {
    const loaded = await loadOpenPawlConfig(tmpDir);

    expect(loaded).toEqual({
      config: null,
      configPath: null,
    });
  });

  it("loads validation defaults from openpawl.config.json", async () => {
    const configPath = path.join(tmpDir, "openpawl.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        validation: {
          writeTestCommand: "bun test",
        },
      }),
      "utf-8"
    );

    const loaded = await loadOpenPawlConfig(tmpDir);

    expect(loaded.configPath).toBe(configPath);
    expect(loaded.config).toEqual({
      validation: {
        writeTestCommand: "bun test",
      },
    });
  });

  it("fails clearly when an explicit config path does not exist", async () => {
    await expect(loadOpenPawlConfig(tmpDir, "missing.json")).rejects.toThrow(
      "Openpawl config file does not exist"
    );
  });
});

describe("Openpawl config validation", () => {
  it("rejects non-object payloads", () => {
    expect(() => parseOpenPawlConfig(null, "openpawl.config.json")).toThrow(
      "must be a JSON object"
    );
  });

  it("rejects empty write test commands", () => {
    expect(() => parseOpenPawlConfig({
      validation: {
        writeTestCommand: "   ",
      },
    }, "openpawl.config.json")).toThrow("non-empty string");
  });

  it("prefers explicit test commands and keeps dry-run on the placeholder path", () => {
    const config = {
      validation: {
        writeTestCommand: "bun run test",
      },
    };

    expect(resolveRunTestCommand({
      dryRun: true,
      explicitTestCommand: undefined,
      config,
    })).toBeUndefined();

    expect(resolveRunTestCommand({
      dryRun: false,
      explicitTestCommand: undefined,
      config,
    })).toBe("bun run test");

    expect(resolveRunTestCommand({
      dryRun: false,
      explicitTestCommand: "echo explicit",
      config,
    })).toBe("echo explicit");
  });
});
