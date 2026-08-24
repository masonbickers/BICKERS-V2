# Bickers Action Sage 50 Windows Connector

This is a .NET 8 Windows Worker Service. It runs on the trusted Windows machine
that hosts, or can access, Sage 50 Accounts UK and the licensed Sage Data
Objects installation.

Its default responsibilities are deliberately read-only:

- protect the registered machine credential with Windows DPAPI;
- authenticate to the existing connector heartbeat API;
- discover installed Sage 50 Accounts and SDO versions;
- select a compatible, explicitly read-only version adapter;
- test read-only access to the configured company;
- poll only the separate read-only customer lookup queue;
- return bounded customer account search results;
- send bounded health metadata;
- run as either a Windows Service or an interactive console process.

An isolated invoice worker can additionally create service invoices through a
separate `ISage50InvoiceWriteAdapter`. It runs only when local
`EnableInvoicePosting` is true and the server-side connector has separately
enabled posting. It never creates customers, credits, payments or allocations.

## Version adapter gate

No Sage COM ProgID, SDO DLL version or login signature is hard-coded. The
installed Sage and SDO versions must be detected before an adapter is selected.
Version-specific adapter assemblies live in the configured `AdapterDirectory`
and implement `ISage50ReadOnlyAdapter` and, separately where approved,
`ISage50InvoiceWriteAdapter`.

An adapter is accepted only when:

1. it declares `CapabilityMode` exactly as `read_only`;
2. `CanHandle` accepts the detected Sage/SDO combination;
3. its connection test uses the configured `CompanyDataPath`;
4. it returns only company name, a safe company identifier and bounded errors.

If no compatible adapter is installed, the connector reports
`unsupported_sage_sdo_version` and `degraded`. This is intentional: obtain the
exact installed Sage 50 and SDO releases and build/approve the corresponding
adapter instead of guessing a COM ProgID.

Every adapter assembly must be an administrator-controlled deployment artifact
whose SHA-256 digest is listed in `TrustedAdapterSha256`. The read-only adapter
must not expose write methods. The write adapter is restricted to finding and
creating service invoices for existing active Sage accounts.

If the confirmed SDO adapter requires Sage credentials, that adapter must use
Windows-protected secret storage and must never place them in `appsettings.json`
or heartbeat metadata.

## Configuration

Edit `appsettings.json` on the Windows connector machine:

```json
{
  "Connector": {
    "ConnectorApiBaseUrl": "https://booking.example.com",
    "ConnectorId": "s50-registered-connector-id",
    "CompanyDataPath": "\\\\sage-server\\company-data",
    "HeartbeatIntervalSeconds": 60,
    "LookupPollIntervalSeconds": 10,
    "InvoicePollIntervalSeconds": 15,
    "ApiRequestTimeoutSeconds": 30,
    "SageAdapter": "auto",
    "SageWriteAdapter": "auto",
    "EnableInvoicePosting": false,
    "ExpectedSageCompanyIdentifier": "APPROVED-COMPANY-ID",
    "AdapterDirectory": "adapters",
    "CredentialFilePath": "",
    "SdoSearchPaths": [],
    "SdoFilePatterns": [],
    "TrustedAdapterSha256": ["UPPERCASE-SHA256-WITHOUT-SEPARATORS"]
  }
}
```

`SdoSearchPaths` and `SdoFilePatterns` are optional discovery inputs when an
installed SDO component is not registered in Windows Programs and Features.
The defaults do not assume a DLL name.

The machine credential is never placed in `appsettings.json`.
Keep `EnableInvoicePosting` false until read-only lookup succeeds, the company
binding is confirmed, and a test-company service invoice has been reconciled.

## Build and publish

On a machine with the .NET 8 SDK, use the runtime matching the captured Sage/SDO
architecture (`win-x64` shown):

```powershell
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=false -o .\publish
```

Copy `install-service.ps1` into `publish`, configure `appsettings.json`, and run
the installer from an elevated PowerShell session. The installer prompts for
the one-time credential without echoing it. The credential is encrypted with
DPAPI `LocalMachine` scope, entropy-bound to the connector ID, and its file ACL
is restricted to SYSTEM, Administrators and the installing identity.

If the service runs under a dedicated Windows account, grant that account read
access to the credential file and company data using the organisation’s normal
Windows administration process.

## Console diagnostics

Run the executable directly from its installation directory. Ctrl+C triggers
graceful cancellation. Logs contain connector IDs and safe health information,
but never the bearer credential, company data path, or Sage credentials.

The heartbeat uses:

- `Authorization: Bearer <machine credential>`
- `X-Sage-Connector-Id: <registered connector ID>`
- `POST /api/integrations/sage50/connectors/heartbeat`

Failures use bounded backoff of 5, 15, 30 and 60 seconds, capped by the
configured heartbeat interval. There is no tight polling loop.

Customer lookup polling uses the separately configured
`LookupPollIntervalSeconds` and only the
`/api/integrations/sage50/customer-lookups` routes.

Invoice polling uses `InvoicePollIntervalSeconds` and the authenticated
`/api/integrations/sage50/export-jobs` claim/callback routes. It validates
contract v2 and totals, checks for an existing invoice using both the immutable
idempotency key and draft reference, and only then requests service-invoice
creation. If Sage succeeds but the callback fails, the lease expires and the
next attempt resolves the existing Sage invoice instead of creating a duplicate.

## Commissioning gate

This repository deliberately does not include Sage's licensed v34 SDK/SDO
implementation. Before deployment, capture the exact Sage and SDO builds and
architectures on the Windows host, implement both adapter interfaces against
that exact build, test against a backed-up Sage test-company copy, record each
adapter SHA-256, and compile/publish on a Windows machine with .NET 8.
Follow `docs/sage-50-v34-commissioning.md` and use
`collect-diagnostics.ps1` for the redacted host evidence capture.
