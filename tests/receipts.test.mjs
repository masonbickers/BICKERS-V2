import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReceiptCsv,
  canCloseReceiptGroup,
  currentMonthKey,
  dedupeReceiptParticipants,
  isSelectableReceiptMonth,
  moneyToPence,
  normalizeReceiptStatus,
  previousStatementMonthKey,
  receiptGroupId,
  safeReceiptFileName,
  suggestedVatPence,
} from "../src/app/utils/receipts.js";

test("receipt participants collapse duplicate employee and email identities onto the canonical UID", () => {
  const participants = dedupeReceiptParticipants([
    {
      id: "employee_employee-1",
      uid: "employee_employee-1",
      employeeId: "employee-1",
      email: "mason@example.com",
      displayName: "Mason Bickers",
      role: "user",
      companyId: "company-1",
    },
    {
      id: "canonical-user",
      uid: "canonical-user",
      employeeId: "employee-1",
      email: "MASON@example.com",
      name: "Mason Bickers",
      role: "platformAdmin",
      companyId: "company-1",
    },
    {
      id: "legacy-user",
      uid: "legacy-user",
      employeeId: "employee-1",
      email: "mason@example.com",
      displayName: "Mason Bickers",
      role: "user",
      companyId: "company-1",
    },
  ], { preferredUidByEmployeeId: new Map([["employee-1", "canonical-user"]]) });

  assert.deepEqual(participants, [{
    uid: "canonical-user",
    uids: ["canonical-user", "employee_employee-1", "legacy-user"],
    name: "Mason Bickers",
  }]);
});

test("receipt participants deduplicate normalized email but never merge on display name alone", () => {
  const participants = dedupeReceiptParticipants([
    { id: "one", uid: "one", email: "alex@example.com", name: "Alex Smith", companyId: "company-1" },
    { id: "two", uid: "two", email: " ALEX@example.com ", displayName: "Alex Smith", companyId: "company-1" },
    { id: "three", uid: "three", email: "different@example.com", name: "Alex Smith", companyId: "company-1" },
  ]);

  assert.equal(participants.length, 2);
  assert.deepEqual(participants.find((row) => row.uid === "one")?.uids, ["one", "two"]);
  assert.deepEqual(participants.find((row) => row.uid === "three")?.uids, ["three"]);
});

test("receipt values and standard VAT use integer pence", () => {
  assert.equal(moneyToPence("120.00"), 12000);
  assert.equal(suggestedVatPence(12000), 2000);
  assert.equal(moneyToPence("not a value"), null);
});

test("receipt months are London calendar months and future months are blocked", () => {
  const now = new Date("2026-08-06T10:00:00Z");
  assert.equal(currentMonthKey(now), "2026-08");
  assert.equal(previousStatementMonthKey(now), "2026-07");
  assert.equal(previousStatementMonthKey(new Date("2026-01-06T10:00:00Z")), "2025-12");
  assert.equal(isSelectableReceiptMonth("2026-07", now), true);
  assert.equal(isSelectableReceiptMonth("2026-09", now), false);
});

test("receipt group IDs are deterministic and path safe", () => {
  assert.equal(receiptGroupId("company a", "user/a", "2026-08"), "company%20a__user%2Fa__2026-08");
});

test("receipt file names are storage safe", () => {
  assert.equal(safeReceiptFileName("My fuel receipt (1).pdf"), "My-fuel-receipt-1-.pdf");
  assert.equal(safeReceiptFileName("../../"), "receipt");
});

test("groups close only when submitted and every receipt has a terminal outcome", () => {
  assert.equal(canCloseReceiptGroup({ status: "submitted" }, [{ status: "vat_claimed" }, { status: "no_vat" }]), true);
  assert.equal(canCloseReceiptGroup({ status: "submitted" }, [{ status: "checked" }]), false);
  assert.equal(canCloseReceiptGroup({ status: "submitted", declaredNoReceipts: true }, []), true);
  assert.equal(canCloseReceiptGroup({ status: "draft" }, [{ status: "vat_claimed" }]), false);
});

test("legacy receipt statuses normalize and CSV escapes values", () => {
  assert.equal(normalizeReceiptStatus("claimed"), "vat_claimed");
  const csv = buildReceiptCsv([{ monthKey: "2026-08", submitterName: "Mason", purpose: "Fuel, north", valuePence: 12000, vatPence: 2000, status: "vat_claimed", fileName: "fuel.pdf" }]);
  assert.match(csv, /"Fuel, north"/);
  assert.match(csv, /120\.00,20\.00,20\.00,VAT claimed/);
});
