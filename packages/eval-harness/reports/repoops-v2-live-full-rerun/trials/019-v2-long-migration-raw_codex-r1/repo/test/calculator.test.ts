import { expect, test } from "bun:test";
import { calculate } from "../src/calculator";

test("calculator", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(8, "-", 3)).toBe(5);
  expect(calculate(4, "*", 3)).toBe(12);
  expect(calculate(8, "/", 2)).toBe(4);
  expect(calculate(8, "/", 0)).toBe("Error");
  expect(() => calculate(1, "%", 2)).toThrow("operator");
});
