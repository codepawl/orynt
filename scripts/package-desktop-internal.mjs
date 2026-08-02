import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version ?? "0.0.0";
const platform = process.platform;
const arch = process.arch;
const releaseName = `orynt-desktop-${version}-${platform}-${arch}`;
const distRoot = join(root, "dist", "private-beta");
const stagingRoot = join(distRoot, releaseName);
const binaryName = platform === "win32" ? "orynt-desktop.exe" : "orynt-desktop";
const binaryPath = join(root, "apps", "desktop", "src-tauri", "target", "release", binaryName);
const runnerRoot = join(stagingRoot, "orynt-runner");
const builtinSkillNames = [
  "repository-onboarding",
  "change-planner",
  "bug-fixer",
  "code-reviewer",
  "release-readiness",
];
const builtinSkillRoot = join(root, "packages", "skill-registry", "builtins");

const runnerPackages = [
  "codex-adapter",
  "coding-apprentice",
  "cognitive-kernel",
  "gateway",
  "local-state",
  "memory",
  "model-runtime",
  "repository-sandbox",
  "shared",
  "skill-registry",
  "verifier",
];

function tauriBuildEnv() {
  const env = { ...process.env };
  if (process.platform === "linux") {
    delete env.PKG_CONFIG_LIBDIR;
    delete env.PKG_CONFIG_SYSROOT_DIR;

    if (existsSync("/usr/bin/pkg-config")) {
      env.PKG_CONFIG = "/usr/bin/pkg-config";
      env.PATH = ["/usr/bin", "/usr/sbin", "/bin", "/sbin", env.PATH].filter(Boolean).join(":");
    }

    env.PKG_CONFIG_PATH = ["/usr/lib64/pkgconfig", "/usr/share/pkgconfig", env.PKG_CONFIG_PATH]
      .filter(Boolean)
      .join(":");
  }
  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

async function copyPackage(packageName, targetRoot) {
  const sourceRoot = join(root, "packages", packageName);
  const packageManifest = join(sourceRoot, "package.json");
  const distDir = join(sourceRoot, "dist");
  if (!existsSync(packageManifest) || !existsSync(distDir)) {
    throw new Error(`package @codepawl/${packageName} must be built before packaging`);
  }
  await mkdir(targetRoot, { recursive: true });
  await cp(packageManifest, join(targetRoot, "package.json"));
  await cp(distDir, join(targetRoot, "dist"), { recursive: true });
}

async function sha256(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

if (platform !== "linux") {
  throw new Error("The internal private beta package currently targets Linux only.");
}

run("pnpm", ["build:desktop"]);
run("pnpm", ["--filter", "@codepawl/desktop", "exec", "tauri", "build", "--no-bundle", "--ci"], {
  env: tauriBuildEnv(),
});

if (!existsSync(binaryPath)) {
  throw new Error(`expected desktop binary was not found at ${binaryPath}`);
}

await rm(stagingRoot, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });
await mkdir(join(stagingRoot, "docs"), { recursive: true });
await mkdir(join(runnerRoot, "scripts"), { recursive: true });

await cp(binaryPath, join(stagingRoot, binaryName));
await cp(join(root, "package.json"), join(runnerRoot, "package.json"));
await cp(
  join(root, "scripts", "desktop-repository-run.mjs"),
  join(runnerRoot, "scripts", "desktop-repository-run.mjs"),
);
await cp(
  join(root, "scripts", "desktop-skill-manager.mjs"),
  join(runnerRoot, "scripts", "desktop-skill-manager.mjs"),
);
await cp(
  join(root, "scripts", "desktop-memory-manager.mjs"),
  join(runnerRoot, "scripts", "desktop-memory-manager.mjs"),
);
await cp(
  join(root, "scripts", "register-extensionless-esm-loader.mjs"),
  join(runnerRoot, "scripts", "register-extensionless-esm-loader.mjs"),
);

for (const packageName of runnerPackages) {
  await copyPackage(packageName, join(runnerRoot, "packages", packageName));
  await copyPackage(packageName, join(runnerRoot, "node_modules", "@codepawl", packageName));
}
await cp(
  builtinSkillRoot,
  join(runnerRoot, "packages", "skill-registry", "builtins"),
  { recursive: true },
);

for (const doc of [
  "docs/productization/private-beta-release-notes.md",
  "docs/productization/private-beta-release-smoke.md",
]) {
  if (existsSync(join(root, doc))) {
    await cp(join(root, doc), join(stagingRoot, "docs", doc.split("/").at(-1)));
  }
}

const manifest = {
  product: "Orynt Desktop",
  version,
  target: `${platform}-${arch}`,
  generatedAt: new Date().toISOString(),
  binary: binaryName,
  runnerRoot: "orynt-runner",
  distribution: "Unsigned internal Linux beta tarball.",
  updater: "Disabled; no updater artifacts are produced for this private beta.",
  signing: "Unsigned; verify SHA256SUMS from the trusted internal channel.",
  scope: "Repository-only supervised Coding Apprentice. Browser, desktop, arbitrary files, terminal, cloud sync, hosted accounts, and live billing are not enabled.",
  appData: {
    linux: "$XDG_CONFIG_HOME/com.codepawl.orynt or ~/.config/com.codepawl.orynt",
    artifacts: "artifacts/",
    memory: "memory/",
    runs: "runs/",
  },
  builtinSkills: {
    root: "orynt-runner/packages/skill-registry/builtins",
    names: builtinSkillNames,
  },
  smokeChecklist: "docs/private-beta-release-smoke.md",
};
await writeFile(join(stagingRoot, "RELEASE_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  join(stagingRoot, "README-INTERNAL-BETA.txt"),
  [
    "Orynt Desktop private beta",
    "",
    "Run ./orynt-desktop from this directory.",
    "Keep orynt-runner next to the binary; it contains the repository and skill-manager sidecars.",
    "This build is unsigned and manually distributed. The updater is disabled.",
    "Use docs/private-beta-release-smoke.md for the local release smoke checklist.",
    "",
  ].join("\n"),
);

const archivePath = join(distRoot, `${releaseName}.tar.gz`);
await mkdir(dirname(archivePath), { recursive: true });
run("tar", ["-czf", archivePath, "-C", distRoot, releaseName]);

const digest = await sha256(archivePath);
await writeFile(join(distRoot, "SHA256SUMS"), `${digest}  ${releaseName}.tar.gz\n`);

console.log(`Created ${archivePath}`);
console.log(`SHA256 ${digest}`);
