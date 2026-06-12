import { describe, it, expect } from "vitest";
import { GitignoreMatcher, isPathIgnored, globToRegex } from "../gitignore";

describe("globToRegex", () => {
  it("converts simple filenames", () => {
    const { regex, dirOnly } = globToRegex("foo.txt");
    expect(dirOnly).toBe(false);
    expect(regex.test("foo.txt")).toBe(true);
    expect(regex.test("dir/foo.txt")).toBe(true);
    expect(regex.test("foo.txt.bak")).toBe(false);
  });

  it("handles directory-only pattern trailing slashes", () => {
    const { regex, dirOnly } = globToRegex("dist/");
    expect(dirOnly).toBe(true);
    expect(regex.test("dist")).toBe(true);
    expect(regex.test("foo/dist")).toBe(true);
  });

  it("handles anchored leading slashes", () => {
    const { regex } = globToRegex("/dist");
    expect(regex.test("dist")).toBe(true);
    expect(regex.test("foo/dist")).toBe(false);
  });

  it("handles wildcards", () => {
    const { regex } = globToRegex("*.log");
    expect(regex.test("error.log")).toBe(true);
    expect(regex.test("dir/error.log")).toBe(true);
    expect(regex.test("error.log.txt")).toBe(false);
  });

  it("handles double asterisk folder wildcard", () => {
    const { regex } = globToRegex("logs/**/*.txt");
    expect(regex.test("logs/error.txt")).toBe(true);
    expect(regex.test("logs/2026/error.txt")).toBe(true);
    expect(regex.test("logs/2026/06/error.txt")).toBe(true);
    expect(regex.test("other/logs/error.txt")).toBe(false); // Anchored due to slash
  });
});

describe("GitignoreMatcher", () => {
  it("matches root patterns correctly", () => {
    const gitignoreContent = `
# Comment
temp/
*.log
!important.log
/root-only.txt
`;
    const matcher = new GitignoreMatcher(gitignoreContent, "");

    // Temp folder ignored
    expect(matcher.match("temp", true)).toEqual({ ignored: true });
    expect(matcher.match("temp", false)).toBeNull(); // temp/ is dirOnly
    expect(matcher.match("src/temp", true)).toEqual({ ignored: true });

    // Logs ignored
    expect(matcher.match("error.log", false)).toEqual({ ignored: true });
    expect(matcher.match("src/error.log", false)).toEqual({ ignored: true });

    // Negated log not ignored
    expect(matcher.match("important.log", false)).toEqual({ ignored: false });
    expect(matcher.match("src/important.log", false)).toEqual({ ignored: false });

    // Root only file matching
    expect(matcher.match("root-only.txt", false)).toEqual({ ignored: true });
    expect(matcher.match("src/root-only.txt", false)).toBeNull();
  });

  it("matches nested gitignore patterns relative to baseDir", () => {
    const gitignoreContent = `
dist/
*.tmp
`;
    const matcher = new GitignoreMatcher(gitignoreContent, "packages/core");

    // Outside path not matched
    expect(matcher.match("dist", true)).toBeNull();
    expect(matcher.match("packages/dist", true)).toBeNull();

    // Nested path inside packages/core matched
    expect(matcher.match("packages/core/dist", true)).toEqual({ ignored: true });
    expect(matcher.match("packages/core/src/index.tmp", false)).toEqual({ ignored: true });
  });
});

describe("isPathIgnored stack matcher", () => {
  it("checks rule precedence correctly", () => {
    const rootMatcher = new GitignoreMatcher(`
*.log
/dist/
`, "");

    const nestedMatcher = new GitignoreMatcher(`
!important.log
dist/
`, "src");

    const matchers = [rootMatcher, nestedMatcher];

    // Root ignores logs
    expect(isPathIgnored("error.log", false, matchers)).toBe(true);
    // Nested matcher negates important.log inside src
    expect(isPathIgnored("src/important.log", false, matchers)).toBe(false);
    // Root does not negate important.log outside src
    expect(isPathIgnored("important.log", false, matchers)).toBe(true);

    // Root ignores dist at root
    expect(isPathIgnored("dist", true, matchers)).toBe(true);
    // Root does not ignore nested dist, but nested matcher does
    expect(isPathIgnored("src/dist", true, matchers)).toBe(true);
  });
});
