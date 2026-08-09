export type PassedOutcome = {
  status: "pass";
  code: "verification_passed";
};

export type FailedOutcome = {
  status: "fail";
  code: "verification_failed";
  evidence: "Repository verification failed.";
};

export type Outcome = PassedOutcome | FailedOutcome;

export function finalize(status: "pass"): PassedOutcome;
export function finalize(status: "fail"): FailedOutcome;
export function finalize(status: Outcome["status"]): Outcome {
  if (status === "fail") {
    return {
      status,
      code: "verification_failed",
      evidence: "Repository verification failed.",
    };
  }

  return { status, code: "verification_passed" };
}
