export type CalculatorOperator = "+" | "-" | "*" | "/";

export type CalculatorState = {
  display: string;
  memory: number | null;
};

export const createCalculatorState = (value: number): CalculatorState => ({
  display: String(value),
  memory: value,
});

export const applyOperation = (
  state: CalculatorState,
  operator: CalculatorOperator,
  operand: number,
): CalculatorState => {
  const left = state.memory ?? Number(state.display);
  const result = operator === "+" ? left + operand
    : operator === "-" ? left - operand
    : operator === "*" ? left * operand
    : operator === "/" && operand !== 0 ? left / operand
    : null;

  return result === null
    ? { display: "Error", memory: null }
    : { display: String(result), memory: result };
};
