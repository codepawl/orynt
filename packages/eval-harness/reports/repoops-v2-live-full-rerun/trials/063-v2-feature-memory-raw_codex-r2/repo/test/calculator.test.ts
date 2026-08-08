import { expect, test } from "bun:test";
import { calculate, recallMemory } from "../src/calculator";

test("calculator", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(8, "/", 0)).toBe("Error");
});

test("recalls stored memory to the display", () => {
  const state = { display: "0", memory: 42 };

  expect(recallMemory(state)).toEqual({ display: "42", memory: 42 });
});

test("leaves the state unchanged when memory is empty", () => {
  const state = { display: "17", memory: null };

  expect(recallMemory(state)).toBe(state);
});
