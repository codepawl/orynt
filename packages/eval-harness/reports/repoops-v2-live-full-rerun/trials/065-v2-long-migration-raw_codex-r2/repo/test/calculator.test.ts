import { expect, test } from "bun:test";
import { calculate } from "../src/calculator";
import { applyOperation, createCalculatorState } from "../src/state";

test("calculator preserves its public calculation API", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(8, "-", 3)).toBe(5);
  expect(calculate(2, "*", 3)).toBe(6);
  expect(calculate(8, "/", 2)).toBe(4);
  expect(calculate(8, "/", 0)).toBe("Error");
  expect(() => calculate(2, "%", 3)).toThrow("operator");
});

test("calculator state records the latest result", () => {
  const result = applyOperation(createCalculatorState(10), "-", 4);

  expect(result).toEqual({ display: "6", memory: 6 });
});
