import { expect, test } from "bun:test";
import { frame } from "./composer";

test("keeps only the latest authoritative repaint frame", () => {
  expect(frame(["stale repaint", "authoritative repaint"])).toBe(
    "authoritative repaint",
  );
});

test("does not duplicate an unchanged repaint frame", () => {
  expect(frame(["a", "a"])).toBe("a");
});

test("returns an empty frame when no repaint has been produced", () => {
  expect(frame([])).toBe("");
});
