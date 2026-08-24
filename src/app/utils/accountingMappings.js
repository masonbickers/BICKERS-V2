export const SAGE_CUSTOMER_MAPPING_STATUSES = Object.freeze([
  "unmapped",
  "mapped",
  "needs_review",
]);

const text = (value) => String(value ?? "").trim();
const integer = (value, fallback = 30) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

export function normaliseBillingAddress(value) {
  if (typeof value === "string") {
    return { line1: text(value), line2: "", city: "", county: "", postcode: "" };
  }
  return {
    line1: text(value?.line1),
    line2: text(value?.line2),
    city: text(value?.city),
    county: text(value?.county),
    postcode: text(value?.postcode),
  };
}

export function normaliseCustomerFinanceProfile(record = {}) {
  const source = record.financeProfile && typeof record.financeProfile === "object"
    ? record.financeProfile
    : record;
  const sageCustomerId = text(source.sageCustomerId);
  const requestedStatus = text(source.sageCustomerMappingStatus);
  const sageCustomerMappingStatus = SAGE_CUSTOMER_MAPPING_STATUSES.includes(requestedStatus)
    ? requestedStatus
    : sageCustomerId
      ? "mapped"
      : "unmapped";

  return {
    billingLegalName: text(source.billingLegalName || record.name),
    billingTradingName: text(source.billingTradingName),
    billingAddress: normaliseBillingAddress(source.billingAddress || record.address),
    billingCountry: text(source.billingCountry) || "GB",
    accountsPayableContact: text(source.accountsPayableContact || record.invoiceContactName),
    accountsPayableEmail: text(source.accountsPayableEmail || record.invoiceContactEmail || record.email),
    companyRegistrationNumber: text(source.companyRegistrationNumber),
    vatNumber: text(source.vatNumber),
    defaultCurrency: text(source.defaultCurrency).toUpperCase() || "GBP",
    defaultPaymentTerms: integer(source.defaultPaymentTerms, 30),
    poRequirement: text(source.poRequirement) || "optional",
    sageCustomerId: sageCustomerId || null,
    sageCustomerMappingStatus,
    sageCustomerMappedAt: text(source.sageCustomerMappedAt) || null,
    sageCustomerMappedBy: text(source.sageCustomerMappedBy) || null,
  };
}

export function createInvoiceCustomerSnapshot(contact = {}, fallback = {}) {
  const profile = normaliseCustomerFinanceProfile(contact);
  return {
    contactId: text(contact.id || fallback.contactId) || null,
    name: profile.billingLegalName || text(fallback.name),
    contactName: profile.accountsPayableContact || text(fallback.contactName),
    email: profile.accountsPayableEmail || text(fallback.email),
    phone: text(contact.phone || contact.number || fallback.phone),
    address: profile.billingAddress,
    billingCountry: profile.billingCountry,
    billingTradingName: profile.billingTradingName,
    companyRegistrationNumber: profile.companyRegistrationNumber,
    vatNumber: profile.vatNumber,
    sageCustomerId: profile.sageCustomerId,
    sageCustomerMappingStatus: profile.sageCustomerMappingStatus,
    poRequirement: text(
      contact.financeProfile?.poRequirement || contact.poRequirement || fallback.poRequirement
    ) || "optional",
  };
}

export function getAccountingMappingReadiness(invoice = {}) {
  const blockers = [];
  if (!text(invoice.customer?.contactId)) {
    blockers.push({ code: "customer_contact_missing", message: "Select a saved billing customer." });
  }
  if (!text(invoice.customer?.sageCustomerId)) {
    blockers.push({ code: "sage_customer_missing", message: "The billing customer is not mapped to Sage." });
  }
  if (text(invoice.customer?.sageCustomerMappingStatus) !== "mapped") {
    blockers.push({ code: "sage_customer_mapping_unconfirmed", message: "The Sage customer mapping must be confirmed." });
  }
  if (!text(invoice.customer?.name)) {
    blockers.push({ code: "billing_legal_name_missing", message: "Billing legal name is missing." });
  }
  if (!text(invoice.customer?.billingCountry)) {
    blockers.push({ code: "billing_country_missing", message: "Billing country is missing." });
  }
  if (
    text(invoice.customer?.poRequirement).toLowerCase() === "required" &&
    !text(invoice.purchaseOrderNumber)
  ) {
    blockers.push({ code: "purchase_order_missing", message: "This customer requires a PO number." });
  }
  (Array.isArray(invoice.lines) ? invoice.lines : [])
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ line }) => {
      const hasQuantity = line && (
        Object.prototype.hasOwnProperty.call(line, "quantity")
        || Object.prototype.hasOwnProperty.call(line, "qty")
      );
      return !hasQuantity || Number(line.quantity ?? line.qty ?? 0) > 0;
    })
    .forEach(({ line, lineIndex }) => {
      if (!text(line.nominalCode)) {
        blockers.push({ code: "nominal_code_missing", line: lineIndex + 1, message: `Line ${lineIndex + 1} needs a nominal code.` });
      }
      if (!text(line.taxCode)) {
        blockers.push({ code: "tax_code_missing", line: lineIndex + 1, message: `Line ${lineIndex + 1} needs a Sage tax code.` });
      }
    });
  return { ready: blockers.length === 0, blockers };
}
