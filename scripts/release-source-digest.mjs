import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GENERATED_ROOTS = [
  "dist/",
  "docs/release/evidence/",
  "packages/eval-harness/reports/",
];

function isGeneratedPath(file) {
  return GENERATED_ROOTS.some((root) => file.startsWith(root));
}

export async function releaseSourceDigest(repositoryRoot) {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, maxBuffer: 8 * 1024 * 1024 },
  );
  const files = Buffer.from(stdout).toString("utf8").split("\0").filter(Boolean)
    .filter((file) => !isGeneratedPath(file));
  const digest = createHash("sha256");
  for (const file of files.sort()) {
    digest.update(file).update("\0");
    const absolutePath = path.join(repositoryRoot, file);
    const entry = await lstat(absolutePath).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (entry === null) {
      digest.update("<deleted>").update("\0");
      continue;
    }
    if (entry.isFile()) {
      digest.update("<file>\0").update(await readFile(absolutePath)).update("\0");
      continue;
    }
    if (entry.isSymbolicLink()) {
      digest.update("<symlink>\0").update(await readlink(absolutePath)).update("\0");
      continue;
    }
    throw new Error(`Unsupported release source entry type: ${file}`);
  }
  return digest.digest("hex");
}
