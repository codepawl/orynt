#!/usr/bin/env bun
import { spawn } from "node:child_process";

const token = `orynt-stdio-${process.pid}-${Date.now()}`;
const child = spawn(
  process.execPath,
  [
    "-e",
    "process.stdin.setEncoding('utf8');let value='';process.stdin.on('data',(chunk)=>value+=chunk);process.stdin.on('end',()=>process.stdout.write(value));",
  ],
  { stdio: ["pipe", "pipe", "pipe"] },
);
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-2_000);
});

const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("HOST_STDIO_UNAVAILABLE: child stdin round trip timed out."));
  }, 5_000);
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    clearTimeout(timeout);
    resolve({ code, signal });
  });
  child.stdin.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.stdin.end(token);
});

if (result.code !== 0 || stdout !== token) {
  throw new Error(
    "HOST_STDIO_UNAVAILABLE: the current host cannot deliver data to a child " +
      `process over stdin (code=${String(result.code)}, signal=${String(result.signal)}, ` +
      `stdoutBytes=${Buffer.byteLength(stdout)}, stderr=${JSON.stringify(stderr)}).`,
  );
}

process.stdout.write("Host child-process stdin round trip passed.\n");
