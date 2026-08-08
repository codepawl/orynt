type CalculationResult = number | "Error";

function normalizeDecimal(value: number): number {
  // Arithmetic on decimal input can otherwise expose binary floating-point
  // artifacts, such as 0.1 + 0.2 producing 0.30000000000000004.
  return Number(value.toPrecision(15));
}

export function calculate(a: number, op: string, b: number): CalculationResult {
  if (op === "C" || op === "clear") {
    return 0;
  }

  switch (op) {
    case "+":
      return normalizeDecimal(a + b);
    case "-":
      return normalizeDecimal(a - b);
    case "*":
      return normalizeDecimal(a * b);
    case "/":
      return b === 0 ? "Error" : normalizeDecimal(a / b);
    default:
      throw new Error("operator");
  }
}
