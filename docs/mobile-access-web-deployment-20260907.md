# Mobile access web fixes — production deployment

Deployed and verified on 2026-09-07.

- Code commit: `8cc462383a1da67d9b4f5485bcf22d2302357a2d`
- Branch: `codex/mobile-access-web-deploy-20260907`
- Production: https://bickers-v2.vercel.app
- Deployment: `dpl_7nGzQkYrvPSXqNAts7T6iC1kZYCd`
- Candidate: https://bickers-v2-ki7sg54nd-bickers-projects.vercel.app
- Rollback: `dpl_76QmAbfc7rTvTW7LAS8B9ASKABQX`
  (https://bickers-v2-9uy7myz84-bickers-projects.vercel.app)

The release starts from the verified live commit `55f479a3` and changes only
the employee-edit page and its personnel-save regression tests. It adds inline
mobile approval success/error feedback and reads the linked user's current role
before building the employee-save access patch, preserving administrator roles.

The earlier commit used a Mac placeholder author email. This release uses the
existing authenticated Vercel identity, `mason@bickers.co.uk`. The web repository's
local Git author email is now corrected; no project permissions or deployment
protection settings were changed and no pushed history was rewritten.

Verification: 827 unit tests passed, edited files passed ESLint, TypeScript passed,
and Vercel production build completed Ready. Candidate login returned HTTP 200;
the protected mobile-access API rejected an unauthenticated empty request with
HTTP 401. After promotion, the public alias resolved to the new deployment and
the authenticated employee page displayed Platform Admin, active mobile access,
and no Firestore permission failures. The deployment-scoped error-log scan
returned no entries; this is a spot check, not ongoing monitoring. No invitations
were sent and no employee records were saved as part of verification.

No Firebase rules, dependencies, backend settings or store releases changed.
The signature-recognition backend/mobile change remains a separate release.
Preserve this release when preparing future deployments from main; the production
code is on the release branch above, not merged into main by this deployment.
