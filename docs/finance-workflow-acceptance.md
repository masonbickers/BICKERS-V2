# Finance Workflow Acceptance

## Purpose

This acceptance test proves the local quote-to-delivered-invoice workflow using
the existing Sage 50 connector contracts without contacting Firebase, Resend,
Sage, Windows or SDO.

Automated test:

```bash
node --test tests/financeWorkflowAcceptance.test.mjs
```

The test uses deterministic timestamps and in-memory stores. It sends no email,
writes no files, creates no Firebase records and performs no network requests.

## Test Fixture

- Tenant: `test-tenant-bickers`
- Operations actor: `test.operations@bickers.invalid`
- Finance actor: `test.finance@bickers.invalid`
- Reconciliation actor: `test.reconciliation@bickers.invalid`
- Simulated connector: `TEST-CONNECTOR-01`
- Job: `9301` / `test-booking-9301`
- Customer: `Humour Productions Test Ltd`
- Sage customer mapping: `TEST-HUM001`
- Accepted quote: `QTEST-9301-002`
- Purchase order: `PO-TEST-9301`
- Crew: one test crew member with an approved timesheet
- Vehicle: one test tracking vehicle
- Payment terms: 30 days
- Nominal codes: `4000` and `4001`
- Sage tax code: `T1`
- Test sender configuration: represented only by the delivery transport double
- Simulated Sage record: `TEST-SAGE-RECORD-0001`
- Simulated official number: `TEST-SAGE-0001`

The accepted quote has two net lines totalling GBP 1,800.00. The controlled
invoice variation adds two hours of test overtime at GBP 100.00. The final
invoice is GBP 2,000.00 net, GBP 400.00 VAT and GBP 2,400.00 gross.

## Successful Stages

1. The saved accepted quote is selected and remains unchanged.
2. Finance readiness passes with the accepted quote, PO, operational review
   and approved timesheet. Missing mandatory evidence blocks readiness.
3. One invoice draft is created with a stable draft reference and no official
   number. Repeated creation resolves to the same active draft.
4. The controlled overtime variation recalculates net, VAT and gross totals.
   Browser attempts to set lifecycle and Sage-owned fields are stripped.
5. Incomplete accounting mappings block approval. Approval, reasoned reopening
   and reapproval pass. Approved snapshots are frozen in the harness.
6. Only the approved Sage-ready invoice is prepared and queued. The export
   payload is produced from the server-side invoice state and queue creation is
   idempotent.
7. The simulated connector claims the oldest eligible job with a hashed lease.
   Another connector cannot claim it and the invoice remains approved.
8. `TEST-SAGE-0001` is introduced only by the simulated successful connector
   result. An identical callback is idempotent and a conflicting callback is
   rejected.
9. Trusted reconciliation changes the invoice from approved to issued, stores
   the Sage record ID, updates the booking to invoiced and creates the issued
   snapshot. Duplicate reconciliation creates no duplicate audit entry.
10. The authoritative PDF is rendered only from the issued snapshot. Its
    SHA-256 is stable, it contains `TEST-SAGE-0001`, and it does not present the
    draft reference as the invoice number. Mutating live booking/customer test
    objects does not change the PDF.
11. The delivery double verifies the stored PDF checksum, uses the frozen
    recipient, records the provider identity and treats a duplicate send as
    idempotent. Delivery leaves lifecycle status as issued.

## Queue Classification

Exactly one primary Finance Home classification is asserted at each stage:

- Ready for Finance
- Draft
- Approved
- Pending Export
- Exporting, derived from the separate Sage transport state
- Issued

Invoice lifecycle remains separate from Sage transport state. An approved
invoice is not changed to a synthetic lifecycle status merely to display export
progress.

## Audit Sequence

The acceptance ledger verifies ordered actor-labelled events for:

1. `finance_handoff`
2. `invoice_created`
3. `draft_saved`
4. `invoice_approved`
5. `sage50_export_job_queued`
6. `sage50_export_job_claimed`
7. `sage50_export_job_succeeded`
8. `sage50_export_reconciled`
9. `invoice_issued`
10. `issued_document_stored`
11. `invoice_delivered`

Connector and reconciliation events are labelled as system actions. The audit
assertion rejects connector credentials, lease tokens, private keys and
complete invoice line payloads.

## Negative Paths

The automated acceptance test proves:

- missing Sage customer mapping blocks approval;
- missing nominal code blocks approval;
- missing Sage tax code blocks approval;
- an offline connector blocks queueing;
- failed export leaves the invoice approved and numberless;
- failed or tenant-mismatched reconciliation cannot issue an invoice;
- browser draft writes cannot set official number, issued/paid state or Sage ID;
- payment status cannot be changed manually;
- tenant mismatch blocks reconciliation;
- invoice/export collections and issued storage remain browser-write denied;
- a successful export cannot be claimed, cancelled or requeued;
- an identical success callback is idempotent and a conflicting callback fails;
- recipient override is rejected by the protected delivery implementation.

## Integrity and Isolation

- No production Firebase project is used.
- No Firebase emulator is required for this test.
- No real email is sent.
- No Sage endpoint or SDO component is contacted.
- No Windows connector is required.
- No wall-clock time is read for workflow assertions.
- In-memory maps are discarded when the test process exits.

Firestore and Storage rule assertions remain in their dedicated emulator tests
and require Java 21 with the current Firebase CLI.

## Known Limitation and Windows Evidence Gate

This test validates the local workflow and simulated connector contract only.
It does **not** prove that Sage 50 accepts or posts an invoice.

Before a real read-only adapter can be commissioned, diagnostics must be
captured on the actual Windows Sage server for:

- Windows version and process architecture;
- exact Sage 50 Accounts UK product, version, build and release;
- installed SDO version and architecture;
- discovered SDO DLL filename/location with sensitive path portions redacted;
- registered COM/SDO identity;
- configured company identity binding;
- connector-selected adapter and safe blocker codes.

After that evidence is reviewed, one exact version-specific read-only adapter
must be built, tested and deployed. Production Sage posting remains unavailable
until a later separately approved write adapter is implemented and verified.
