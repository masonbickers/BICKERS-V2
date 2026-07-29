import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveFinanceOwnership,
  resolveFinanceStage,
  resolveOperationalStatus,
} from "../src/app/utils/jobSummaryHeader.js";

test("maps a legacy ready-to-invoice job into separate display states", () => {
  const job = { status: "Ready to Invoice", readyToInvoice: true };
  assert.equal(resolveOperationalStatus(job), "Complete");
  assert.equal(resolveFinanceStage(job), "Ready for Finance");
});

test("prefers explicit operational status and live invoice stage", () => {
  const job = { status: "Ready to Invoice", operationalStatus: "Completed" };
  assert.equal(resolveOperationalStatus(job), "Complete");
  assert.equal(resolveFinanceStage(job, { status: "approved" }), "Approved");
});

test("needs-action ownership returns to Operations", () => {
  assert.equal(resolveFinanceStage({ status: "Action Required" }, { status: "draft" }), "Needs Action");
  assert.deepEqual(resolveFinanceOwnership("Needs Action"), {
    owner: "Operations",
    nextAction: "Resolve requested corrections",
  });
});

test("maps supported finance stages to owner and next action", () => {
  assert.deepEqual(resolveFinanceOwnership("Ready for Finance"), {
    owner: "Finance",
    nextAction: "Review and create invoice",
  });
  assert.deepEqual(resolveFinanceOwnership("Draft"), {
    owner: "Finance",
    nextAction: "Complete invoice draft",
  });
  assert.deepEqual(resolveFinanceOwnership("Approved"), {
    owner: "Finance",
    nextAction: "Issue invoice",
  });
  assert.deepEqual(resolveFinanceOwnership("Issued"), {
    owner: "Finance",
    nextAction: "Await or record payment",
  });
});

test("reports missing states honestly", () => {
  assert.equal(resolveOperationalStatus({}), "Unknown");
  assert.equal(resolveFinanceStage({}), "Not set");
  assert.deepEqual(resolveFinanceOwnership("Not set"), { owner: null, nextAction: null });
});
