import test from "node:test";
import assert from "node:assert/strict";
import {
  createInvoiceCustomerSnapshot,
  getAccountingMappingReadiness,
  normaliseCustomerFinanceProfile,
} from "../src/app/utils/accountingMappings.js";

test("normalises a saved contact into one canonical finance profile", () => {
  const profile = normaliseCustomerFinanceProfile({
    name: "Bad Bird Ltd",
    email: "accounts@example.com",
    financeProfile: { sageCustomerId: "SAGE-42", defaultPaymentTerms: 45 },
  });
  assert.equal(profile.billingLegalName, "Bad Bird Ltd");
  assert.equal(profile.accountsPayableEmail, "accounts@example.com");
  assert.equal(profile.defaultPaymentTerms, 45);
  assert.equal(profile.sageCustomerMappingStatus, "mapped");
});

test("creates a stable invoice customer mapping snapshot", () => {
  const snapshot = createInvoiceCustomerSnapshot({
    id: "contact-42",
    name: "Bad Bird Ltd",
    financeProfile: {
      sageCustomerId: "SAGE-42",
      sageCustomerMappingStatus: "mapped",
      billingCountry: "GB",
      poRequirement: "required",
    },
  });
  assert.equal(snapshot.contactId, "contact-42");
  assert.equal(snapshot.sageCustomerId, "SAGE-42");
  assert.equal(snapshot.sageCustomerMappingStatus, "mapped");
  assert.equal(snapshot.poRequirement, "required");
});

test("requires a PO only when the selected customer policy requires one", () => {
  const base = {
    customer: {
      name: "Bad Bird Ltd",
      contactId: "contact-42",
      billingCountry: "GB",
      sageCustomerId: "SAGE-42",
      sageCustomerMappingStatus: "mapped",
    },
    lines: [{ quantity: 1, nominalCode: "4000", taxCode: "T1" }],
  };

  assert.equal(getAccountingMappingReadiness({
    ...base,
    customer: { ...base.customer, poRequirement: "optional" },
  }).ready, true);
  assert.deepEqual(
    getAccountingMappingReadiness({
      ...base,
      customer: { ...base.customer, poRequirement: "required" },
    }).blockers.map((item) => item.code),
    ["purchase_order_missing"]
  );
  assert.equal(getAccountingMappingReadiness({
    ...base,
    customer: { ...base.customer, poRequirement: "required" },
    purchaseOrderNumber: "PO-42",
  }).ready, true);
});

test("mapping blockers retain the original invoice line number when unused lines are skipped", () => {
  const result = getAccountingMappingReadiness({
    customer: {
      name: "Bad Bird Ltd",
      contactId: "contact-42",
      billingCountry: "GB",
      sageCustomerId: "SAGE-42",
      sageCustomerMappingStatus: "mapped",
    },
    lines: [
      { quantity: 0, nominalCode: "", taxCode: "" },
      { quantity: 1, nominalCode: "", taxCode: "" },
    ],
  });

  assert.deepEqual(result.blockers.map((item) => item.line), [2, 2]);
});

test("requires one mapped customer and both mappings on every invoice line", () => {
  const result = getAccountingMappingReadiness({
    customer: {
      name: "Bad Bird Ltd",
      contactId: "contact-42",
      billingCountry: "GB",
      sageCustomerId: "SAGE-42",
      sageCustomerMappingStatus: "mapped",
    },
    lines: [
      { nominalCode: "4000", taxCode: "T1" },
      { nominalCode: "", taxCode: "" },
    ],
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers.map((item) => item.code), [
    "nominal_code_missing",
    "tax_code_missing",
  ]);
});
