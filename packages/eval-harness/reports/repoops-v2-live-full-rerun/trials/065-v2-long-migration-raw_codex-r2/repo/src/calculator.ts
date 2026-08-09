import {
  applyOperation,
  createCalculatorState,
} from "./state";

export function calculate(a: number, op: string, b: number): number | "Error" {
  if (op !== "+" && op !== "-" && op !== "*" && op !== "/") {
    throw new Error("operator");
  }

  const nextState = applyOperation(createCalculatorState(a), op, b);
  return nextState.memory ?? "Error";
}
