#!/usr/bin/env bun
import {
  chmod,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";

import { generateReleaseLegalArtifacts } from "./release-legal.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const releaseRoot = path.join(repositoryRoot, "dist", "cli");
const bundlePath = path.join(releaseRoot, "orynt.mjs");
const version = process.env.ORYNT_VERSION?.trim() || "0.1.0";
const releasePublicKey =
  process.env.ORYNT_RELEASE_PUBLIC_KEY?.trim() ||
  "REPLACE_WITH_PRODUCTION_ED25519_PUBLIC_KEY";
const releaseKeyId =
  process.env.ORYNT_RELEASE_KEY_ID?.trim() ||
  "REPLACE_WITH_PRODUCTION_KEY_ID";
const releasePublicKeys = JSON.stringify({
  [releaseKeyId]: releasePublicKey.replaceAll("\\n", "\n"),
});
const buildNative = process.argv.includes("--native");
const releaseBuild = process.env.ORYNT_RELEASE_BUILD === "1";
const languageServerDependencies = {
  "bash-language-server": "5.6.0",
  pyright: "1.1.411",
  typescript: "6.0.3",
  "typescript-language-server": "5.3.0",
  "vscode-langservers-extracted": "4.10.0",
  "yaml-language-server": "1.24.0",
};

if (
  releaseBuild &&
  (
    !/^\d+\.\d+\.\d+$/u.test(version) ||
    releasePublicKey.includes("REPLACE_WITH_PRODUCTION") ||
    releaseKeyId.includes("REPLACE_WITH_PRODUCTION")
  )
) {
  throw new Error(
    "Release packaging requires a stable ORYNT_VERSION and production ORYNT_RELEASE_PUBLIC_KEY.",
  );
}

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
await generateReleaseLegalArtifacts(releaseRoot);
const cliEntry = path.join(repositoryRoot, "packages", "cli", "src", "main.ts");
const npmBuild = await Bun.build({
  entrypoints: [cliEntry],
  outdir: releaseRoot,
  naming: "orynt.mjs",
  format: "esm",
  target: "bun",
  sourcemap: "external",
  banner: "#!/usr/bin/env bun",
  define: {
    "process.env.ORYNT_VERSION": JSON.stringify(version),
    "process.env.ORYNT_INSTALL_KIND": JSON.stringify("npm"),
    "process.env.ORYNT_RELEASE_PUBLIC_KEYS": JSON.stringify(releasePublicKeys),
  },
});
assertBuild(npmBuild, "CLI npm bundle");
await chmod(bundlePath, 0o755);

const npmRoot = path.join(releaseRoot, "npm");
await mkdir(npmRoot, { recursive: true });
await writeFile(
  path.join(npmRoot, "package.json"),
  `${JSON.stringify({
    name: "orynt",
    version,
    description: "Local-first supervised coding agent CLI",
    type: "module",
    bin: { orynt: "./orynt.mjs" },
    files: [
      "orynt.mjs",
      "orynt.mjs.map",
      "LICENSE",
      "README.md",
      "THIRD_PARTY_NOTICES.md",
      "orynt.spdx.json",
      "scripts",
      "packages",
    ],
    engines: { bun: ">=1.3.14" },
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "https://github.com/codepawl/orynt.git",
    },
    homepage: "https://github.com/codepawl/orynt#readme",
    bugs: { url: "https://github.com/codepawl/orynt/issues" },
    dependencies: languageServerDependencies,
  }, null, 2)}\n`,
);
await Promise.all([
  copy(bundlePath, path.join(npmRoot, "orynt.mjs")),
  copy(`${bundlePath}.map`, path.join(npmRoot, "orynt.mjs.map")),
  copy(
    path.join(repositoryRoot, "LICENSE"),
    path.join(npmRoot, "LICENSE"),
  ),
  copy(
    path.join(repositoryRoot, "README.md"),
    path.join(npmRoot, "README.md"),
  ),
  copy(
    path.join(releaseRoot, "THIRD_PARTY_NOTICES.md"),
    path.join(npmRoot, "THIRD_PARTY_NOTICES.md"),
  ),
  copy(
    path.join(releaseRoot, "orynt.spdx.json"),
    path.join(npmRoot, "orynt.spdx.json"),
  ),
]);
await Promise.all([
  copyRuntimeResources(releaseRoot),
  copyRuntimeResources(npmRoot),
]);

if (buildNative) {
  const extension = process.platform === "win32" ? ".exe" : "";
  const output = path.join(
    releaseRoot,
    `orynt-${process.platform}-${process.arch}${extension}`,
  );
  const nativeTargets = {
    "linux:x64": "bun-linux-x64",
    "linux:arm64": "bun-linux-arm64",
    "darwin:x64": "bun-darwin-x64",
    "darwin:arm64": "bun-darwin-arm64",
    "win32:x64": "bun-windows-x64",
    "win32:arm64": "bun-windows-arm64",
  };
  const nativeTarget = nativeTargets[`${process.platform}:${process.arch}`];
  if (!nativeTarget) {
    throw new Error(`Unsupported native CLI target: ${process.platform}/${process.arch}`);
  }
  const nativeBuild = await Bun.build({
    entrypoints: [cliEntry],
    minify: true,
    compile: {
      target: nativeTarget,
      outfile: output,
    },
    define: {
      "process.env.ORYNT_VERSION": JSON.stringify(version),
      "process.env.ORYNT_INSTALL_KIND": JSON.stringify("native"),
      "process.env.ORYNT_RELEASE_PUBLIC_KEYS": JSON.stringify(releasePublicKeys),
    },
  });
  assertBuild(nativeBuild, "CLI native executable");
  if (process.platform !== "win32") await chmod(output, 0o755);
  const payloadRoot = path.join(releaseRoot, "native-payload");
  await rm(payloadRoot, { recursive: true, force: true });
  await mkdir(payloadRoot, { recursive: true });
  await copy(
    output,
    path.join(payloadRoot, process.platform === "win32" ? "orynt.exe" : "orynt"),
  );
  await copy(path.join(repositoryRoot, "LICENSE"), path.join(payloadRoot, "LICENSE"));
  await copy(
    path.join(releaseRoot, "THIRD_PARTY_NOTICES.md"),
    path.join(payloadRoot, "THIRD_PARTY_NOTICES.md"),
  );
  await copy(
    path.join(releaseRoot, "orynt.spdx.json"),
    path.join(payloadRoot, "orynt.spdx.json"),
  );
  await cp(path.join(releaseRoot, "scripts"), path.join(payloadRoot, "scripts"), {
    recursive: true,
  });
  await cp(path.join(releaseRoot, "packages"), path.join(payloadRoot, "packages"), {
    recursive: true,
  });
  await writeFile(
    path.join(payloadRoot, "package.json"),
    `${JSON.stringify({
      private: true,
      type: "module",
      dependencies: languageServerDependencies,
    }, null, 2)}\n`,
  );
  await copyLanguageServerDependencies(payloadRoot);
  const archive = path.join(
    releaseRoot,
    `orynt-${process.platform}-${process.arch}.tar.gz`,
  );
  await run("tar", ["-czf", archive, "-C", payloadRoot, "."]);
}

process.stdout.write(
  `${JSON.stringify({ releaseRoot, bundlePath, npmRoot, native: buildNative }, null, 2)}\n`,
);

async function copy(source, target) {
  const { copyFile } = await import("node:fs/promises");
  await copyFile(source, target);
}

async function copyRuntimeResources(targetRoot) {
  await mkdir(path.join(targetRoot, "scripts"), { recursive: true });
  const result = await Bun.build({
    entrypoints: [
      path.join(repositoryRoot, "scripts", "desktop-skill-manager.mjs"),
    ],
    outdir: path.join(targetRoot, "scripts"),
    naming: "desktop-skill-manager.mjs",
    format: "esm",
    target: "bun",
  });
  assertBuild(result, "runtime skill manager");
  await cp(
    path.join(repositoryRoot, "packages", "skill-registry", "builtins"),
    path.join(targetRoot, "packages", "skill-registry", "builtins"),
    { recursive: true },
  );
}

async function copyLanguageServerDependencies(payloadRoot) {
  const sourceRequire = createRequire(
    path.join(repositoryRoot, "packages", "lsp-runtime", "package.json"),
  );
  const targetNodeModules = path.join(payloadRoot, "node_modules");
  const copiedDestinations = new Set();

  async function copyPackage(name, requireFromParent, destination) {
    if (copiedDestinations.has(destination)) return;
    const root = packageRoot(requireFromParent, name);
    const manifestPath = path.join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    copiedDestinations.add(destination);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(root, destination, {
      recursive: true,
      dereference: true,
      filter: (source) => source === root || !source.startsWith(`${root}${path.sep}node_modules`),
    });

    const nestedRequire = createRequire(manifestPath);
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    };
    for (const dependency of Object.keys(dependencies)) {
      const dependencyDestination = path.join(
        destination,
        "node_modules",
        ...dependency.split("/"),
      );
      try {
        await copyPackage(dependency, nestedRequire, dependencyDestination);
      } catch {
        if (manifest.dependencies?.[dependency]) {
          throw new Error(
            `Native LSP dependency ${manifest.name ?? name} cannot resolve ${dependency}`,
          );
        }
      }
    }
  }

  await mkdir(targetNodeModules, { recursive: true });
  for (const name of Object.keys(languageServerDependencies)) {
    const destination = path.join(targetNodeModules, ...name.split("/"));
    await copyPackage(name, sourceRequire, destination);
  }
}

function packageRoot(requireFromPackage, name) {
  try {
    return path.dirname(requireFromPackage.resolve(`${name}/package.json`));
  } catch {
    let current = path.dirname(requireFromPackage.resolve(name));
    while (current !== path.dirname(current)) {
      try {
        const manifest = JSON.parse(
          readFileSync(
            path.join(current, "package.json"),
            "utf8",
          ),
        );
        if (manifest.name === name) return realpathSync(current);
      } catch {
        // Continue to the package root.
      }
      current = path.dirname(current);
    }
    throw new Error(`Cannot resolve package root for ${name}`);
  }
}

function assertBuild(result, label) {
  if (result.success) return;
  const details = result.logs.map((entry) => entry.message).join("\n");
  throw new Error(`${label} failed:\n${details}`);
}

async function run(command, args, cwd = repositoryRoot) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(
        `Command failed (${signal ?? code}): ${command} ${args.join(" ")}`,
      ));
    });
  });
}
