import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entryPath = resolve("packages/cli/dist/main.js");
const rawArguments = process.env.ORYNT_CLI_ARGS_JSON;
let cliArguments = [];

if (rawArguments) {
  try {
    const parsedArguments = JSON.parse(rawArguments);
    if (!Array.isArray(parsedArguments) || parsedArguments.some((argument) => typeof argument !== "string")) {
      throw new TypeError("expected a JSON array of strings");
    }
    cliArguments = parsedArguments;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`ORYNT_CLI_ARGS_JSON must be a valid JSON array of strings: ${detail}`);
    process.exitCode = 2;
  }
}

if (process.exitCode === undefined) {
  process.argv = [process.execPath, entryPath, ...cliArguments];
  await import(pathToFileURL(entryPath).href);
}
