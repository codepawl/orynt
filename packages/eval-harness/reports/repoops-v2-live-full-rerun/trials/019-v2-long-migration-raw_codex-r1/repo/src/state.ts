export type CalculatorState = {
  display: string;
  memory: number | null;
};

export type CalculationResult = number | "Error";

export function evaluateCalculation(
  left: number,
  operator: string,
  right: number,
): CalculationResult {
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return right === 0 ? "Error" : left / right;

  throw new Error("operator");
}
