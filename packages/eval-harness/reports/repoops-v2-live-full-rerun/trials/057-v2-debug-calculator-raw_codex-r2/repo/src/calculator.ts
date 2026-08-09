export function calculate(a: number, op: string, b: number) {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? "Error" : a / b;
    case "C":
    case "clear":
      return 0;
    default:
      throw new Error("operator");
  }
}
