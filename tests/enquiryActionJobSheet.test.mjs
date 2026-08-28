import assert from "node:assert/strict";
import test from "node:test";
import { buildEnquiryActionJobSheetData } from "../src/app/utils/enquiryActionJobSheet.js";

test("builds a printable action sheet from partial enquiry information", () => {
  const sheet = buildEnquiryActionJobSheetData({
    jobNumber: "9328x",
    client: "Production Co",
    production: "Example Production",
    location: "London",
    po: "PO-42",
    additionalContacts: [{ name: "Alex", department: "Locations", email: "alex@example.com", phone: "020 1234 5678" }],
    selectedVehicles: [{ name: "Tracking Vehicle", registration: "AB12 CDE" }],
    equipment: ["Camera mount"],
    notes: "Initial phone enquiry.",
  }, new Date("2026-08-27T08:00:00.000Z"));

  assert.equal(sheet.jobNumber, "9328x");
  assert.equal(sheet.poNumbers, "PO-42");
  assert.equal(sheet.contacts[0].department, "Locations");
  assert.deepEqual(sheet.vehicles, ["Tracking Vehicle - AB12 CDE"]);
  assert.deepEqual(sheet.equipment, ["Camera mount"]);
  assert.equal(sheet.printedDate, "27/08/2026");
});

test("keeps sparse enquiries printable with a blank contact block", () => {
  const sheet = buildEnquiryActionJobSheetData({ jobNumber: "1001" }, new Date("2026-08-27T08:00:00.000Z"));

  assert.equal(sheet.contacts.length, 1);
  assert.deepEqual(sheet.contacts[0], { name: "", department: "", phone: "", mobile: "", email: "" });
  assert.deepEqual(sheet.vehicles, []);
  assert.equal(sheet.notes, "");
});

test("uses saved enquiry quote, invoice, date and legacy contact fields", () => {
  const sheet = buildEnquiryActionJobSheetData({
    quoteNumber: "Q1001-001",
    invoices: [{ invoiceNumber: "INV-77" }],
    bookingDates: ["2026-09-01", "2026-09-02"],
    contactName: "Sam",
    contactNumber: "07700 900123",
    contactEmail: "sam@example.com",
    vehicleNames: "Bike 1, Van 2",
  }, new Date("2026-08-27T08:00:00.000Z"));

  assert.equal(sheet.quoteNumbers, "Q1001-001");
  assert.equal(sheet.invoiceNumbers, "INV-77");
  assert.equal(sheet.dates, "01/09/2026, 02/09/2026");
  assert.equal(sheet.contacts[0].name, "Sam");
  assert.deepEqual(sheet.vehicles, ["Bike 1", "Van 2"]);
});
