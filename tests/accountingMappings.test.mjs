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
    },
  });
  assert.equal(snapshot.contactId, "contact-42");
  assert.equal(snapshot.sageCustomerId, "SAGE-42");
  assert.equal(snapshot.sageCustomerMappingStatus, "mapped");
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
