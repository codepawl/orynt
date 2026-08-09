import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import {
  parseBrowserCliArgs,
  readBrowserSessionDescriptor,
  runBrowserCli,
} from "./browser";

describe("Orynt browser CLI", () => {
  it("parses isolated start defaults and explicit headed options", () => {
    expect(parseBrowserCliArgs(["start"])).toEqual({
      kind: "start",
      headless: true,
      allowedOrigins: [],
    });
    expect(parseBrowserCliArgs([
      "start",
      "--headed",
      "--executable",
      "./chrome",
      "--url",
      "https://example.test",
      "--allow-origin",
      "https://assets.example.test",
    ])).toEqual({
      kind: "start",
      headless: false,
      executablePath: path.resolve("./chrome"),
      initialUrl: "https://example.test",
      allowedOrigins: [
        "https://assets.example.test",
        "https://example.test",
      ],
    });
  });

  it("requires an explicit loopback endpoint for attaching a logged-in browser", () => {
    expect(parseBrowserCliArgs([
      "attach",
      "--browser-url",
      "http://127.0.0.1:9222",
      "--allow-origin",
      "https://example.test",
    ])).toEqual({
      kind: "attach",
      browserUrl: "http://127.0.0.1:9222",
      allowedOrigins: ["https://example.test"],
    });
    expect(() => parseBrowserCliArgs([
      "attach",
      "--browser-url",
      "https://browser.example.com",
      "--allow-origin",
      "https://example.test",
    ])).toThrow(/loopback/i);
    expect(() => parseBrowserCliArgs([
      "attach",
      "--browser-url",
      "http://127.0.0.1:9222",
    ])).toThrow(/allow-origin/i);
  });

  it("parses explicit origin-scope management and rejects path-shaped scopes", () => {
    expect(parseBrowserCliArgs(["scope", "list"])).toEqual({
      kind: "scope",
      operation: "list",
    });
    expect(parseBrowserCliArgs([
      "scope",
      "add",
      "https://example.test",
    ])).toEqual({
      kind: "scope",
      operation: "add",
      origin: "https://example.test",
    });
    expect(() => parseBrowserCliArgs([
      "scope",
      "add",
      "https://example.test/private",
    ])).toThrow(/origin scope/i);
  });

  it("requires an explicitly started or attached browser session", async () => {
    const output: string[] = [];
    const code = await runBrowserCli(["status"], {
      env: {},
      stateRoot: "/tmp/orynt-browser-cli-test",
      write: (line) => output.push(line),
    });
    expect(code).toBe(1);
    expect(output.join("\n")).toMatch(/No scoped browser session/);
  });

  it("fails closed for legacy session descriptors without an origin scope", async () => {
    const stateRoot = await mkdtemp(
      path.join(os.tmpdir(), "orynt-browser-legacy-"),
    );
    await mkdir(path.join(stateRoot, "browser"));
    await writeFile(
      path.join(stateRoot, "browser", "session.json"),
      JSON.stringify({
        schemaVersion: 1,
        mode: "attached",
        webSocketUrl: "ws://127.0.0.1:9222/devtools/browser/example",
        createdAt: new Date().toISOString(),
      }),
    );

    await expect(readBrowserSessionDescriptor(stateRoot)).resolves.toBeUndefined();
  });

  it("reports doctor readiness without opening a browser", async () => {
    const output: string[] = [];
    const code = await runBrowserCli(["doctor"], {
      env: {},
      stateRoot: "/tmp/orynt-browser-cli-test",
      findChrome: async () => "/opt/chrome-for-testing/chrome",
      write: (line) => output.push(line),
    });
    expect(code).toBe(0);
    expect(output.join("\n")).toContain("Runtime: available on explicit start or attach");
    expect(output.join("\n")).toContain("no cookies, credentials, raw scripts");
  });
});
