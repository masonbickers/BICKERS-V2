import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyHeartbeatCompanyBinding,
  connectorReadyForInvoiceWrite,
  connectorReadyForReadOnly,
  createConnectorCredential,
  createSage50ConnectorRecord,
  publicConnectorStatus,
  sanitiseHeartbeat,
  verifyConnectorCredential,
} from "../src/app/utils/sage50ConnectorIdentity.js";

test("machine credentials are random, stored as hashes and verified safely", () => {
  const first = createConnectorCredential("s50-connector-1");
  const second = createConnectorCredential("s50-connector-1");
  assert.notEqual(first.credential, second.credential);
  assert.notEqual(first.credentialHash, first.credential);
  assert.equal(verifyConnectorCredential(first.credential, first.credentialHash), true);
  assert.equal(verifyConnectorCredential(second.credential, first.credentialHash), false);
});

test("creates one canonical tenant-scoped connector record", () => {
  const record = createSage50ConnectorRecord({
    connectorId: "s50-connector-1",
    tenantId: "company-1",
    displayName: "Accounts server",
    actor: { uid: "admin-1", email: "admin@example.com", role: "admin" },
    credentialHash: "abc",
    credentialPrefix: "s50c_",
    now: "2026-07-24T12:00:00.000Z",
  });
  assert.equal(record.provider, "sage_50_accounts_uk");
  assert.equal(record.mode, "windows_sdo_connector");
  assert.equal(record.tenantId, "company-1");
  assert.equal(record.companyId, "company-1");
  assert.equal(record.status, "offline");
});

test("heartbeat metadata is bounded and cannot set protected fields", () => {
  const heartbeat = sanitiseHeartbeat({
    status: "degraded",
    machineName: "SAGE-SERVER",
    connectorVersion: "1.0.0",
    processArchitecture: "X64",
    lastErrorCode: "SDO_BUSY",
    lastErrorMessage: "Company data is temporarily locked.",
    capabilities: ["read_only_customer_lookup", "invoice_write", "attacker_capability"],
    tenantId: "attacker-company",
    credentialHash: "attacker-hash",
  });
  assert.equal(heartbeat.status, "degraded");
  assert.equal(heartbeat.machineName, "SAGE-SERVER");
  assert.equal(heartbeat.processArchitecture, "x64");
  assert.equal("tenantId" in heartbeat, false);
  assert.equal("credentialHash" in heartbeat, false);
  assert.deepEqual(heartbeat.capabilities, ["read_only_customer_lookup", "invoice_write"]);
});

test("company binding removes capabilities on a mismatched heartbeat", () => {
  const heartbeat = applyHeartbeatCompanyBinding(
    { expectedSageCompanyIdentifier: "COMPANY-A" },
    sanitiseHeartbeat({
      status: "online",
      sageCompanyIdentifier: "COMPANY-B",
      capabilities: ["read_only_customer_lookup", "invoice_write"],
    })
  );
  assert.equal(heartbeat.status, "error");
  assert.equal(heartbeat.lastErrorCode, "sage_company_binding_mismatch");
  assert.deepEqual(heartbeat.capabilities, []);
});

test("an unbound connector cannot advertise usable capabilities", () => {
  const heartbeat = applyHeartbeatCompanyBinding(
    {},
    sanitiseHeartbeat({
      status: "online",
      sageCompanyIdentifier: "COMPANY-A",
      capabilities: ["read_only_customer_lookup"],
    })
  );
  assert.equal(heartbeat.status, "degraded");
  assert.equal(heartbeat.lastErrorCode, "sage_company_binding_required");
  assert.deepEqual(heartbeat.capabilities, []);
});

test("read and write readiness require binding, capabilities and both kill switches", () => {
  const now = Date.parse("2026-07-24T12:00:00.000Z");
  const record = {
    status: "online",
    isEnabled: true,
    lastHeartbeatAt: "2026-07-24T11:59:00.000Z",
    connectorVersion: "2.0.0",
    sageVersion: "33.1.359.0",
    sdoVersion: "captured-v33.1-build",
    processArchitecture: "x64",
    sageCompanyIdentifier: "COMPANY-A",
    expectedSageCompanyIdentifier: "COMPANY-A",
    adapterName: "sage50-v33.1.359.0-readonly",
    writeAdapterName: "sage50-v33.1.359.0-invoice-write",
    capabilities: ["read_only_customer_lookup", "invoice_write"],
    invoicePostingEnabled: false,
  };
  assert.equal(connectorReadyForReadOnly(record, now), true);
  assert.equal(connectorReadyForReadOnly({ ...record, processArchitecture: null }, now), false);
  assert.equal(connectorReadyForInvoiceWrite(record, now), false);
  assert.equal(connectorReadyForInvoiceWrite({ ...record, invoicePostingEnabled: true }, now), true);
});

test("public status is redacted and treats stale connectors as offline", () => {
  const status = publicConnectorStatus({
    provider: "sage_50_accounts_uk",
    mode: "windows_sdo_connector",
    connectorId: "s50-1",
    tenantId: "company-1",
    displayName: "Connector",
    status: "online",
    isEnabled: true,
    credentialHash: "must-not-leak",
    credentialPrefix: "s50c_s50-1_",
    lastHeartbeatAt: "2026-07-24T11:00:00.000Z",
  }, Date.parse("2026-07-24T12:00:00.000Z"));
  assert.equal(status.status, "offline");
  assert.equal("credentialHash" in status, false);
});

test("connector routes are protected and Firestore denies direct access", () => {
  const management = readFileSync(
    new URL("../src/app/api/integrations/sage50/connectors/route.js", import.meta.url),
    "utf8"
  );
  const heartbeat = readFileSync(
    new URL("../src/app/api/integrations/sage50/connectors/heartbeat/route.js", import.meta.url),
    "utf8"
  );
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(management, /requireAdminFromRequest/);
  assert.match(management, /bind_company/);
  assert.match(management, /enable_invoice_posting/);
  assert.match(management, /invoicePostingEnabled: false/);
  assert.match(heartbeat, /authenticateConnector/);
  assert.match(heartbeat, /applyHeartbeatCompanyBinding/);
  const connectorRule = rules.slice(rules.indexOf("match /sage50Connectors/{connectorId}"));
  assert.equal(connectorRule.includes("match /sage50Connectors/{connectorId}"), true);
  assert.equal(connectorRule.includes("allow read, write: if false;"), true);
});
