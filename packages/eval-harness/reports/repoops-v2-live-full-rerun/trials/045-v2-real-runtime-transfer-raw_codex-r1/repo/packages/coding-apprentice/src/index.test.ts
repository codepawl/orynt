import { expect, test } from "bun:test";
import { finalize } from "./index";

test("failure outcome includes typed, reader-visible evidence", () => {
  const outcome = finalize("fail");

  expect(outcome).toEqual({
    status: "fail",
    code: "verification_failed",
    evidence: "Repository verification failed.",
  });
});
