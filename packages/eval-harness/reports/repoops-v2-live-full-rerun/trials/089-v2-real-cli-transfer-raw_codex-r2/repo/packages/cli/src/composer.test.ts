import { expect, test } from "bun:test"
import { frame } from "./composer"

test("keeps the latest repaint as the authoritative frame", () => {
  expect(frame(["previous frame", "current frame"])).toBe("current frame")
})

test("preserves repeated lines within the authoritative frame", () => {
  expect(frame(["line\nline", "line\nline"])).toBe("line\nline")
})

test("returns an empty frame when nothing has been rendered", () => {
  expect(frame([])).toBe("")
})
