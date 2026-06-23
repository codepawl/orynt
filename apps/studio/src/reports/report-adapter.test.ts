import uiMissingE2eReport from "../fixtures/reports/report-needs-evidence-ui-missing-e2e.json";
import { adaptCodePawlReport, buildReportDataState } from "./report-adapter";
import { isCodePawlReport } from "./report-schema";
import { type SessionFixture } from "../fixtures/studio-fixtures";

if (isCodePawlReport(uiMissingE2eReport)) {
  const session = adaptCodePawlReport(uiMissingE2eReport);

  session satisfies SessionFixture;
}

const dataState = buildReportDataState([uiMissingE2eReport]);

dataState satisfies {
  status: "report-backed" | "empty" | "malformed";
  sessions: [SessionFixture, ...SessionFixture[]] | [];
};
