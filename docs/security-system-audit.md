# BAS Security, Permissions & Production Readiness Audit

Date: 2026-06-03

## Executive Summary

Overall security rating: **Medium risk, improving**.

Overall system health rating: **Medium risk, not production-final until tenant-scope cleanup is completed**.

The platform uses Clerk as its sole authentication provider and exchanges an authorized Clerk session for a Firebase custom token. `users/{uid}` remains the canonical application-access document; employee, company, workspace, module, and role records remain the authorization source of truth. The remaining production risk is mainly tenant isolation in older business collections that still allow broad workspace reads/writes instead of explicit `companyId` checks.

## Critical Issues

- **Older company data can still be exposed if collections are not tenant-scoped.** Static audit found 31 client files touching company collections whose Firestore rules are not explicitly company-scoped. Highest-risk collections include `maintenanceBookings`, `maintenanceJobs`, `vehicleIssues`, `deletedBookings`, `sickLeave`, `timesheetQueries`, `uCraneFreelancers`, and H&S record collections.
- **Storage previously allowed access based on email-domain fallback.** This has been fixed locally in `storage.rules`; Storage now requires a valid enabled user document and role/access fields.
- **Some admin and HR pages still perform direct browser writes to sensitive or admin-adjacent collections.** These should move to server APIs before production if they mutate users, settings, employee access, or admin-only HR data.

## Medium Issues

- **63 client files perform Firestore writes.** Many are normal business workflows, but admin-sensitive writes should be converted to server routes with audit logging.
- **Client files still touch sensitive collections.** Expected access and profile reads remain subject to Firestore rules and the canonical server bootstrap, but they remain high-value regression points.
- **Storage paths do not consistently include company IDs.** Without company-aware Storage paths or metadata checks, Storage isolation is enforced only by broad user/service/admin access, not by company ownership.
- **Company isolation depends on data integrity.** Tenant-scoped Firestore rules require documents to contain `companyId`; documents missing `companyId` may fail to load or require backfill before strict rules can be safely applied.

## Low Priority Issues

- Several legacy/backup files still contain Firestore and Storage operations. They should be excluded from production routing or removed once confirmed unused.
- The access test emits a Node module-type warning because package metadata does not declare ESM. It does not fail tests.
- Some feature pages still use local hard-coded admin email arrays for UI behavior. These should gradually be replaced by shared role/access helpers.

## Files Modified

- `storage.rules`
- `scripts/security-access-audit.mjs`
- `docs/security-system-audit.md`

This report also builds on the existing access fixes in:

- `src/app/api/security/bootstrap-access/route.js`
- `src/app/context/authContext.js`
- `src/app/admin/page.js`
- `src/app/platform-admin/_components/PlatformAdminShell.jsx`
- `src/app/components/AccountGuard.jsx`

## Firestore Rules Findings

Confirmed secure:

- `users/{uid}` requires signed-in enabled access; normal users can only read their own user doc.
- Clerk-authenticated users still require an enabled canonical `users/{uid}` record before application data access.
- Obsolete `mfaSecrets`, `passkeyCredentials`, `passkeyChallenges`, and `setupCodeRateLimits` records remain explicitly client-denied pending a separately reviewed cleanup.
- `adminAuditLogs` and `loginSecurityLogs` are client-readable only to platform admin/admin and client-write denied.
- Many core business collections now use company-aware helpers, including `bookings`, `employees`, `vehicles`, `equipment`, `holidays`, `notes`, `contacts`, `invoiceQueue`, `workBookings`, `serviceRecords`, `defectReports`, `vehicleChecks`, `vehiclePrepRecords`, and `timesheets`.

Remaining risks:

- Collections still using broad workspace rules should be migrated to explicit `companyId` checks once missing `companyId` data is backfilled: `maintenanceBookings`, `maintenanceJobs`, `vehicleIssues`, `deletedBookings`, `sickLeave`, `timesheetQueries`, `uCraneFreelancers`, `lorries`, `hsRegister`, `hsCheckRecords`, `ppeIssueRecords`, and `employeeTrainingRecords`.
- The catch-all read for Platform Admin is intentional for platform-wide support, but it should remain read-only and should not be expanded to writes.

## Firebase Storage Rules Findings

Fixed locally:

- Removed email-domain fallback from Storage access.
- Removed admin access based only on email allow-list.
- Storage admin access now requires an enabled `users/{uid}` document with role `admin`, `platformAdmin`, or `platformadmin`.
- User/service file access now requires an enabled user document with the relevant app access, workspace, or role.

Remaining risks:

- Storage paths such as `booking_pdfs`, `quotes`, `job_attachments`, `maintenance-quotes`, and `vehicles/{vehicleId}` do not encode `companyId`, so rules cannot directly compare file ownership to the signed-in user's company.
- HR contracts are admin-only, which is acceptable for now, but should eventually be company-aware for company admins if that workflow is required.

## Database Structure Issues Found

The audit tooling reports tenant-scope risks for older collections that may lack `companyId`. The Platform Admin cleanup preview already includes a safe task for business documents missing `companyId`; that should be run in preview mode first and only applied with an explicitly selected company.

High priority backfill candidates:

- `maintenanceBookings`
- `maintenanceJobs`
- `vehicleIssues`
- `deletedBookings`
- `sickLeave`
- `timesheetQueries`
- `uCraneFreelancers`
- H&S record collections

## Access Control Issues Found

Fixed in recent local changes:

- `/admin` and `/platform-admin` no longer depend on fragile browser-side role reads before server bootstrap.
- `bootstrap-access` now avoids write/audit loops when access fields have not materially changed.
- `AccountGuard` no longer starts its own `users/{uid}` listener.

Remaining:

- Some feature pages still read `users` or `settings` directly for local UI decisions. These are not admin gate failures now, but they should be reviewed if console permission errors persist.
- Admin mutations in normal `/admin` and HR pages should continue moving to server APIs where they affect user access, employee access, settings, or audit-sensitive data.

## Company Isolation Results

Static isolation scan result:

- Client files with Firestore usage: **103**
- Client files with Firestore writes: **63**
- Client files touching sensitive collections: **15**
- Admin/platform gate direct `users` reads: **0**
- Client files touching company collections without explicit tenant-scoped rules: **31**

Conclusion: Platform Admin access is in better shape, but company isolation is **not production-final** until unscoped legacy collections are backfilled and their Firestore rules are tightened.

## Final Verification Checklist

- Authentication secure: **Partially verified locally**
- Authorisation secure: **Partially verified locally**
- Firestore secure: **Core sensitive collections secure; tenant-scope work remains**
- Storage secure: **Improved locally; company-aware Storage paths remain future work**
- Data displaying correctly: **Build passes; manual route verification still required**
- Company isolation working: **Not fully complete for legacy collections**
- Admin access working: **Local gate checks repaired**
- No critical vulnerabilities remaining: **No; tenant-scope legacy collections remain critical before production launch**

## Verification Commands

Run locally before rollout:

```powershell
npm.cmd run audit:access
npm.cmd run test:access
npm.cmd run build
npm.cmd run lint
```

Production rollout must deploy app code, Firestore rules, and Storage rules together after manual verification.
