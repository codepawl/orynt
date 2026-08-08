import { expect, test } from "bun:test";
import { calculate } from "../src/calculator";

test("calculator arithmetic supports decimals", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(1.5, "+", 2.3)).toBe(3.8);
  expect(calculate(7.5, "/", 2.5)).toBe(3);
});

test("clear resets the calculator result", () => {
  expect(calculate(42, "C", 0)).toBe(0);
  expect(calculate(42, "clear", 0)).toBe(0);
});

test("division by zero returns an error", () => {
  expect(calculate(8, "/", 0)).toBe("Error");
  expect(calculate(8, "/", -0)).toBe("Error");
});
