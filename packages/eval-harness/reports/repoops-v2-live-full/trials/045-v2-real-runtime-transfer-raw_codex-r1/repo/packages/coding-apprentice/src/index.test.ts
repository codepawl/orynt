import { expect, test } from "bun:test";

import { finalize } from "./index";

test("failure outcome includes a typed code and reader-visible evidence", () => {
  expect(finalize("fail")).toEqual({
    status: "fail",
    code: "verification_failed",
    evidence: "Repository verification failed.",
  });
});

test("successful outcomes retain their matching typed code and evidence", () => {
  expect(finalize("pass")).toEqual({
    status: "pass",
    code: "verification_passed",
    evidence: "Repository verification passed.",
  });
});
