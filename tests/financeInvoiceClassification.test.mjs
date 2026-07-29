import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FINANCE_GROUPS,
  buildFinanceRows,
  classifyFinanceRecord,
  countFinanceGroups,
  financeRowMatchesSearch,
} from "../src/app/utils/financeInvoiceClassification.js";

const booking = { id: "job-1", jobNumber: "9164", client: "Bad Bird", readyToInvoice: true };
const invoice = (status, extra = {}) => ({
  id: "invoice-1",
  bookingId: "job-1",
  jobNumber: "9164",
  status,
  draftReference: "DRAFT-9164-job-1",
  ...extra,
});

for (const [status, group] of [
  ["draft", FINANCE_GROUPS.DRAFT],
  ["approved", FINANCE_GROUPS.APPROVED],
  ["issued", FINANCE_GROUPS.ISSUED],
  ["part_paid", FINANCE_GROUPS.PART_PAID],
  ["paid", FINANCE_GROUPS.PAID],
]) {
  test(`classifies a linked ${status} invoice only as ${group}`, () => {
    const extra = status === "issued" ? { invoiceNumber: "SI-100" } : {};
    const rows = buildFinanceRows({ bookings: [booking], invoices: [invoice(status, extra)] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].group, group);
  });
}

test("classifies approved invoices by their separate Sage transport state", () => {
  assert.equal(
    classifyFinanceRecord({
      invoice: invoice("approved", { sageSync: { status: "pending" } }),
    }).group,
    FINANCE_GROUPS.EXPORT_PENDING
  );
  assert.equal(
    classifyFinanceRecord({
      invoice: invoice("approved", { sageSync: { status: "syncing" } }),
    }).group,
    FINANCE_GROUPS.EXPORTING
  );
  assert.equal(
    classifyFinanceRecord({
      invoice: invoice("approved", { sageSync: { status: "failed" } }),
    }).group,
    FINANCE_GROUPS.SYNC_FAILED
  );
});

test("maps a legacy invoiced invoice to Issued for display", () => {
  const result = classifyFinanceRecord({
    booking,
    invoice: invoice("invoiced", { invoiceNumber: "SI-OLD" }),
  });
  assert.equal(result.group, FINANCE_GROUPS.ISSUED);
  assert.equal(result.isLegacyStatus, true);
});

test("a linked draft overrides readyToInvoice", () => {
  const rows = buildFinanceRows({ bookings: [booking], invoices: [invoice("draft")] });
  assert.equal(rows[0].group, FINANCE_GROUPS.DRAFT);
});

test("booking-only invoiced markers become data-quality exceptions", () => {
  const result = classifyFinanceRecord({
    booking: { id: "job-2", status: "invoiced" },
  });
  assert.equal(result.group, FINANCE_GROUPS.EXCEPTION);
  assert.match(result.warnings[0], /no linked invoice/i);
});

test("summary counts use the same classified rows as queues", () => {
  const rows = buildFinanceRows({
    bookings: [
      booking,
      { id: "job-2", jobNumber: "9165", readyToInvoice: true },
    ],
    invoices: [invoice("draft")],
  });
  assert.deepEqual(countFinanceGroups(rows), {
    draft: 1,
    ready_for_finance: 1,
  });
});

test("search matches draft and official invoice identities", () => {
  const row = {
    jobNumber: "9164",
    draftReference: "DRAFT-9164-A7F3",
    invoiceNumber: "SI-1042",
  };
  assert.equal(financeRowMatchesSearch(row, "a7f3"), true);
  assert.equal(financeRowMatchesSearch(row, "si-1042"), true);
  assert.equal(financeRowMatchesSearch(row, "missing"), false);
});

test("legacy and unknown records do not crash classification", () => {
  assert.equal(
    classifyFinanceRecord({ invoice: { id: "legacy", status: { value: "invoiced" }, invoiceNumber: "SI-1" } }).group,
    FINANCE_GROUPS.ISSUED
  );
  assert.equal(
    classifyFinanceRecord({ invoice: { id: "unknown", status: "mystery" } }).group,
    FINANCE_GROUPS.EXCEPTION
  );
});

test("Finance Home contains no ordinary issue or paid mutation actions", () => {
  const source = readFileSync(
    new URL("../src/app/finance-home/page.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /Mark Invoiced|Mark Paid|markAsInvoiced|markAsPaid/);
  assert.doesNotMatch(source, /\b(updateDoc|setDoc)\s*\(/);
});
