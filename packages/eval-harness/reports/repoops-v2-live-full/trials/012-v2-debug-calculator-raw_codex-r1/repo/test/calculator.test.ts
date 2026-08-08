import { expect, test } from "bun:test";
import { calculate } from "../src/calculator";

test("calculator", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(0.1, "+", 0.2)).toBe(0.3);
  expect(calculate(42, "C", 0)).toBe(0);
  expect(calculate(8, "/", 0)).toBe("Error");
});
