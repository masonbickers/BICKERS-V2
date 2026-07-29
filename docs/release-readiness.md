# Release Readiness Runbook

This runbook is for finishing the Bickers Booking System for controlled internal use. It is intentionally about closure, not new features.

## Scope Freeze

During finalisation, accepted changes must fit one of these categories:

- Bug fix
- Security/access fix
- User-flow cleanup
- Documentation or release prep
- Test/checklist coverage

Do not add new product features until the controlled rollout is complete.

## Release Branch Checklist

1. Review `git status --short`.
2. Review `docs/release-worktree-review.md`.
3. Confirm each changed file belongs to the release.
4. Do not delete or revert unrelated user work without explicit approval.
5. Create the release branch only after the working tree has been reviewed.
6. Run all automated checks before deployment.

Required checks:

```bash
npm run lint
npx tsc --noEmit --incremental false
node --experimental-vm-modules --test \
  $(find tests -name '*.test.mjs' ! -name '*rules.test.mjs' -print)
npm run test:firestore-rules
firebase emulators:exec --only firestore,storage \
  --project demo-bickers-storage-access-rules \
  "node --test tests/storageAccess.rules.test.mjs"
npm run build
```

Run TypeScript and `next build` sequentially. Both use `.next/types`; running
them concurrently can create false missing-generated-file errors.

The current Firebase CLI requires Java 21 or newer for emulator rule tests.
The non-rule Node suite does not require Java.

The focused finance/Sage release suite is:

```bash
node --test \
  tests/invoiceLifecycle.test.mjs \
  tests/invoiceLifecycleActions.test.mjs \
  tests/sage50ConnectorContract.test.mjs \
  tests/sage50ConnectorIdentity.test.mjs \
  tests/sage50CustomerLookup.test.mjs \
  tests/sage50ExportQueue.test.mjs \
  tests/sage50Reconciliation.test.mjs \
  tests/issuedInvoiceDocument.test.mjs \
  tests/invoiceDelivery.test.mjs \
  tests/timesheetBookingLink.test.mjs \
  tests/sage50WindowsConnectorHost.test.mjs
```

## Production Environment

The ordinary Next.js deployment does not require Windows connector settings,
an SDO installation, a Sage company path or Sage user credentials.

Required for protected server-side Firebase access:

- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (or server-only `FIREBASE_PROJECT_ID`)
- `NEXT_PUBLIC_FIREBASE_API_KEY` (or server-only `FIREBASE_API_KEY`)
- `FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET` for authoritative issued-document storage
- `CLERK_SECRET_KEY` for protected Clerk-authenticated server routes

The private key may contain escaped newlines. Legacy aliases
`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` remain supported, but the
`FIREBASE_SERVICE_ACCOUNT_*` names are canonical for production.

Required only when invoice delivery email is enabled:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

`SECURITY_EMAIL_FROM` is an optional override for security notifications.
Invoice delivery fails safely as `email_provider_not_configured` when the
Resend pair is absent; invoice lifecycle and document storage remain separate.

Optional web integrations include the DVLA/DVSA, OpenAI, passkey and cron
variables referenced by their individual routes. They are not Sage connector
configuration and must not be used to convey Windows machine credentials.

Issued PDFs are rendered in the Node.js runtime from `issuedSnapshot` and
stored through the server-only Firebase helper. No browser bundle may import
that helper or the issued-document service.

## Pre-Deployment Checklist

- README and `docs/finalisation-checklist.md` are current.
- Known issues are recorded in `docs/known-issues.md`.
- Firestore rules and Storage rules are reviewed.
- Deploy the reviewed `firestore.rules` and `storage.rules` with the web
  release; application deployment does not deploy these rules automatically.
- Firebase data backup/export is available.
- Environment variables are confirmed for Firebase, DVLA, OpenAI, MFA/passkeys, and cron/API secrets.
- Admin, platform admin, user-only, service-only, hybrid, disabled, and MFA flows have been tested.

## Sage Integration Gate

The confirmed target is **Sage 50 Accounts UK**, server-based/on-premise, using
**Sage Data Objects (SDO)** through a separately deployed trusted Windows
connector. Cloud Sage Accounting OAuth is not applicable. The Next.js/Vercel
runtime must never load COM, ActiveX or SDO and must never access Sage company
data directly.

The versioned connector architecture and contract are documented in
`docs/sage-50-sdo-integration.md`. Connector registration, heartbeat,
tenant-scoped lookup/export transport and local reconciliation contracts exist.
The Windows service remains outside the Next.js runtime and its machine
configuration is managed on the Windows host, not through web environment
variables.

Production Sage posting remains unavailable. Before it can be enabled, an
administrator must run safe diagnostics on the real Windows Sage server,
confirm the exact Sage 50 Accounts UK version/build, SDO version, architecture,
DLL/COM identity and company binding, then build and commission one matching
read-only adapter. That adapter must pass a real bounded customer lookup and
prove no Sage record changed. Invoice posting requires a later separately
reviewed write adapter and is not part of the current release.

## Support During Pilot

- Pilot users report issues to the named support owner.
- Issues are triaged as blocker, high, medium, or low.
- Blockers stop wider rollout until fixed.
- Medium/low issues can stay in known issues if there is a clear workaround.

## Rollback Notes

If rollout has to be reversed:

1. Revert the Vercel deployment to the previous stable deployment.
2. Re-deploy the previous Firestore/Storage rules if rules changed.
3. Use the Firebase backup/export only if data corruption occurred.
4. Record the rollback reason and affected flows in `docs/known-issues.md`.
