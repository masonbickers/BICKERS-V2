# Approved employee app access release

This release is deliberately split into a compatibility deployment and a later
cutover. Do not deploy the hardened Firebase rules or run the migration with
`--apply` until both version 5.0.10 store builds are publicly downloadable.

## Release branches

- Web: `codex/approved-employee-app-access-web`
- Mobile/backend: `codex/approved-employee-app-access-mobile`
- Live web production deployment (verified 2026-09-05):
  `dpl_76QmAbfc7rTvTW7LAS8B9ASKABQX`
  (`https://bickers-v2-9uy7myz84-bickers-projects.vercel.app`, aliased to
  `https://bickers-v2.vercel.app`)
- Last known web production rollback deployment:
  `https://bickers-v2-c2ever25a-bickers-projects.vercel.app`
- Live Render backend deployment (verified 2026-09-06):
  `dep-daei4upt0dsc73ab0ieg` at mobile/backend commit
  `0987ba7ba6fabc229a88a278a97b30f31fd503a6`
- Render backend rollback deployment: `dep-da256su7bikc73ct166g` at commit
  `3b0db05b6995d2292eb6af486a187ccb29664ae8`
- Last known iOS production build: version 5.0.9, build 80, EAS build
  `9ff0f537-9525-4936-a4f8-33d1de459e96`
- Last known Android store build: version 5.0.6, build 19, EAS build
  `4741c92e-92fc-419a-90a6-45ef7951ad91`

## Current release gates

- The production migration dry run currently reports 22 employees: 6 eligible
  to grandfather, 4 setup emails, 4 pending, 3 disabled and 9 blocking identity
  conflicts. Do not use `--apply` until a fresh dry run reports zero conflicts.
- Store build 5.0.9 was uploaded from an uncommitted working tree. Its binary
  contains receipts, Working Terms, expenses and day-note features that are not
  present on mobile `origin/main`. Do not submit the clean 5.0.10 authentication
  branch by itself: first establish and verify a release baseline that retains
  the features already shipped in 5.0.9.
- The internal-test and store-review employee emails are not stored in source.
  They must be supplied through the production employee-management UI before
  store submission.
- Firebase currently rejects both console and Identity Platform API changes to
  the password-reset template with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. The
  existing Firebase reset email remains usable, but its subject cannot be
  renamed until Firebase removes the project-level restriction.
- Render auto-deploy is disabled because the compatibility backend was deployed
  as a specific tested commit. Keep deployments manual until the release branch
  is deliberately merged or the service branch is changed.

## Completed compatibility work

- The web employee-management controls are live on Vercel and were verified in
  an authenticated platform-admin session. The mobile-access section is visible
  and no employee was approved or emailed during verification.
- The live protected mobile-access API rejects an unauthenticated request with
  HTTP 401.
- The clean mobile/backend branch is committed and pushed at
  `0987ba7ba6fabc229a88a278a97b30f31fd503a6`.
- The same backend commit is live on Render with
  `LEGACY_EMPLOYEE_SETUP_MODE=enabled`. Production `/app-config` was verified to
  report `legacyEmployeeSetupEnabled: true` and `minAppVersion: "5.0.4"`.
- A protected production backup and dry-run report were created outside the
  repositories. No migration writes or invitation emails were performed.

## Compatibility deployment

1. Verify both clean branches and review their diffs.
2. Deploy the web employee controls to a Vercel preview, verify an authenticated
   admin can view the mobile-access controls, then promote the same deployment.
3. Configure Render with `LEGACY_EMPLOYEE_SETUP_MODE=enabled` and keep
   `MIN_APP_VERSION=5.0.4`.
4. Deploy the backend and record the exact Render rollback revision.
5. Confirm `/app-config` reports `legacyEmployeeSetupEnabled: true` and
   `minAppVersion: "5.0.4"`.
6. Configure the Firebase password-reset template as
   `Set up your Bickers app account`.
7. Create one internal test employee and one limited reviewer employee through
   the web controls. Store credentials only in the Apple and Google consoles.

## Backup and dry run

Create files outside the repository and protect them as sensitive production
data:

```sh
npm run backup:mobile-access -- --output=/private/tmp/bickers-mobile-access-backup.json
npm run migrate:mobile-access -- --report=/private/tmp/bickers-mobile-access-dry-run.json
```

The dry run prints only aggregate counts unless `--verbose` is supplied. Any
reported identity conflict blocks the apply step and must be resolved manually.

## Store release

1. Build version 5.0.10 for iOS and Android from the mobile release commit.
2. Submit both builds with manual release enabled.
3. Give reviewers only the temporary reviewer credentials using the secure store
   review fields.
4. Wait until both builds are approved and ready for release.
5. Release both and independently confirm the public listings offer 5.0.10.

## Coordinated cutover

Record a fresh backup first. Then, without reordering the safety gates:

1. Apply the migration:

   ```sh
   npm run migrate:mobile-access -- --apply --confirm=grandfather-prior-mobile-users --report=/private/tmp/bickers-mobile-access-apply.json
   ```

2. Confirm all setup emails succeeded and the report contains zero conflicts.
3. Set `LEGACY_EMPLOYEE_SETUP_MODE=disabled` and `MIN_APP_VERSION=5.0.10` on
   Render, deploy, and verify `/auth/employee-setup-lookup` returns HTTP 410.
4. Deploy the reviewed Firestore and Storage rules.
5. Verify an active 5.0.10 account on iPhone and Android, and verify pending,
   disabled, duplicate-email, mismatched and old-version identities are denied.
6. Disable the reviewer employee, reset its password and revoke its refresh
   tokens.

## Emergency rollback

Before cutover, roll back Vercel/Render and pause both manual store releases.
Immediately after cutover, the recorded Render revision may be restored with
`LEGACY_EMPLOYEE_SETUP_MODE=enabled` and `MIN_APP_VERSION=5.0.4` temporarily.
Restore data only from the matching protected backup, and do not weaken the
Firebase rules without confirming which client versions are active.
