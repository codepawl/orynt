export type PassedOutcome = {
  status: "pass";
  code: "verification_passed";
};

export type FailedOutcome = {
  status: "fail";
  code: "verification_failed";
  evidence: string;
};

export type Outcome = PassedOutcome | FailedOutcome;

export const finalize = (status: Outcome["status"]): Outcome => {
  if (status === "pass") {
    return { status, code: "verification_passed" };
  }

  return {
    status,
    code: "verification_failed",
    evidence: "Repository verification failed.",
  };
};
