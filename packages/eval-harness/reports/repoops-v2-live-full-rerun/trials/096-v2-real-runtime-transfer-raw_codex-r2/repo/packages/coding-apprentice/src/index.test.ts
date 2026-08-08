import { expect, test } from "bun:test";
import { finalize } from "./index";

test("failure outcome includes typed code and reader-visible evidence", () =>
  expect(finalize("fail")).toEqual({
    status: "fail",
    code: "verification_failed",
    evidence: "Repository verification failed. Review the run output for details.",
  }));
