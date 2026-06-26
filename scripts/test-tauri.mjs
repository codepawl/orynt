#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const manifestPath = "apps/desktop/src-tauri/Cargo.toml";
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

const cargo = spawn("cargo", ["test", "--manifest-path", manifestPath, ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});

cargo.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
