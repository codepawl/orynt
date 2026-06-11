import * as path from "path";

/**
 * Thrown when a write operation targets a disallowed file or path.
 * The run is aborted immediately on this error.
 */
export class SafetyViolationError extends Error {
  public readonly violatingPath: string;
  public readonly reason: string;

  constructor(violatingPath: string, reason: string) {
    super(`Safety violation on path "${violatingPath}": ${reason}`);
    this.name = "SafetyViolationError";
    this.violatingPath = violatingPath;
    this.reason = reason;
  }
}

/**
 * File name patterns that are considered secret or sensitive.
 * Matched against the basename of the file.
 */
const SECRET_FILENAME_PATTERNS = [
  /^\.env(\..+)?$/,   // .env, .env.local, .env.production, etc.
  /^\.netrc$/,
  /^credentials(\.json)?$/,
  /^secrets(\.json|\.yaml|\.yml)?$/,
  /^id_rsa$/,
  /^id_ed25519$/,
  /^.*\.pem$/,
  /^.*\.key$/,
  /^.*\.pfx$/,
  /^.*\.p12$/,
];

/**
 * Directory or file patterns that should never be written to.
 * Matched against relative paths from the repo root.
 */
const DISALLOWED_WRITE_PATTERNS = [
  // Version control
  /^\.git\b/,
  // Package lock files
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^bun\.lock(\.bak)?$/,
  /^pnpm-lock\.yaml$/,
  /^Pipfile\.lock$/,
  /^poetry\.lock$/,
  /^Cargo\.lock$/,
  // Generated build artifacts
  /^(dist|build|\.next|\.nuxt|out|__pycache__|\.venv|coverage)(\/|$)/,
  // Migration files (append-only by convention)
  /^(apps\/api\/migrations|migrations|db\/migrations)(\/|$)/,
  // Dependency directories
  /^node_modules(\/|$)/,
  // Environment files
  /^\.env(\..+)?$/,
  // Binary file extensions
  /\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|otf|mp4|webm|mp3|pdf|zip|tar|gz|rar|bin|exe|dll|so|dylib)$/i,
];

/**
 * Directory patterns excluded from repo scan (read safety).
 */
export const SCAN_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "coverage",
  ".venv",
  "__pycache__",
  ".codepawl",
  ".agents",
  "out",
  ".openpawl-src",
]);

/** Maximum number of files to include in a repo scan. */
export const SCAN_MAX_FILES = 2000;

/** Maximum total bytes to read across all selected file contents. */
export const SCAN_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Returns true if the given file basename looks like it contains secrets.
 */
export function isSecretFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return SECRET_FILENAME_PATTERNS.some((re) => re.test(basename));
}

/**
 * Returns true if the relative path is in a disallowed write location.
 * Also returns true if the resolved absolute path is outside the repo root.
 *
 * @param repoRoot  Absolute path to the repository root.
 * @param filePath  Either absolute or relative path to the file.
 */
export function isDisallowedPath(repoRoot: string, filePath: string): boolean {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(repoRoot, filePath);

  // Never write outside the repository
  const normalizedRepo = path.resolve(repoRoot);
  if (!absolutePath.startsWith(normalizedRepo + path.sep) && absolutePath !== normalizedRepo) {
    return true;
  }

  const relativePath = path.relative(normalizedRepo, absolutePath);

  // Check basename for secret patterns
  if (isSecretFile(relativePath)) {
    return true;
  }

  // Check against disallowed write patterns
  return DISALLOWED_WRITE_PATTERNS.some((re) => re.test(relativePath));
}

/**
 * Validates a list of file paths intended for write operations.
 * Throws SafetyViolationError immediately on the first violation.
 *
 * @param repoRoot   Absolute path to the repository root.
 * @param filePaths  Array of absolute or relative file paths to validate.
 */
export function assertWriteSafe(repoRoot: string, filePaths: ReadonlyArray<string>): void {
  for (const filePath of filePaths) {
    if (isDisallowedPath(repoRoot, filePath)) {
      const reason = determineViolationReason(repoRoot, filePath);
      throw new SafetyViolationError(filePath, reason);
    }
  }
}

/**
 * Returns a human-readable reason for why a path is disallowed.
 */
function determineViolationReason(repoRoot: string, filePath: string): string {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(repoRoot, filePath);
  const normalizedRepo = path.resolve(repoRoot);

  if (!absolutePath.startsWith(normalizedRepo + path.sep) && absolutePath !== normalizedRepo) {
    return "path is outside the repository root";
  }

  const relativePath = path.relative(normalizedRepo, absolutePath);
  const basename = path.basename(relativePath);

  if (SECRET_FILENAME_PATTERNS.some((re) => re.test(basename))) {
    return "file appears to be a secret or credentials file";
  }

  if (/^\.git\b/.test(relativePath)) return "cannot modify .git internals";
  if (/lock/.test(basename)) return "lockfiles must not be modified by agent";
  if (/^(dist|build|\.next|coverage|__pycache__|\.venv)/.test(relativePath)) {
    return "generated build or virtual environment artifact";
  }
  if (/migrations/.test(relativePath)) return "migration files are append-only";
  if (/^node_modules/.test(relativePath)) return "cannot modify installed dependencies";
  if (/^\.env/.test(basename)) return "environment files may contain secrets";

  return "matches a disallowed write pattern";
}
