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

To make that work:

- `users/{uid}.role` should contain `admin`, `employee`, `service`, or `hybrid`
- `users/{uid}.appAccess.user` and `users/{uid}.appAccess.service` should mirror employee workspace access
- `users/{uid}.defaultWorkspace` should mirror the default workspace

The employee edit page now mirrors those fields onto `users/{uid}` when the employee record contains a linked `uid` or `authUid`.

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
