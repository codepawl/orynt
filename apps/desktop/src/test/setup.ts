import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

await import("@testing-library/jest-dom");
const [{ act, cleanup }, { afterEach, beforeEach }] = await Promise.all([
  import("@testing-library/react"),
  import("bun:test"),
]);

const reactActWarningPatterns = [
  "not wrapped in act",
  "testing environment is not configured to support act",
];
let originalConsoleError = console.error;
let reactActWarnings: string[] = [];

beforeEach(() => {
  originalConsoleError = console.error;
  reactActWarnings = [];
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (reactActWarningPatterns.some((pattern) => message.includes(pattern))) {
      reactActWarnings.push(message);
    }
    originalConsoleError(...args);
  };
});

afterEach(async () => {
  await act(async () => {
    for (let pass = 0; pass < 4; pass += 1) {
      await Bun.sleep(0);
    }
  });
  cleanup();
  console.error = originalConsoleError;
  if (reactActWarnings.length > 0) {
    throw new Error(
      `React act warning gate failed with ${reactActWarnings.length} warning(s).`,
    );
  }
});
