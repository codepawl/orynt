import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@codepawl/shared": resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    exclude: ["dist/**", "node_modules/**"],
  },
});
