export type Outcome =
  | {
      status: "pass";
      code: "verification_passed";
      evidence: "Repository verification passed.";
    }
  | {
      status: "fail";
      code: "verification_failed";
      evidence: "Repository verification failed.";
    };

export const finalize = (status: Outcome["status"]): Outcome =>
  status === "pass"
    ? {
        status,
        code: "verification_passed",
        evidence: "Repository verification passed.",
      }
    : {
        status,
        code: "verification_failed",
        evidence: "Repository verification failed.",
      };
