import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".open-next/**",
      ".next/**",
      ".turbo/**",
      "e2e/**",
      "__tests__/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["postcss.config.js"],
    languageOptions: {
      globals: {
        module: "readonly",
      },
    },
  },
);
