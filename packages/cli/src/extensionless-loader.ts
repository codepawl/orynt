import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const missingExtension =
        (error as { code?: string }).code === "ERR_MODULE_NOT_FOUND" &&
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !specifier.match(/\.[a-z0-9]+$/i);
      if (!missingExtension) {
        throw error;
      }

      const candidate = new URL(`${specifier}.js`, context.parentURL);
      if (!existsSync(fileURLToPath(candidate))) {
        throw error;
      }
      return nextResolve(candidate.href, context);
    }
  },
});
