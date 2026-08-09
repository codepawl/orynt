#!/usr/bin/env bun
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
// Permissive licences only. BlueOak-1.0.0 is OSI approved and asks for less
// than MIT does; minimatch 10 moved to it from ISC, and it reaches the CLI
// through bash-language-server.
const ALLOWED_LICENSES = new Set([
  "Apache-2.0",
  "Apache-2.0 OR MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
]);
const CANONICAL_LICENSE_TEXT = {
  ISC: `ISC License

Copyright (c) the package contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`,
  MIT: `MIT License

Copyright (c) the package contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
};

export async function generateReleaseLegalArtifacts(outputRoot) {
  const lockText = await readFile(path.join(repositoryRoot, "bun.lock"), "utf8");
  Bun.JSONC.parse(lockText);
  const inventory = await productionDependencyInventory(
    path.join(repositoryRoot, "packages", "cli", "package.json"),
  );
  const packages = [];
  for (const entry of inventory) {
    const license = String(entry.manifest.license ?? "").replace(/^\((.*)\)$/u, "$1");
    if (!ALLOWED_LICENSES.has(license)) {
      throw new Error(`Unapproved production dependency license: ${license}`);
    }
    const names = await readdir(entry.root);
    const licenseName = names
      .filter((name) => /^(?:licen[cs]e|copying)(?:\..*)?$/iu.test(name))
      .sort()[0];
    const fallbackText = CANONICAL_LICENSE_TEXT[license];
    if (!licenseName && !fallbackText) {
      throw new Error(
        `Dependency ${entry.manifest.name} does not include a license file.`,
      );
    }
    const text = licenseName
      ? await readFile(path.join(entry.root, licenseName), "utf8")
      : fallbackText;
    packages.push({
      name: entry.manifest.name,
      version: entry.manifest.version,
      license,
      homepage:
        typeof entry.manifest.homepage === "string"
          ? entry.manifest.homepage
          : undefined,
      licenseText: text.trim(),
    });
  }
  packages.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`,
    )
  );
  const notices = [
    "# Third-party notices",
    "",
    "Orynt bundles the following third-party software. Each entry retains the",
    "license text distributed by that package.",
    "",
    ...packages.flatMap((item) => [
      `## ${item.name}@${item.version}`,
      "",
      `License: ${item.license}`,
      ...(item.homepage ? [`Homepage: ${item.homepage}`] : []),
      "",
      "```text",
      item.licenseText.replaceAll("```", "'''"),
      "```",
      "",
    ]),
  ].join("\n");
  const namespaceDigest = (
    await import("node:crypto")
  ).createHash("sha256").update(notices).digest("hex");
  const sbom = {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: "orynt-cli-runtime",
    documentNamespace:
      `https://github.com/codepawl/orynt/sbom/${namespaceDigest}`,
    creationInfo: {
      created: new Date(0).toISOString(),
      creators: ["Tool: orynt-release-legal-v1"],
    },
    packages: packages.map((item, index) => ({
      SPDXID: `SPDXRef-Package-${index + 1}`,
      name: item.name,
      versionInfo: item.version,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: item.license,
      licenseDeclared: item.license,
      copyrightText: "NOASSERTION",
      ...(item.homepage ? { homepage: item.homepage } : {}),
    })),
  };
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(outputRoot, "THIRD_PARTY_NOTICES.md"),
      `${notices.trim()}\n`,
    ),
    writeFile(
      path.join(outputRoot, "orynt.spdx.json"),
      `${JSON.stringify(sbom, null, 2)}\n`,
    ),
  ]);
  return { packageCount: packages.length };
}

async function productionDependencyInventory(rootManifestPath) {
  const workspaceRoot = await realpath(path.join(repositoryRoot, "packages"));
  const queue = [rootManifestPath];
  const visited = new Set();
  const inventory = [];

  while (queue.length > 0) {
    const manifestPath = queue.shift();
    const canonical = await realpath(manifestPath);
    if (visited.has(canonical)) continue;
    visited.add(canonical);
    const root = path.dirname(canonical);
    const manifest = JSON.parse(await readFile(canonical, "utf8"));
    const isWorkspace = root === repositoryRoot ||
      root.startsWith(`${workspaceRoot}${path.sep}`) ||
      root.startsWith(`${path.join(repositoryRoot, "apps")}${path.sep}`);
    if (!isWorkspace) inventory.push({ root, manifest });

    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
      const dependencyManifest = await resolveDependencyManifest(root, dependency);
      queue.push(dependencyManifest);
    }
  }
  return inventory;
}

async function resolveDependencyManifest(fromRoot, dependency) {
  let current = fromRoot;
  while (true) {
    const candidate = path.join(current, "node_modules", dependency, "package.json");
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not resolve production dependency ${dependency} from ${fromRoot}`);
    }
    current = parent;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : path.join(repositoryRoot, "dist", "legal");
  if (!output) throw new Error("--output requires a directory.");
  const result = await generateReleaseLegalArtifacts(path.resolve(output));
  process.stdout.write(
    `Generated release notices for ${result.packageCount} packages.\n`,
  );
}
