type CalculationResult = number | "Error";

/**
 * Calculates two operands. This remains the calculator's public API while
 * state management lives in the dedicated state model.
 */
export function calculate(
  a: number,
  op: string,
  b: number,
): CalculationResult {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return b === 0 ? "Error" : a / b;

  throw new Error("operator");
}
