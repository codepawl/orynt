import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@codepawl/ipc-contracts": resolve(__dirname, "../../packages/ipc-contracts/src/index.ts"),
      "@codepawl/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
