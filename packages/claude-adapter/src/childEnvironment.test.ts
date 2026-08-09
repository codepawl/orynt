import { describe, expect, it } from "bun:test";

import { claudeChildEnvironment } from "./childEnvironment";

const SOURCE: NodeJS.ProcessEnv = {
  PATH: "/usr/bin",
  HOME: "/home/an",
  LANG: "en_US.UTF-8",
  CLAUDE_CONFIG_DIR: "/home/an/.claude",
  ANTHROPIC_BASE_URL: "https://api.anthropic.com",
  ANTHROPIC_API_KEY: "sk-ant-secret",
  ANTHROPIC_AUTH_TOKEN: "oat-secret",
  GITHUB_TOKEN: "ghp_secret",
  AWS_SECRET_ACCESS_KEY: "aws-secret",
  ORYNT_STATE_HOME: "/home/an/.local/state/orynt",
  NPM_BOOTSTRAP_TOKEN: "npm-secret",
};

describe("claude child environment allowlist", () => {
  it("passes through the operational variables the CLI needs", () => {
    const child = claudeChildEnvironment(SOURCE);
    expect(child.PATH).toBe("/usr/bin");
    expect(child.HOME).toBe("/home/an");
    expect(child.LANG).toBe("en_US.UTF-8");
    expect(child.CLAUDE_CONFIG_DIR).toBe("/home/an/.claude");
    expect(child.ANTHROPIC_BASE_URL).toBe("https://api.anthropic.com");
  });

  it("withholds every credential that is not explicitly allowed", () => {
    const child = claudeChildEnvironment(SOURCE);
    // The allowlist is the security boundary: unrelated secrets in Orynt's own
    // environment must never reach the spawned process.
    for (const name of [
      "GITHUB_TOKEN",
      "AWS_SECRET_ACCESS_KEY",
      "NPM_BOOTSTRAP_TOKEN",
      "ORYNT_STATE_HOME",
    ]) {
      expect(child).not.toHaveProperty(name);
    }
    expect(JSON.stringify(child)).not.toContain("ghp_secret");
    expect(JSON.stringify(child)).not.toContain("aws-secret");
  });

  it("withholds the Anthropic credential unless bare mode needs it", () => {
    const child = claudeChildEnvironment(SOURCE);
    expect(child).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(child).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
  });

  it("includes the Anthropic credential in bare mode", () => {
    // `--bare` never reads OAuth credentials or the keychain, so the key is
    // the only way the child can authenticate.
    const child = claudeChildEnvironment(SOURCE, { includeApiCredential: true });
    expect(child.ANTHROPIC_API_KEY).toBe("sk-ant-secret");
    expect(child.ANTHROPIC_AUTH_TOKEN).toBe("oat-secret");
    expect(child).not.toHaveProperty("GITHUB_TOKEN");
  });

  it("omits absent variables rather than setting them to undefined", () => {
    const child = claudeChildEnvironment({ PATH: "/usr/bin" });
    expect(Object.keys(child)).toEqual(["PATH"]);
    expect(JSON.stringify(child)).not.toContain("undefined");
  });
});
