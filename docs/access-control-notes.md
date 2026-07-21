# Access Control Notes

## Employee access source of truth

Employee workspace access is stored on `employees/{id}` using:

- `role`
- `isService`
- `appAccess.user`
- `appAccess.service`
- `defaultWorkspace`
- `updatedAt`
- `updatedBy`

## Client-side guard

The app now resolves access from the employee document and guards routes in:

- `src/app/components/ProtectedLayout.js`
- `src/app/components/HeaderSidebarLayout.jsx`

This blocks users from opening user-only or service-only areas from the client when they do not have access.

## Server / Firestore rule guidance

Client guards are not enough on their own. Firestore rules or backend checks should also validate access.

This repo now includes a first-pass [firestore.rules](/abs/path/c:/Users/MasonBickers/OneDrive%20-%20Bickers%20Action/Desktop/Bickers-Booking1/firestore.rules) file and [firebase.json](/abs/path/c:/Users/MasonBickers/OneDrive%20-%20Bickers%20Action/Desktop/Bickers-Booking1/firebase.json) mapping. These rules rely on `users/{uid}` being the server-trusted access record.

For v1.0 the supported application roles are:

- `platformAdmin`: platform-wide control centre, companies, users, security, audit logs
- `admin`: application admin workflows, user access and admin area
- `user`: standard application access, with workspace access controlled by `appAccess`

To make that work:

- `users/{uid}.role` should contain only `platformAdmin`, `admin`, or `user`
- `users/{uid}.companyId` should be set for every non-platform user
- `users/{uid}.appAccess.user` and `users/{uid}.appAccess.service` should mirror employee workspace access
- `users/{uid}.defaultWorkspace` should mirror the default workspace

The employee edit page now mirrors those fields onto `users/{uid}` when the employee record contains a linked `uid` or `authUid`.

## Tenant scoping

Section 13 adds company scoping for business collections. The following collections must carry `companyId` on every document:

- `bookings`
- `employees`
- `vehicles`
- `equipment`
- `holidays`
- `notes`
- `maintenance`
- `maintenanceBookings`
- `maintenanceJobs`
- `serviceRecords`
- `defectReports`
- `defects`
- `vehicleIssues`
- `motPreChecks`
- `timesheets`
- `timesheetQueries`
- `contacts`
- `invoiceQueue`
- `deletedBookings`
- `sickLeave`
- `uCraneFreelancers`
- `lorries`
- `workBookings`
- `vehicleChecks`
- `vehicleUsageNotes`
- `vehiclePrepRecords`
- `hsRegister`
- `hsCheckRecords`
- `ppeIssueRecords`
- `employeeTrainingRecords`

Firestore rules now enforce:

- platform admins can read all tenant-scoped business docs
- admins can access tenant-scoped business docs only for their own `companyId`
- normal users can access only same-company docs for their allowed workspace/module
- creates must include `companyId`, and updates must preserve the existing `companyId`

Existing business docs missing `companyId` are surfaced in `/platform-admin/cleanup` and can be backfilled with an explicitly selected company. The backfill writes audit records and only stamps tenant metadata; it does not delete business data.

## Firestore rule hardening

Section 14 removes weak access paths from the rules:

- email-domain fallback access is removed
- platform admin is based on `users/{uid}.role == "platformAdmin"`, not hard-coded email lists
- users must have an enabled `users/{uid}` record before app access is granted
- Clerk is the sole application sign-in provider
- verified Clerk email and explicit canonical UID links are required before Firebase tokens are issued
- unmatched collections are platform-admin read-only in rules; writes must use explicit collection rules or server APIs

## Server API boundary

Section 15 adds dedicated platform server APIs for sensitive admin operations:

- `/api/platform/users/update`
- `/api/platform/companies/update`
- `/api/platform/employee-linking/link`
- `/api/platform/audit-log`

These routes require a Firebase token issued through the verified Clerk bridge and an enabled `users/{uid}` record with `role == "platformAdmin"`. Sensitive writes use the Admin REST helper rather than client Firestore writes, and each mutation writes to `adminAuditLogs`.

## Platform Admin Control Centre

The Platform Admin Control Centre is the master BAS Software control panel. It covers dashboard, companies, company settings, branding, feature control, all users, employee linking, roles, security, cleanup, audit logs, login logs, and global settings.

Storage model:

- global branding lives in `settings/platformBranding`
- company branding lives in `platformCompanies/{companyId}.branding`
- global features live in `settings/platformFeatures`
- company feature/module switches live in `platformCompanies/{companyId}.modules`

Safety model:

- `platformAdmin` is the highest role
- Legacy custom-auth records are no longer read or written; any cleanup requires a separate reviewed migration
- sensitive mutations use server APIs and audit logs
- repair actions are preview-first where they touch business data
- destructive business-data deletion should be avoided unless explicitly confirmed

After changing rules locally, deploy them with Firebase CLI.

Recommended approach:

1. Copy the employee access model onto a server-trusted user record or custom claims.
2. In Firestore rules, only allow reads/writes for service collections if:
   - the signed-in user is an admin, or
   - `appAccess.service == true`
3. Only allow reads/writes for user workspace collections if:
   - the signed-in user is an admin, or
   - `appAccess.user == true`

## Example rule shape

```text
function isAdmin() {
  return request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
}

function employeeAccess() {
  return get(/databases/$(database)/documents/employees/$(request.auth.uid)).data.appAccess;
}

function canUseUserWorkspace() {
  return isAdmin() || employeeAccess().user == true;
}

function canUseServiceWorkspace() {
  return isAdmin() || employeeAccess().service == true;
}
```

If employee docs are not keyed by auth UID, create a mirrored access record keyed by UID or store the access on `users/{uid}` as well.
