type CalculationResult = number | "Error";

function normalizeDecimal(value: number): number {
  // Avoid exposing the binary floating-point tail from ordinary calculator input
  // (for example, 0.1 + 0.2).
  return Number.parseFloat(value.toPrecision(15));
}

export function calculate(a: number, op: string, b: number): CalculationResult {
  if (op === "C" || op === "clear") return 0;
  if (op === "+") return normalizeDecimal(a + b);
  if (op === "-") return normalizeDecimal(a - b);
  if (op === "*") return normalizeDecimal(a * b);
  if (op === "/") return b === 0 ? "Error" : normalizeDecimal(a / b);

  throw new Error("operator");
}
