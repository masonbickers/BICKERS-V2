# Sage 50 v34 Commissioning Runbook

This runbook is the production evidence gate. Repository tests do not replace
these steps.

## 1. Capture the Windows/Sage baseline

Run `collect-diagnostics.ps1` from an elevated PowerShell session on the Sage
host, supplying only approved SDO search directories and the confirmed COM
ProgID. Redirect the JSON to an access-controlled location. The report omits
the company-data path and all credentials.

Record and approve:

- exact Sage 50 Accounts UK v34 version/build and process architecture;
- exact SDO version/build and architecture;
- Windows version and service-account identity;
- registered SDO COM identity and redacted DLL evidence;
- licensed third-party SDO access;
- verified backup and restore of the Sage test-company copy.

Do not build an adapter from a product name alone. `CanHandle` must match the
captured Sage and SDO versions exactly.

## 2. Build and trust the adapters

Implement `ISage50ReadOnlyAdapter` using the licensed v34 SDK. It must only test
the company connection and search bounded customer results. Implement
`ISage50InvoiceWriteAdapter` separately; it may only find an existing invoice
by the Bickers idempotency key/reference and create a service invoice for an
existing active customer.

Build both adapters for the detected architecture, code-sign the deployment
artifacts under the organisation's normal Windows policy, calculate each DLL's
SHA-256 and add those digests to `TrustedAdapterSha256`. Any changed DLL requires
a newly reviewed digest.

## 3. Establish read-only production connectivity

1. Register the tenant connector and retain its one-time credential securely.
2. Install the service with `EnableInvoicePosting` set to `false`.
3. Start with `ExpectedSageCompanyIdentifier` empty. The degraded heartbeat
   reports the safe discovered identifier without granting capabilities.
4. Compare that identifier with the approved company, call the connector
   management action `bind_company`, set the same identifier in local
   configuration and restart the service.
5. Require an online heartbeat with `read_only_customer_lookup`, the approved
   adapter name, exact versions and matching expected/reported company IDs.
6. Search at least three representative customers and have Finance confirm the
   correct existing account mappings. Inactive accounts must remain unmapped.

## 4. Test-company invoice gate

1. Disable server-side invoice posting and stop the service.
2. Point the service at the restored test-company copy, update both company
   bindings, add the trusted write-adapter digest and set local
   `EnableInvoicePosting` to `true`.
3. Restart and require an online heartbeat advertising both
   `read_only_customer_lookup` and `invoice_write`. Posting remains blocked by
   the server-side switch.
4. Enable posting through the administrator action `enable_invoice_posting`.
5. Queue one approved service invoice for an existing mapped customer.
6. Confirm the Sage account, invoice date, payment terms, draft reference, job,
   quote, PO, line descriptions, nominal/tax codes and net/VAT/gross totals.
7. Simulate a success-callback interruption. Allow the lease to expire and
   prove the replay finds the same Sage invoice without creating another.
8. Reconcile in Bickers and confirm the official invoice number and immutable
   issued document.

## 5. Controlled live pilot

Disable posting, repoint and bind the connector to the approved live company,
then repeat the read-only checks before re-enabling either write switch. Prepare
only one controlled live invoice. Once the job is claimed, use
`disable_invoice_posting` to prevent another claim while allowing the active
job's authenticated callbacks to finish. Finance must compare and reconcile the
live Sage record before posting is re-enabled for normal use.

## Rollback and incident rules

- Use `disable_invoice_posting` first; it stops new claims without invalidating
  callbacks for the active job.
- Disable the whole connector only if all connector access must stop.
- Never delete an ambiguous Sage invoice. Let the lease expire, re-enable the
  connector and allow the idempotency lookup to resolve it.
- Correct a genuinely posted accounting error using Finance's approved Sage
  credit/reversal process; credit-note automation is out of scope.
- Treat a company-binding mismatch, untrusted adapter, version mismatch or
  duplicate reference as a hard stop.
