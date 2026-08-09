import { expect, test } from "bun:test";
import { calculate } from "../src/calculator";

test("calculates whole-number operations", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(9, "-", 4)).toBe(5);
  expect(calculate(3, "*", 4)).toBe(12);
  expect(calculate(8, "/", 2)).toBe(4);
});

test("calculates decimal values without floating-point artifacts", () => {
  expect(calculate(0.1, "+", 0.2)).toBe(0.3);
  expect(calculate(0.3, "/", 0.1)).toBe(3);
});

test("clear resets the calculator", () => {
  expect(calculate(42, "C", 7)).toBe(0);
  expect(calculate(42, "clear", 7)).toBe(0);
});

test("returns an error when dividing by zero", () => {
  expect(calculate(8, "/", 0)).toBe("Error");
  expect(calculate(8, "/", -0)).toBe("Error");
});
