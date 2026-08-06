import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import type { LspCommandSpec } from "./types.js";

const require = createRequire(import.meta.url);

export const TYPESCRIPT_LANGUAGE_SERVER_VERSION = "5.3.0";
export const BUNDLED_TYPESCRIPT_VERSION = "6.0.3";

export function bundledTypeScriptCommand(
  workspacePath: string,
): LspCommandSpec {
  const cliPath = require.resolve("typescript-language-server/lib/cli.mjs");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        adapter: "typescript",
        server: TYPESCRIPT_LANGUAGE_SERVER_VERSION,
        typescript: BUNDLED_TYPESCRIPT_VERSION,
        cliPath,
      }),
    )
    .digest("hex");
  return {
    command: process.execPath,
    args: [cliPath, "--stdio", "--log-level", "2"],
    cwd: workspacePath,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
    },
    fingerprint,
  };
}
