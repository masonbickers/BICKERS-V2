# Bickers Booking repository consolidation assessment

Captured: 20 July 2026, Europe/London

## PR #8 controlled revision — 22 July 2026

The remote review of PR #8 blocked the proposed tenant-isolation rollout. The revised PR retains protected API access for ChatGPT, DVLA vehicle lookup, DVLA MOT history, manual MOT synchronization and Statistics, plus the required vehicle-page token caller and reconciliation documentation. API authorization now checks the intended workspace, honors both supported module-flag representations, and scopes company-admin MOT synchronization to the caller's company.

The revised PR deliberately restores `firestore.rules`, `storage.rules`, `src/app/utils/firestoreAccess.js`, `src/app/utils/storageAccess.js`, `package.json`, and `package-lock.json` to the `main` versions and removes the candidate Firestore/Storage rule tests. No tenant-filter, composite-index, legacy Storage-path, or timesheet-message policy change is included. Those controls remain a separate rollout gated by data backfill, writer migration, index validation, Storage migration, parent-tenant enforcement and focused review.

Assessment scope:

- Canonical candidate: /Users/masonbickers/Developer/Bickers-Booking1
- OneDrive copy: /Users/masonbickers/Library/CloudStorage/OneDrive-BickersAction/Desktop/Bickers-Booking1
- Common comparison base: 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8
- The repository comparison was read-only. No source file was modified, copied, restored, deleted, staged, committed or merged during the assessment.
- This document is the only file created by the consolidation task. No authentication change has been transferred.

## Decision

The single canonical development repository should be:

    /Users/masonbickers/Developer/Bickers-Booking1

This is the explicitly approved development and reconciliation location. It contains the unique dependency lockfile work, the existing worktree-reconciliation report and the hash-recorded safety snapshot. It is also outside OneDrive's live synchronization path. The OneDrive copy contains sync-conflict files, conflicted Git metadata and later uncommitted authentication edits, so continuing active development there would recreate the current ambiguity.

Active development must not continue in both repositories. After approved transfer and verification, retain the OneDrive copy only as a read-only historical backup until the Developer repository has clean, reviewed commits and a verified remote backup.

## 1. Repository records

### Repository A — Developer

| Field | Recorded value |
|---|---|
| Absolute path | /Users/masonbickers/Developer/Bickers-Booking1 |
| Branch | main |
| Commit | 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Remote | origin — https://github.com/masonbickers/BICKERS-V2.git |
| Upstream | origin/main |
| Recorded ahead / behind | 0 / 0 against the local origin/main reference; no fetch was performed |
| Staged entries | 0 |
| Modified tracked entries | 42 |
| Untracked entries | 28, including this reconciliation report but before this consolidation report |
| Total status entries | 70 before this report |
| Unique work | package-lock.json and docs/BICKERS_WORKTREE_RECONCILIATION.md |

Full status captured before this document was created:

    ## main...origin/main
     m .codex-emergency-rules
     m .codex-user-email-rules
     m .codex-worktree-vehicle
     M .githooks/pre-commit
     M firestore.rules
     M package-lock.json
     M package.json
     M src/app/admin/_components/AppearanceAdminEditor.jsx
     M src/app/admin/_components/AppearanceAdminEditor.module.css
     M src/app/admin/content-labels/page.js
     M src/app/admin/global-styling/page.js
     M src/app/admin/global-styling/page.module.css
     M src/app/api/admin/_lib.js
     M src/app/api/admin/appearance/migrate/route.js
     M src/app/api/admin/appearance/route.js
     M src/app/api/appearance/route.js
     M src/app/api/auth/firebase-token/route.js
     M src/app/api/chatgpt/route.js
     M src/app/api/dvla/mot-history/route.js
     M src/app/api/dvla/mot-history/sync/route.js
     M src/app/api/dvla/vehicle/route.js
     M src/app/api/mfa/setup/route.js
     M src/app/api/mfa/verify/route.js
     M src/app/api/security/bootstrap-access/route.js
     M src/app/api/statistics/_auth.js
     M src/app/api/statistics/_briefingService.js
     M src/app/api/statistics/business-rules/route.js
     M src/app/api/statistics/daily-briefing/feedback/route.js
     M src/app/api/statistics/daily-briefing/generate/route.js
     M src/app/api/statistics/daily-briefing/route.js
     M src/app/api/theme/route.js
     M src/app/components/ProtectedLayout.js
     M src/app/context/authContext.js
     M src/app/page.module.css
     M src/app/settings/ai-business-rules/page.js
     M src/app/settings/ai-business-rules/page.styles.module.css
     M src/app/utils/accessControl.js
     M src/app/utils/firestoreAccess.js
     M src/app/utils/storageAccess.js
     M src/middleware.js
     M storage.rules
     M tests/accessControl.test.mjs
    ?? ".githooks/pre-commit-MacBook Pro (2)"
    ?? docs/BICKERS_PAGE_AUDIT_TRACKER.md
    ?? docs/BICKERS_WORKTREE_RECONCILIATION.md
    ?? "package-MacBook Pro (2).json"
    ?? "src/app/admin/_components/AppearanceAdminEditor-MacBook Pro (2).jsx"
    ?? "src/app/admin/_components/AppearanceAdminEditor.module-MacBook Pro (2).css"
    ?? "src/app/admin/content-labels/page-MacBook Pro (2).js"
    ?? "src/app/admin/global-styling/page-MacBook Pro (2).js"
    ?? "src/app/admin/global-styling/page.module-MacBook Pro (2).css"
    ?? "src/app/api/admin/appearance/migrate/route-MacBook Pro (2).js"
    ?? "src/app/api/admin/appearance/route-MacBook Pro (2).js"
    ?? "src/app/api/appearance/route-MacBook Pro (2).js"
    ?? src/app/api/auth/_clerkAccess.js
    ?? "src/app/api/statistics/_auth-MacBook Pro (2).js"
    ?? "src/app/api/statistics/_briefingService-MacBook Pro (2).js"
    ?? "src/app/api/statistics/business-rules/route-MacBook Pro (2).js"
    ?? "src/app/api/statistics/daily-briefing/feedback/route-MacBook Pro (2).js"
    ?? "src/app/api/statistics/daily-briefing/generate/route-MacBook Pro (2).js"
    ?? "src/app/api/statistics/daily-briefing/route-MacBook Pro (2).js"
    ?? "src/app/api/theme/route-MacBook Pro (2).js"
    ?? "src/app/page.module-MacBook Pro (2).css"
    ?? "src/app/settings/ai-business-rules/page-MacBook Pro (2).js"
    ?? "src/app/settings/ai-business-rules/page.styles.module-MacBook Pro (2).css"
    ?? src/app/utils/accountAccess.js
    ?? src/app/utils/clerkFirebaseLink.js
    ?? tests/authBoundary.test.mjs
    ?? tests/firestoreServiceAccess.rules.test.mjs
    ?? tests/storageAccess.rules.test.mjs

### Repository B — OneDrive

| Field | Recorded value |
|---|---|
| Absolute path | /Users/masonbickers/Library/CloudStorage/OneDrive-BickersAction/Desktop/Bickers-Booking1 |
| Branch | main |
| Commit | 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Remote | origin — https://github.com/masonbickers/BICKERS-V2.git |
| Upstream | origin/main |
| Recorded ahead / behind | 0 / 0 against the local origin/main reference; no fetch was performed |
| Staged entries | 0 |
| Modified tracked entries | 45 |
| Untracked entries | 27 |
| Total status entries | 72 |
| Unique work | Four OneDrive-only authentication route edits and eight newer versions of files also changed in Developer |

Full status:

    ## main...origin/main
     m .codex-emergency-rules
     m .codex-user-email-rules
     m .codex-worktree-vehicle
     M .githooks/pre-commit
     M firestore.rules
     M package.json
     M src/app/admin/_components/AppearanceAdminEditor.jsx
     M src/app/admin/_components/AppearanceAdminEditor.module.css
     M src/app/admin/content-labels/page.js
     M src/app/admin/global-styling/page.js
     M src/app/admin/global-styling/page.module.css
     M src/app/api/admin/_lib.js
     M src/app/api/admin/appearance/migrate/route.js
     M src/app/api/admin/appearance/route.js
     M src/app/api/admin/users/[userId]/route.js
     M src/app/api/appearance/route.js
     M src/app/api/auth/firebase-token/route.js
     M src/app/api/chatgpt/route.js
     M src/app/api/device-tokens/route.js
     M src/app/api/dvla/mot-history/route.js
     M src/app/api/dvla/mot-history/sync/route.js
     M src/app/api/dvla/vehicle/route.js
     M src/app/api/mfa/setup/route.js
     M src/app/api/mfa/verify/route.js
     M src/app/api/passkeys/_lib.js
     M src/app/api/security/bootstrap-access/route.js
     M src/app/api/security/login-notification/route.js
     M src/app/api/statistics/_auth.js
     M src/app/api/statistics/_briefingService.js
     M src/app/api/statistics/business-rules/route.js
     M src/app/api/statistics/daily-briefing/feedback/route.js
     M src/app/api/statistics/daily-briefing/generate/route.js
     M src/app/api/statistics/daily-briefing/route.js
     M src/app/api/theme/route.js
     M src/app/components/ProtectedLayout.js
     M src/app/context/authContext.js
     M src/app/page.module.css
     M src/app/settings/ai-business-rules/page.js
     M src/app/settings/ai-business-rules/page.styles.module.css
     M src/app/utils/accessControl.js
     M src/app/utils/firestoreAccess.js
     M src/app/utils/storageAccess.js
     M src/middleware.js
     M storage.rules
     M tests/accessControl.test.mjs
    ?? ".githooks/pre-commit-MacBook Pro (2)"
    ?? docs/BICKERS_PAGE_AUDIT_TRACKER.md
    ?? "package-MacBook Pro (2).json"
    ?? "src/app/admin/_components/AppearanceAdminEditor-MacBook Pro (2).jsx"
    ?? "src/app/admin/_components/AppearanceAdminEditor.module-MacBook Pro (2).css"
    ?? "src/app/admin/content-labels/page-MacBook Pro (2).js"
    ?? "src/app/admin/global-styling/page-MacBook Pro (2).js"
    ?? "src/app/admin/global-styling/page.module-MacBook Pro (2).css"
    ?? "src/app/api/admin/appearance/migrate/route-MacBook Pro (2).js"
    ?? "src/app/api/admin/appearance/route-MacBook Pro (2).js"
    ?? "src/app/api/appearance/route-MacBook Pro (2).js"
    ?? src/app/api/auth/_clerkAccess.js
    ?? "src/app/api/statistics/_auth-MacBook Pro (2).js"
    ?? "src/app/api/statistics/_briefingService-MacBook Pro (2).js"
    ?? "src/app/api/statistics/business-rules/route-MacBook Pro (2).js"
    ?? "src/app/api/statistics/daily-briefing/feedback/route-MacBook Pro (2).js"
    ?? "src/app/api/statistics/daily-briefing/generate/route-MacBook Pro (2).js"
    ?? "src/app/api/statistics/daily-briefing/route-MacBook Pro (2).js"
    ?? "src/app/api/theme/route-MacBook Pro (2).js"
    ?? "src/app/page.module-MacBook Pro (2).css"
    ?? "src/app/settings/ai-business-rules/page-MacBook Pro (2).js"
    ?? "src/app/settings/ai-business-rules/page.styles.module-MacBook Pro (2).css"
    ?? src/app/utils/accountAccess.js
    ?? src/app/utils/clerkFirebaseLink.js
    ?? tests/authBoundary.test.mjs
    ?? tests/firestoreServiceAccess.rules.test.mjs
    ?? tests/storageAccess.rules.test.mjs

### Branches, audit references and safety records

Both repositories contain the same relevant local refs:

| Ref | Commit | Purpose or observation |
|---|---|---|
| codex/booking-hr-audit-updates | 4e4855e | Existing booking/HR audit branch; not this authentication audit |
| backup-before-finance-update | 6c3c1fd | Historical safety branch |
| backup-before-update | 6c3c1fd | Historical safety branch |
| backup-december16th | baecfff | Historical safety branch |
| backup-main-20251024-145239 | c2ad801 | Historical safety branch |
| backup/dashboard-pre-update | b0bc1f9 | Historical safety branch |
| backup/pre-update-2025-10-06 | 39bbd84 | Historical safety branch |
| wip/backup-2025-10-06 | a83e5de | Historical WIP branch |
| v1.0-rc1 | 8e45aa5 | Release-candidate tag |
| stash dated 2025-10-06 11:26:28 +0100 | panic-2025-10-06_11-26-27 | Historical stash |

There is no dedicated authentication-transfer or repository-reconciliation branch. Three tracked gitlinks, .codex-emergency-rules, .codex-user-email-rules and .codex-worktree-vehicle, are dirty nested repositories in both copies. Their internal HEADs and counts match across both copies, but they are not transfer inputs and require separate reconciliation.

The Developer reconciliation report records this external safety snapshot:

    /private/tmp/Bickers-Booking1-worktree-snapshot-94d4a3d-20260720T1445BST.tar.gz
    Size: 22,002,835 bytes
    SHA-256: f38e4954a76f9cc6ebc3dee352422098f0895fcfaa7f73cbfd1de4819ead01a7
    Created: 2026-07-20 14:42:40 +0100

The snapshot covers the Developer worktree at the time described in BICKERS_WORKTREE_RECONCILIATION.md. It predates the later OneDrive-only edits and this consolidation document, so it is not by itself a backup of those later deltas.

## 2. Comparison against the common base

Both repositories have the same HEAD, so their common base and comparison base is 94d4a3d. All differences described below are uncommitted working-tree differences.

The status-path sets contain:

- 68 paths changed in both copies.
- 2 paths changed only in Developer.
- 4 paths changed only in OneDrive.
- Of the 68 common paths, 57 regular files are byte-identical, 8 regular files differ and 3 are matching dirty nested repositories.

### Developer-only paths

| File | Meaning | Transfer protection |
|---|---|---|
| package-lock.json | Dependency graph for the Firebase rules tooling already declared in the identical package.json files | Preserve Developer version; never copy OneDrive's older lockfile over it |
| docs/BICKERS_WORKTREE_RECONCILIATION.md | Detailed reconciliation inventory, conflict-copy analysis and safety snapshot record | Preserve unchanged |

### OneDrive-only changed paths

| File | Semantic change | Assessment |
|---|---|---|
| src/app/api/device-tokens/route.js | Uses the shared active canonical-user guard instead of token verification plus an exact isEnabled check | Security hardening; safe as a narrow patch because the required admin helper is already identical in Developer |
| src/app/api/passkeys/_lib.js | Requires canonical UID, full disabled-state checks and company access, with a Platform Admin exception | Security hardening; safe as a narrow patch because accountAccess.js is already identical |
| src/app/api/security/login-notification/route.js | Uses the shared active canonical-user guard and canonical user document | Security hardening; safe as a narrow patch |
| src/app/api/admin/users/[userId]/route.js | Removes the email-allowlist import and the special block preventing deletion of allowlisted admin accounts | Requires manual policy review; this broadens which canonical admins may delete and must not be copied automatically |

### Paths changed differently in both copies

| File | Semantic comparison | Classification |
|---|---|---|
| firestore.rules | OneDrive reduces repeated lookups, accepts only canonical role spellings, and correctly separates user-workspace from service-workspace collection access. Developer still uses broad canUseSoftware checks for those helpers. | Security-significant but deployment-blocked |
| storage.rules | OneDrive changes optional disabled-field reads to map.get defaults. Other scoped and legacy path rules are the same. | Blocked until Storage emulator validation |
| src/app/utils/firestoreAccess.js | OneDrive makes the emergency broad-read helper call the tenant query helper and updates its warning. No current callers were found. | Coupled to the tenant migration and Firestore-rule rollout |
| src/app/api/security/bootstrap-access/route.js | OneDrive removes an unused email comparison function and unused email argument. It does not change current authorization behavior. | Safe cleanup patch |
| src/app/api/mfa/setup/route.js | OneDrive denies non-Platform-Admin accounts with no companyId before MFA setup. | Safe code patch, with onboarding/lockout validation required |
| src/app/api/mfa/verify/route.js | Applies the same company-access check before verification. | Safe code patch, with onboarding/lockout validation required |
| src/app/api/statistics/_auth.js | OneDrive switches to the shared active-user/module guard and removes the fallback company bickers-action. It retains statistics/finance feature and audience logic. | Manual semantic merge because the Developer file is part of existing statistics/reconciliation state and has line-ending churn |
| docs/BICKERS_PAGE_AUDIT_TRACKER.md | OneDrive preserves the inventory and adds the authentication findings, changes, test results and Blocked status. | Safe documentation-only patch; do not replace unrelated docs |

### Files unchanged between the copies but containing authentication work

The following 18 files are byte-identical and already present in Developer. They must not be copied again:

1. src/middleware.js
2. src/app/components/ProtectedLayout.js
3. src/app/context/authContext.js
4. src/app/utils/accountAccess.js
5. src/app/utils/accessControl.js
6. src/app/utils/storageAccess.js
7. src/app/utils/clerkFirebaseLink.js
8. src/app/api/auth/_clerkAccess.js
9. src/app/api/auth/firebase-token/route.js
10. src/app/api/admin/_lib.js
11. src/app/api/chatgpt/route.js
12. src/app/api/dvla/vehicle/route.js
13. src/app/api/dvla/mot-history/route.js
14. src/app/api/dvla/mot-history/sync/route.js
15. tests/accessControl.test.mjs
16. tests/authBoundary.test.mjs
17. tests/firestoreServiceAccess.rules.test.mjs
18. tests/storageAccess.rules.test.mjs

### Conflict copies, generated files and unrelated work

- Both copies contain the same 20 untracked files named with "MacBook Pro (2)". Sixteen are source-equivalent after line-ending normalization and four contain substantive differences. They are reconciliation evidence, not authentication transfer inputs.
- The two appearance API conflict copies contain useful direct-document-ID logic that is not present in the newer canonical files. They must remain protected for the separate appearance reconciliation.
- The tracked generated file src/app/generated/buildInfo.js is clean against HEAD. Ignored .next directories, node_modules, logs and OS metadata are generated or temporary and must not be transferred.
- Appearance, global styling, statistics briefing and AI business-rule changes are outside this authentication transfer. A direct directory copy would overwrite or obscure them.
- The Developer package-lock.json is unique and would be lost by a whole-repository or package-file copy from OneDrive.

## 3. Relevant modification times

Times are local Europe/London times on 20 July 2026 unless stated otherwise.

| File or group | Developer | OneDrive | Meaning |
|---|---|---|---|
| middleware.js, accountAccess.js, accessControl.js | 13:19:35–13:19:36 | Same | Identical initial audit work |
| ProtectedLayout.js, authContext.js | 13:20:20 | Same | Identical initial audit work |
| auth/_clerkAccess.js | 13:20:53 | Same | Identical new helper |
| auth/firebase-token/route.js | 13:22:45 | Same | Identical bridge change |
| admin/_lib.js | 13:19:56 | Same | Identical canonical API guard |
| storageAccess.js | 13:22:17 | Same | Identical scoped path helper |
| auth/rules tests | 13:23:24 | Same | Identical tests |
| BICKERS_PAGE_AUDIT_TRACKER.md | 12:23:22 | 22:05:49 | OneDrive contains the later audit record |
| BICKERS_WORKTREE_RECONCILIATION.md | 14:46:19 | Missing | Developer-only reconciliation record |
| package-lock.json | 14:06:09 | 15 July 12:41:54 | Developer-only lockfile update |
| firestore.rules | 13:23:34 | 21:59:55 | OneDrive has later rule refinements |
| storage.rules | 13:22:07 | 21:59:55 | OneDrive has later rule refinements |
| firestoreAccess.js | 13:22:17 | 22:04:47 | OneDrive has later tenant-helper refinement |
| bootstrap-access/route.js | 13:20:21 | 22:02:49 | OneDrive has later cleanup |
| login-notification/route.js | 16 July 10:56:33 | 22:02:49 | OneDrive-only hardening |
| admin/users/[userId]/route.js | 15 July 12:21:05 | 22:02:49 | OneDrive-only deletion-policy change |
| mfa/setup and mfa/verify | 13:20:54 | 22:03:05 | OneDrive has later company checks |
| passkeys/_lib.js | 15 July 12:21:05 | 22:03:13 | OneDrive-only hardening |
| device-tokens/route.js | 15 July 12:21:05 | 22:02:48 | OneDrive-only hardening |
| statistics/_auth.js | 15 July 15:31:54 | 22:02:49 | Competing semantic and line-ending state |

Modification times support the sequence but are not treated as proof that the newer file is correct.

## 4. Authentication audit validation

### Presence and commit state

- The authentication audit is not present only in OneDrive. Eighteen of the 30 identified authentication/audit files already match Developer exactly.
- All authentication work in both repositories is uncommitted. Neither repository has staged authentication changes or a dedicated authentication branch.
- OneDrive contains four additional modified routes and eight later versions of files that are also changed in Developer.

### Internal dependency check

- The new dependencies accountAccess.js, clerkFirebaseLink.js and api/auth/_clerkAccess.js already exist in Developer and have the same hashes as OneDrive.
- Every inspected JavaScript authentication file passed node --check in the OneDrive tree.
- No missing authentication imports were found in the compared delta.
- The separate package tooling remains incomplete: package.json references two missing files, scripts/service-access-readiness-report.mjs and tests/serviceAccessReadiness.test.mjs, and has no script for the Storage rules test. This is pre-existing reconciliation work and must not be hidden by the transfer.

### Scope and compatibility risks

1. The OneDrive admin-user deletion edit removes a historical email-gate protection. The canonical role/company/self-delete controls remain, but the deletion set is broader. Treat this as a policy decision, not an automatic security cleanup.
2. The Firestore rules accept only canonical admin and platformAdmin spellings, while server helpers normalize legacy aliases. Existing production role values must be inventoried before deployment or valid legacy admins could be locked out.
3. The OneDrive Firestore rules correctly separate user and service workspace helpers, but 311 tenant records were reported by the earlier audit as lacking companyId. The rules and tenant helper must not be deployed until the records and remaining direct writers are dealt with.
4. Two denied Firestore writes reportedly passed as denied while also reaching emulator expression-limit diagnostics. This needs resolution before rule deployment.
5. The Storage rules retain legacy unscoped paths so they do not immediately block existing objects. Those paths cannot prove tenant ownership and therefore remain a known cross-tenant isolation gap. Blocking them before inventory/migration would break legacy access; leaving them enabled is not final isolation.
6. The Storage rules delta was not executed in a Storage emulator. The map.get form and all allow/deny cases must be validated with the required Java/Firebase tooling.
7. MFA remains browser-trusted rather than server-verifiable. Transferring the MFA company checks does not close that blocker.
8. Middleware deliberately excludes API routes from Clerk page protection. API security therefore continues to depend on every individual route using the correct server guard.
9. The Firebase bridge is fail-closed for unverified Clerk email and requires a linked user/employee UID, but duplicate email matches are not rejected by chooseLinkedUid. The earlier production report said no duplicate links were found; that production assertion was not rerun during this read-only repository assessment.
10. The earlier audit reported 7 canonical users with required fields/company IDs, 12 employees without an auth UID, 3 orphaned employee UID links and 311 tenant records without companyId. These are recorded audit results, not newly verified production data. No identity or company link should be invented during transfer.

### Overall validation result

The code delta is not independently transferable as one block. The original assessment identified seven narrow-patch candidates, but the 21 July bootstrap review reclassified bootstrap-access/route.js as blocked because its OneDrive cleanup does not satisfy the explicit identity-link boundary. Six files remain transferable under the approved narrow method, two require manual semantic decisions and four are blocked by identity, data, emulator or rollout dependencies. The authentication workflow itself remains Blocked rather than Approved.

## 5. Transfer classification and method

There are 30 identified authentication implementation/test/audit files:

| Classification | Count | Files |
|---|---:|---|
| Already identical; no transfer | 18 | The 18 files listed above |
| Safe without semantic merge, as narrow patches | 7 initially; 5 transferred, 1 remains and 1 was reclassified blocked | login-notification/route.js, device-tokens/route.js, passkeys/_lib.js, mfa/setup/route.js and mfa/verify/route.js completed; BICKERS_PAGE_AUDIT_TRACKER.md remains; bootstrap-access/route.js is blocked below |
| Manual semantic merge | 2 | admin/users/[userId]/route.js; statistics/_auth.js |
| Blocked by dependency or uncertainty | 4 | bootstrap-access/route.js; firestore.rules; storage.rules; firestoreAccess.js |

Raw whole-file copy count: zero. "Safe" above means the delta is small and separable, not that an unreviewed cp operation is recommended.

### Safe file-by-file method

| File | Safe transfer method |
|---|---|
| bootstrap-access/route.js | Reclassified blocked on 21 July 2026; the unused sameEmail/email-parameter cleanup dry-runs cleanly but must not be applied as if it satisfies the required identity boundary |
| login-notification/route.js | Completed on 20 July 2026 as a validated two-hunk patch after confirming Developer admin/_lib.js and accountAccess.js were present |
| mfa/setup/route.js | Completed on 21 July 2026 as a validated two-hunk patch adding the company-access boundary before secret access |
| mfa/verify/route.js | Completed on 21 July 2026 as a validated two-hunk patch adding the company-access boundary before token/body or secret processing |
| passkeys/_lib.js | Completed on 21 July 2026 as a validated two-hunk patch adding canonical, disabled and company checks to requireActiveUser |
| device-tokens/route.js | Completed on 20 July 2026 as a validated two-hunk patch using the shared active-user guard and its canonical user data |
| BICKERS_PAGE_AUDIT_TRACKER.md | Apply the documentation diff that updates authentication rows and adds the audit record; preserve the inventory and the Developer reconciliation document |

### Manual merge method

| File | Required merge decision |
|---|---|
| src/app/api/statistics/_auth.js | Preserve statistics and finance audience behavior, replace the duplicated token/user check with requireActiveUserFromRequest using the statistics module, and remove the implicit bickers-action company fallback. Avoid line-ending normalization of unrelated statistics files. |
| src/app/api/admin/users/[userId]/route.js | Decide explicitly whether historical email-gate accounts may be deleted by canonical admins. If the allowlist is obsolete, remove only the import and guard after adding deletion authorization tests. Otherwise retain a server-side protected-account policy that is based on canonical data, not email. |

### Blocked file method

| File | Blocker and later method |
|---|---|
| src/app/api/security/bootstrap-access/route.js | Both copies retain employee-document-ID fallback, silent canonical UID repair, cross-company access mirroring and implicit workspace/module defaults. Route-level Clerk assurance also depends on broader bridge/token verification. Require a separately approved hardening design, production-link inventory and focused tests before transfer. |
| firestore.rules | Do not deploy or merge into a release until companyId backfill/direct-writer work, production role-value inventory and expression-limit diagnostics are resolved. Later perform a reviewed three-way merge and emulator test matrix. |
| src/app/utils/firestoreAccess.js | Keep the Developer version during the first transfer. The OneDrive delta affects an emergency helper with no callers and belongs with the tenant-query migration/rules rollout, not the immediate API hardening patch. |
| storage.rules | Do not promote until legacy object paths are inventoried/migrated or explicitly accepted and Storage emulator tests pass. Later merge only the validated disabled-field/rule changes. |

## 6. Safe execution order

This remains the overall consolidation sequence. The controlled login-notification, device-token, passkey-helper, MFA-setup and MFA-verification transfers were completed as recorded below. The bootstrap transfer was inspected and dry-run but blocked without application changes, as recorded below.

1. Stop OneDrive sync and all development servers for both paths.
2. Verify the existing Developer snapshot checksum, then create separate hash-recorded pre-transfer snapshots of the current Developer and OneDrive worktrees. Exclude secrets but retain untracked source and conflict evidence.
3. Create an approved Developer reconciliation branch. Because the worktree is dirty, a branch name alone is not a backup; retain the snapshots and export binary diffs/untracked manifests first.
4. Record SHA-256 hashes for all 30 authentication files in both trees.
5. Generate a seven-file patch set only. Use per-file diffs against the actual Developer working files for the three already-modified files and tracker; use common-HEAD diffs for the three OneDrive-only safe routes. Run git apply --check before changing the worktree.
6. Apply and review one logical group at a time: API active-user guards, MFA company checks, bootstrap cleanup, then tracker documentation.
7. Manually merge statistics authorization with targeted tests.
8. Resolve the admin-account deletion policy and add tests before deciding whether to merge that delta.
9. Keep Firestore rules, firestoreAccess.js and Storage rules out of the transferable group until their blockers are cleared. Do not deploy any rules.
10. Run the verification matrix below in Developer.
11. Commit only reviewed authentication groups. Do not mix package-lock, appearance, line-ending cleanup, conflict copies, nested repositories or unrelated statistics changes into those commits.
12. Once Developer is verified and backed up remotely, mark OneDrive read-only and do not resume active development there.

## 7. Controlled transfer record — login notification

Completed: 20 July 2026

| Field | Result |
|---|---|
| Active repository | /Users/masonbickers/Developer/Bickers-Booking1 |
| Branch and HEAD | main at 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Exact application file changed | src/app/api/security/login-notification/route.js |
| OneDrive source hash | 3e5e7bc1bca37913b2a9fd6b0374430262e17a0c91467200b0b9da6e9092032a |
| Developer pre-transfer hash | 1ef56b9d4793d7fd55dbad73c2c9a8a0d53450d5c4869a7f3e1f2a310196923d |
| Developer post-transfer hash | 3e5e7bc1bca37913b2a9fd6b0374430262e17a0c91467200b0b9da6e9092032a |
| Supplemental snapshot | /private/tmp/Bickers-Booking1-login-notification-transfer-94d4a3d-20260720T224810BST.tar.gz |
| Supplemental snapshot SHA-256 | 82cde9bad90d2ce3d522d304fe851120284cdd6adfa11b9197f930db4d60925a |
| Validated patch | /private/tmp/Bickers-Booking1-login-notification-narrow-94d4a3d-20260720.patch |
| Patch SHA-256 | 63141103bee4077f840d7cecd4f3752624ad0218e2f234dfd3cbb3f789a543f3 |
| Patch size | Two hunks; 5 insertions and 11 deletions in one file |
| Staged or committed | No |

The existing worktree snapshot was verified before transfer at SHA-256 f38e4954a76f9cc6ebc3dee352422098f0895fcfaa7f73cbfd1de4819ead01a7. The supplemental snapshot contains the pre-transfer Developer route, the unchanged OneDrive route, both repositories' status, both diff summaries, the route comparison summary and source hashes.

### Behaviour transferred

- Replaced the route-local Firebase token check with the existing shared requireActiveUserFromRequest guard.
- Requires a canonical users/{uid} record with a UID.
- Applies all centralized disabled-state checks rather than only isEnabled === false.
- Requires company access for non-Platform-Admin users.
- Reuses the guard's verified Firebase user and canonical user data.
- Records blocked access through the shared security logging path.

No module, workspace or ordinary role restriction was added because the guard is called without a module option and this notification remains available to any active company user or Platform Admin.

### Developer behaviour preserved

- POST method, Authorization header and JSON body containing method are unchanged.
- IP, approximate location, user-agent and login-method capture are unchanged.
- Resend email composition, delivery handling and failure logging are unchanged.
- Successful loginSecurityLogs creation is unchanged.
- The success response remains { ok: true, emailSent: boolean }.
- Both callers still send a Firebase ID token and ignore the response body, so the stronger denial messages do not break their contract.
- No unrelated formatting or notification behaviour changed.

The denial contract is intentionally stricter: an invalid token now returns the shared 401 response, while missing canonical record, disabled state and missing company return focused 403 responses. Failed authorization may also create a blocked loginSecurityLogs entry.

### Patch and test results

| Check | Result |
|---|---|
| Repository/commit revalidation | Passed; both repositories remained at 94d4a3d with the expected status counts |
| Existing snapshot checksum | Passed |
| git apply --check dry-run | Passed cleanly |
| Scope review | Passed; only two intended hunks in one route |
| Post-transfer hash comparison | Passed; Developer route now matches the source hash |
| OneDrive immutability check | Passed; source hash remained 3e5e7bc... |
| node --check | Passed |
| Targeted ESLint | Passed with zero findings |
| Import presence | Passed for admin/_lib.js, accountAccess.js and _firebaseAdminRest.js |
| git diff --check | Passed |
| Focused diff review | Passed; no formatting churn |
| npm run test:access | Passed, 12/12 |
| node --test tests/authBoundary.test.mjs | Passed, 3/3 |
| Caller search | Passed; only auth completion and MFA setup call through loginNotification.js |
| Route-specific unit test | Not available |
| Browser, Clerk, email-provider or production execution | Not run |

### Retention decision and uncertainty

This transfer is safe to retain and is ready for a later authentication commit, provided the commit also contains or follows the currently uncommitted shared admin/_lib.js and accountAccess.js dependencies. It must not be committed alone against HEAD without those dependencies.

Remaining uncertainty is limited to runtime integration not exercised here: no real Firebase token, Clerk browser flow, Resend delivery or production loginSecurityLogs write was attempted. The shared guard's authorization logic is covered indirectly by the existing access/auth-boundary tests, but the route itself has no isolated unit test.

The next-file recommendation made at this point was src/app/api/device-tokens/route.js. That transfer was subsequently approved and completed in the record below.

## 8. Controlled transfer record — device tokens

Completed: 20 July 2026

| Field | Result |
|---|---|
| Active repository | /Users/masonbickers/Developer/Bickers-Booking1 |
| Branch and HEAD | main at 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Exact application file changed | src/app/api/device-tokens/route.js |
| OneDrive source hash | 89bf13b0edf45d655a114bc020ad91b577905d0752dbb17c31e38be3fb9fd1bd |
| Developer pre-transfer hash | e70ae10067aa615c5623d57ffa6134c5008f6c39c47969efd09b1cb4e60f2489 |
| Developer post-transfer hash | 89bf13b0edf45d655a114bc020ad91b577905d0752dbb17c31e38be3fb9fd1bd |
| Supplemental snapshot | /private/tmp/Bickers-Booking1-device-tokens-transfer-94d4a3d-20260720T225326BST.tar.gz |
| Supplemental snapshot SHA-256 | e9c2bef9a326a30f7e5f68705e8cea8919756d7ab90168965b7ded86d6aa4551 |
| Validated patch | /private/tmp/Bickers-Booking1-device-tokens-narrow-94d4a3d-20260720.patch |
| Patch SHA-256 | 9ac7069bcd88da083dc9795ef82b7159a070e446587772be9e5345e24dfdfff4 |
| Patch size | Two hunks; 5 insertions and 6 deletions in one file |
| Staged or committed | No |

The supplemental snapshot contains the pre-transfer Developer route, the unchanged OneDrive route, current Developer status and diff summary, route comparison summary, hashes and the Developer versions of admin/_lib.js, accountAccess.js and _firebaseAdminRest.js needed to understand the authorization path.

### Route purpose and behaviour transferred

This is a POST-only device-token registration endpoint. It accepts token, expoPushToken or pushToken, derives a deterministic document ID from the token, verifies completed phone/authenticator MFA and upserts a token beneath deviceTokens/{verifiedUid}/tokens/{tokenHash}.

The controlled patch:

- Replaced direct bearer-token verification with the shared requireActiveUserFromRequest guard.
- Requires a canonical users/{uid} record with a UID.
- Applies all centralized disabled-state checks rather than only isEnabled === false.
- Requires company access for non-Platform-Admin users.
- Reuses canonical user data returned by the guard instead of reading the user document again.
- Records blocked authorization attempts through the shared security log path.

No module, workspace or ordinary role restriction was added. Platform Admin retains the shared guard's intended companyId exception.

### Developer behaviour preserved

- The POST method and Firebase bearer-token request contract are unchanged.
- token, expoPushToken and pushToken aliases remain supported.
- Token, platform and app-version normalization and length limits are unchanged.
- A missing token still returns 400 with "Device token is required."
- Phone verification, authenticator MFA, reset-state and private-secret requirements are unchanged.
- The document owner remains the verified UID; no UID is accepted from the request body.
- Token hashing, Firestore path, stored fields and timestamps are unchanged.
- Re-registering the same token for the same UID still updates the same deterministic document.
- The success response remains { ok: true, id } and the catch-all 500 response remains unchanged.
- No unrelated feature or formatting change was introduced.

There is no GET or DELETE handler. A caller cannot select another user's storage path through this route. The code does not prevent the same raw token being registered beneath two different verified UIDs, and body.createdAt remains client-supplied; neither behaviour was changed by this transfer.

No in-repository application caller was found. References outside the route are documentation, a dirty nested worktree and platform cleanup code for older push-token-only user documents, not consumers of this endpoint.

### Shared uncommitted dependencies

| Dependency | SHA-256 | State |
|---|---|---|
| src/app/api/admin/_lib.js | 8a1df54c11b17b1fe71a915b0e7191abcca89a50ea254374b6aa864f810cb7dc | Modified and uncommitted; exports the shared guard |
| src/app/utils/accountAccess.js | 73079e74920c19857f2f21b7bd200b3ea8a751df1f3d24dbfcfae5a4472a61ab | Untracked and uncommitted; supplies canonical, disabled and company predicates |
| src/app/api/_firebaseAdminRest.js | d57176d9f6522ba3201aed2e6343695479a11f137e292bd6f6a10b5e67007ce1 | Existing server Firestore helper |

The route must not be committed alone against HEAD without the first two dependencies.

### Patch and test results

| Check | Result |
|---|---|
| Repository/commit revalidation | Passed; both repositories remained at 94d4a3d with expected status counts |
| Previous login-notification hash | Passed; remained 3e5e7bc1... |
| Supplemental snapshot | Passed and hash-recorded |
| git apply --check dry-run | Passed cleanly |
| Scope review | Passed; only two intended authentication hunks in one route |
| Post-transfer source comparison | Passed; Developer route matches the approved source hash |
| OneDrive immutability check | Passed; source hash and modification time remained unchanged |
| node --check | Passed |
| Targeted ESLint | Passed with zero findings |
| Import presence/resolution check | Passed |
| accountAccess helper smoke assertions | Passed, 6/6 for canonical, disabled and company predicates |
| git diff --check and focused diff | Passed; no formatting churn |
| npm run test:access | Passed, 12/12; existing module-type warning only |
| node --test tests/authBoundary.test.mjs | Passed, 3/3; existing module-type warning only |
| Device-token-specific tests | Not available |
| In-repository caller review | Passed; no active caller found |
| Reverse-patch rollback validation | Passed |
| Browser, Firebase Admin, Firestore or production request | Not run |

### Requested behaviour matrix

| Case | Result |
|---|---|
| Signed-out request | Not run at HTTP-route level; code delegates to the shared 401 guard |
| Missing canonical account | Helper-level assertion/test passed; HTTP-route execution not run |
| Disabled account | Helper-level assertion/test passed; HTTP-route execution not run |
| Missing company access | Helper-level assertion passed; HTTP-route execution not run |
| Platform Admin company exception | Confirmed by code review of the shared guard; not dynamically run |
| Valid user registering own token | Not run; requires Firebase/Admin integration |
| Attempt to modify/remove another user's token | No such target operation is exposed; UID ownership confirmed by code review, not dynamically run |
| Invalid or incomplete body | Missing-token 400 confirmed by code review; not dynamically run |
| Duplicate token registration | Deterministic same-user upsert confirmed by code review; not dynamically run |

### Retention decision and uncertainty

This transfer is safe to retain and is ready for a later authentication consolidation commit provided admin/_lib.js and accountAccess.js are included in or precede that commit. The previous login-notification transfer remains unchanged.

Remaining uncertainty is the absence of a route-specific test or active in-repository caller. No real Firebase token, MFA secret, Admin Firestore write, cross-user attempt or production device registration was exercised. Global duplicate-token ownership and client-supplied createdAt remain existing design questions, not regressions introduced by this patch.

The next-file recommendation made at this point was src/app/api/passkeys/_lib.js. That transfer was subsequently approved and completed in the record below.

## 9. Controlled transfer record — passkey helper

Completed: 21 July 2026

| Field | Result |
|---|---|
| Active repository | /Users/masonbickers/Developer/Bickers-Booking1 |
| Branch and HEAD | main at 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Exact application file changed | src/app/api/passkeys/_lib.js |
| OneDrive source hash | d443c773cc45f469c43dc92e3eed6caa9863a2d5f004dea29888c150710c7cf2 |
| Developer pre-transfer hash | d258b01fe2f45ccd2c1fe4bf864f4b5b6efe546d14634c1754795bb473bdcdc6 |
| Developer post-transfer hash | d443c773cc45f469c43dc92e3eed6caa9863a2d5f004dea29888c150710c7cf2 |
| Supplemental snapshot | /private/tmp/Bickers-Booking1-passkeys-lib-transfer-94d4a3d-20260721T000317BST.tar.gz |
| Supplemental snapshot SHA-256 | d5b3f6e2cedfb9800902d5f2c5f287ea20caa8c68a5ee9a04431ec90e8858f2d |
| Validated patch | /private/tmp/Bickers-Booking1-passkeys-lib-narrow-94d4a3d-20260721.patch |
| Patch SHA-256 | d914569093a29194bdf630468da8235149af52d69693e2277d698980d26cae4f |
| Patch size | Two hunks; 3 insertions and 1 deletion in one file |
| Staged or committed | No |

The supplemental snapshot contains the pre-transfer Developer helper, unchanged OneDrive helper, current Developer status and diff summary, helper comparison summary, importing-route list, hashes and the Developer versions of accountAccess.js, admin/_lib.js, mfa/_lib.js and _firebaseAdminRest.js.

### Helper responsibilities and security behaviour transferred

The helper supplies passkey error responses, relying-party/origin metadata, base64url conversion, active-user loading, Bickers email lookup, credential listing/lookup and challenge freshness checks.

The controlled patch changed only requireActiveUser:

- Requires a canonical users/{uid} record containing a UID.
- Applies all centralized disabled-state checks instead of only isEnabled === false.
- Requires company access for ordinary users.
- Preserves the intended companyId exception only for the canonical role value platformAdmin.
- Keeps the same access-denial message and thrown-error behavior.

No blocked-access logging was added because this helper receives a UID rather than the request. No MFA, workspace, module or passkeysAllowed feature check was added.

### Existing passkey behaviour preserved

- RP name, host/protocol-derived RP ID and origin, and environment overrides are unchanged.
- Base64url public-key conversion is unchanged.
- Bickers-domain email lookup and existing first-match behavior are unchanged.
- Credential listing remains filtered by UID.
- Login verification still rejects a credential whose stored UID differs from the selected user's ID.
- Registration verification still returns 409 when a credential belongs to another UID.
- Registration and authentication challenge creation, five-minute expiry and per-UID storage are unchanged.
- Successful verification still clears the relevant challenge fields.
- WebAuthn user-verification, expected challenge, origin and RP ID checks are unchanged.
- Credential counters, device/back-up metadata and last-used timestamps are unchanged.
- Registration success still records adminAuditLogs.
- Legacy passkey login remains disabled with 410 unless ALLOW_LEGACY_FIREBASE_LOGIN is true.
- Registration routes retain their existing Firebase token checks. No additional MFA check was introduced.
- Existing request bodies and success/error response shapes are unchanged.

The access helper still throws an Error that importing route catch blocks return as a 500 response. This pre-existing response behavior was deliberately preserved rather than broadening this single-file transfer.

Challenge consumption remains non-transactional: a cleared challenge is rejected on later use, but concurrent verification before the first request clears it was not tested and is an existing risk. Origin and RP ID remain derived from configured values or forwarded host headers; invalid-origin/RP rejection is delegated unchanged to SimpleWebAuthn.

### Importing routes reviewed

| Route | Helper use and effect |
|---|---|
| passkeys/login/options/route.js | Email lookup, active user, RP metadata and credential list before authentication challenge generation |
| passkeys/login/verify/route.js | Active user, credential lookup/UID binding, challenge freshness and public-key decoding before verification |
| passkeys/register/options/route.js | Firebase-authenticated active user, RP metadata and existing credentials before registration challenge generation |
| passkeys/register/verify/route.js | Firebase-authenticated active user, challenge freshness, credential ownership and public-key encoding before persistence |

No active application caller of these legacy API routes was found. The current account page directs users to Clerk-managed passkeys.

### Shared dependencies

| Dependency | SHA-256 | State |
|---|---|---|
| src/app/utils/accountAccess.js | 73079e74920c19857f2f21b7bd200b3ea8a751df1f3d24dbfcfae5a4472a61ab | New direct dependency; untracked and uncommitted |
| src/app/api/_firebaseAdminRest.js | d57176d9f6522ba3201aed2e6343695479a11f137e292bd6f6a10b5e67007ce1 | Existing direct dependency |
| src/app/api/mfa/_lib.js | 138257f56acddfafba9a173cf6b8492af9bfa1c93c1cf51548e07f94c0211e2a | Existing registration-route token verifier; unchanged |
| src/app/api/admin/_lib.js | 8a1df54c11b17b1fe71a915b0e7191abcca89a50ea254374b6aa864f810cb7dc | Shared authentication work but not imported by this helper |
| @simplewebauthn/server | Package dependency ^13.3.1 | Existing route dependency; unchanged |

The helper must not be committed alone against HEAD without accountAccess.js.

### Patch and test results

| Check | Result |
|---|---|
| Repository/commit revalidation | Passed; both repositories remained at 94d4a3d with expected status counts |
| Previous controlled-transfer hashes | Passed; login-notification and device-token routes remained unchanged |
| Supplemental snapshot | Passed and hash-recorded |
| git apply --check dry-run | Passed cleanly |
| Scope review | Passed; one import and one active-user predicate hunk |
| Post-transfer source comparison | Passed; Developer helper matches the approved source hash |
| OneDrive immutability check | Passed; source hash and modification time remained unchanged |
| Helper and four importer syntax checks | Passed |
| Targeted ESLint for helper and four importers | Passed with zero findings |
| Import presence/resolution check | Passed |
| Exact-source temporary helper harness | Passed, 8/8 |
| git diff --check and focused diff | Passed; no formatting churn |
| npm run test:access | Passed, 12/12; existing module-type warning only |
| node --test tests/authBoundary.test.mjs | Passed, 3/3; existing module-type warning only |
| Repository passkey-specific tests | Not available |
| Four importing-route reviews | Completed |
| Reverse-patch rollback validation | Passed |
| Browser, Clerk, SimpleWebAuthn or production execution | Not run |

The temporary harness at /private/tmp/bickers-passkey-helper-policy.test.mjs executed the exact changed helper source with in-memory Firestore mocks. It covered an active canonical company user, missing canonical user, all centralized disabled states, missing company, canonical Platform Admin exception, legacy role alias rejection, fresh/expired/cleared challenges and base64url round-trip. Its VM-module experimental warning and the repository's module-type warning are pre-existing/tooling warnings, not test failures.

### Requested behaviour matrix

| Case | Result |
|---|---|
| Signed-out access | Not run at route level; registration's existing Firebase token check and login's legacy-feature gate were code-reviewed |
| Missing canonical account | Passed in the exact-source helper harness |
| Disabled account | Passed for all centralized disabled states in the exact-source helper harness |
| Missing company access | Passed in the exact-source helper harness |
| Platform Admin exception | Passed for canonical platformAdmin; legacy platformadmin alias was confirmed denied |
| Valid passkey owner | Ownership code reviewed; WebAuthn route execution not run |
| Credential belonging to another UID | Login 401 and registration 409 checks preserved by code review; not dynamically run |
| Missing or expired challenge | Passed at helper level; route response not dynamically run |
| Replayed challenge | Cleared challenge rejected in helper harness; concurrent replay not run |
| Invalid origin or RP values | Existing SimpleWebAuthn checks preserved; not dynamically run |
| Invalid or incomplete payload | Existing route handling preserved; not dynamically run |

### Retention decision and uncertainty

This transfer is safe to retain and is ready for a later authentication consolidation commit provided accountAccess.js is included in or precedes that commit. The prior login-notification and device-token transfers remain unchanged.

Remaining uncertainty is limited to behavior outside the changed predicate: no live WebAuthn ceremony, Firebase token, Clerk flow, cross-UID credential attempt, malformed payload or concurrent challenge replay was executed. Canonical role/company enforcement may intentionally lock out legacy records without uid/companyId, and production data was not re-read during this transfer.

The next-file recommendation made at this point was src/app/api/mfa/setup/route.js. That transfer was subsequently approved and completed in the record below.

## 10. Controlled transfer record — MFA setup

Completed: 21 July 2026

| Field | Result |
|---|---|
| Active repository | /Users/masonbickers/Developer/Bickers-Booking1 |
| Branch and HEAD | main at 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Exact application file changed | src/app/api/mfa/setup/route.js |
| OneDrive source hash | 0e746ea8f25147b5b446f9ab6dc786e942ac50bc835fe9762c1865da27a5bc2a |
| Developer pre-transfer hash | 629c2057ee501f1236d7792460464af36493c479b6337b67bd20c16c063849ff |
| Developer post-transfer hash | 0e746ea8f25147b5b446f9ab6dc786e942ac50bc835fe9762c1865da27a5bc2a |
| Supplemental snapshot | /private/tmp/Bickers-Booking1-mfa-setup-transfer-94d4a3d-20260721T001909BST.tar.gz |
| Supplemental snapshot SHA-256 | 898c5d192fc8c6f738077b36ed3f6bac8db7f5a4eab9e1e42bd546d7def3d5e7 |
| Validated patch | /private/tmp/Bickers-Booking1-mfa-setup-narrow-94d4a3d-20260721.patch |
| Patch SHA-256 | 06a6d3e8bd71bf1a53199dfb2f29bc66957d8aacdbc579a847c3f40dded4fc82 |
| Patch size | Two hunks; 4 insertions and 1 deletion in one file |
| Staged or committed | No |

The supplemental snapshot contains both setup-route versions, Developer status/diff summary, route comparison, hashes, direct/shared authorization helpers, the verify route and reference copies of setup/verify pages, authSecurity.js, authContext.js and ProtectedLayout.js.

### Route purpose and transferred boundary

The route prepares TOTP enrolment for the Firebase-authenticated UID. It reads users/{uid} and mfaSecrets/{uid}, preserves an existing active secret where appropriate, writes a pending secret for new/reset enrolment, writes adminAuditLogs and returns either alreadyEnrolled or an otpauthUrl consumed by the setup page.

The Developer route already contained canonical-user and centralized disabled-account checks. This controlled delta:

- Added hasCompanyAccess to the account-access import.
- Rejects company-less ordinary users before any mfaSecrets read or write.
- Preserves the companyId exception only for the canonical platformAdmin role.

The route still assumes that the Firebase token was created through the verified Clerk-email/explicit-UID bridge; it does not re-check Clerk email or linkage itself. The verified token UID exclusively selects users/{uid}, mfaSecrets/{uid} and audit target fields, and the request body cannot select another account.

### Existing MFA setup behaviour preserved

- The route remains POST-only and requires a Firebase bearer token.
- No request body is required or consumed.
- Existing secret plus no reset requirement still returns { alreadyEnrolled: true }, preserves the secret and repairs user MFA flags.
- A reset-required account retains its active secret while receiving a replacement pendingSecret.
- New setup generates a 20-byte-base32 Speakeasy secret and returns only its otpauthUrl.
- Repeated unconfirmed setup continues to replace only pendingSecret; this may invalidate the previous unscanned QR and is pre-existing behavior.
- The active secret is not replaced until the separate verify route successfully validates the pending code.
- Successful setup preparation and existing-enrolment confirmation still attempt admin audit writes.
- Audit-write failure remains non-blocking; secret/user storage failure still returns 500.
- Existing response shapes and the setup page's alreadyEnrolled/otpauthUrl handling remain unchanged.
- No recent-authentication, password-confirmation, Clerk MFA or additional email-verification requirement was introduced.

Collections/documents used remain users/{uid}, mfaSecrets/{uid} and adminAuditLogs. Direct client access to mfaSecrets and audit logs remains denied by Firestore rules; the route writes with the server helper.

### Callers and related MFA state reviewed

- src/app/setup-mfa/page.js is the only route caller. It requests setup for auth.currentUser's Firebase token and converts otpauthUrl to a QR code.
- src/app/api/mfa/verify/route.js verifies pending/active TOTP secrets and completes enrolment. It was reviewed but not modified.
- src/app/verify-mfa/page.js, src/app/utils/authSecurity.js, src/app/context/authContext.js and src/app/components/ProtectedLayout.js read or write the browser-held MFA completion marker. They were reviewed for context and not modified.

The browser marker remains mutable localStorage/sessionStorage state. APIs, Firestore rules and Storage rules still cannot verify MFA completion. This transfer does not resolve or reduce that architectural blocker and must not be treated as MFA production approval.

### Shared dependencies

| Dependency | SHA-256 | State |
|---|---|---|
| src/app/utils/accountAccess.js | 73079e74920c19857f2f21b7bd200b3ea8a751df1f3d24dbfcfae5a4472a61ab | Direct dependency; untracked and uncommitted |
| src/app/api/mfa/_lib.js | 138257f56acddfafba9a173cf6b8492af9bfa1c93c1cf51548e07f94c0211e2a | Existing Firebase-token verifier; unchanged |
| src/app/api/_firebaseAdminRest.js | d57176d9f6522ba3201aed2e6343695479a11f137e292bd6f6a10b5e67007ce1 | Existing server Firestore helper; unchanged |
| src/app/api/admin/_lib.js | 8a1df54c11b17b1fe71a915b0e7191abcca89a50ea254374b6aa864f810cb7dc | Shared authentication work but not imported by this route |
| speakeasy | Package dependency ^2.0.0 | Existing TOTP generator; unchanged |

The route must not be committed alone against HEAD without accountAccess.js.

### Patch and test results

| Check | Result |
|---|---|
| Repository/commit revalidation | Passed; both repositories remained at 94d4a3d with expected status counts |
| Previous controlled-transfer hashes | Passed; login-notification, device-token and passkey helper remained unchanged |
| Supplemental snapshot | Passed and hash-recorded |
| git apply --check dry-run | Passed cleanly |
| Scope review | Passed; one import and one company-access guard hunk |
| Post-transfer source comparison | Passed; Developer route matches the approved source hash |
| OneDrive immutability check | Passed; source hash and modification time remained unchanged |
| Setup, verify, MFA helper and relevant client syntax checks | Passed |
| Targeted ESLint | Passed with zero findings |
| Import presence/resolution check | Passed |
| Exact-source temporary setup-route harness | Passed, 11/11 |
| git diff --check and focused diff | Passed; no formatting churn |
| Caller/response compatibility review | Passed |
| npm run test:access | Passed, 12/12; existing module-type warning only |
| node --test tests/authBoundary.test.mjs | Passed, 3/3; existing module-type warning only |
| Repository MFA-setup-specific tests | Not available |
| Reverse-patch rollback validation | Passed |
| Browser, Clerk, Firebase Admin or production execution | Not run |

The temporary harness at /private/tmp/bickers-mfa-setup-route.test.mjs executed the exact changed route source with in-memory token, Firestore and Speakeasy mocks. It covered signed-out, missing canonical, disabled, missing company, canonical Platform Admin, own-UID setup, no-body setup, existing-secret preservation, reset-required setup, repeated pending setup, storage failure and audit failure.

### Requested behaviour matrix

| Case | Result |
|---|---|
| Signed-out request | Passed in exact-source route harness; rejected 401 before data access |
| Missing canonical account | Passed; rejected 403 |
| Disabled account | Passed; rejected 403 |
| Missing company access | Passed; rejected 403 before secret access |
| Platform Admin exception | Passed for canonical platformAdmin |
| Valid active-user setup | Passed; returned otpauthUrl and wrote only that UID's pending secret |
| Attempt to act on another user's configuration | Passed structurally in harness; request body was not consumed and verified UID selected all documents |
| Invalid or incomplete request | No body is required; no-body valid setup passed. Invalid token is covered by signed-out case |
| Repeated setup | Passed; only pending secret was replaced |
| Existing-secret handling | Passed for already-enrolled and reset-required cases; active secret remained intact |
| Storage failure | Passed; returned 500 |
| Logging failure | Passed; audit failure remained non-blocking |

### Retention decision and remaining blocker

This transfer is safe to retain and is ready for a later authentication consolidation commit provided accountAccess.js is included in or precedes that commit. The three previous controlled transfers remain unchanged.

The authentication workflow remains Blocked overall. MFA completion is still trusted from mutable browser storage and is not server-verifiable by APIs, Firestore or Storage. No production Clerk/Firebase flow, QR scan, real TOTP enrolment or production write was exercised.

Recommended next file from the approved transfer list: src/app/api/mfa/verify/route.js. It is the paired company-access boundary for TOTP verification and requires its own snapshot and file-specific approval.

## 11. Controlled transfer record — MFA verification

Completed: 21 July 2026

| Field | Result |
|---|---|
| Active repository | /Users/masonbickers/Developer/Bickers-Booking1 |
| Branch and HEAD | main at 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Exact application file changed | src/app/api/mfa/verify/route.js |
| OneDrive source hash | fa982793c981dd59bcd5f21ac6a58f596d4c7c5530be9b0e7978449c925addc7 |
| Developer pre-transfer hash | d423e97c398a2b49ee78a5d7394d9ce2f3f05130a6a20cb947232d9c84544eee |
| Developer post-transfer hash | fa982793c981dd59bcd5f21ac6a58f596d4c7c5530be9b0e7978449c925addc7 |
| Supplemental snapshot | /private/tmp/Bickers-Booking1-mfa-verify-transfer-94d4a3d-20260721-002837.tar.gz |
| Supplemental snapshot SHA-256 | bfb135e9862c60c65fb587a3c7db6806a7484387bb174bca22eb9d89c6a6ee26 |
| Validated patch | /private/tmp/Bickers-Booking1-mfa-verify-narrow-94d4a3d-20260721.patch |
| Patch SHA-256 | 26535e550ee67158943e2085c8e3bc8a2ebb35bb1c86b1374ef6529943422402 |
| Patch size | Two hunks; 4 insertions and 1 deletion in one file |
| Staged or committed | No |

The supplemental snapshot contains the pre-transfer Developer route, unchanged OneDrive route, current Developer status and diff summary, direct authorization and Firebase helpers, related setup/verification files, active callers and browser-held MFA state references.

### Route purpose and transferred boundary

The POST route verifies a submitted TOTP for the Firebase-authenticated UID. Normal verification reads the active secret from mfaSecrets/{uid}. Enrolment verification reads pendingSecret, promotes it to active only after a valid code, removes the pending fields, updates users/{uid}, and writes loginSecurityLogs plus adminAuditLogs.

The Developer route already required a canonical user record and applied centralized disabled-account checks. This controlled delta:

- Added hasCompanyAccess to the existing account-access import.
- Rejects company-less ordinary users before parsing the request body or reading mfaSecrets.
- Preserves the intended companyId exception only for the canonical platformAdmin role.

The Firebase token UID remains the sole owner selector for users/{uid}, mfaSecrets/{uid}, audit targets and login events. A body UID or legacy body secret cannot select another user's secret.

### Existing MFA verification behaviour preserved

- Firebase bearer-token verification, POST request method and response shapes are unchanged.
- TOTP normalization still removes whitespace; Speakeasy still verifies base32 secrets with window: 1.
- Normal mode still uses only the active secret. mode: "enroll" still uses only pendingSecret.
- A pending secret is promoted only after successful verification; pendingSecret and pendingCreatedAt are then deleted.
- During reset enrolment, the old active secret remains intact after an invalid pending code and is replaced only after valid pending-secret confirmation.
- Existing user MFA flags, legacy users.mfaSecret deletion, enrolment audit and success/failure login events are unchanged.
- Audit-write failure remains non-blocking. Secret read/write failure still returns 500.
- No secret is returned by the route, and the two callers continue to consume only success/error responses.

The verification page still sends an unused legacy body.secret field; the server ignores it. This is pre-existing caller behavior and was not changed in this route-only transfer.

### Callers, related routes and state reviewed

- src/app/verify-mfa/page.js sends token for normal verification, then writes the completion marker to localStorage or sessionStorage.
- src/app/setup-mfa/page.js sends token with mode: "enroll", then writes a 30-day localStorage completion marker.
- src/app/api/mfa/setup/route.js creates/replaces pending enrolment secrets and preserves an active secret until confirmation.
- Admin and Platform Admin user routes can reset MFA by clearing active/pending secret fields and updating users/{uid}.
- src/app/utils/authSecurity.js, authContext.js and ProtectedLayout.js trust a mutable browser marker for completed MFA.

The company guard hardens this one API boundary only. It does not create a durable server-verifiable MFA assurance state and does not make the overall MFA workflow production-ready for APIs, Firestore or Storage.

### Shared dependencies

| Dependency | SHA-256 | State |
|---|---|---|
| src/app/utils/accountAccess.js | 73079e74920c19857f2f21b7bd200b3ea8a751df1f3d24dbfcfae5a4472a61ab | Direct dependency; untracked and uncommitted |
| src/app/api/mfa/_lib.js | 138257f56acddfafba9a173cf6b8492af9bfa1c93c1cf51548e07f94c0211e2a | Existing Firebase-token verifier; unchanged |
| src/app/api/_firebaseAdminRest.js | d57176d9f6522ba3201aed2e6343695479a11f137e292bd6f6a10b5e67007ce1 | Existing server Firestore helper; unchanged |
| src/app/api/admin/_lib.js | 8a1df54c11b17b1fe71a915b0e7191abcca89a50ea254374b6aa864f810cb7dc | Shared authentication work but not imported by this route |
| speakeasy | Package dependency ^2.0.0 | Existing TOTP verifier; unchanged |

The route must not be committed alone against HEAD without accountAccess.js.

### Patch and test results

| Check | Result |
|---|---|
| Repository/commit revalidation | Passed; both repositories remained on main at 94d4a3d |
| Previous controlled-transfer hashes | Passed; login-notification, device-token, passkey helper and MFA setup remained unchanged |
| Supplemental snapshot | Passed and hash-recorded |
| git apply --check dry-run | Passed cleanly |
| Scope review | Passed; one import and one company-access guard hunk |
| Post-transfer source comparison | Passed; Developer route matches the approved OneDrive source hash |
| OneDrive immutability check | Passed; source hash and modification time remained unchanged |
| Verify/setup routes, MFA helper and two caller syntax checks | Passed |
| Targeted ESLint | Passed with zero findings |
| Import presence/resolution check | Passed for local targets, speakeasy and next/server |
| Exact-source temporary route harness | Passed, 18/18 on final run using real Speakeasy TOTP values |
| npm run test:access equivalent | Passed, 12/12; existing module-type warning only |
| node --test tests/authBoundary.test.mjs | Passed, 3/3; existing module-type warning only |
| git diff --check and focused diff | Passed; no formatting churn |
| Caller/response compatibility review | Passed |
| Reverse-patch rollback validation | Passed |
| Repository MFA-verification-specific tests | Not available |
| Browser, Clerk, Firebase Admin, production data or production write | Not run |

The first temporary-harness run stopped after four passed cases because a test-only deepStrictEqual compared objects from different VM realms. No application assertion failed. The harness assertion was corrected, then the complete final run passed 18/18. The VM-module experimental warning and repository module-type warnings are tooling warnings, not application failures.

### Exercised behaviour and remaining risks

| Case | Result |
|---|---|
| Signed-out request | Passed; 401 before data access |
| Missing canonical account | Passed; 403 |
| Disabled account | Passed; 403 |
| Missing company access | Passed; 403 before secret access |
| Platform Admin exception | Passed for canonical platformAdmin |
| Valid active TOTP | Passed, including whitespace normalization and no secret mutation |
| Invalid or missing TOTP | Passed; 401 invalid and 400 missing |
| Malformed JSON | Existing 500 behavior confirmed; not changed |
| Valid pending enrolment TOTP | Passed; pending secret promoted and pending fields removed |
| Existing active secret during reset | Passed; preserved after invalid pending code and replaced only after valid confirmation |
| Attempt to target another UID | Passed structurally; body UID ignored and verified UID selected the secret |
| Missing secret | Passed; 400 and failed login event |
| Audit-write failure | Passed; successful enrolment remained successful |
| Secret-read or secret-write failure | Passed; returned 500 |
| Expired/obsolete pending setup | No expiry enforcement exists; the harness confirmed an old pendingCreatedAt is accepted |
| Repeated active-code verification | No replay tracking exists; the harness confirmed the same valid code can succeed repeatedly within its time window |
| Brute-force/rate limiting | Not available; failed attempts are logged but no counter, lockout, throttle or rate limiter exists in this route |

One additional pre-existing sensitive-data risk was confirmed by exact-source execution: if users/{uid} still contains the legacy mfaSecret field during successful enrolment, spreading userData into both before and after audit payloads copies that secret into adminAuditLogs. The response does not expose it. Production presence was not queried, and this narrow source-to-source transfer did not alter the audit payload. It requires a separately approved remediation and legacy-data check.

### Retention decision and remaining blocker

This patch is safe to retain and the route is ready for a later authentication consolidation commit provided accountAccess.js is included in or precedes that commit. The four earlier controlled transfers remain unchanged.

The overall MFA workflow remains Blocked: completed MFA is represented by mutable browser storage rather than server-verifiable session assurance. The route also lacks rate limiting, pending-secret expiry and active-code replay protection, and its legacy audit payload can copy users.mfaSecret when that field exists. No production Clerk/Firebase flow or production data was exercised.

The next-file recommendation made at this point was src/app/api/security/bootstrap-access/route.js. The subsequent assessment below reclassified that transfer as blocked and did not modify the application route.

## 12. Controlled transfer assessment — access bootstrap (Blocked; not applied)

Assessed: 21 July 2026

| Field | Result |
|---|---|
| Active repository | /Users/masonbickers/Developer/Bickers-Booking1 |
| Branch and HEAD | main at 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Application file assessed | src/app/api/security/bootstrap-access/route.js |
| Application file changed by this assessment | No |
| OneDrive source hash | be087ceb9d1ec3c125b9cf6c1696d844fd3d965335fc4fc6c95bcd047f2e7477 |
| Developer source hash before and after | 4cc66197ebdb76e50c5dee4ff9895117b5703816759a5b3839e2c05c13f27e7e |
| Supplemental snapshot | /private/tmp/Bickers-Booking1-bootstrap-access-transfer-94d4a3d-20260721-101323.tar.gz |
| Supplemental snapshot SHA-256 | 4b5264e5616eae3973b5f25d7807b8acd360e2453cbcd6346708dd2c4686a3d3 |
| Dry-run cleanup patch | /private/tmp/Bickers-Booking1-bootstrap-access-cleanup-94d4a3d-20260721.patch |
| Dry-run patch SHA-256 | 9740a9dc052633fa6d95dcd3ecfbcb282b236bb57ebae1a11c282addbed04635 |
| Dry-run patch size | Three hunks; 2 insertions and 6 deletions in one file |
| Dry-run result | Applies cleanly, but deliberately not applied |
| Staged or committed | No |
| Status | Blocked |

The snapshot contains both route versions, Developer status/diff summaries, directly imported Firebase and account helpers, Clerk-to-Firebase bridge code, canonical-user and employee-linking utilities, all five active callers, relevant Platform Admin link/repair tools and focused authentication tests.

### Current bootstrap flow

1. AuthProvider requires a Clerk session and calls /api/auth/firebase-token without a request body.
2. The bridge obtains Clerk auth/currentUser, requires a verified @bickers.co.uk email, lists users and employees by matching email fields, then calls chooseLinkedUid.
3. The bridge creates a Firebase custom token containing authMethod: "clerk", clerkUserId and companyEmail claims and the client signs in to Firebase.
4. Five callers send the resulting Firebase ID token to /api/security/bootstrap-access: authContext, setup-mfa, verify-mfa, the Admin page and PlatformAdminShell.
5. Bootstrap verifies only that Firebase token, reads users/{verifiedUid} and mfaSecrets/{verifiedUid}, and requires a truthy currentUserDoc.uid plus centralized disabled-state checks.
6. Canonical Admin/Platform Admin roles bypass employee resolution. An ordinary user is resolved by the first employee whose document ID, uid or authUid equals the verified UID.
7. The route derives appAccess/defaultWorkspace from the employee, preserves canonical companyId in preference to employee companyId, mirrors selected fields into users/{verifiedUid}, resolves feature flags and returns { ok, repaired, access }.
8. A changed canonical record is patched once, followed by a non-blocking adminAuditLogs event. An unchanged record is returned without a write or audit.

The route does not read the request body. A caller cannot directly supply a UID, employee ID, role, company, workspace or module selection.

### OneDrive delta and preserved behavior

The complete OneDrive delta only:

- Deletes the already-unused sameEmail function.
- Removes the unused email parameter from findEmployeeForUser.
- Removes that unused argument at the caller.

It does not change identity, authentication, authorization, data writes, auditing or responses. It leaves employee document-ID matching, role/workspace derivation and every verified blocker below unchanged. Applying it would be cosmetic cleanup, not an authentication hardening transfer.

Because no application patch was applied, all Developer behavior and fields remain exactly unchanged. The current route may write uid, email, isEnabled, role, isService, appAccess, defaultWorkspace, companyId, conditional MFA fields, name, employeeId, updatedAt and accessMirroredAt. Existing canonical companyId wins over employee companyId; an existing name is preserved; unrelated user/profile fields are not included in the patch. Those preservation rules were inspected but not modified.

### Blocking identity and access findings

1. Employee-document-ID fallback is present in both copies: findEmployeeForUser accepts id === verifiedUid even when employee.uid and employee.authUid are absent. The exact-source harness confirmed such a record is treated as linked and its access is mirrored.
2. Canonical UID equality is not enforced. The route requires currentUserDoc.uid to be truthy but does not require it to equal the verified UID; the harness confirmed a mismatched value is silently overwritten with verifiedUid. This is automatic identity repair, contrary to the approved constraint.
3. Cross-company linkage is not rejected. A canonical company-1 user explicitly linked to a company-2 employee retains company-1 but receives the company-2 employee's workspace access. The harness confirmed this mixed record succeeds.
4. Missing explicit workspace access defaults to user access. normalizeAppAccess treats an employee with no appAccess as user-workspace enabled, and resolveDefaultWorkspace selects user. The harness confirmed this implicit grant.
5. Missing feature configuration defaults every DEFAULT_FEATURE_FLAGS entry to true in the returned access object. The harness confirmed finance and settings are enabled when platform/company configuration documents are absent.
6. Bootstrap cannot prove current Clerk assurance. verifyFirebaseIdToken returns UID/email only and discards the bridge's authMethod/clerkUserId/companyEmail claims. The harness confirmed an otherwise valid Firebase identity with no Clerk assurance represented at this boundary succeeds.
7. The preceding bridge uses email to select candidate user/employee records. Employees still require an explicit UID value before chooseLinkedUid returns one, but the user-record branch can fall back to a matching user document ID when data.uid is missing. Bootstrap later rejects a missing data.uid; nevertheless the bridge can mint a Firebase token before that fail-closed step. Duplicate matches are not rejected by the bridge.

The existing Developer audit work already removed email-only employee matching, hard-coded admin-email elevation, default-company recovery for Admin and automatic canonical-user creation. Missing canonical users, known disabled canonical accounts, known disabled employees, missing company for ordinary users, email-only employees and employees linked to another UID fail closed. Platform Admin remains based on canonical role and may omit companyId as intended.

### Why no patch was applied

The approved cleanup dry-runs cleanly, introduces no import or response change and would remove dead code. It cannot, however, satisfy the required statement that the resulting route uses only explicit employee UID associations and cannot accidentally grant access. Meeting that boundary requires a separately approved hardening patch and possibly coordinated changes to Firebase token claim verification and clerkFirebaseLink.js, plus production identity/access inventory before fail-closed defaults are changed.

Applying the cleanup now would create a misleading "completed" transfer while preserving the confirmed security violations. The application route therefore remains unchanged and the assessment is Blocked rather than completed.

### Shared uncommitted dependencies and manual blockers

| Dependency | SHA-256 | State or blocker |
|---|---|---|
| src/app/api/admin/_lib.js | 8a1df54c11b17b1fe71a915b0e7191abcca89a50ea254374b6aa864f810cb7dc | Modified/uncommitted; verifies Firebase tokens but does not expose/require Clerk bridge claims |
| src/app/utils/accountAccess.js | 73079e74920c19857f2f21b7bd200b3ea8a751df1f3d24dbfcfae5a4472a61ab | Untracked/uncommitted; supplies canonical/disabled/company predicates |
| src/app/api/auth/firebase-token/route.js | bf73bbebefe9fe19bc23bc38c2dd210b819db4e3c882da0c574016fed4bf39bc | Modified/uncommitted; requires verified Clerk email but resolves candidates by email |
| src/app/utils/clerkFirebaseLink.js | ad26b69b6ffb727ce4ebd8db89c22709a17994c4900b358dfdabc83339def258 | Untracked/uncommitted; candidate selection and UID fallback require separate review |
| src/app/api/_firebaseAdminRest.js | d57176d9f6522ba3201aed2e6343695479a11f137e292bd6f6a10b5e67007ce1 | Existing token/admin Firestore helper |

Employees without explicit authUid/uid, orphaned links, duplicate links, canonical UID mismatches and cross-company links remain manual data blockers. No production data was queried and no UID, employee association, company or role was invented. The previously reported production counts were not revalidated during this task.

### Tests and exact results

| Check | Result |
|---|---|
| Repository/commit revalidation | Passed; both repositories remained on main at 94d4a3d |
| Previous controlled-transfer hashes | Passed; all five remained unchanged |
| Supplemental snapshot | Passed and hash-recorded |
| Source comparison | Passed; only dead sameEmail/email-parameter cleanup differs |
| git apply --check for cleanup | Passed cleanly; patch intentionally not applied |
| Route syntax check | Passed |
| Related JavaScript syntax checks | Passed |
| PlatformAdminShell.jsx node syntax check | Not available; node --check does not support .jsx |
| Targeted ESLint excluding ignored JSX | Passed with zero findings |
| PlatformAdminShell.jsx ESLint | Not available under current configuration; file was ignored with one warning |
| Import presence/resolution | Passed for all direct local targets |
| Exact-source temporary bootstrap harness | 20/20 assertions passed; five assertions intentionally confirmed blocking behavior rather than security success |
| npm run test:access equivalent | Passed, 12/12; existing module-type warning only |
| node --test tests/authBoundary.test.mjs | Passed, 3/3; existing module-type warning only |
| Focused diff/formatting check | Passed for the unchanged Developer route |
| Caller and response-contract review | Passed; all five callers send only Authorization and consume data.access/error |
| Reverse-patch rollback validation | Not run because no patch was applied; rollback is unnecessary |
| Browser, live Clerk, Firebase Admin, production identity or production write | Not run |

No application test failure was introduced because no application file changed. The .jsx syntax/ESLint limitations are tooling availability issues, not application failures.

### Retention and next action

There is no new application change to retain or commit. The current Developer route retains the earlier fail-closed audit improvements but is not safe to approve under the explicit bootstrap constraint. Do not commit or describe the OneDrive cleanup as a completed security transfer.

The route needed a new, separately approved hardening scope covering explicit employee UID-only matching, canonical UID equality, cross-company rejection, fail-closed workspace/module configuration and verifiable Clerk-origin token assurance. That scope was subsequently approved and implemented in the controlled record below. Production link/default inventories remain required before rollout.

The rejected OneDrive cleanup remains unapplied. Bootstrap is no longer being handled as a file transfer; its separately approved hardening is recorded below.

## 13. Controlled hardening record — Clerk/Firebase identity bootstrap

Completed: 21 July 2026

| Field | Result |
|---|---|
| Active repository | /Users/masonbickers/Developer/Bickers-Booking1 |
| Branch and HEAD | main at 94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8 |
| Primary files changed | src/app/api/auth/firebase-token/route.js; src/app/api/security/bootstrap-access/route.js |
| Essential supporting file changed | src/app/api/admin/_lib.js |
| Focused test file added | tests/identityBootstrap.test.mjs |
| Bridge pre/post SHA-256 | bf73bbebefe9fe19bc23bc38c2dd210b819db4e3c882da0c574016fed4bf39bc → 824f3e52e232634f475aaa20b1d8f9f540da4f40d4bd4294784f15917b5c1739 |
| Bootstrap pre/post SHA-256 | 4cc66197ebdb76e50c5dee4ff9895117b5703816759a5b3839e2c05c13f27e7e → 1903588ea36f6d7a4e8d8f4cdb2d9cd8e157c65946110e1a591aa894ba397025 |
| Firebase verifier pre/post SHA-256 | 8a1df54c11b17b1fe71a915b0e7191abcca89a50ea254374b6aa864f810cb7dc → 15e1af0e00daea427ec7f650f526d54ce37ed133d1b364c44f634aed65b582f0 |
| Focused test SHA-256 | e1c921c671df0955d3eb7eda1e16d17072e9cd1157677e7b92893bd64f80b8f3 |
| Supplemental snapshot | /private/tmp/Bickers-Booking1-identity-bootstrap-hardening-94d4a3d-20260721-102210.tar.gz |
| Supplemental snapshot SHA-256 | dce7e923a3a6436a78091f0377c23d8beaff0c5e2c74671797f30cbed98d289f |
| Task delta before documentation | Bridge +309/-14; bootstrap +251/-83; verifier +7/-0; focused test +559/-0 |
| Staged, committed or deployed | No |

This was a new hardening task, not application of the rejected OneDrive cleanup. The OneDrive repository remained a read-only reference.

### Hardened identity flow

1. /api/auth/firebase-token requires an authenticated Clerk session and a verified @bickers.co.uk primary email.
2. Firebase UID selection is allowed only from explicit server-controlled links: Clerk externalId, Clerk privateMetadata.firebaseUid or a unique canonical users.clerkUserId/auth.clerkUserId record. Multiple explicit sources must agree.
3. Email matching is used only to report that a likely record lacks an explicit link or to verify consistency after UID resolution. It never selects the UID.
4. Canonical users/{uid}, when present, must have data.uid equal to the authenticated UID. Conflicting canonical UID or Clerk fields fail closed and are not repaired.
5. Ordinary users require exactly one active employee whose authUid/uid explicitly equals the same UID. Employee document ID is never an identity source; missing, conflicting, duplicate or other-UID links fail closed.
6. Canonical and employee email, employeeId and company relationships are checked for conflicts. Missing company fails for non-Platform-Admin users.
7. Workspace access must contain at least one explicit boolean. Explicit false/false is preserved; missing configuration returns 403.
8. The bridge issues a version-2 custom token carrying verifiedClerkEmail, clerkUserId, companyEmail, identityEmployeeId and identityCompanyId claims.
9. The shared verifier exposes those fields only after Firebase validates the same ID token. Bootstrap requires the version-2 Clerk assurance and revalidates employee/company state against Firestore.
10. A missing canonical user may be created only for a verified ordinary user with one explicit employee link, matching company, consistent email and explicit workspace configuration. Administrative roles are never created from employee data.
11. Missing module configuration resolves every known module flag to false. The resolved featureFlags map is persisted to users/{uid}, so later backend module checks cannot treat absence as allowed.
12. Canonical access is written through one atomic document patch. A failed patch returns 500 before the success audit; repeated calls become no-op/idempotent after the mirrored record converges.

Request bodies remain unused by both routes. UID, employee, role, company, workspace and module access cannot be supplied by a caller.

### Issues fixed and access made stricter

- Removed email-selected Firebase UID resolution from the active bridge.
- Removed employee-document-ID identity fallback from bootstrap.
- Rejected canonical UID, canonical Clerk ID and canonical employeeId conflicts rather than overwriting them.
- Rejected employee authUid/uid conflicts, other-UID links and duplicate links.
- Rejected canonical/employee company conflicts and bridge-to-bootstrap employee/company changes.
- Rejected disabled canonical and employee records, including isEnabled:false and status:"disabled".
- Removed superadmin/companyadmin alias elevation; only canonical platformAdmin/admin roles retain administrative behavior.
- Removed implicit user-workspace recovery and preserved explicit false/false access.
- Changed all missing module defaults from true to false and persisted the result.
- Rejected legacy/non-versioned Firebase, passkey and user-code assurance at bootstrap.
- Added non-sensitive blocked loginSecurityLogs events for bridge/bootstrap denials.

The successful response contracts remain { customToken, uid, email } for the bridge and { ok, repaired, access } for bootstrap. Existing callers already handle non-2xx errors generically, so no successful caller contract changed.

### Essential supporting change

src/app/api/admin/_lib.js was the only supporting helper modified. verifyFirebaseIdToken already validates the Firebase ID token through Identity Toolkit and decodes that same signed token. The additive return fields expose authMethod, clerkUserId, companyEmail, verifiedClerkEmail, identityLinkVersion, identityEmployeeId and identityCompanyId to bootstrap. This avoids duplicating or trusting unvalidated claim parsing in the route. Existing callers that use uid/email remain compatible.

clerkFirebaseLink.js was not modified. Its legacy chooseLinkedUid export remains covered by the older auth-boundary test but has no active application caller after this bridge change.

### Tests and exact results

| Check | Result |
|---|---|
| Target and related syntax checks | Passed |
| Targeted ESLint | Passed with zero findings on final run |
| Direct import resolution | Passed |
| Focused exact-source identity suite | Passed, 26/26 with `node --experimental-vm-modules --test tests/identityBootstrap.test.mjs` |
| Access-control suite | Passed, 12/12; existing module-type warning only |
| Authentication-boundary suite | Passed, 3/3; existing module-type warning only |
| git diff --check | Passed |
| Caller and response-contract review | Passed; one bridge caller and five bootstrap callers remain compatible |
| Reverse-patch rollback checks | Passed independently for bridge, bootstrap, verifier and new test |
| Firestore emulator suite | Blocked before test execution: firebase-tools 15.24.0 requires Java 21+, environment has Java 17.0.18 |
| Storage emulator suite | Not run; no Storage code/rules changed |
| Browser, live Clerk, Firebase Admin, production identity or production write | Not run |

The first focused-suite rerun reported two test-fixture failures because both explicit Clerk UID sources were not cleared in those fixtures; after correction the suite passed 25/25. Targeted ESLint then reported three test-only `module` variable-name violations; after renaming and adding the canonical-Clerk conflict case, the final suite passed 26/26 with zero lint findings. No application behavior assertion failed in those intermediate runs.

A final verification attempt using plain `node --test tests/identityBootstrap.test.mjs` failed 26/26 before any application assertion because this Node runtime does not expose `vm.SyntheticModule` without its experimental VM-modules flag. This was an invocation/configuration failure, not an application assertion failure. The immediate rerun with `--experimental-vm-modules` passed 26/26.

### Manual remediation and rollout blockers

Rollout will intentionally block any account that lacks one explicit Clerk-to-Firebase link. Acceptable links are Clerk externalId, Clerk privateMetadata.firebaseUid or unique canonical clerkUserId/auth.clerkUserId data. Public/unsafe Clerk metadata and email-only matches are not accepted.

Manual review is also required for employees without authUid/uid, duplicate or conflicting employee links, orphaned UIDs, canonical data.uid/document-ID mismatches, canonical employeeId conflicts, cross-company links, missing appAccess booleans and missing company/module configuration.

Exact production counts are not available because no production records or Clerk identities were read or changed. The earlier audit historically reported 12 employees without an auth UID and 3 orphaned employee UID links; those figures were not revalidated. The count of accounts lacking an explicit Clerk link and the count with missing workspace/module configuration are unknown and must be inventoried before rollout.

### Retention and approval decision

The source and test changes are safe to retain and are ready for a later authentication consolidation commit together. The verifier addition must not be separated from the bridge/bootstrap changes.

The code-level Clerk bridge and canonical bootstrap boundary now satisfies the approved fail-closed invariants. Operational approval remains Blocked until explicit Clerk links and access configuration are inventoried/remediated and a real Clerk → Firebase → bootstrap browser flow is tested. The Java 21 emulator blocker is unrelated to these server-route changes but remains part of the broader authentication audit.

Do not deploy these changes or continue to another audit item automatically.

### Local commit-readiness validation — 21 July 2026

The retained boundary was revalidated before staging or commit. Two confirmed fail-open gaps and one audit-data minimisation issue were found and fixed within the same authentication scope:

1. The bridge now rejects an employee whose `authUid`/`uid` fields conflict and include the resolved UID even when that employee has a different email. It therefore cannot mint a Firebase token before bootstrap later discovers the same conflict.
2. `AuthProvider` no longer treats a failed `/api/security/bootstrap-access` call as an optional result and fall back to `users/{uid}`. A denial, malformed success response or request failure clears cached access and signs out both Firebase and Clerk.
3. Successful bootstrap audit entries now copy only an allowlisted access snapshot. Arbitrary canonical-user fields are not duplicated into `adminAuditLogs`.

The validation added `scripts/identity-access-inventory.mjs`, a separately gated read-only diagnostic. It reads only `users`, `employees`, `settings`, `platformCompanies` and Clerk users; it has no Firestore/Clerk write operation, prints counts and record identifiers without email addresses, separates confirmed inconsistencies from email-only hints, and returns non-zero only for execution/configuration failures. It was exercised only with in-memory fixture data. Production was not accessed.

Later, after explicit approval and with the required Clerk/Firebase read credentials, run from the canonical repository:

`IDENTITY_INVENTORY_CONFIRM_READ_ONLY=1 node scripts/identity-access-inventory.mjs --production --project=bickers-booking`

Additional files now belonging to the boundary commit are `src/app/context/authContext.js` and `scripts/identity-access-inventory.mjs`. Final source SHA-256 values are:

- Firebase bridge: `59f563f6ef087dc71b560e5374afdb4749e551c9beb7aa6052e40a019309f569`
- Bootstrap: `5f3eeffe7d7fe2b25e9db3ddf7bb24ccc3e35fe8c32ec212a9dd10d30f597470`
- Firebase verifier: `15e1af0e00daea427ec7f650f526d54ce37ed133d1b364c44f634aed65b582f0`
- Auth context: `b2aeb0d6bca8d0f226f136f059ec70b4715a30f705455459a34d254a11f39184`
- Focused test: `c647690875b674555b12381fcec61c03074d5b00fd205d0ee2b686742033516f`
- Read-only inventory: `9cb7aca3b2ebd569a8974bdaeedaf7dfe669f1e7176c1465e8c5d60f2fba036b`

Validation results: syntax passed; targeted ESLint passed with zero findings; focused identity suite passed 30/30; access-control passed 12/12; authentication-boundary passed 3/3; import/static and formatting checks passed. The inventory CLI also refused to run without an explicit fixture or production mode as designed.

Java 21 is not installed. Java is `17.0.18`; local Firebase CLI is `15.24.0` and requires Java 21 for the emulator. No emulator test ran. The required Homebrew installation command is `brew install openjdk@21`; after installation, use `export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"` and prepend `$JAVA_HOME/bin` for the validation shell without changing the system-wide Java default.

Commit-readiness decision: **READY TO COMMIT WITH MANUAL FOLLOW-UP** as one isolated authentication-boundary group. Before deployment, run the Firestore emulator suite under Java 21, execute the approved read-only production inventory, remediate explicit-link/configuration findings, and complete a real Clerk → Firebase → bootstrap browser test against an explicitly approved environment.

## 14. Tests required after transfer

### Patch and static validation

- git apply --check for every patch before application.
- Recompute file hashes and inspect git diff --check.
- Run node --check for every transferred JavaScript file.
- Run targeted ESLint on all authentication files, then npm run lint.
- Confirm no missing imports and no missing package scripts are accidentally introduced.

### Unit and integration tests

- npm run test:access
- node --test tests/authBoundary.test.mjs
- Add focused tests for login-notification, device-token, passkey and statistics guards.
- Add admin-user deletion tests covering self-delete, cross-company targets, ordinary users, Admin, Platform Admin and any intentionally protected account policy.
- Cover signed-out, invalid/expired token, missing canonical user, disabled flags, missing company, wrong module, wrong role and cross-company request-body manipulation.

### Firebase emulator tests

- Run npm run test:firestore-rules with Java 21 and a complete Firebase CLI installation.
- Resolve, rather than ignore, Firestore deny-path expression-limit diagnostics.
- Run the Storage emulator against tests/storageAccess.rules.test.mjs, including anonymous, missing user, disabled user, same/cross-company paths, workspace separation and legacy paths.
- Do not use production rules deployment as a test.

### Build and manual checks

- Run npm run build from the Developer path and distinguish pre-existing appearance warnings from transfer failures.
- Manually test Clerk login/logout, unverified email, missing/incorrect UID link, disabled account, company-less account, MFA enrol/challenge, direct private URLs and direct API requests.
- Confirm legacy Storage objects remain available only under the explicitly accepted migration policy.
- Do not claim browser, Clerk Dashboard, production-data or deployment testing unless actually completed.

## 15. Rollback

Because the Developer worktree is already dirty, do not use git reset --hard or replace the repository directory.

- Keep the pre-transfer snapshots and the exact forward patches with hashes.
- Apply one reviewed group at a time.
- Before commit, roll back a transferred group only with its reviewed reverse patch after git apply --reverse --check succeeds.
- After commit, use a normal revert commit for that isolated group.
- If a file has received later edits, restore only the affected hunks through a manual three-way merge against the pre-transfer snapshot.
- Never restore package-lock.json, BICKERS_WORKTREE_RECONCILIATION.md, appearance files, conflict copies or nested .codex repositories from the OneDrive copy.

## 16. Final assessment

| Question | Result |
|---|---|
| Recommended canonical path | /Users/masonbickers/Developer/Bickers-Booking1 |
| Authentication files already identical | 18 |
| Authentication files initially safe to transfer without semantic merge | 7 |
| Completed controlled transfers | 5 — login-notification/route.js, device-tokens/route.js, passkeys/_lib.js, mfa/setup/route.js and mfa/verify/route.js |
| Remaining approved narrow transfers | 1 — BICKERS_PAGE_AUDIT_TRACKER.md; bootstrap-access/route.js was reclassified blocked |
| Authentication files requiring manual merge | 2 |
| Authentication files blocked | 4 |
| Safe raw whole-file copies | 0 |
| Risk of losing Developer work with direct copy | High: package-lock, reconciliation evidence, appearance/statistics work and conflict-copy evidence could be overwritten or obscured |
| OneDrive future role | Read-only historical backup after verified transfer and remote backup |

Recommended next approved consolidation file after separate explicit approval: docs/BICKERS_PAGE_AUDIT_TRACKER.md. Bootstrap hardening now requires a new scope and must precede any claim that the authentication boundary is approved. Do not start with rules, a directory copy or the statistics/admin-user files.
