import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinanceReadiness,
  financeReadinessSummary,
  isLinkedTimesheetValid,
} from "../src/app/utils/financeReadiness.js";

const ready = {
  readyForInvoicing: true,
  acceptedQuoteNumber: "Q9164-002",
  hasPurchaseOrder: true,
};

test("passes valid linked timesheets", () => {
  const result = buildFinanceReadiness({
    ...ready,
    job: { timesheetsRequired: true },
    timesheets: [{ submitted: true }],
  });
  assert.equal(result.blockers.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.checks.at(-1).label, "Timesheets linked");
  assert.equal(financeReadinessSummary(result.counts), "All checks passed");
});

test("blocks when required timesheets are missing", () => {
  const result = buildFinanceReadiness({ ...ready, job: { timesheetsRequired: true } });
  assert.equal(result.blockers.at(-1).label, "Required timesheets are missing");
});

test("warns when timesheet requirement cannot be determined", () => {
  const result = buildFinanceReadiness({ ...ready, job: {} });
  assert.equal(result.warnings.at(-1).code, "timesheet_requirement_uncertain");
});

test("recognises a recorded warning acknowledgement", () => {
  const result = buildFinanceReadiness({
    ...ready,
    job: {
      history: [{
        action: "Finance warning acknowledged",
        warningCode: "timesheet_requirement_uncertain",
        user: "Finance User",
        timestamp: "2026-07-23T12:00:00.000Z",
      }],
    },
  });
  assert.equal(result.warnings.length, 0);
  assert.match(result.checks.at(-1).label, /confirmed by Finance User/);
});

test("blocks missing accepted quote and incomplete operational review", () => {
  const result = buildFinanceReadiness({ job: {}, timesheets: [], hasPurchaseOrder: true });
  assert.deepEqual(
    result.blockers.map((check) => check.code),
    ["operational_review", "accepted_quote"]
  );
});

test("recognises submitted and approved timesheet states", () => {
  assert.equal(isLinkedTimesheetValid({ status: "Submitted" }), true);
  assert.equal(isLinkedTimesheetValid({ approvalStatus: "approved" }), true);
  assert.equal(isLinkedTimesheetValid({ status: "draft" }), false);
});
