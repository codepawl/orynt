export type CalculatorOperator = "+" | "-" | "*" | "/";

/**
 * The serializable calculator model. `display` and `memory` are retained for
 * callers that used the original state shape; the remaining fields describe an
 * in-progress calculation explicitly.
 */
export type CalculatorState = {
  display: string;
  memory: number | null;
  /** Optional so existing `{ display, memory }` state literals remain valid. */
  operator?: CalculatorOperator | null;
  waitingForOperand?: boolean;
  error?: boolean;
};

export const initialCalculatorState = (): CalculatorState => ({
  display: "0",
  memory: null,
  operator: null,
  waitingForOperand: false,
  error: false,
});

export const stateForResult = (result: number | "Error"): CalculatorState =>
  result === "Error"
    ? { ...initialCalculatorState(), display: "Error", error: true }
    : { ...initialCalculatorState(), display: String(result) };
