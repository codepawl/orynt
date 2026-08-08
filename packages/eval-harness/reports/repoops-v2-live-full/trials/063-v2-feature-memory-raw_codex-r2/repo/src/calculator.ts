import type { CalculatorState } from "./state";

export type Operator = "+" | "-" | "*" | "/";

export function calculate(a: number, op: Operator, b: number): number | "Error" {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return b === 0 ? "Error" : a / b;
  throw new Error("operator");
}

export function recallMemory(state: CalculatorState): CalculatorState {
  return { ...state, display: String(state.memory ?? 0) };
}
