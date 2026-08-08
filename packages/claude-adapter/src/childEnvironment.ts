/**
 * Environment allowlist for the spawned `claude` process.
 *
 * This list is the security boundary for Track B: everything not named here is
 * withheld from the child, so repository-derived or unrelated credentials in
 * Orynt's own environment cannot reach it. Mirrors `codexChildEnvironment()`
 * with the Codex-specific entries swapped for Claude's.
 */
export type ClaudeChildEnvironmentOptions = {
  /**
   * Include `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`. Required only in
   * bare mode, where the CLI never reads OAuth credentials or the keychain and
   * therefore has no other way to authenticate.
   */
  includeApiCredential?: boolean;
};

const ALLOWED_NAMES = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "WINDIR",
  "LOCALAPPDATA",
  "APPDATA",
  "USERPROFILE",
  "CLAUDE_CONFIG_DIR",
  "ANTHROPIC_BASE_URL",
  "SSL_CERT_FILE",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "DBUS_SESSION_BUS_ADDRESS",
  "BROWSER",
] as const;

const CREDENTIAL_NAMES = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;

export function claudeChildEnvironment(
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
  options: ClaudeChildEnvironmentOptions = {},
): NodeJS.ProcessEnv {
  const names: readonly string[] = options.includeApiCredential
    ? [...ALLOWED_NAMES, ...CREDENTIAL_NAMES]
    : ALLOWED_NAMES;
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = sourceEnvironment[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}
