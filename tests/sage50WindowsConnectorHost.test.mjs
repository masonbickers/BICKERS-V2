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

test("host does not poll invoice export jobs or expose Sage write operations", () => {
  const files = [
    read("Program.cs"),
    read("Hosting/ConnectorWorker.cs"),
    read("Transport/ConnectorApiClient.cs"),
    read("Sage/ISage50ReadOnlyAdapter.cs"),
  ].join("\n");
  assert.doesNotMatch(files, /export-jobs|create_sales_invoice/);
  assert.doesNotMatch(files, /CreateInvoice|UpdateInvoice|DeleteInvoice|PostInvoice/);
});

test("worker uses cancellation and bounded backoff", () => {
  const worker = read("Hosting/ConnectorWorker.cs");
  assert.match(worker, /BackgroundService/);
  assert.match(worker, /stoppingToken/);
  assert.match(worker, /TimeSpan\.FromSeconds\(5\)/);
  assert.match(worker, /TimeSpan\.FromSeconds\(60\)/);
  assert.match(worker, /Task\.Delay\(retry, stoppingToken\)/);
});
