import { expect, test } from "bun:test";

import { calculate } from "../src/calculator";
import {
  createCalculatorState,
  initialCalculatorState,
  updateCalculatorState,
} from "../src/state";

test("calculator public API", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(8, "/", 0)).toBe("Error");
});

test("calculator state creates independent snapshots", () => {
  const state = createCalculatorState({ display: "42" });

  expect(initialCalculatorState).toEqual({ display: "0", memory: null });
  expect(state).toEqual({ display: "42", memory: null });
  expect(state).not.toBe(initialCalculatorState);
});

test("calculator state updates are immutable", () => {
  const previous = createCalculatorState({ display: "12", memory: 7 });
  const next = updateCalculatorState(previous, { display: "19" });

  expect(next).toEqual({ display: "19", memory: 7 });
  expect(previous).toEqual({ display: "12", memory: 7 });
});
