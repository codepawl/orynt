import {
  type CalculatorOperator,
  type CalculatorState,
  initialCalculatorState,
  stateForResult,
} from "./state";

const operators: readonly CalculatorOperator[] = ["+", "-", "*", "/"];

export const isCalculatorOperator = (
  operator: string,
): operator is CalculatorOperator => operators.includes(operator as CalculatorOperator);

/** Preserves the original calculator API. */
export function calculate(
  a: number,
  op: string,
  b: number,
): number | "Error" {
  if (!isCalculatorOperator(op)) throw new Error("operator");
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  return b === 0 ? "Error" : a / b;
}

/**
 * Applies one binary calculation to a state snapshot without mutating it.
 * It is intended for stateful consumers; `calculate` remains available for
 * existing callers.
 */
export function applyCalculation(
  state: CalculatorState,
  operator: CalculatorOperator,
  operand: number,
): CalculatorState {
  const left = state.memory ?? Number(state.display);

  if (!Number.isFinite(left) || state.error) return stateForResult("Error");

  const result = calculate(left, operator, operand);
  return {
    ...stateForResult(result),
    memory: typeof result === "number" ? result : null,
  };
}

export { initialCalculatorState };
