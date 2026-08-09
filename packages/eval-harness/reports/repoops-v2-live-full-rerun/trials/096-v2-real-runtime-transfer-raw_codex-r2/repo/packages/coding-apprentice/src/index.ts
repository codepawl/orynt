export type Outcome =
  | { status: "pass"; code: "verification_passed" }
  | {
      status: "fail";
      code: "verification_failed";
      evidence: "Repository verification failed. Review the run output for details.";
    };

export const finalize = (status: Outcome["status"]): Outcome =>
  status === "pass"
    ? { status, code: "verification_passed" }
    : {
        status,
        code: "verification_failed",
        evidence: "Repository verification failed. Review the run output for details.",
      };
