type Fraction = {
  numerator: bigint;
  denominator: bigint;
};

function decimalFraction(value: number): Fraction {
  if (!Number.isFinite(value)) {
    throw new Error("operand");
  }

  const [coefficient, exponentPart] = value.toString().toLowerCase().split("e");
  const exponent = Number(exponentPart ?? 0);
  const sign = coefficient.startsWith("-") ? -1n : 1n;
  const unsignedCoefficient = coefficient.replace(/^-/, "");
  const [whole, fractional = ""] = unsignedCoefficient.split(".");
  const digits = `${whole}${fractional}`;
  const scale = fractional.length - exponent;
  const numerator = sign * BigInt(digits);

  return scale >= 0
    ? { numerator, denominator: 10n ** BigInt(scale) }
    : { numerator: numerator * 10n ** BigInt(-scale), denominator: 1n };
}

function calculateDecimal(a: number, op: string, b: number): number {
  const left = decimalFraction(a);
  const right = decimalFraction(b);

  if (op === "+") {
    return Number(left.numerator * right.denominator + right.numerator * left.denominator) /
      Number(left.denominator * right.denominator);
  }
  if (op === "-") {
    return Number(left.numerator * right.denominator - right.numerator * left.denominator) /
      Number(left.denominator * right.denominator);
  }
  if (op === "*") {
    return Number(left.numerator * right.numerator) / Number(left.denominator * right.denominator);
  }

  return Number(left.numerator * right.denominator) / Number(left.denominator * right.numerator);
}

export function calculate(a: number, op: string, b: number): number | "Error" {
  if (op === "C") {
    return 0;
  }
  if (op === "/" && b === 0) {
    return "Error";
  }
  if (["+", "-", "*", "/"].includes(op)) {
    return calculateDecimal(a, op, b);
  }

  throw new Error("operator");
}
