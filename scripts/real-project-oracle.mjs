#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";

import { chromium } from "playwright-core";
import { evaluateAuthoredSourceReadability } from "../packages/eval-harness/dist/index.js";

// Hidden oracles are loopback-only. Proxying CDP can both hang the handshake and
// violate the no-external-network evidence boundary.
for (const name of [
  "ALL_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "all_proxy",
  "http_proxy",
  "https_proxy",
]) {
  delete process.env[name];
}
process.env.NO_PROXY = "127.0.0.1,localhost,::1";
process.env.no_proxy = process.env.NO_PROXY;

const options = parseOptions(process.argv.slice(2));
const oracleId = required("oracle");
const repository = path.resolve(required("repo"));
const outputRoot = path.resolve(required("output"));
const cliPath = path.resolve(required("cli"));
const stateHome = path.resolve(required("state-home"));
await mkdir(outputRoot, { recursive: true });

const startedAt = new Date().toISOString();
let result;
try {
  if (oracleId === "calculator-browser-v1") {
    result = await runStaticBrowserOracle("calculator");
  } else if (oracleId === "project-board-browser-v1") {
    result = await runStaticBrowserOracle("project-board");
  } else if (oracleId === "support-desk-browser-api-v1") {
    result = await runSupportDeskOracle();
  } else if (oracleId === "click-strict-equality-v1") {
    result = await runClickOracle();
  } else {
    throw new Error(`Unknown hidden oracle: ${oracleId}`);
  }
  const report = {
    schemaVersion: 1,
    oracleId,
    status: "pass",
    startedAt,
    completedAt: new Date().toISOString(),
    ...result,
  };
  await writeJson(path.join(outputRoot, "oracle-result.json"), report);
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  const report = {
    schemaVersion: 1,
    oracleId,
    status: "fail",
    startedAt,
    completedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  await writeJson(path.join(outputRoot, "oracle-result.json"), report);
  process.stderr.write(`${report.error}\n`);
  process.exitCode = 1;
}

async function runStaticBrowserOracle(kind) {
  await assertFile(path.join(repository, "index.html"), "index.html is missing");
  if (kind === "project-board") {
    await assertReadableAuthoredSources([
      "index.html",
      "styles.css",
      "src/main.js",
    ]);
  }
  await runDeclaredTestScript(kind === "calculator");
  const port = await reservePort();
  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      const relative = url.pathname === "/"
        ? "index.html"
        : decodeURIComponent(url.pathname.slice(1));
      const normalized = path.posix.normalize(relative);
      if (
        normalized === ".." ||
        normalized.startsWith("../") ||
        path.isAbsolute(normalized)
      ) {
        response.writeHead(404).end("Not found");
        return;
      }
      const target = path.join(repository, normalized);
      const metadata = await stat(target).catch(() => null);
      if (!metadata?.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, { "content-type": contentType(target) });
      response.end(await readFile(target));
    } catch {
      response.writeHead(500).end("Internal error");
    }
  });
  await listenServer(server, port);
  try {
    const origin = `http://127.0.0.1:${port}`;
    return await withOryntBrowser(origin, async (page) => {
      if (kind === "calculator") return await inspectCalculator(page);
      return await inspectProjectBoard(page);
    });
  } finally {
    await closeServer(server);
  }
}

async function assertReadableAuthoredSources(relativePaths) {
  for (const relativePath of relativePaths) {
    const target = path.join(repository, relativePath);
    const source = await readFile(target, "utf8").catch(() => null);
    if (source === null) continue;
    const problems = evaluateAuthoredSourceReadability(relativePath, source);
    if (problems.length > 0) throw new Error(problems.join("; "));
  }
}

async function inspectCalculator(page) {
  const browserErrors = collectBrowserErrors(page);
  await page.goto(page.url(), { waitUntil: "networkidle" });
  const requiredTestIds = [
    "calculator",
    "display",
    ...Array.from({ length: 10 }, (_, digit) => `key-${digit}`),
    "key-decimal",
    "key-add",
    "key-subtract",
    "key-multiply",
    "key-divide",
    "key-equals",
    "key-clear",
  ];
  const missingTestIds = [];
  for (const testId of requiredTestIds) {
    if (await page.getByTestId(testId).count() !== 1) {
      missingTestIds.push(testId);
    }
  }
  if (missingTestIds.length > 0) {
    throw new Error(
      `calculator DOM contract is missing unique data-testid values: ${missingTestIds.join(", ")}`,
    );
  }
  const ariaLive = await page.getByTestId("display").getAttribute("aria-live");
  if (!ariaLive || ariaLive === "off") {
    throw new Error("calculator display must expose an active aria-live region");
  }
  await page.keyboard.press("Tab");
  const focusStyle = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const style = getComputedStyle(active);
    return {
      tag: active.tagName,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
  if (
    !focusStyle ||
    (
      (focusStyle.outlineStyle === "none" || focusStyle.outlineWidth === "0px") &&
      focusStyle.boxShadow === "none"
    )
  ) {
    throw new Error("calculator keyboard focus is not visibly styled");
  }
  await click(page, "key-1");
  await click(page, "key-2");
  await click(page, "key-add");
  await click(page, "key-7");
  await click(page, "key-equals");
  await expectText(page, "display", "19");
  await click(page, "key-clear");
  await page.keyboard.type("9-4=");
  await expectText(page, "display", "5");
  await click(page, "key-clear");
  await page.keyboard.type("6*7=");
  await expectText(page, "display", "42");
  await click(page, "key-clear");
  await page.keyboard.type("8/2=");
  await expectText(page, "display", "4");
  await click(page, "key-clear");
  await page.keyboard.type("1.5+2.25=");
  await expectText(page, "display", "3.75");
  await click(page, "key-clear");
  await page.keyboard.type("8/0=");
  await expectText(page, "display", "Error");
  await page.keyboard.type("7");
  await expectText(page, "display", "7");
  await click(page, "key-clear");
  await expectText(page, "display", "0");
  await screenshotPair(page);
  assertNoBrowserErrors(browserErrors);
  return {
    checks: [
      "semantic calculator root",
      "exact data-testid contract",
      "aria-live display and visible keyboard focus",
      "pointer addition",
      "keyboard subtraction, multiplication, division, and decimals",
      "division-by-zero recovery by new input and all-clear",
      "desktop and mobile screenshots",
    ],
    visualEvidence: visualPaths(),
  };
}

async function inspectProjectBoard(page) {
  const browserErrors = collectBrowserErrors(page);
  await page.goto(page.url(), { waitUntil: "networkidle" });
  for (const testId of [
    "board-root",
    "add-task",
    "column-backlog",
    "column-in-progress",
    "column-done",
  ]) {
    await expectTestIdCount(page, testId, 1, "page");
  }
  await click(page, "add-task");
  for (const testId of [
    "task-title",
    "task-description",
    "task-submit",
  ]) {
    await expectTestIdCount(page, testId, 1, "open task form");
  }
  await page.getByTestId("task-title").fill("Battle task");
  await page.getByTestId("task-description").fill("Created by the hidden oracle");
  await click(page, "task-submit");
  await expectCount(page, '[data-testid="task-card"]', 1);
  let taskCard = page.getByTestId("task-card").first();
  await expectTestIdCount(taskCard, "edit-task", 1, "task card");
  await expectTestIdCount(taskCard, "move-next", 1, "advancing task card");
  await expectTestIdCount(taskCard, "delete-task", 1, "task card");
  await taskCard.getByTestId("edit-task").click();
  await page.getByTestId("task-title").fill("Battle task edited");
  await click(page, "task-submit");
  taskCard = page.getByTestId("task-card").first();
  await expectTestIdCount(taskCard, "move-next", 1, "advancing task card");
  await taskCard.getByTestId("move-next").click();
  await expectCount(
    page.getByTestId("column-in-progress"),
    '[data-testid="task-card"]',
    1,
  );
  await page.reload({ waitUntil: "networkidle" });
  await expectCount(page, '[data-testid="task-card"]', 1);
  taskCard = page.getByTestId("task-card").first();
  await expectTestIdCount(taskCard, "edit-task", 1, "persisted task card");
  await expectTestIdCount(taskCard, "delete-task", 1, "persisted task card");
  const persisted = await page.evaluate(() =>
    localStorage.getItem("orynt.project-board.v1")
  );
  if (!persisted?.includes("Battle task edited")) {
    throw new Error("project board did not persist the edited task");
  }
  await screenshotPair(page);
  await taskCard.getByTestId("delete-task").click();
  await expectCount(page, '[data-testid="task-card"]', 0);
  assertNoBrowserErrors(browserErrors);
  return {
    checks: [
      "create",
      "edit",
      "move",
      "reload persistence",
      "delete",
      "readable authored source",
      "desktop and mobile screenshots",
    ],
    visualEvidence: visualPaths(),
  };
}

async function runSupportDeskOracle() {
  await assertFile(path.join(repository, "package.json"), "package.json is missing");
  await runDeclaredTestScript(true);
  const port = await reservePort();
  const databasePath = path.join(outputRoot, "support-desk.sqlite3");
  let server = startRepositoryServer(port, databasePath);
  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${origin}/api/tickets`);
    const invalid = await fetch(`${origin}/api/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    if (invalid.status !== 400) {
      throw new Error(`invalid ticket returned ${invalid.status}, expected 400`);
    }
    const createdResponse = await fetch(`${origin}/api/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "API ticket",
        description: "Persistence check",
        priority: "high",
      }),
    });
    if (!createdResponse.ok) {
      throw new Error(`ticket creation failed with ${createdResponse.status}`);
    }
    const created = await createdResponse.json();
    if (!created?.id) throw new Error("created ticket has no id");
    const updated = await fetch(`${origin}/api/tickets/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    if (!updated.ok) throw new Error(`ticket update failed with ${updated.status}`);
    await stopProcess(server);
    server = startRepositoryServer(port, databasePath);
    await waitForHttp(`${origin}/api/tickets`);
    const tickets = await fetch(`${origin}/api/tickets`).then((response) =>
      response.json()
    );
    if (
      !Array.isArray(tickets) ||
      !tickets.some((ticket) =>
        ticket.id === created.id && ticket.status === "resolved"
      )
    ) {
      throw new Error("ticket did not survive server restart");
    }
    const browserResult = await withOryntBrowser(origin, async (page) => {
      const browserErrors = collectBrowserErrors(page);
      await page.goto(origin, { waitUntil: "networkidle" });
      await expectCount(page, '[data-testid="support-desk"]', 1);
      await page.getByTestId("ticket-title").fill("Browser ticket");
      await page.getByTestId("ticket-description").fill("Created in browser");
      await page.getByTestId("ticket-priority").selectOption("medium");
      await click(page, "ticket-submit");
      await page.getByTestId("ticket-card").filter({ hasText: "Browser ticket" })
        .waitFor();
      await screenshotPair(page);
      assertNoBrowserErrors(browserErrors);
      return { visualEvidence: visualPaths() };
    });
    return {
      checks: [
        "invalid request",
        "API create",
        "API update",
        "SQLite restart persistence",
        "browser create",
        "desktop and mobile screenshots",
      ],
      ...browserResult,
    };
  } finally {
    await stopProcess(server);
  }
}

async function runDeclaredTestScript(required) {
  const manifestPath = path.join(repository, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    typeof manifest.scripts?.test !== "string" ||
    !manifest.scripts.test.trim()
  ) {
    if (required) {
      throw new Error("package.json must expose a non-empty test script");
    }
    return;
  }
  const outcome = await runProcess("bun", ["run", "test"], {
    cwd: repository,
    env: {
      ...process.env,
      CI: "1",
    },
    timeoutMs: 2 * 60_000,
  });
  if (outcome.exitCode !== 0) {
    throw new Error(
      `declared test script failed: ${outcome.stderr || outcome.stdout}`,
    );
  }
}

async function runClickOracle() {
  const sourcePath = path.join(repository, "src");
  const python = [
    "import click",
    "class StrictEq:",
    "    def __eq__(self, other):",
    "        if isinstance(other, str):",
    "            raise ValueError('cannot compare to string')",
    "        return NotImplemented",
    "    def __str__(self):",
    "        return 'strict'",
    "ctx = click.Context(click.Command('cli'))",
    "strict = click.Option(['--limit'], default=StrictEq(), show_default=True)",
    "message = strict.get_help_record(ctx)[1]",
    "assert '[default: strict]' in message, message",
    "empty = click.Option(['--empty'], default='', show_default=True)",
    "empty_message = empty.get_help_record(ctx)[1]",
    "assert '[default: \"\"]' in empty_message, empty_message",
    "print('click strict equality oracle passed')",
  ].join("\n");
  const outcome = await runProcess("python3", ["-c", python], {
    cwd: repository,
    env: {
      ...process.env,
      PYTHONPATH: sourcePath,
      PYTHONDONTWRITEBYTECODE: "1",
    },
    timeoutMs: 60_000,
  });
  if (outcome.exitCode !== 0) {
    throw new Error(outcome.stderr || outcome.stdout || "Click oracle failed");
  }
  return { checks: ["strict equality default", "empty string default"] };
}

async function withOryntBrowser(origin, inspect) {
  const start = await runProcess(
    "bun",
    [
      cliPath,
      "browser",
      "start",
      "--url",
      origin,
      "--allow-origin",
      origin,
    ],
    {
      cwd: repository,
      env: { ...process.env, ORYNT_STATE_HOME: stateHome },
      timeoutMs: 30_000,
    },
  );
  if (start.exitCode !== 0) {
    throw new Error(start.stderr || start.stdout || "Orynt browser start failed");
  }
  let browser;
  try {
    const descriptor = JSON.parse(
      await readFile(
        path.join(stateHome, "orynt", "browser", "session.json"),
        "utf8",
      ),
    );
    if (
      typeof descriptor.webSocketUrl !== "string" ||
      !descriptor.allowedOrigins.includes(origin)
    ) {
      throw new Error("Orynt browser descriptor is missing the scoped CDP endpoint");
    }
    const cdpEndpoint = new URL(descriptor.webSocketUrl);
    cdpEndpoint.protocol = "http:";
    cdpEndpoint.pathname = "";
    cdpEndpoint.search = "";
    cdpEndpoint.hash = "";
    browser = await chromium.connectOverCDP(cdpEndpoint.origin, {
      timeout: 15_000,
    });
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.newPage();
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
      ) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });
    if (page.url() === "about:blank") await page.goto(origin);
    return await inspect(page);
  } finally {
    await browser?.close().catch(() => undefined);
    await runProcess("bun", [cliPath, "browser", "close"], {
      cwd: repository,
      env: { ...process.env, ORYNT_STATE_HOME: stateHome },
      timeoutMs: 30_000,
    }).catch(() => undefined);
  }
}

async function screenshotPair(page) {
  const desktopPath = path.join(outputRoot, "desktop.png");
  const mobilePath = path.join(outputRoot, "mobile.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: desktopPath, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: mobilePath, fullPage: true });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  if (overflow) throw new Error("mobile viewport has horizontal overflow");
}

function visualPaths() {
  return [
    path.join(outputRoot, "desktop.png"),
    path.join(outputRoot, "mobile.png"),
  ];
}

function startRepositoryServer(port, databasePath) {
  return spawn("bun", ["run", "start"], {
    cwd: repository,
    env: {
      ...process.env,
      PORT: String(port),
      ORYNT_SUPPORT_DB: databasePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not reserve a loopback port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function listenServer(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHttp(url) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `server did not become ready: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`,
  );
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    delay(2_000),
  ]);
  if (child.exitCode === null) {
    if (child.pid && process.platform !== "win32") {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    } else {
      child.kill("SIGKILL");
    }
  }
}

async function runProcess(executable, argv, {
  cwd,
  env,
  input = "",
  timeoutMs,
}) {
  return await new Promise((resolve) => {
    const child = spawn(executable, argv, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-4_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000_000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
      });
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode: exitCode ?? 1, stdout, stderr, timedOut });
    });
    child.stdin.end(input);
  });
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

function assertNoBrowserErrors(errors) {
  if (errors.length > 0) {
    throw new Error(`browser errors: ${errors.join(" | ")}`);
  }
}

async function expectText(page, testId, expected) {
  const actual = (await page.getByTestId(testId).textContent())?.trim();
  if (actual !== expected) {
    throw new Error(`${testId} rendered ${JSON.stringify(actual)}, expected ${expected}`);
  }
}

async function expectCount(parent, selector, expected) {
  const locator = typeof selector === "string"
    ? parent.locator(selector)
    : selector;
  const actual = await locator.count();
  if (actual !== expected) {
    throw new Error(`expected ${expected} matches for ${selector}, received ${actual}`);
  }
}

async function expectTestIdCount(parent, testId, expected, scope) {
  const actual = await parent.getByTestId(testId).count();
  if (actual !== expected) {
    throw new Error(
      `${scope} expected ${expected} data-testid="${testId}" element(s), received ${actual}`,
    );
  }
}

async function click(page, testId) {
  await page.getByTestId(testId).click();
}

function contentType(file) {
  const extension = path.extname(file);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function assertFile(file, message) {
  const metadata = await stat(file).catch(() => null);
  if (!metadata?.isFile()) throw new Error(message);
}

function parseOptions(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) parsed.set(argument.slice(2), true);
    else {
      parsed.set(argument.slice(2), value);
      index += 1;
    }
  }
  return parsed;
}

function required(name) {
  const value = options.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing --${name}.`);
  }
  return value;
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
