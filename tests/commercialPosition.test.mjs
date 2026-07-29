import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommercialPosition,
  findAcceptedQuoteSnapshot,
  resolveAcceptanceEvidence,
  resolvePoPosition,
} from "../src/app/utils/commercialPosition.js";

test("finds the saved snapshot matching the accepted quote number", () => {
  const accepted = findAcceptedQuoteSnapshot(
    { acceptedQuoteNumber: "Q100-002" },
    [{ quoteNumber: "Q100-001" }, { quoteNumber: "Q100-002", subtotal: 1200 }]
  );
  assert.equal(accepted.subtotal, 1200);
});

test("uses the latest saved quote as the approved source for a completed job", () => {
  const approved = findAcceptedQuoteSnapshot(
    { status: "Ready to Invoice" },
    [{ quoteNumber: "Q100-001" }, { quoteNumber: "Q100-002", subtotal: 1400 }]
  );
  assert.equal(approved.quoteNumber, "Q100-002");
});

test("uses saved quote net and structured adjustments for expected variance", () => {
  const result = buildCommercialPosition({
    quote: { subtotal: 1000, vatTotal: 200, grossTotal: 1200, currency: "GBP" },
    job: {
      additionalCharges: [{ amount: 150, reason: "Extra day" }],
      deductions: [{ amount: 50, reason: "Unused kit" }],
    },
  });
  assert.equal(result.expectedNet, 1100);
  assert.equal(result.variance, 100);
  assert.equal(result.variancePercentage, 10);
});

test("does not infer variations when no structured records exist", () => {
  const result = buildCommercialPosition({
    quote: { subtotal: 800 },
    job: { notes: "Customer asked for another day costing £500" },
  });
  assert.equal(result.adjustments.hasStructuredData, false);
  assert.equal(result.expectedNet, 800);
  assert.equal(result.variance, 0);
  assert.equal(result.vat, 160);
  assert.equal(result.gross, 960);
});

test("treats a legacy quote total as excluding VAT", () => {
  const result = buildCommercialPosition({
    quote: { total: 1000, currency: "GBP" },
  });
  assert.equal(result.acceptedNet, 1000);
  assert.equal(result.vat, 200);
  assert.equal(result.gross, 1200);
});

test("reports acceptance evidence and explicit PO states honestly", () => {
  assert.deepEqual(resolveAcceptanceEvidence({}, {}), {
    label: "No acceptance evidence recorded",
    warning: true,
  });
  assert.equal(resolvePoPosition({ poRequired: false }).status, "PO not required");
  assert.equal(resolvePoPosition({ poRequired: true }).status, "PO missing");
  assert.equal(resolvePoPosition({ poNumber: "010100" }).status, "Provided");
});
