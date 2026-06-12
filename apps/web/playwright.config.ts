import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const previewPort = Number(process.env.PLAYWRIGHT_PREVIEW_PORT ?? 4177);
const localBaseURL = `http://127.0.0.1:${previewPort}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;
const shouldStartPreview = !process.env.PLAYWRIGHT_BASE_URL;
const chromeChannel =
  process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ??
  (existsSync("/usr/bin/google-chrome") || existsSync("/usr/bin/google-chrome-stable")
    ? "chrome"
    : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: chromeChannel,
      },
    },
  ],
  webServer: shouldStartPreview
    ? {
        command: `bun run build && bun run preview --host 127.0.0.1 --port ${previewPort}`,
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
