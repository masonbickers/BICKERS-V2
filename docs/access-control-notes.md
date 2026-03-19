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
