#!/usr/bin/env bun
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const bundleRoot = path.join(
  repositoryRoot,
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "release",
  "bundle",
);
const requirements = {
  linux: [
    { directory: "appimage", extension: ".AppImage" },
    { directory: "deb", extension: ".deb" },
    { directory: "rpm", extension: ".rpm" },
  ],
  darwin: [
    { directory: "dmg", extension: ".dmg" },
    { directory: "macos", extension: ".app", directoryArtifact: true },
  ],
  win32: [
    { directory: "msi", extension: ".msi" },
    { directory: "nsis", extension: ".exe" },
  ],
};
const platformRequirements = requirements[process.platform];
if (!platformRequirements) {
  throw new Error(`Unsupported desktop bundle platform: ${process.platform}`);
}

const artifacts = [];
for (const requirement of platformRequirements) {
  const directory = path.join(bundleRoot, requirement.directory);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const match = entries.find((entry) =>
    requirement.directoryArtifact
      ? entry.isDirectory() && entry.name.endsWith(requirement.extension)
      : entry.isFile() && entry.name.endsWith(requirement.extension),
  );
  if (!match) {
    throw new Error(
      `Desktop bundle is missing ${requirement.directory}/${requirement.extension}.`,
    );
  }
  const artifact = path.join(directory, match.name);
  if (!requirement.directoryArtifact && (await stat(artifact)).size === 0) {
    throw new Error(`Desktop bundle is empty: ${artifact}`);
  }
  artifacts.push(path.relative(repositoryRoot, artifact));
}

const sidecarRoot = path.join(repositoryRoot, "apps", "desktop", "src-tauri", "binaries");
const sidecars = await readdir(sidecarRoot).catch(() => []);
if (!sidecars.some((name) => name.startsWith("orynt-desktop-sidecar-"))) {
  throw new Error("Desktop package is missing its target-specific sidecar.");
}

process.stdout.write(`${JSON.stringify({ platform: process.platform, artifacts }, null, 2)}\n`);
