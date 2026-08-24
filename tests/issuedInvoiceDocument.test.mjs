import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderIssuedInvoicePdf } from "../src/app/utils/issuedInvoicePdf.js";

const snapshot = {
  schemaVersion: 1,
  invoiceNumber: "SI-1001",
  issueDate: "2026-07-24",
  dueDate: "2026-08-23",
  jobNumber: "9164",
  currency: "GBP",
  customer: {
    billingLegalName: "Bad Bird Ltd",
    address: { line1: "1 Production Road", city: "Glasgow", postcode: "G1 1AA" },
  },
  purchaseOrderNumber: "PO-010100",
  paymentTermsDays: 30,
  lines: [
    {
      description: "Artic low loader and tracking trailer",
      quantity: 1,
      unitPrice: 2245,
      taxRate: 20,
      net: 2245,
    },
  ],
  totals: { net: 2245, tax: 449, gross: 2694 },
};

test("renders a deterministic authoritative PDF from an issued snapshot", () => {
  const first = renderIssuedInvoicePdf(snapshot);
  const second = renderIssuedInvoicePdf(structuredClone(snapshot));
  assert.equal(first.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.equal(first.subarray(-5).toString("latin1"), "%%EOF");
  assert.equal(
    createHash("sha256").update(first).digest("hex"),
    createHash("sha256").update(second).digest("hex")
  );
  assert.match(first.toString("latin1"), /SI-1001/);
  assert.match(first.toString("latin1"), /GBP 2,694.00/);
});

test("rejects incomplete issued snapshots", () => {
  assert.throws(
    () => renderIssuedInvoicePdf({ ...snapshot, invoiceNumber: "" }),
    /official invoice number/i
  );
});

test("issued storage service is immutable, checksummed and snapshot-only", () => {
  const service = readFileSync(
    new URL("../src/app/utils/issuedInvoiceDocumentService.js", import.meta.url),
    "utf8"
  );
  assert.match(service, /renderIssuedInvoicePdf\(invoice\.issuedSnapshot\)/);
  assert.match(service, /mustNotExist: true/);
  assert.match(service, /sourceSnapshotSha256/);
  assert.doesNotMatch(service, /bookings/);
  assert.doesNotMatch(service, /quotes/);
  assert.doesNotMatch(service, /customers/);
});

test("issued downloads use protected storage and draft preview remains separate", () => {
  const route = readFileSync(
    new URL("../src/app/api/invoices/[id]/issued-document/route.js", import.meta.url),
    "utf8"
  );
  const view = readFileSync(
    new URL("../src/app/invoice-view/[id]/page.js", import.meta.url),
    "utf8"
  );
  const rules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");
  assert.match(route, /requireFinanceFromRequest\(req\)/);
  assert.match(route, /adminDownloadStorageObject/);
  assert.match(view, /rawInvoice\.status === "issued"/);
  assert.match(view, /issued-document/);
  assert.match(rules, /issued-invoices[\s\S]*allow read, write: if false/);
});

test("draft preview keeps Sage-controlled dates pending and labels draft downloads", () => {
  const view = readFileSync(
    new URL("../src/app/invoice-view/[id]/page.js", import.meta.url),
    "utf8"
  );
  const styles = readFileSync(
    new URL("../src/app/invoice-view/[id]/page.module.css", import.meta.url),
    "utf8"
  );

  assert.match(view, /const issueDate = identity\.isDraft \? null : invoice\.issueDate \|\| invoice\.issuedAt/);
  assert.doesNotMatch(view, /invoice\.issueDate \|\| invoice\.issuedAt \|\| invoice\.createdAt/);
  assert.match(view, /Assigned when issued by Sage/);
  assert.match(view, /days from Sage posting/);
  assert.match(view, /Save draft PDF/);
  assert.match(view, /Billing address incomplete/);
  assert.match(styles, /\.linesTable td\s*\{[^}]*background:\s*#fff;[^}]*color:\s*#111827/);
  assert.match(styles, /\.lowerSection\s*\{[^}]*break-inside:\s*avoid;[^}]*page-break-inside:\s*avoid/);
  assert.match(styles, /@media print[\s\S]*\.previewNotice\s*\{[^}]*display:\s*none !important/);
});
