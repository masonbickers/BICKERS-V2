# Bickers Booking working-tree reconciliation

Captured: 20 July 2026, Europe/London
Inspection scope: `/Users/masonbickers/Developer/Bickers-Booking1`
Inspection rule: read-only until creation of this report; no existing repository file was modified, deleted, restored, renamed, staged, committed, merged, or reconciled.

## PR #8 controlled revision — 22 July 2026

Following remote review, PR #8 was narrowed to the safe API-access changes, their required caller adjustment, focused API-authorization tests, and reconciliation documentation. The tenant-isolation candidate is not shipping in this PR: Firestore rules, Storage rules, tenant query/write helpers, Storage-path helpers, rule-emulator tests and their package tooling are restored to `main` behavior.

This preserves visibility of existing records without `companyId`, introduces no composite-index requirement, leaves legacy Storage paths and timesheet-message authorization unchanged, and makes no claim that tenant enforcement is ready for deployment. The deferred rollout requires its own production-data preparation and authorization review.

## Executive conclusion

The repository is not safe for ordinary development yet. There is coherent, apparently intentional authentication and tenant-isolation work, but it is mixed with line-ending churn, OneDrive conflict copies, three anomalous nested Git repositories, and a small number of incomplete cross-file changes.

The initial top-level state contained 69 changed entries:

- 42 unstaged tracked entries
- 27 untracked files
- 0 staged entries
- 23 tracked files with substantive content changes
- 16 tracked files whose only content difference from `HEAD` is CRLF/LF line endings
- 3 dirty gitlink/nested-repository entries
- 20 untracked OneDrive conflict-copy files
- 7 other untracked files that form coherent source, test, and audit work

This report itself is an additional untracked file created after those totals were frozen.

## 1. Repository state

| Item | Captured value |
|---|---|
| Repository | `/Users/masonbickers/Developer/Bickers-Booking1` |
| Branch | `main` |
| Commit | `94d4a3d09ba233a34a2e58b0e0d9f5c8d1b045b8` |
| Remote | `origin` |
| Fetch URL | `https://github.com/masonbickers/BICKERS-V2.git` |
| Push URL | `https://github.com/masonbickers/BICKERS-V2.git` |
| Upstream | `origin/main` |
| Ahead / behind | `0 / 0`, using the locally recorded remote-tracking reference; no fetch was performed |
| Staged changes | None |
| Unstaged tracked entries | 42 |
| Untracked files | 27 |

### Full initial status

```text
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
```

### Diff summaries

There are no staged diffs.

Raw unstaged diff, including line-ending churn:

```text
42 files changed, 17,583 insertions(+), 10,116 deletions(-)
```

After ignoring CRLF/LF-only changes and excluding the lockfile's mechanical expansion, the meaningful top-level diff is:

```text
25 entries changed, 272 insertions(+), 228 deletions(-)
```

The 25 entries comprise 22 meaningful source/configuration files and 3 dirty gitlinks. `package-lock.json` is additionally substantive and is discussed separately.

### Relevant ignored files

| Ignored path | Classification | Relevance |
|---|---|---|
| `.env`, `.env.local`, `.env.local.save` | Configuration/secrets | Expected to remain ignored; excluded from the safety archive. |
| `.next/`, `.next-dev/` | Generated build output | Generated caches. Recent `.next` timestamps came from the preceding read-only audit build, not an active writer. |
| `.vercel/` | Generated/deployment metadata | Not part of the working-tree changes. |
| `node_modules/` | Generated dependencies | Not part of the working-tree changes. |
| `firestore-debug.log` | Temporary diagnostic | Safe candidate for later cleanup, never for source control. |
| `.DS_Store`, `bickers-booking/.DS_Store` | OS metadata | Safe candidates for later cleanup. |

### Active writer check

`lsof` found no Node, Next.js, Firebase, npm, or other application process holding files beneath the repository. The only open handles were the shell and inspection commands themselves. Process enumeration through `pgrep` was unavailable in the sandbox, so the conclusion is based on open-file inspection plus generated-file timestamps. At capture time there was no evidence of an active application writer.

The tracked generated file `src/app/generated/buildInfo.js` is content-clean against `HEAD`. Its modification time reflects the earlier audit build, whose content change was restored before this reconciliation began.

## 2. Safety snapshot

A non-destructive compressed snapshot was created outside the repository:

```text
/private/tmp/Bickers-Booking1-worktree-snapshot-94d4a3d-20260720T1445BST.tar.gz
Size: 22,002,835 bytes
SHA-256: f38e4954a76f9cc6ebc3dee352422098f0895fcfaa7f73cbfd1de4819ead01a7
Created: 2026-07-20T14:42:40+0100
```

It contains the current source tree, untracked source, conflict copies, documentation, and nested repository working files. It excludes Git internals, dependency folders, build caches, logs, and environment-secret files. The commit IDs and deleted-file state of the nested repositories are recorded below because an archive of the current filesystem cannot itself preserve deleted content.

## 3. Classification model and totals

Primary categories are used once per top-level changed entry. Conflict-copy duplicate status is also shown as a secondary category because categories 3, 9, and 10 naturally overlap.

| Category | Count | Meaning in this tree |
|---|---:|---|
| 1. Intentional source change | 18 | Coherent tracked authentication, access-control, API, tenant-isolation, and test work. |
| 2. Intentional new file | 6 | Three source helpers and three tests required by the tracked changes. |
| 3. OneDrive conflict copy | 20 | All untracked; 16 content-equivalent after line-ending normalization, 4 substantively different. |
| 4. Generated build output | 0 changed | Generated output exists only in ignored paths. |
| 5. Dependency or lockfile change | 2 | `package.json` and `package-lock.json`. |
| 6. Configuration change | 3 | Firestore rules, Storage rules, and Clerk middleware. |
| 7. Documentation or audit output | 1 | Existing page-audit tracker. This report is additional and post-capture. |
| 8. Temporary or diagnostic file | 3 | Dirty nested `.codex-*` Git repositories represented as gitlinks. |
| 9. Duplicate with no unique content | 16 | Tracked files whose worktree content equals `HEAD` after CRLF normalization. |
| 10. Duplicate containing unique content | Secondary: 4 | Four of the 20 conflict copies differ semantically from their canonical files. |
| 11. Unclear and requiring manual review | Secondary: 7 | The four unique conflict copies and three nested Git repositories. |

## 4. Intentional tracked work

### Authentication and canonical-account boundary

| File | Purpose | Related new files | Assessment |
|---|---|---|---|
| `src/app/api/auth/firebase-token/route.js` | Requires a verified Clerk email, centralizes disabled-account checks, and stops inventing a Firebase UID from an employee document ID. | `accountAccess.js`, `clerkFirebaseLink.js`, `authBoundary.test.mjs` | Intentional and coherent; must be retained with all three untracked dependencies. |
| `src/app/api/admin/_lib.js` | Adds a fail-closed active-user boundary based on canonical user records, company access, feature flags, and database roles rather than email allowlists. | `accountAccess.js` | Intentional security hardening. |
| `src/app/api/mfa/setup/route.js` | Requires a canonical account and centralized disabled-state checks before MFA setup. | `accountAccess.js` | Intentional. |
| `src/app/api/mfa/verify/route.js` | Applies the same canonical-account and disabled-state checks during verification. | `accountAccess.js` | Intentional. |
| `src/app/api/security/bootstrap-access/route.js` | Removes email-based admin elevation and default access recovery; requires an existing canonical UID, company, and active employee/account relationship. | `accountAccess.js` | Intentional fail-closed change; security-sensitive and should receive focused review. |
| `src/app/context/authContext.js` | Uses canonical account state instead of email allowlists and signs out missing/disabled records. | `accountAccess.js` | Intentional; cannot be committed without the new helper. |
| `src/app/components/ProtectedLayout.js` | Adds role, module, workspace, MFA, and landing-route enforcement in the client shell. | Existing access-control helpers | Intentional but tightly coupled to middleware and auth-context changes. |
| `src/app/utils/accessControl.js` | Preserves an explicit denial of both workspaces instead of silently granting user access. | Existing test updated | Intentional. |
| `tests/accessControl.test.mjs` | Adds coverage for explicit denial of both workspaces. | `accessControl.js` | Intentional. |

### Protected server endpoints

| File | Purpose | Related new files | Assessment |
|---|---|---|---|
| `src/app/api/chatgpt/route.js` | Replaces local token verification and client-supplied role trust with the shared active-user/module boundary. | `accountAccess.js` through admin auth library | Intentional security hardening. |
| `src/app/api/dvla/mot-history/route.js` | Requires an active Clerk-linked account before DVSA history access. | `_clerkAccess.js` | Intentional; currently performs a full user-list scan through the helper and should be reviewed for scale later. |
| `src/app/api/dvla/vehicle/route.js` | Applies the same active Clerk boundary to vehicle lookup. | `_clerkAccess.js` | Intentional. |
| `src/app/api/dvla/mot-history/sync/route.js` | Replaces duplicated Firebase/email-admin checks with the shared database-role admin boundary. | Admin auth library | Intentional and simplifies duplicated code. |

### Tenant and storage isolation

| File | Purpose | Related new files | Assessment |
|---|---|---|---|
| `src/app/utils/firestoreAccess.js` | Requires a canonical UID/company, adds company filters to tenant queries, and stamps company IDs on writes. | Firestore rules tests | Intentional tenant-isolation work. |
| `src/app/utils/storageAccess.js` | Prefixes legacy storage paths with `companies/{companyId}`. | Storage rules tests | Intentional. |

### Appearance workflow

| File | Purpose | Assessment |
|---|---|---|
| `src/app/admin/_components/AppearanceAdminEditor.jsx` | Sends the current draft with the publish request so unsaved valid edits can be published deliberately. | Intentional, newer than its conflict copy. |
| `src/app/api/admin/appearance/route.js` | Accepts and validates a submitted draft during publish and introduces `appearanceDocumentId`. | Intentional but internally inconsistent: `appearanceDocumentId` is not exported by `appearanceModel.js`. Manual merge required. |
| `src/app/api/admin/appearance/migrate/route.js` | Requests legacy appearance data during migration and also introduces `appearanceDocumentId`. | Intentional but has the same missing-export problem. Manual merge required. |

## 5. Configuration changes

| File | Purpose | Assessment |
|---|---|---|
| `firestore.rules` | Changes signed-in fallbacks to canonical enabled-user, workspace, and company-scoped rules; narrows employee and timesheet writes. | Intentional, security-sensitive, and paired with new emulator tests. |
| `storage.rules` | Requires enabled canonical users, company/path scope, and workspace-specific access. | Intentional and paired with a new emulator test. |
| `src/middleware.js` | Protects non-public, non-API application pages with Clerk middleware. | Intentional and coupled to `ProtectedLayout.js`. |

## 6. Dependency and lockfile changes

| File | Purpose | Assessment |
|---|---|---|
| `package.json` | Adds Firebase rules test dependencies and test/audit scripts. | Partly incomplete: `audit:service-access` references missing `scripts/service-access-readiness-report.mjs`; `test:service-readiness` references missing `tests/serviceAccessReadiness.test.mjs`. The Firestore rules script is backed by an existing untracked test. There is no script for `storageAccess.rules.test.mjs`. |
| `package-lock.json` | Regenerated after adding `@firebase/rules-unit-testing@^4.0.1` and `firebase-tools@^15.24.0`. | Coherent with the two new dev dependencies but mechanically very large. Review and commit with `package.json`, never alone. |

The lockfile root dependency change is limited to the two Firebase development packages. Its large 15,465-addition/8,042-deletion diff is mainly dependency-graph expansion and serialization/line-ending churn from Firebase Tools and its transitive dependencies.

## 7. Intentional untracked files

| File | Classification | Purpose | Retain? |
|---|---|---|---|
| `src/app/api/auth/_clerkAccess.js` | Intentional new source | Shared active Clerk-user and canonical-account enforcement for DVLA endpoints. | Yes; tracked files import it. |
| `src/app/utils/accountAccess.js` | Intentional new source | Central disabled, canonical-record, and company-access predicates. | Yes; multiple tracked files import it. |
| `src/app/utils/clerkFirebaseLink.js` | Intentional new source | Verified-email and stable Firebase UID selection logic. | Yes; Firebase-token route imports it. |
| `tests/authBoundary.test.mjs` | Intentional new test | Covers verified email, UID selection, and fail-closed account checks. | Yes. |
| `tests/firestoreServiceAccess.rules.test.mjs` | Intentional new test | Covers signed-out/disabled denial, tenant queries, workspace boundaries, writes, and platform scope. | Yes. |
| `tests/storageAccess.rules.test.mjs` | Intentional new test | Covers signed-out/disabled denial and company/workspace path isolation. | Yes; add an explicit script later. |
| `docs/BICKERS_PAGE_AUDIT_TRACKER.md` | Documentation/audit output | Broad page/API/data-access inventory and review tracker. | Retain separately from security implementation commits. |

## 8. Tracked files with no unique content

The following 16 tracked files are not byte-identical to `HEAD`, but become identical after removing carriage returns. They contain no source-level change and should not be included in a functional commit:

```text
.githooks/pre-commit
src/app/admin/_components/AppearanceAdminEditor.module.css
src/app/admin/content-labels/page.js
src/app/admin/global-styling/page.js
src/app/admin/global-styling/page.module.css
src/app/api/appearance/route.js
src/app/api/statistics/_auth.js
src/app/api/statistics/_briefingService.js
src/app/api/statistics/business-rules/route.js
src/app/api/statistics/daily-briefing/feedback/route.js
src/app/api/statistics/daily-briefing/generate/route.js
src/app/api/statistics/daily-briefing/route.js
src/app/api/theme/route.js
src/app/page.module.css
src/app/settings/ai-business-rules/page.js
src/app/settings/ai-business-rules/page.styles.module.css
```

These are candidates for later restoration to the repository's chosen line-ending policy, but no restoration was performed. A `.gitattributes` policy should be agreed before any bulk normalization.

## 9. Conflict-copy inventory and checksums

All 20 conflict copies in the working tree are untracked. None is byte-identical to its canonical file because the copies use different line endings. Sixteen are source-equivalent after CRLF normalization. Four contain substantive differences.

| Conflict copy | Likely canonical file | Conflict SHA-256 | Canonical SHA-256 | Exact bytes? | Normalized result |
|---|---|---|---|---|---|
| `.githooks/pre-commit-MacBook Pro (2)` | `.githooks/pre-commit` | `cc34f032a584910fbeac0a3bf278c3c608010ddd9fe1a7fcc67d3d4550539254` | `b35be97942100e50320baae265116df164bd78cee93543e2c72761aaacbd55d6` | No | Equivalent |
| `package-MacBook Pro (2).json` | `package.json` | `51a8d7ea73ca70740077bb24ee550d523fc56da75e1afa79cd63464c1019b5cf` | `b3d52e7d65bc672e26b93ca2bdd0cc02becb29177406f25e8b84b4880d45e5dc` | No | Unique |
| `src/app/settings/ai-business-rules/page-MacBook Pro (2).js` | `src/app/settings/ai-business-rules/page.js` | `bc8377c76dff9fb91728727c12466ecb6be4366e2b68e49d3df5153de4c66190` | `135d248e4a19c0e522face6509539e2748e3eb1b070dfb5c36907ddd3266c67c` | No | Equivalent |
| `src/app/settings/ai-business-rules/page.styles.module-MacBook Pro (2).css` | `src/app/settings/ai-business-rules/page.styles.module.css` | `9cec2e26d2b92e4a21f37497f46510b9611e4e968788fdf1c42b8826805cd508` | `4d7ff369a38c8234b28099de719dfac203695123ad95c68fd269b445d7e17dce` | No | Equivalent |
| `src/app/admin/global-styling/page.module-MacBook Pro (2).css` | `src/app/admin/global-styling/page.module.css` | `2c230aea05f9fb2e1c9c426cd48f96678c7f679427335f0c082e919327c6c3c6` | `8aa22ab8107e2e4e76437ee232be9e589a19ab4e3c0f1336e3af6f0c340bec4e` | No | Equivalent |
| `src/app/admin/global-styling/page-MacBook Pro (2).js` | `src/app/admin/global-styling/page.js` | `ee806ff567afc06e6283f0e19624e87f516dc0ec19b5d87d52dda26103c24638` | `e5added7139a159cf815ddc6fe242afd2ba7fe5ad5627dea2e4c3eb3220147be` | No | Equivalent |
| `src/app/admin/content-labels/page-MacBook Pro (2).js` | `src/app/admin/content-labels/page.js` | `d2ed882e50eeb940faba3eb629976bf68f7918a735a39ced8b776272d85aedb4` | `1b9d932f727ba5a624ea0f24059664d91bdf084436b9bc3af14a7dc00f28bf40` | No | Equivalent |
| `src/app/admin/_components/AppearanceAdminEditor.module-MacBook Pro (2).css` | `src/app/admin/_components/AppearanceAdminEditor.module.css` | `22bef363f7dece6f781b7cd1d47d2679b7b1b47436aa69df09f662e2d7b0fa19` | `100546011235f5a0a839fbf421c9ee9e4cbeb791ebdf1d8a3a4a5f23a34ff2b6` | No | Equivalent |
| `src/app/admin/_components/AppearanceAdminEditor-MacBook Pro (2).jsx` | `src/app/admin/_components/AppearanceAdminEditor.jsx` | `40abe296ac93968c1abd9f295c388df2b808a2d72c0af349662ac3e8a6e45706` | `cb37ae9c976f23e4a31e0c1005ccb28c03177eacd02913d1dbcb64b188f7272c` | No | Unique |
| `src/app/page.module-MacBook Pro (2).css` | `src/app/page.module.css` | `4cc9c0f5606b1daa4c883f1e1835ec671bfe291d4012d18001754cefc08f1867` | `3d7ed7aef42369f92e851790e0ac2db4eb599b1bf2f2a640b15c24cf3443d354` | No | Equivalent |
| `src/app/api/statistics/business-rules/route-MacBook Pro (2).js` | `src/app/api/statistics/business-rules/route.js` | `c2f01e0328669e5adafcd6644fac99f4f52ed9f21514e6ee15de1901295d9ae0` | `b9f9059e29e106493c5fefd4215b3bfc31ada1eb198ace7ba70869f7f26cc4a6` | No | Equivalent |
| `src/app/api/statistics/daily-briefing/feedback/route-MacBook Pro (2).js` | `src/app/api/statistics/daily-briefing/feedback/route.js` | `909d304fa64b1f5fe7317456fdbfc5a88f3d940edd8d3c244a445b1500302fe9` | `04a96d96fd99b56c321b7d19629e80f5a6ac03cc9ebf000d6ee3fab0710c59e6` | No | Equivalent |
| `src/app/api/statistics/daily-briefing/route-MacBook Pro (2).js` | `src/app/api/statistics/daily-briefing/route.js` | `cd50db9a11dfe17e08743a6a611d07178c70d4d315bb98c056d1837afc61c5ab` | `f01b44f73c6513cd10f1a59063f4aa2cb085972376a609e5b35c5316a6afb788` | No | Equivalent |
| `src/app/api/statistics/daily-briefing/generate/route-MacBook Pro (2).js` | `src/app/api/statistics/daily-briefing/generate/route.js` | `26b05444a0b3bc360ae53f355300ad7216a1edf500c61bff51462791c757e038` | `941b11bb04a5dbe8cee4e66e5fcb197c403739f79a5e0483bdfe060020785451` | No | Equivalent |
| `src/app/api/statistics/_briefingService-MacBook Pro (2).js` | `src/app/api/statistics/_briefingService.js` | `3fd13c20b731efd70b7b1cd2a1bf67ff90bfae762b9336e96cc4e9710d2c033f` | `e7d3fe74b1365750d46dd27a881afce5c2ca424f818dcc80104fea17336b6e89` | No | Equivalent |
| `src/app/api/statistics/_auth-MacBook Pro (2).js` | `src/app/api/statistics/_auth.js` | `b1dbacc1efb7002a2df73ecd0c1ae4c1912e866a621c603677bd72fb24fa5ed2` | `b6dc7fdac0a8a5bf0ce5383a76161fe05d408f91399c16a1716e9e4aae2443a5` | No | Equivalent |
| `src/app/api/appearance/route-MacBook Pro (2).js` | `src/app/api/appearance/route.js` | `61be070ce797b791992eee1a8123d7a4f660259dc13326afaa716d637972e2a1` | `4a37417ad2b97a2b6dbb26eb97bc7cc85ac4bdf09a999cfe01f398245b3599af` | No | Equivalent |
| `src/app/api/admin/appearance/migrate/route-MacBook Pro (2).js` | `src/app/api/admin/appearance/migrate/route.js` | `32c95eb57e3e37baf7c538835fe9342da3c07c7ebd68723653c0fef41054dc21` | `1cb5fa56f8e0414da7ef6a8af416b28668ee03cb60e3fbffb2838df7e5389a04` | No | Unique |
| `src/app/api/admin/appearance/route-MacBook Pro (2).js` | `src/app/api/admin/appearance/route.js` | `3e186344f720d5749ce7fd8922615e8d9bbccc32f05c5678fdb73f29c7066dab` | `0be52d3c52585ac88aa09f35e921ec6738537bc19ea5e701554a85f0a69426ed` | No | Unique |
| `src/app/api/theme/route-MacBook Pro (2).js` | `src/app/api/theme/route.js` | `b0e0b2e0897d8f6338d1142f80db4cb880b15db20c6180c197d7778e7e0933a6` | `5a2343939979610135b102a926412691af1a37ef41b3096dc86e94b116da42a9` | No | Equivalent |

### Semantic comparison of the four unique conflict copies

| Conflict copy | Semantic difference | Unique or newer code? | Recommendation |
|---|---|---|---|
| `package-MacBook Pro (2).json` | Older package manifest without Firebase emulator dependencies or the new audit/test scripts. Canonical file is newer by timestamp and contains the active tooling changes. | Unique by omission only; no newer functionality. | Retain canonical `package.json`. Keep the copy only until the dependency/tooling group is reviewed; it is safe to remove later after approval. |
| `AppearanceAdminEditor-MacBook Pro (2).jsx` | Conflict copy publishes without sending the current draft; canonical sends `{ action: "publish", draft }`. | Older behavior, no desirable newer code. | Retain canonical editor behavior. Copy is safe to remove later after approval. |
| `appearance/migrate/route-MacBook Pro (2).js` | Conflict copy uses `state.companyId` directly and does not request legacy data. Canonical adds `includeLegacy: true` but imports missing `appearanceDocumentId`. | Copy contains a useful direct-ID implementation that avoids the missing export; canonical contains newer migration behavior. | Manual merge: retain canonical legacy migration intent and resolve document-ID handling deliberately. Do not discard this copy until that is done. |
| `appearance/route-MacBook Pro (2).js` | Conflict copy uses `state.companyId` directly and publishes the stored draft. Canonical accepts a submitted draft but imports missing `appearanceDocumentId`. | Copy contains the useful direct-ID fix; canonical contains newer publish-draft behavior. | Manual merge: retain canonical submitted-draft behavior and incorporate a valid document-ID strategy. Do not discard this copy until that is done. |

No conflict copy is newer than its canonical file by modification time. Two of the four unique copies nevertheless contain a useful fix not present in the canonical files.

### Conflict-named files inside `.git`

Two additional conflict-named files exist inside Git metadata. They are not working-tree files and do not appear in `git status`:

| Metadata file | Canonical metadata file | Conflict SHA-256 | Canonical SHA-256 | Meaning |
|---|---|---|---|---|
| `.git/logs/refs/remotes/origin/agent/current-platform-update-MacBook Pro (2)` | `.git/logs/refs/remotes/origin/agent/current-platform-update` | `44a44581dda28782c497cb38dfbab4b2aa9a784a9eadaf4cf20406a033d4d0ec` | `b5a7cd486598154e0f534e1bc470928e49502fd87f637f50279859fb500e1fb8` | Older reflog line versus current remote-tracking reflog. Never edit manually. |
| `.git/logs/refs/remotes/origin/agent/statistics-ui-and-toolbar-updates-MacBook Pro (2)` | `.git/logs/refs/remotes/origin/agent/statistics-ui-and-toolbar-updates` | `3ea3d7639f41a1067db67337d5bc2f9bc24ad9a0d0aeec68b5a27b6aba01d1ef` | `c44312cf38124f80a312d2653e02b71fc8f5ab5db00259ffe8e1c8c11302bb67` | Older reflog line versus current remote-tracking reflog. Never edit manually. |

These indicate that the repository's `.git` directory was previously exposed to sync-conflict behavior. They should be handled only through Git-aware backup/recovery procedures, not ordinary file deletion.

## 10. Nested Git repository risk

The three `.codex-*` paths are tracked as gitlinks (`mode 160000`) in the parent commit, but the parent has no `.gitmodules` file. Each directory is also a standalone Git repository with extensive internal changes. The parent therefore records only each gitlink as one dirty entry, hiding hundreds of nested changes from the top-level totals.

| Path | Recorded commit | Branch | Local divergence | Internal state |
|---|---|---|---|---|
| `.codex-emergency-rules` | `e002ea2dee272126b6aaf575a6966fb6a6a83ec9` | `codex/emergency-rules` | ahead 1, behind 57 | 180 modified, 7 deleted, 0 untracked |
| `.codex-user-email-rules` | `7d88cb01c782743189cfcb1ec0503a9f71608a1f` | `codex/user-email-rules` | ahead 0, behind 52 | 180 modified, 7 deleted, 0 untracked |
| `.codex-worktree-vehicle` | `4e4855e1aa8c05d2e9f13ff8ffe2f956a5e7a9fd` | detached/no branch shown | no upstream | 291 modified, 7 deleted, 0 untracked |

The nested diffs show widespread full-file line-ending churn plus deleted package manifests and other files. These directories require manual judgment as independent repositories. Do not treat them as ordinary generated folders and do not remove them until their branch commits and internal worktrees have been reviewed or separately archived.

## 11. Incomplete or inconsistent work

1. `src/app/api/admin/appearance/route.js` and its migration route import `appearanceDocumentId`, but `src/app/utils/appearanceModel.js` exports no such function. This is the known production-build warning. The conflict copies contain the direct-ID approach and must be consulted during manual merge.
2. `package.json` references `scripts/service-access-readiness-report.mjs`, which does not exist.
3. `package.json` references `tests/serviceAccessReadiness.test.mjs`, which does not exist.
4. `tests/storageAccess.rules.test.mjs` exists but has no package script.
5. Multiple tracked files import `src/app/utils/accountAccess.js` and `src/app/api/auth/_clerkAccess.js`; those helpers are still untracked. Committing only tracked files would break the build.
6. Firestore and Storage rule tests require Firebase emulators. The current machine cannot start them because its Java runtime is older than the Firebase CLI's Java 21 requirement. The tests therefore remain unverified in this environment.
7. Sixteen tracked files and sixteen conflict copies are source-equivalent after line-ending normalization. Committing that churn would obscure review and increase future conflict risk.
8. The parent repository has three gitlinks without `.gitmodules` mappings. Their intended lifecycle and ownership are unclear.

## 12. Files safe to remove later

No file was removed during this task. Subject to explicit approval after the safety snapshot is verified:

- The 16 normalized-equivalent conflict copies are clearly redundant.
- `package-MacBook Pro (2).json` and `AppearanceAdminEditor-MacBook Pro (2).jsx` contain no desirable newer code and are safe after their comparisons are accepted.
- `.DS_Store` files, `firestore-debug.log`, and ignored build caches are ordinary cleanup candidates.
- The 16 tracked line-ending-only modifications can be restored to the repository's agreed line-ending representation, but this must be done with an explicit, narrow operation after `.gitattributes` policy is decided.

The two unique appearance API conflict copies are not safe to remove until their document-ID fix has been merged or otherwise preserved. The three `.codex-*` directories are not safe to remove.

## 13. Changes that must be retained

- The three untracked source helpers and three new tests.
- The 23 substantive tracked changes, pending review, because they form a coherent security and tenant-isolation effort.
- `package.json` and `package-lock.json` as a pair if the Firebase emulator tooling is retained.
- `docs/BICKERS_PAGE_AUDIT_TRACKER.md` as a separate audit artifact.
- Both sides of the two unique appearance API pairs until manual merge is complete.
- All three nested repository directories until their independent work is resolved.

## 14. Recommended commit groupings

Do not commit until conflict-copy and nested-repository decisions are complete. When approved, the intended work should be separated into reviewable groups:

1. **Canonical Clerk/Firebase account linkage**
   `accountAccess.js`, `clerkFirebaseLink.js`, Firebase-token route, and `authBoundary.test.mjs`.
2. **Application and server access boundary**
   Admin auth library, bootstrap route, auth context, protected layout, access-control helper/test, middleware, and MFA routes.
3. **Tenant-isolated Firestore and Storage**
   Firestore/Storage helpers, rules, emulator tests, and only the required package tooling.
4. **Protected assistant and DVLA endpoints**
   `_clerkAccess.js`, ChatGPT route, and the three DVLA routes.
5. **Appearance draft and migration workflow**
   Editor and the two API routes only after manually reconciling document-ID handling and eliminating the missing export.
6. **Audit documentation**
   Page audit tracker and this reconciliation report.
7. **Repository hygiene**
   Line-ending policy and conflict-copy removal as a separate non-functional operation, never mixed with source changes.
8. **Nested repository decision**
   Handle each `.codex-*` gitlink independently; do not mix it into any application commit.

## 15. Recommended safe order of operations

1. Verify the external snapshot checksum and retain it until reconciliation is complete.
2. Keep development servers and sync tools stopped during reconciliation.
3. Create a dedicated reconciliation branch only after explicit approval.
4. Preserve and manually merge the useful direct-ID logic from the two appearance API conflict copies into the newer canonical behavior.
5. Review the three nested Git repositories independently and decide whether they are intentional gitlinks, archived work, or accidental embedded clones.
6. Review the coherent authentication/tenant-isolation groups and ensure every imported new helper is included.
7. Decide whether the missing service-readiness script/test should be recovered or their package scripts removed; add a Storage rule-test script if intended.
8. Establish `.gitattributes`/line-ending policy, then remove only line-ending-only tracked noise with explicit approval.
9. Remove normalized-equivalent conflict copies only after the unique four have been resolved and the snapshot remains available.
10. Run lint, unit tests, Java 21 Firebase emulator tests, and a clean production build.
11. Commit in the groups above. Do not begin wider audit or Sage work until the repository is clean and those checks pass.

## 16. Risk and final counts

| Question | Result |
|---|---:|
| Clearly intentional files in the initial state | 30 |
| Byte-for-byte exact conflict-copy duplicates | 0 |
| Conflict copies equivalent after CRLF normalization | 16 |
| Tracked modifications equivalent to `HEAD` after CRLF normalization | 16 |
| Conflict copies containing substantive differences | 4 |
| Conflict copies containing useful unique code to preserve | 2 |
| Primary top-level entries requiring manual judgment | 7 |

The seven manual-judgment entries are the four unique conflict copies and the three nested Git repositories. The four canonical counterparts to the unique copies must also participate in those decisions.

### Recommended first reconciliation action

After the user verifies the external snapshot, create an approved reconciliation branch and manually reconcile the two appearance API conflict pairs first. Preserve the canonical legacy-migration and publish-draft behavior while resolving the missing `appearanceDocumentId` strategy using the direct-ID logic found in the conflict copies. Do not remove any conflict copy until that merge has been reviewed.
