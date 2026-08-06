import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "bun:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("release source digest ignores generated reports and hashes supported entries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-release-digest-"));
  try {
    await execFileAsync("git", ["init"], { cwd: root });
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "packages", "eval-harness", "reports", "nested", "repo"), {
      recursive: true,
    });
    await writeFile(path.join(root, "src", "tracked.txt"), "tracked\n");
    await writeFile(
      path.join(root, "packages", "eval-harness", "reports", "nested", "repo", "fixture.txt"),
      "generated\n",
    );
    await symlink("tracked.txt", path.join(root, "src", "link.txt"));
    await execFileAsync("git", ["add", "src/tracked.txt"], { cwd: root });
    const { releaseSourceDigest } = await import("./release-source-digest.mjs");
    const first = await releaseSourceDigest(root);
    await writeFile(
      path.join(root, "packages", "eval-harness", "reports", "nested", "repo", "fixture.txt"),
      "changed generated output\n",
    );
    assert.equal(await releaseSourceDigest(root), first);
    await writeFile(path.join(root, "src", "tracked.txt"), "changed\n");
    assert.notEqual(await releaseSourceDigest(root), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release signer requires and signs the exact native matrix", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-release-tools-"));
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const environment = {
    ...process.env,
    ORYNT_RELEASE_SIGNING_KEY: privateKey.export({
      type: "pkcs8",
      format: "pem",
    }).toString(),
    ORYNT_RELEASE_PUBLIC_KEY: publicKey.export({
      type: "spki",
      format: "pem",
    }).toString(),
    ORYNT_RELEASE_KEY_ID: "test-key",
  };
  try {
    for (const name of [
      "orynt-linux-x64.tar.gz",
      "orynt-win32-x64.tar.gz",
      "orynt-darwin-arm64.tar.gz",
      "orynt-darwin-x64.tar.gz",
    ]) {
      await writeFile(path.join(root, name), `fixture:${name}\n`);
    }
    await execFileAsync(
      process.execPath,
      [
        "scripts/sign-release-manifest.mjs",
        "--asset-root",
        root,
        "--version",
        "0.1.0",
      ],
      { cwd: repositoryRoot, env: environment },
    );
    const manifest = JSON.parse(
      await readFile(path.join(root, "release-manifest.json"), "utf8"),
    );
    assert.equal(manifest.assets.length, 4);
    assert.equal(manifest.keyId, "test-key");

    await rm(path.join(root, "orynt-darwin-x64.tar.gz"), { force: true });
    await assert.rejects(
      execFileAsync(
        process.execPath,
        [
          "scripts/sign-release-manifest.mjs",
          "--asset-root",
          root,
          "--version",
          "0.1.0",
        ],
        { cwd: repositoryRoot, env: environment },
      ),
      /Native release matrix is incomplete/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release check runs the workspace test script instead of Bun test discovery", async () => {
  const source = await readFile(
    path.join(repositoryRoot, "scripts", "release-check.mjs"),
    "utf8",
  );
  assert.match(source, /scripts\/host-stdio-preflight\.mjs/u);
  assert.match(source, /\["bun", \["run", "test"\]\]/u);
  assert.doesNotMatch(source, /\["bun", \["test"\]\]/u);
});

test("release automation keeps host and artifact gates fail-closed", async () => {
  const [quality, cliRelease, desktop, audit] = await Promise.all([
    readFile(path.join(repositoryRoot, ".github", "workflows", "quality.yml"), "utf8"),
    readFile(path.join(repositoryRoot, ".github", "workflows", "cli-release.yml"), "utf8"),
    readFile(path.join(repositoryRoot, ".github", "workflows", "desktop.yml"), "utf8"),
    readFile(path.join(repositoryRoot, "scripts", "release-audit.mjs"), "utf8"),
  ]);

  assert.match(quality, /workflow_dispatch:/u);
  assert.match(cliRelease, /bun run release:tools:install/u);
  assert.doesNotMatch(cliRelease, /\bcurl\b/u);
  assert.match(desktop, /scripts\/verify-desktop-bundles\.mjs/u);
  assert.match(desktop, /actions\/upload-artifact@/u);
  assert.match(audit, /dist", "tools", "gitleaks", "8\.30\.1", "gitleaks"/u);
});
