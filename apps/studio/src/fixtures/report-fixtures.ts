import blockedPolicyReport from "./reports/report-blocked-severe-policy.json";
import failedCommandReport from "./reports/report-failed-command-log.json";
import verifiedReport from "./reports/report-fixture-basic.json";
import needsEvidenceUiReport from "./reports/report-needs-evidence-ui-missing-e2e.json";
import riskyProtectedPathReport from "./reports/report-risky-protected-path.json";
import { buildReportDataState } from "../reports/report-adapter";

export const importedReportJson = [
  needsEvidenceUiReport,
  verifiedReport,
  blockedPolicyReport,
  riskyProtectedPathReport,
  failedCommandReport,
] as const;

export const reportDataState = buildReportDataState([...importedReportJson]);

