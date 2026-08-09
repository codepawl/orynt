import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandRoot = path.join(repositoryRoot, "assets", "brand", "codepawl-orynt");
const desktopPublic = path.join(repositoryRoot, "apps", "desktop", "public");
const desktopBuild = path.join(repositoryRoot, "apps", "desktop", "build");

const files = {
  oryntMarkSvg: path.join(brandRoot, "orynt", "orynt-mark.svg"),
  oryntMarkPng: path.join(brandRoot, "orynt", "orynt-mark.png"),
};

const run = async (command, args, errorMessage) => {
  const process = Bun.spawn([command, ...args], {
    cwd: repositoryRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`${errorMessage} failed with exit code ${exitCode}.`);
  }
};

await Promise.all([
  mkdir(desktopPublic, { recursive: true }),
  mkdir(desktopBuild, { recursive: true }),
]);

const reverseMark = (await readFile(files.oryntMarkSvg, "utf8")).replaceAll("#241F1A", "#F7F3ED");
const consumerCopies = [
  [files.oryntMarkSvg, path.join(desktopPublic, "favicon-light.svg")],
  [files.oryntMarkSvg, path.join(desktopPublic, "favicon.svg")],
];
await Promise.all(consumerCopies.map(([source, target]) => cp(source, target)));
await writeFile(path.join(desktopPublic, "favicon-dark.svg"), reverseMark);

const iconOutput = await mkdtemp(path.join(os.tmpdir(), "orynt-brand-icons-"));
try {
  const tauri = path.join(repositoryRoot, "apps", "desktop", "node_modules", ".bin", "tauri");
  await run(tauri, ["icon", files.oryntMarkPng, "--output", iconOutput], "Tauri icon generation");
  await Promise.all(
    ["icon.png", "icon.ico", "icon.icns"].map((name) =>
      cp(path.join(iconOutput, name), path.join(desktopBuild, name)),
    ),
  );
} finally {
  await rm(iconOutput, { recursive: true, force: true });
}

console.log("Synchronized CodePawl × Orynt brand assets.");
