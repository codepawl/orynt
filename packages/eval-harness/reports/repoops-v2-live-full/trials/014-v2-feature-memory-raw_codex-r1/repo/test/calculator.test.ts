import { expect, test } from "bun:test";
import { calculate, recallMemory } from "../src/calculator";
import type { CalculatorState } from "../src/state";

test("calculator", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(8, "/", 0)).toBe("Error");
});

test("recalls a stored memory value to the display", () => {
  const state: CalculatorState = { display: "0", memory: 42 };

  expect(recallMemory(state)).toEqual({ display: "42", memory: 42 });
});

test("leaves the state unchanged when memory is empty", () => {
  const state: CalculatorState = { display: "7", memory: null };

  expect(recallMemory(state)).toBe(state);
});
