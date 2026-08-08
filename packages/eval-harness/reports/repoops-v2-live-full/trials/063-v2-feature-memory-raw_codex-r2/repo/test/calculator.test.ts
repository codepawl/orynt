import { expect, test } from "bun:test";
import { calculate, recallMemory } from "../src/calculator";

test("calculator", () => {
  expect(calculate(2, "+", 3)).toBe(5);
  expect(calculate(8, "/", 0)).toBe("Error");
});

test("recallMemory displays the stored memory value without mutating the state", () => {
  const state = { display: "12", memory: 42 };

  expect(recallMemory(state)).toEqual({ display: "42", memory: 42 });
  expect(state).toEqual({ display: "12", memory: 42 });
});

test("recallMemory displays zero when memory is empty", () => {
  expect(recallMemory({ display: "9", memory: null })).toEqual({
    display: "0",
    memory: null,
  });
});
