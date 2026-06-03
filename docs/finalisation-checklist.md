# Finalisation Checklist

Use this checklist for the controlled pilot before final rollout.

## Automated Checks

- `npm.cmd run lint` passes.
- `npm.cmd run test:access` passes.
- `npm.cmd run build` passes.
- No visible mojibake remains in shared shell, HR, holiday allowance, login, or admin screens.
- `docs/known-issues.md` has been reviewed and shared with pilot users.
- `docs/release-worktree-review.md` has been reviewed and each pending file is accepted, parked, or removed with approval.

## Role Smoke Tests

- Admin user can sign in, complete MFA, open Admin, Platform Admin, HR, Vehicles, Dashboard, and Finance.
- User-only employee lands in the user workspace and cannot open service-only pages.
- Service-only employee lands in the service workspace and cannot open user-only pages.
- Hybrid employee can use both workspaces and returns to the preferred workspace.
- Disabled account is signed out and shown the disabled-account message.
- User with missing phone or authenticator is sent to setup MFA.
- User without current MFA verification is sent to verify MFA.

## Workflow Smoke Tests

- Create a booking with client, contact, location, dates, crew, vehicles/equipment, notes, and status.
- Edit an existing booking, save, return to the same calendar context, and confirm changes show on the dashboard.
- Submit a holiday request, approve it as admin, request deletion, and approve/decline deletion.
- Record a vehicle/service update and confirm it appears in vehicle and service overview screens.
- Route a defect to general maintenance and immediate defects.
- Move a job through review queue, ready invoice, invoiced, and paid states.
- Update an admin user record and confirm audit/login-security screens still load.

## Launch Readiness

- README runbook is current.
- Firestore and Storage rules are deployed.
- Recent Firebase backup/export is available.
- Known issues list is written and shared with pilot users.
- Support owner and rollback contact are agreed before rollout.
- Release readiness runbook in `docs/release-readiness.md` has been followed.
