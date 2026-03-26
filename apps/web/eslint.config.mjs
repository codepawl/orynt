import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // setState in useEffect is a standard hydration guard pattern with next-themes
      "react-hooks/set-state-in-effect": "off",
      // Float32Array mutation in useFrame is the standard three.js pattern
      "react-hooks/immutability": "off",
      // Allow any in API response handlers and Ant Design callbacks
      "@typescript-eslint/no-explicit-any": "warn",
      // External avatar URLs use <img> intentionally (not optimized via next/image)
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
