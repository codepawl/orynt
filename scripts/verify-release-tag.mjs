#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const tag = process.env.GITHUB_REF_NAME?.trim() || process.argv[2]?.trim();
if (!tag || !/^v\d+\.\d+\.\d+$/u.test(tag)) {
  throw new Error("A stable v<major>.<minor>.<patch> tag is required.");
}
const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
if (tag.slice(1) !== packageJson.version) {
  throw new Error(
    `Tag ${tag} does not match package version ${packageJson.version}.`,
  );
}
const { stdout } = await execFileAsync(
  "git",
  ["merge-base", "--is-ancestor", "HEAD", "origin/main"],
  { cwd: repositoryRoot },
);
void stdout;
process.stdout.write(`Release tag ${tag} matches package metadata and main.\n`);
