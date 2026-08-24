import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../tools/sage50-connector/${path}`, import.meta.url), "utf8");

test("connector is an isolated .NET 8 Windows Worker Service", () => {
  const project = read("BickersAction.Sage50Connector.csproj");
  const program = read("Program.cs");
  assert.match(project, /Microsoft\.NET\.Sdk\.Worker/);
  assert.match(project, /net8\.0-windows/);
  assert.match(project, /Microsoft\.Extensions\.Hosting\.WindowsServices/);
  assert.match(program, /AddWindowsService/);
  assert.match(program, /ConnectorWorker/);
});

test("machine credential uses DPAPI and restricted Windows ACLs", () => {
  const store = read("Security/DpapiMachineCredentialStore.cs");
  assert.match(store, /DataProtectionScope\.LocalMachine/);
  assert.match(store, /ProtectedData\.Protect/);
  assert.match(store, /SetAccessRuleProtection/);
  assert.match(store, /LocalSystemSid/);
  assert.match(store, /BuiltinAdministratorsSid/);
  assert.doesNotMatch(read("appsettings.json"), /s50c_/);
});

test("heartbeat matches the existing authenticated connector API", () => {
  const client = read("Transport/ConnectorApiClient.cs");
  const model = read("Transport/HeartbeatRequest.cs");
  assert.match(client, /\/api\/integrations\/sage50\/connectors\/heartbeat/);
  assert.match(client, /AuthenticationHeaderValue\("Bearer"/);
  assert.match(client, /X-Sage-Connector-Id/);
  for (const field of [
    "machineName",
    "connectorVersion",
    "sageVersion",
    "sdoVersion",
    "sageCompanyName",
    "sageCompanyIdentifier",
    "adapterName",
    "writeAdapterName",
    "capabilities",
    "lastErrorCode",
    "lastErrorMessage",
  ]) {
    assert.match(model, new RegExp(`"${field}"`));
  }
});

test("version gate is configurable and adapters are strictly read-only", () => {
  const catalog = read("Sage/SageAdapterCatalog.cs");
  const contract = read("Sage/ISage50ReadOnlyAdapter.cs");
  const projectSources = [
    catalog,
    contract,
    read("Sage/WindowsSageInstallationDiscovery.cs"),
    read("Hosting/ConnectorWorker.cs"),
  ].join("\n");
  assert.match(catalog, /unsupported_sage_sdo_version/);
  assert.match(catalog, /CapabilityMode\.Equals\("read_only"/);
  assert.match(contract, /TestConnectionAsync/);
  assert.doesNotMatch(projectSources, /GetTypeFromProgID|Sage\.\d+|SDOEngine\.\d+/);
});

test("invoice posting is isolated behind a separate adapter and local kill switch", () => {
  const readOnly = read("Sage/ISage50ReadOnlyAdapter.cs");
  const writeContract = read("Sage/ISage50InvoiceWriteAdapter.cs");
  const writeWorker = read("Hosting/InvoiceExportWorker.cs");
  const settings = read("appsettings.json");
  assert.doesNotMatch(readOnly, /CreateServiceInvoiceAsync|invoice_write/);
  assert.match(writeContract, /CapabilityMode/);
  assert.match(writeContract, /FindExistingServiceInvoiceAsync/);
  assert.match(writeContract, /CreateServiceInvoiceAsync/);
  assert.match(writeContract, /ExpectedSageCompanyIdentifier/);
  assert.match(writeWorker, /EnableInvoicePosting/);
  assert.match(writeWorker, /ContractVersion != 2/);
  assert.match(writeWorker, /FindExistingServiceInvoiceAsync[\s\S]*CreateServiceInvoiceAsync/);
  assert.match(settings, /"EnableInvoicePosting": false/);
});

test("adapter assemblies require an explicit SHA-256 trust allowlist", () => {
  const loader = read("Sage/TrustedAdapterLoader.cs");
  assert.match(loader, /SHA256\.HashData/);
  assert.match(loader, /TrustedAdapterSha256/);
  assert.match(loader, /Rejected untrusted Sage adapter assembly/);
});

test("worker uses cancellation and bounded backoff", () => {
  const worker = read("Hosting/ConnectorWorker.cs");
  const program = read("Program.cs");
  assert.match(worker, /BackgroundService/);
  assert.match(worker, /stoppingToken/);
  assert.match(worker, /TimeSpan\.FromSeconds\(5\)/);
  assert.match(worker, /TimeSpan\.FromSeconds\(60\)/);
  assert.match(worker, /Task\.Delay\(retry, stoppingToken\)/);
  assert.match(program, /ApiRequestTimeoutSeconds/);
  assert.match(program, /client\.Timeout/);
});
