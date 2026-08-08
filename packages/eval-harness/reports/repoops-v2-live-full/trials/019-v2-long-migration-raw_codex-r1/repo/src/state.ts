/** The persisted calculator state. Kept compatible with the original shape. */
export type CalculatorState = {
  display: string;
  memory: number | null;
};

export type CalculatorStateUpdate = Partial<CalculatorState>;

export const initialCalculatorState: Readonly<CalculatorState> = Object.freeze({
  display: "0",
  memory: null,
});

/** Creates an owned state object so callers never share the initial state. */
export function createCalculatorState(
  update: CalculatorStateUpdate = {},
): CalculatorState {
  return { ...initialCalculatorState, ...update };
}

/** Applies a state update without mutating the previous snapshot. */
export function updateCalculatorState(
  state: CalculatorState,
  update: CalculatorStateUpdate,
): CalculatorState {
  return { ...state, ...update };
}
