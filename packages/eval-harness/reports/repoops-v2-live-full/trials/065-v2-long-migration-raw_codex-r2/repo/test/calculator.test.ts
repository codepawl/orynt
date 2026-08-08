import { expect, test } from "bun:test";
import {
  applyCalculation,
  calculate,
  initialCalculatorState,
} from "../src/calculator";
import type { CalculatorState } from "../src/state";

test("calculator public API", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(8, "/", 0)).toBe("Error");
  expect(() => calculate(2, "%", 3)).toThrow("operator");
});

test("calculator state model returns immutable result snapshots", () => {
  const state = { ...initialCalculatorState(), display: "4", memory: 4 };

  expect(applyCalculation(state, "*", 3)).toEqual({
    display: "12",
    memory: 12,
    operator: null,
    waitingForOperand: false,
    error: false,
  });
  expect(state).toEqual({
    display: "4",
    memory: 4,
    operator: null,
    waitingForOperand: false,
    error: false,
  });
  expect(applyCalculation(state, "/", 0).error).toBe(true);
});

test("legacy calculator state literals remain valid", () => {
  const legacyState: CalculatorState = { display: "7", memory: 7 };

  expect(applyCalculation(legacyState, "+", 2).display).toBe("9");
});
