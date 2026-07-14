# Security cutover runbook

The production mutation steps below are intentionally not automated as part of a normal build. They require the approved 60-minute maintenance window, reviewed dry-run output, current backups, and production credentials.

## Before the window

1. Review `npm run incident:contain -- --incident-at=<ISO timestamp>` and `npm run incident:disable-legacy-auth` dry-runs.
2. Review `npm run migrate:company -- --company-id=bickers-action`, `npm run migrate:storage`, and `npm run migrate:quote-assets` dry-runs. Any conflicting company ID is a stop condition.
3. Run lint, unit/resource-lock tests, Firebase emulator tests, the semantic access audit, secret scan, production build, and bundle budget checks.
4. Take Firestore and Storage snapshots. Record their identifiers and retention policy in the change ticket.
5. Remove `firebase-users.json` from the OneDrive recycle bin/version history manually and record evidence; the repository scan alone cannot purge provider-side history.

## Window sequence

1. Enable the write freeze:
   `npm run maintenance -- --enable --apply --confirm-maintenance-change`
2. Confirm ordinary and admin client writes return permission denied and protected mutation APIs return `503`.
3. Re-run the company migration dry-run, then apply:
   `npm run migrate:company -- --company-id=bickers-action --apply`
4. Apply storage-reference and quote-asset migrations only after their clean dry-runs.
5. Deploy the scoped application and strict `firestore.rules` / `storage.rules`.
6. Smoke-test admin, ordinary user, disabled user, reset-required user, and cross-company denial cases.
7. Re-run acceptance scans. Missing/conflicting company IDs and authorization errors must both be zero.
8. Disable the write freeze:
   `npm run maintenance -- --disable --apply --confirm-maintenance-change`

## Secure rollback

If acceptance fails, keep maintenance mode enabled and deploy only the reviewed tenant-bound compatibility rules:

`firebase deploy --config firebase.secure-rollback.json --only firestore:rules,storage`

These compatibility rules still require an enabled, non-reset-required account and exact company equality. Never restore the former broad authenticated rules. Restore data from the recorded snapshots only after confirming the failure is a data migration issue.
