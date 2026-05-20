import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    globals: true,
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "./"),
      "@codepawl/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
});
