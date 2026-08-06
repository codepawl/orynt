#!/usr/bin/env bun
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createControlledCodex,
  runProcess,
} from "./cli-e2e-lib.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const executableIndex = process.argv.indexOf("--executable");
if (executableIndex >= 0 && !process.argv[executableIndex + 1]) {
  throw new Error("--executable requires a path.");
}
const packagedModule = path.join(
  repositoryRoot,
  "dist",
  "cli",
  "npm",
  "orynt.mjs",
);
const explicitExecutable =
  executableIndex >= 0
    ? path.resolve(repositoryRoot, process.argv[executableIndex + 1])
    : undefined;
let executable = explicitExecutable ?? packagedModule;
const stateRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-package-smoke-"));
try {
  const binRoot = await createControlledCodex(stateRoot);
  if (!explicitExecutable) {
    const archiveRoot = path.join(stateRoot, "archive");
    const installRoot = path.join(stateRoot, "install");
    await mkdir(archiveRoot);
    await mkdir(installRoot);
    const pack = await runProcess(
      "bun",
      [
        "pm",
        "pack",
        "--destination",
        archiveRoot,
      ],
      {
        cwd: path.dirname(packagedModule),
        env: { ...process.env, BUN_TMPDIR: stateRoot },
        timeoutMs: 120_000,
      },
    );
    if (pack.code !== 0) {
      throw new Error(
        `Packaged CLI archive creation failed.\n${pack.stderr || pack.stdout}`,
      );
    }
    const archives = (await readdir(archiveRoot)).filter((entry) =>
      entry.endsWith(".tgz"),
    );
    if (archives.length !== 1) {
      throw new Error(
        `Expected one packaged CLI archive, found ${String(archives.length)}.`,
      );
    }
    const archive = path.join(archiveRoot, archives[0]);
    await writeFile(
      path.join(installRoot, "package.json"),
      '{"name":"orynt-package-smoke","private":true}\n',
    );
    const install = await runProcess(
      "bun",
      [
        "add",
        "--production",
        "--prefer-offline",
        "--ignore-scripts",
        archive,
      ],
      {
        cwd: installRoot,
        env: { ...process.env, BUN_TMPDIR: stateRoot },
        timeoutMs: 120_000,
      },
    );
    if (install.code !== 0) {
      throw new Error(
        `Packaged CLI archive install failed.\n${install.stderr || install.stdout}`,
      );
    }
    executable = path.join(installRoot, "node_modules", "orynt", "orynt.mjs");
  }
  const environment = {
    ...process.env,
    PATH: `${binRoot}${path.delimiter}${process.env.PATH ?? ""}`,
    ORYNT_NO_UPDATE_CHECK: "1",
    ORYNT_STATE_HOME: stateRoot,
  };
  const runCli = async (args, cwd = repositoryRoot) =>
    await runProcess(
      explicitExecutable ?? process.execPath,
      explicitExecutable ? args : [executable, ...args],
      {
        cwd,
        env: environment,
        timeoutMs: 30_000,
      },
    );
  for (const { args, expected, validate } of [
    { args: ["--version"], expected: /^\d+\.\d+\.\d+\s*$/u },
    { args: ["doctor"], expected: /Orynt doctor/u },
    { args: ["usage", "--json"], expected: /"kind": "orynt_provider_usage"/u },
    { args: ["browser", "doctor"], expected: /Orynt browser doctor/u },
    ...(explicitExecutable
      ? []
      : [{ args: ["skills", "list", "--json"], expected: /"skills"/u }]),
    { args: ["improve", "status"], expected: /"mode": "shadow_review"/u },
    {
      args: ["intelligence", "status", "--json"],
      expected: /"schemaVersion"/u,
    },
    {
      args: ["lsp", "list", "--json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        if (
          explicitExecutable
            ? payload.runtime?.status !== "degraded" ||
              payload.runtime?.distribution !== "native"
            : payload.runtime?.status !== "available" ||
              payload.runtime?.distribution !== "npm"
        ) return false;
        const required = new Set([
          "typescript",
          "python",
          "json",
          "html",
          "css",
          "yaml",
          "bash",
        ]);
        for (const adapter of payload.adapters ?? []) {
          if (
            required.has(adapter.id) &&
            adapter.detected?.availability === "bundled"
          ) {
            required.delete(adapter.id);
          }
        }
        return required.size === 0;
      },
    },
    { args: ["assets"], expected: /Usage: orynt assets generate/u },
  ]) {
    const result = await runCli(args);
    if (
      result.code !== 0 ||
      (expected && !expected.test(result.stdout)) ||
      (validate && !validate(result.stdout))
    ) {
      throw new Error(
        `Packaged CLI smoke failed: ${args.join(" ")}\n` +
          `code=${String(result.code)} signal=${String(result.signal)}\n` +
          `${result.stderr || result.stdout || "<no output>"}`,
      );
    }
  }
  const semanticRoot = path.join(stateRoot, "semantic-repository");
  await mkdir(semanticRoot);
  await writeFile(
    path.join(semanticRoot, "tsconfig.json"),
    "{\"include\":[\"*.ts\"]}\n",
  );
  await writeFile(
    path.join(semanticRoot, "main.ts"),
    "export const answer = 42;\n",
  );
  await writeFile(
    path.join(semanticRoot, "pyproject.toml"),
    "[project]\nname='package-smoke'\nversion='0.0.0'\n",
  );
  await writeFile(
    path.join(semanticRoot, "main.py"),
    "def greet(name: str) -> str:\n    return f'Hello {name}'\n",
  );
  if (explicitExecutable) {
    const degraded = await runCli([
      "lsp",
      "refactor",
      "rename-preview",
      "--path",
      "main.ts",
      "--line",
      "1",
      "--column",
      "14",
      "--new-name",
      "result",
      "--json",
    ], semanticRoot);
    if (
      degraded.code === 0 ||
      !/native companion runtime|RUNTIME_DEGRADED/u.test(
        degraded.stderr || degraded.stdout,
      )
    ) {
      throw new Error(
        `Native CLI did not fail closed for semantic refactoring.\n${
          degraded.stderr || degraded.stdout
        }`,
      );
    }
  } else {
    const typescriptPreview = await runCli([
      "lsp",
      "refactor",
      "rename-preview",
      "--path",
      "main.ts",
      "--line",
      "1",
      "--column",
      "14",
      "--new-name",
      "result",
      "--json",
    ], semanticRoot);
    if (typescriptPreview.code !== 0) {
      throw new Error(
        `Packaged TypeScript semantic preview failed.\n${
          typescriptPreview.stderr || typescriptPreview.stdout
        }`,
      );
    }
    const preview = JSON.parse(typescriptPreview.stdout).data.preview;
    const applied = await runCli([
      "lsp",
      "refactor",
      "apply",
      "--preview-id",
      preview.previewId,
      "--preview-digest",
      preview.previewDigest,
      "--approve-once",
      "--json",
    ], semanticRoot);
    if (
      applied.code !== 0 ||
      !JSON.parse(applied.stdout).data?.changedFiles?.includes("main.ts") ||
      !/const result/u.test(await readFile(path.join(semanticRoot, "main.ts"), "utf8"))
    ) {
      throw new Error(
        `Packaged TypeScript semantic apply failed.\n${
          applied.stderr || applied.stdout
        }`,
      );
    }
    const pythonPreview = await runCli([
      "lsp",
      "refactor",
      "rename-preview",
      "--path",
      "main.py",
      "--line",
      "1",
      "--column",
      "5",
      "--new-name",
      "welcome",
      "--json",
    ], semanticRoot);
    if (
      pythonPreview.code !== 0 ||
      !JSON.parse(pythonPreview.stdout).data?.preview?.previewDigest
    ) {
      throw new Error(
        `Packaged Python semantic preview failed.\n${
          pythonPreview.stderr || pythonPreview.stdout
        }`,
      );
    }
  }
  process.stdout.write(
    `${explicitExecutable ? "Native" : "Packaged"} CLI resources, semantic runtime, doctors, and usage passed smoke.\n`,
  );
} finally {
  await rm(stateRoot, { recursive: true, force: true });
}
