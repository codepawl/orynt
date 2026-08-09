import type { CalculatorState } from "./state";

export function calculate(a: number, op: string, b: number): number | "Error" {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return b === 0 ? "Error" : a / b;
  throw new Error("operator");
}

export function recallMemory(state: CalculatorState): CalculatorState {
  if (state.memory === null) return state;
  return { ...state, display: String(state.memory) };
}
