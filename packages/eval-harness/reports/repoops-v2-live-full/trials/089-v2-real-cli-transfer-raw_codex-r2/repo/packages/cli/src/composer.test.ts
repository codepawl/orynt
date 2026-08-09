import { expect, test } from "bun:test";
import { frame } from "./composer";

test("keeps one authoritative frame", () => {
  expect(frame(["a", "a"])).toBe("a");
  expect(frame(["stale", "current"])).toBe("current");
});

test("returns an empty frame when no repaint was supplied", () => {
  expect(frame([])).toBe("");
});
