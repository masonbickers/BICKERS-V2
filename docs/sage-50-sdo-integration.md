# Sage 50 Accounts UK SDO Integration

## Confirmed target

- Product: Sage 50 Accounts UK
- Deployment: server-based/on-premise
- Integration technology: Sage Data Objects (SDO)
- Integration product key: `sage_50_accounts_uk`
- Sage Accounting cloud OAuth API: not applicable

The Next.js application must not load Sage SDO, COM or ActiveX components and
must not directly access Sage company data. The web runtime prepares a
tenant-scoped, immutable export job. A separately deployed trusted Windows
connector, on a host with the licensed Sage 50 SDO components and company-data
access, is the only component permitted to call SDO.

## Trust boundary

1. Finance prepares and approves an invoice through the protected web lifecycle.
2. The server creates a versioned connector job from the approved invoice
   snapshot. Tenant identity comes from authenticated server context, never the
   request body.
3. A future authenticated transport makes the job available to the authorised
   Windows connector.
4. The connector validates the contract version, product, tenant assignment and
   idempotency key before any SDO operation.
5. The connector returns a signed/authenticated result containing either the
   Sage invoice identity and official number or a structured failure.
6. A future protected server action validates that result before changing the
   invoice lifecycle or sync metadata.

Steps 3–6 remain architectural boundaries for invoice transport. No job
transport, SDO invocation or invoice creation is implemented yet.

## Connector registration and heartbeat

The web application supports one server-managed connector record per tenant:

- `GET /api/integrations/sage50/connectors` returns an administrator-safe,
  redacted status view.
- `POST /api/integrations/sage50/connectors` supports `register`,
  `rotate_credential`, `enable` and `disable`.
- `POST /api/integrations/sage50/connectors/heartbeat` accepts bounded machine
  and Sage installation metadata from the registered connector.

Company administrators are always bound to the company in their authenticated
server-side user record. Platform administrators must explicitly select an
existing platform company. Connector credentials are random high-entropy bearer
secrets; only a SHA-256 hash is stored and the clear credential is returned only
on registration or rotation. Rotation immediately invalidates the previous
credential.

Connector records are held in the server-only `sage50Connectors` collection.
Firestore browser reads and writes are denied. Heartbeats cannot change tenant,
connector identity, enablement, credential data, job state or invoice state.
Registration, rotation, enablement changes and meaningful heartbeat state
changes write administrator audit events.

## Windows connector host

The deployable .NET 8 Windows Worker Service is in
`tools/sage50-connector/`. It runs as a Windows Service in production and a
console application for diagnostics. Its current implementation is limited to
machine authentication, heartbeat scheduling, Sage/SDO discovery and a
read-only company capability test.

The registered machine credential is stored locally with Windows DPAPI
`LocalMachine` protection and a restricted file ACL. It is not stored in
`appsettings.json` or logged.

The exact installed Sage 50 and compatible SDO version remains an enforced
adapter gate. The host does not hard-code a COM ProgID or SDO DLL. It loads an
administrator-deployed adapter implementing the read-only connector interface,
and rejects missing, mismatched or non-read-only adapters. Until a compatible
version adapter is installed, heartbeat health is safely reported as degraded.

The host does not call the invoice export-job claim endpoint and contains no
Sage write operation. It may poll the separate customer lookup queue to run
bounded, read-only account searches through an approved version adapter.

## Export queue and leases

Approved, Sage-ready invoices can be queued only after the protected lifecycle
has prepared them for export and the assigned connector is online with connector,
Sage and SDO versions reported.

- Human users queue and read redacted status through
  `/api/integrations/sage50/export-jobs`.
- Connectors claim the oldest available tenant job through
  `/api/integrations/sage50/export-jobs/claim`.
- A claim returns a one-time lease token. Only its hash is stored.
- Claims use Firestore document update-time preconditions so concurrent
  connectors cannot both acquire the same job.
- Claim leases last two minutes. Processing extends the lease to five minutes.
  Expired claimed or processing jobs can be reclaimed and increment the attempt
  count.
- Connector callbacks are `/started`, `/succeeded` and `/failed` below the
  claimed job ID. They require both machine authentication and the active lease.
- Queue creation uses a deterministic document ID derived from the existing
  tenant-and-draft idempotency key.

Success initially stores the connector result on the export job only. A Finance
user must then call the protected `/reconcile` action for that successful job.
Reconciliation validates the tenant, approved snapshot, totals, Sage record ID,
official number and posted date, then uses the existing protected
`confirm_external_issue` lifecycle transition.

The export job, invoice and booking are updated in one Firestore commit with
update-time preconditions. The invoice becomes Issued, receives an immutable
issued snapshot and Sage sync identity, and the booking finance state becomes
Invoiced. Repeating the same reconciliation is idempotent. Direct callers cannot
submit an official invoice number through the general invoice lifecycle route;
the successful Sage result is the sole authority.

## Connector contract

The canonical TypeScript contract is
`src/app/utils/sage50ConnectorContract.ts`. Runtime construction and validation
helpers are in `src/app/utils/sage50ConnectorContract.js`.

Each job contains:

- Contract version and fixed Sage product key.
- Stable job and idempotency keys.
- Server-derived tenant ID and authenticated actor.
- Approved invoice identity and source quote.
- Saved Sage customer reference.
- Exact nominal and tax code for every line.
- Recalculated line and invoice totals.

The contract deliberately contains no Sage login credentials, SDO credentials,
company-data path, OAuth fields or web-session token.

## Security requirements for the future transport

- Use mutually authenticated service identity; do not expose a public
  unauthenticated polling endpoint.
- Bind each connector identity to an explicit tenant/company allowlist.
- Encrypt transport traffic and secrets at rest.
- Keep SDO/company credentials only on the Windows connector host.
- Reject replayed jobs and duplicate invoice creation with the idempotency key.
- Record immutable audit events for claim, attempt, success and failure.
- Return only the minimum Sage identity needed by the web application.
- Never allow the connector to change tenant ID, invoice payload or lifecycle
  state.

## Explicitly out of scope

- OAuth, client IDs, client secrets, redirect URIs and refresh tokens.
- Sage Business Cloud Accounting endpoints or business selection.
- Next.js/Vercel access to COM, ActiveX, SDO or Sage company files.
- Sage invoice posting logic inside the Windows connector.
- Real Sage customer, invoice, credit-note, payment or allocation creation.
