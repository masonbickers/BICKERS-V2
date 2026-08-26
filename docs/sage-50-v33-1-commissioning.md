# Sage 50 v33.1.359.0 Commissioning Runbook

This is the production evidence gate for the Bickers Sage connector. Repository
tests and simulated adapters do not prove a real Sage connection or posting.

## Approved version matrix

| Component | Required value | Evidence source | Status before commissioning |
| --- | --- | --- | --- |
| Sage 50 Accounts UK | `33.1.359.0` | Sage Help > About and diagnostics JSON | Required |
| SDO | Exact v33.1 file/product build | Diagnostics JSON and licensed SDK package | Required |
| COM identity | `SDOEngine.33` | Redacted registry discovery | Required |
| Connector architecture | Exact `x86` or `x64` match for installed SDO | Diagnostics JSON | Required |
| Read-only adapter | `sage50-v33.1.359.0-readonly` | Signed DLL and reviewed SHA-256 | Required |
| Invoice adapter | `sage50-v33.1.359.0-invoice-write` | Signed DLL and reviewed SHA-256 | Required for test posting only |

Do not substitute v33.0, v34 or a different SDO build. The service remains
degraded until `ExpectedSdoVersion` and `ExpectedProcessArchitecture` match the
captured host evidence.

## 1. Capture the Sage-PC baseline

Run from elevated PowerShell on the Sage PC and store the output in an
access-controlled location:

```powershell
.\collect-diagnostics.ps1 `
  -ComProgId "SDOEngine.33" `
  -CompanyDataPath "<approved-company-data-path>" `
  -SdoSearchPath "<approved-SDO-directory>" | Set-Content -Encoding UTF8 .\sage-v33.1-diagnostics.json
```

The report omits the company path and credentials. Finance/IT must review the
exact Sage/SDO builds, process architecture, Windows version, COM registration,
company-data access and the verified backup/restore of the test-company copy.

## 2. Build and trust the licensed adapters

Obtain the Sage 50 Accounts v33.1 SDK and documentation through the approved
Sage developer channel. The licensed SDK binaries must not be committed.
Implement the read-only and invoice-write interfaces separately and marshal
all SDO/COM work through `SageStaExecutor`.

Both adapters must declare the exact captured Sage version, SDO build and
architecture. Build self-contained for that architecture, code-sign under the
organisation's Windows policy, calculate SHA-256 for each DLL and list only the
approved hashes in `TrustedAdapterSha256`.

The read-only adapter may connect and search a maximum of 25 customers. The
write adapter may only locate an existing Bickers-referenced service invoice or
create one for an existing active customer. It must reject conflicting reused
references and must not create customers, credits, payments or allocations.

## 3. Install credentials and establish live read-only access

Finance creates two dedicated Sage users: one read-only and one restricted to
approved service-invoice posting. Configure `appsettings.json`, leaving
`EnableInvoicePosting` false, then run interactively:

```powershell
.\BickersAction.Sage50Connector.exe --set-credential
.\BickersAction.Sage50Connector.exe --set-sage-read-credential
.\BickersAction.Sage50Connector.exe --set-sage-write-credential
```

The three secrets are stored separately with Windows DPAPI and restricted
ACLs. Never place them in configuration, Firestore, logs, chat or email.

Start against the live company with only the read-only adapter trusted. Capture
the safe company identifier, approve it using `bind_company`, copy it into
`ExpectedSageCompanyIdentifier`, then restart. Require an online heartbeat with
the exact version matrix and `read_only_customer_lookup`. Finance must verify at
least three representative existing customers; inactive accounts stay unmapped.

## 4. Test-company posting gate

Disable server posting and stop the service. Point it to the verified test copy,
update both company bindings, trust the reviewed write-adapter hash and set the
local `EnableInvoicePosting` switch true. The heartbeat may advertise
`invoice_write`, but no job can be claimed until an administrator separately
runs `enable_invoice_posting`.

Post one approved service invoice and reconcile customer, date, payment terms,
references, PO, job, quote, descriptions, nominal/tax codes and net/VAT/gross.
Interrupt the success callback, allow the lease to expire and prove replay finds
the same Sage invoice. A second invoice is a failed gate.

## 5. Controlled live pilot

Disable posting, restore the live path and binding, restart, and repeat all
read-only checks. Enable one reviewed live invoice. Once claimed, run
`disable_invoice_posting` so no second job can be claimed while authenticated
callbacks for the active job finish. Finance must reconcile and approve the
official Sage invoice before normal posting can be enabled.

## Rollback

- Disable server posting first to stop new claims.
- Disable the connector only when all access must stop.
- Never delete an ambiguous invoice; replay the idempotent lookup after lease expiry.
- Correct real accounting errors through Finance's approved Sage credit/reversal process.
- Treat a version, architecture, company-binding, credential, trusted-hash or duplicate-reference mismatch as a hard stop.
