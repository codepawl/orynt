#!/usr/bin/env node

import path from "node:path";

import { LocalJsonMemoryStore } from "../packages/memory/dist/index.js";

const MAX_REQUEST_BYTES = 1024 * 1024;

async function readRequest() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("memory manager request exceeded the 1 MiB limit");
    }
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("memory manager request is required");
  const request = JSON.parse(raw);
  if (request?.schemaVersion !== 1) {
    throw new Error("memory manager schemaVersion must be 1");
  }
  if (
    typeof request.operation !== "string" ||
    !/^[a-z]+(?:\.[a-z]+)*$/.test(request.operation)
  ) {
    throw new Error("memory manager operation is invalid");
  }
  if (typeof request.memoryRoot !== "string" || !path.isAbsolute(request.memoryRoot)) {
    throw new Error("memoryRoot must be an absolute managed path");
  }
  return request;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function requiredString(input, key) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

async function execute(request) {
  const store = new LocalJsonMemoryStore({
    memoryRoot: path.resolve(request.memoryRoot),
  });
  const input = object(request.input);
  switch (request.operation) {
    case "episode.list":
      return store.listEpisodes(object(input.query));
    case "rule.list":
      return store.listCandidateRules(object(input.query));
    case "rule.status":
      return store.updateCandidateRuleStatus(
        requiredString(input, "id"),
        requiredString(input, "status"),
        object(input.options),
      );
    case "semantic.list":
      return store.listSemanticMemory(object(input.query));
    case "semantic.status":
      return store.updateSemanticMemoryStatus(object(input.decision));
    case "semantic.edit":
      return store.editSemanticMemory(object(input.edit));
    case "semantic.delete":
      return store.deleteSemanticMemory(object(input.decision));
    case "semantic.restore":
      return store.restoreSemanticMemory(object(input.decision));
    case "semantic.purge":
      return store.purgeSemanticMemory(object(input.decision));
    case "memory.retrieve":
      return store.retrieveMemory(object(input.query));
    case "summary":
      return store.summarizeMemory(object(input.namespace));
    default:
      throw new Error(`unsupported memory manager operation: ${request.operation}`);
  }
}

try {
  const request = await readRequest();
  const result = await execute(request);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, result })}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "memory manager failed"}\n`,
  );
  process.exitCode = 1;
}
