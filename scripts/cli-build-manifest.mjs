#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { releaseSourceDigest } from "./release-source-digest.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(repositoryRoot, "dist", "cli-build-manifest.json");

if (import.meta.main) {
  const manifest = await createCliBuildManifest(repositoryRoot);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ manifestPath, manifest }, null, 2)}\n`);
}

export async function createCliBuildManifest(root) {
  const packages = await cliWorkspaceClosure(root);
  const records = [];
  for (const workspace of packages) {
    const sourceFiles = [
      workspace.manifestPath,
      path.join(workspace.root, "tsconfig.json"),
      ...(await filesUnder(path.join(workspace.root, "src"))).filter(
        (file) => !/\.test\.[cm]?[jt]sx?$/u.test(file),
      ),
    ].filter((candidate) => candidate);
    const distFiles = await filesUnder(path.join(workspace.root, "dist"));
    if (distFiles.length === 0) {
      throw new Error(`CLI build did not emit ${workspace.name}.`);
    }
    const newestInputMtimeMs = Math.max(
      ...await Promise.all(sourceFiles.map(async (file) => (await stat(file)).mtimeMs)),
    );
    const newestOutputMtimeMs = Math.max(
      ...await Promise.all(distFiles.map(async (file) => (await stat(file)).mtimeMs)),
    );
    if (newestOutputMtimeMs + 1 < newestInputMtimeMs) {
      throw new Error(
        `CLI build output is stale for ${workspace.name}; rebuild the dependency closure.`,
      );
    }
    records.push({
      name: workspace.name,
      sourceSha256: await digestFiles(root, sourceFiles),
      distSha256: await digestFiles(root, distFiles),
    });
  }
  return {
    schemaVersion: 1,
    sourceDigest: await releaseSourceDigest(root),
    createdAt: new Date().toISOString(),
    packages: records,
  };
}

export async function verifyCliBuildManifest(root, manifest) {
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.sourceDigest !== "string" ||
    !Array.isArray(manifest.packages)
  ) {
    throw new Error("CLI build manifest is invalid.");
  }
  const current = await createCliBuildManifest(root);
  if (current.sourceDigest !== manifest.sourceDigest) {
    throw new Error("CLI build manifest source digest is stale.");
  }
  const expected = JSON.stringify(
    manifest.packages.map(({ name, sourceSha256, distSha256 }) => ({
      name,
      sourceSha256,
      distSha256,
    })),
  );
  const actual = JSON.stringify(current.packages);
  if (actual !== expected) {
    throw new Error("CLI build manifest package inputs or outputs are stale.");
  }
  return current;
}

async function cliWorkspaceClosure(root) {
  const packageRoots = (await readdir(path.join(root, "packages"), {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, "packages", entry.name));
  const byName = new Map();
  for (const workspaceRoot of packageRoots) {
    const workspaceManifestPath = path.join(workspaceRoot, "package.json");
    const manifest = JSON.parse(await readFile(workspaceManifestPath, "utf8"));
    if (typeof manifest.name !== "string") continue;
    byName.set(manifest.name, {
      name: manifest.name,
      root: workspaceRoot,
      manifestPath: workspaceManifestPath,
      dependencies: Object.keys(manifest.dependencies ?? {}).filter((name) =>
        name.startsWith("@codepawl/")
      ),
    });
  }
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  const visit = (name) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Workspace dependency cycle at ${name}.`);
    const workspace = byName.get(name);
    if (!workspace) throw new Error(`Missing workspace dependency ${name}.`);
    visiting.add(name);
    for (const dependency of workspace.dependencies) visit(dependency);
    visiting.delete(name);
    visited.add(name);
    ordered.push(workspace);
  };
  visit("@codepawl/cli");
  return ordered;
}

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(target));
    else if (entry.isFile()) files.push(target);
  }
  return files.sort();
}

async function digestFiles(root, files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(path.relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
