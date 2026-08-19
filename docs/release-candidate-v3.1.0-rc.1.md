# Release Candidate v3.1.0-rc.1

Date: 14 August 2026

Branch: `codex/pilot-release-v3.1`

Base target: `main`

## Scope

This candidate reconciles the complete current Bickers product without changing
the existing single-company model, public routes, Firebase/Clerk compatibility,
collection names, or production environment-variable contract.

## Automated Evidence

The local `npm run verify:production` gate passed on 14 August 2026:

- 551/551 Node unit and regression tests passed.
- 10/10 Firestore rule tests passed.
- 4/4 Storage rule tests passed.
- ESLint passed.
- TypeScript passed with incremental output disabled.
- The Next.js production build generated all 155 static pages successfully.
- 18/18 Playwright workflows passed across desktop Chrome, mobile Chrome, and
  mobile Safari.
- The static access audit found no company-isolation risks in its configured
  scan.
- Secret-pattern, conflict-marker, duplicate-filename, whitespace, and
  release-visible file-size scans passed.

The exact final candidate commit must also pass `npm run verify:clean-checkout`
from a fresh temporary checkout before the draft PR is published.

## Non-blocking Warnings

- Node reports `MODULE_TYPELESS_PACKAGE_JSON` while directly loading ES module
  utility files in the Node test runner. Tests still execute and pass.
- Clerk reports that middleware `createRouteMatcher` is deprecated. Migration to
  resource-level authorization belongs in a separately reviewed security change.
- Application typography uses a bundled system-font stack so production builds
  do not depend on downloading Google Fonts.
- The OneDrive-backed local checkout can produce Git `mmap` timeouts. Commits are
  created with index preloading disabled; the clean-checkout gate runs from a
  temporary local directory.

## Manual Gate

The manual role and end-to-end workflow checklist remains required before the RC
tag is created. Record the tester and date in `docs/finalisation-checklist.md`.
The draft PR must remain a draft until this evidence is attached.

## Recovery

Rollback to commit `9a0295bdaef7014cac3dd451d7d6909ec8650626` or restore from:

`/Users/masonbickers/Desktop/Projects/Bickers-Booking1-recovery/2026-08-14-phase1-pre-reconcile`

The recovery bundle, patch, source snapshot, manifests, and checksums were
verified before any conflict or generated artifact was removed.
