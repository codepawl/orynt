import * as path from "path";

export interface GitignoreRule {
  readonly regex: RegExp;
  readonly negated: boolean;
  readonly dirOnly: boolean;
}

/**
 * Converts a gitignore glob pattern to a RegExp.
 */
export function globToRegex(pattern: string): { regex: RegExp; dirOnly: boolean } {
  let dirOnly = false;
  if (pattern.endsWith("/")) {
    dirOnly = true;
    pattern = pattern.slice(0, -1);
  }

  let isAnchored = false;
  if (pattern.startsWith("/")) {
    isAnchored = true;
    pattern = pattern.slice(1);
  } else if (pattern.includes("/")) {
    isAnchored = true;
  }

  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          regexStr += "(?:.*/)?";
          i += 3;
        } else if (i + 2 === pattern.length) {
          regexStr += ".*";
          i += 2;
        } else {
          regexStr += ".*";
          i += 2;
        }
      } else {
        regexStr += "[^/]*";
        i += 1;
      }
    } else if (char === "?") {
      regexStr += "[^/]";
      i += 1;
    } else if (
      char === "\\" ||
      char === "." ||
      char === "+" ||
      char === "^" ||
      char === "$" ||
      char === "|" ||
      char === "(" ||
      char === ")" ||
      char === "{" ||
      char === "}" ||
      char === "[" ||
      char === "]"
    ) {
      regexStr += "\\" + char;
      i += 1;
    } else {
      regexStr += char;
      i += 1;
    }
  }

  if (isAnchored) {
    return {
      regex: new RegExp(`^${regexStr}(?:/|$)`),
      dirOnly,
    };
  } else {
    return {
      regex: new RegExp(`(?:^|/)${regexStr}(?:/|$)`),
      dirOnly,
    };
  }
}

/**
 * Represents a compiled .gitignore file.
 */
export class GitignoreMatcher {
  private readonly rules: GitignoreRule[] = [];
  private readonly baseDirRelative: string;

  constructor(content: string, baseDirRelative: string) {
    // Ensure forward slashes and trim trailing slash
    let normalizedBase = baseDirRelative ? baseDirRelative.replace(/\\/g, "/") : "";
    if (normalizedBase.endsWith("/")) {
      normalizedBase = normalizedBase.slice(0, -1);
    }
    this.baseDirRelative = normalizedBase;

    const lines = content.split(/\r?\n/);
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      let negated = false;
      if (line.startsWith("!")) {
        negated = true;
        line = line.slice(1);
      }

      const { regex, dirOnly } = globToRegex(line);
      this.rules.push({ regex, negated, dirOnly });
    }
  }

  /**
   * Matches a path relative to the repository root.
   * Returns:
   * - { ignored: boolean } if a rule matched.
   * - null if no rules in this matcher matched.
   */
  public match(filePath: string, isDir: boolean): { ignored: boolean } | null {
    const normalizedPath = filePath.replace(/\\/g, "/");

    if (this.baseDirRelative !== "") {
      if (
        normalizedPath !== this.baseDirRelative &&
        !normalizedPath.startsWith(this.baseDirRelative + "/")
      ) {
        return null;
      }
    }

    const relativeToGitignore = this.baseDirRelative === ""
      ? normalizedPath
      : normalizedPath === this.baseDirRelative
        ? ""
        : normalizedPath.slice(this.baseDirRelative.length + 1);

    let matchResult: { ignored: boolean } | null = null;

    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir) {
        continue;
      }
      if (rule.regex.test(relativeToGitignore)) {
        matchResult = { ignored: !rule.negated };
      }
    }

    return matchResult;
  }
}

/**
 * Checks if a relative path is ignored by an accumulated stack of GitignoreMatchers.
 * Matchers are checked from deepest directory to repository root. First match wins.
 */
export function isPathIgnored(
  relativePath: string,
  isDir: boolean,
  matchers: ReadonlyArray<GitignoreMatcher>
): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  for (let i = matchers.length - 1; i >= 0; i--) {
    const matcher = matchers[i];
    if (matcher) {
      const match = matcher.match(normalized, isDir);
      if (match !== null) {
        return match.ignored;
      }
    }
  }
  return false;
}
