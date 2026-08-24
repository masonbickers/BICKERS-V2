import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createCustomerLookupRecord,
  lookupCanBeClaimed,
  publicCustomerLookup,
  sanitiseCustomerLookupResults,
} from "../src/app/utils/sage50CustomerLookup.js";

test("creates a separate tenant-scoped read-only lookup job", () => {
  const job = createCustomerLookupRecord({
    tenantId: "company-1",
    connectorId: "connector-1",
    contactId: "contact-1",
    query: "  Bad   Bird ",
    requestedBy: "finance@example.com",
    now: new Date("2026-07-24T12:00:00.000Z"),
  });
  assert.equal(job.operation, "search_customers_read_only");
  assert.equal(job.tenantId, "company-1");
  assert.equal(job.contactId, "contact-1");
  assert.equal(job.query, "Bad Bird");
  assert.equal(job.status, "queued");
  assert.equal(job.maxResults, 25);
  assert.match(job.lookupJobId, /^s50lookup-/);
  assert.equal("invoice" in job, false);
});

test("lookup leases expire and never outlive the lookup TTL", () => {
  const now = new Date();
  const job = createCustomerLookupRecord({
    tenantId: "company-1",
    connectorId: "connector-1",
    contactId: "contact-1",
    query: "Bird",
    requestedBy: "finance@example.com",
    now,
  });
  assert.equal(lookupCanBeClaimed(job, now.getTime()), true);
  assert.equal(lookupCanBeClaimed(job, Date.parse(job.expiresAt) + 1), false);
  assert.equal(publicCustomerLookup(job).status, "queued");
});

test("sanitises and bounds customer account results", () => {
  const rows = sanitiseCustomerLookupResults([
    {
      accountReference: "BADBIRD",
      name: "Bad Bird Ltd",
      addressSummary: "1 Production Road",
      email: "ACCOUNTS@EXAMPLE.COM",
      isActive: true,
      balance: 999999,
      bankDetails: "must-not-pass-through",
    },
    { accountReference: "BADBIRD", name: "Duplicate" },
    { accountReference: "", name: "Invalid" },
  ]);
  assert.deepEqual(rows, [{
    sageCustomerId: "BADBIRD",
    accountReference: "BADBIRD",
    name: "Bad Bird Ltd",
    addressSummary: "1 Production Road",
    postcode: null,
    email: "accounts@example.com",
    phone: null,
    currency: null,
    isActive: true,
  }]);
  assert.equal("balance" in rows[0], false);
  assert.equal("bankDetails" in rows[0], false);
});

test("browser routes derive tenant authority and use a separate collection", () => {
  const queue = readFileSync(
    new URL("../src/app/api/integrations/sage50/customer-lookups/route.js", import.meta.url),
    "utf8"
  );
  const claim = readFileSync(
    new URL("../src/app/api/integrations/sage50/customer-lookups/claim/route.js", import.meta.url),
    "utf8"
  );
  assert.match(queue, /requireFinanceFromRequest\(req\)/);
  assert.match(queue, /contact\.companyId/);
  assert.match(queue, /findTenantConnector\(tenantId\)/);
  assert.doesNotMatch(queue, /body\.tenantId|body\.connectorId/);
  assert.match(claim, /authenticateConnector/);
  assert.match(claim, /CUSTOMER_LOOKUP_COLLECTION/);
  assert.doesNotMatch(queue + claim, /sage50ExportJobs|EXPORT_JOB_COLLECTION/);
});

test("mapping confirmation uses only a verified result and an atomic server write", () => {
  const confirm = readFileSync(
    new URL(
      "../src/app/api/integrations/sage50/customer-lookups/[lookupJobId]/confirm/route.js",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(confirm, /lookup\.status !== "succeeded"/);
  assert.match(confirm, /sanitiseCustomerLookupResults\(lookup\.results\)/);
  assert.match(confirm, /selected\.isActive/);
  assert.match(confirm, /adminCommitDocumentPatches/);
  assert.match(confirm, /sageCustomerMappingStatus: "mapped"/);
  assert.match(confirm, /sage50_customer_mapping_confirmed/);
});

test("client cannot directly change Sage customer mapping fields", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const page = readFileSync(
    new URL("../src/app/saved-contacts/page.js", import.meta.url),
    "utf8"
  );
  assert.match(rules, /contactSageMappingUnchanged/);
  assert.match(rules, /sage50CustomerLookupJobs[\s\S]*allow read, write: if false/);
  assert.match(page, /\/api\/integrations\/sage50\/customer-lookups/);
  assert.doesNotMatch(page, /\["sageCustomerId", "Sage customer ID"\]/);
});

test("Windows host polls lookup jobs only and exposes read-only adapter search", () => {
  const worker = readFileSync(
    new URL("../tools/sage50-connector/Hosting/CustomerLookupWorker.cs", import.meta.url),
    "utf8"
  );
  const adapter = readFileSync(
    new URL("../tools/sage50-connector/Sage/ISage50ReadOnlyAdapter.cs", import.meta.url),
    "utf8"
  );
  const client = readFileSync(
    new URL("../tools/sage50-connector/Transport/ConnectorApiClient.cs", import.meta.url),
    "utf8"
  );
  assert.match(worker, /search_customers_read_only/);
  assert.match(adapter, /SearchCustomersAsync/);
  assert.match(client, /customer-lookups\/claim/);
  assert.doesNotMatch(worker, /export-jobs/);
  assert.doesNotMatch(adapter, /CreateCustomer|UpdateCustomer|DeleteCustomer/);
});
