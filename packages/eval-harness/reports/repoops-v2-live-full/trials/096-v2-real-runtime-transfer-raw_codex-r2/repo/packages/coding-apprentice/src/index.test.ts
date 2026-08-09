import { expect, test } from "bun:test";
import { finalize } from "./index";

test("failure outcome includes typed failure evidence", () => {
  const outcome = finalize("fail");

  expect(outcome.code).toBe("verification_failed");
  expect(outcome.evidence).toBe("Repository verification failed.");
});

test("successful outcome remains a passed verification", () => {
  expect(finalize("pass")).toEqual({
    status: "pass",
    code: "verification_passed",
  });
});
