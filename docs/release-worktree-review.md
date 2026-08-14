# Release Worktree Review

The mixed working tree captured on 14 August 2026 has been reconciled onto
`codex/pilot-release-v3.1`.

## Recovery Point

- Rollback commit: `9a0295bdaef7014cac3dd451d7d6909ec8650626`.
- External archive: `/Users/masonbickers/Desktop/Projects/Bickers-Booking1-recovery/2026-08-14-phase1-pre-reconcile`.
- The archive contains a complete bundle for the active branch and `origin/main`,
  a binary tracked-file patch, the untracked-file and status manifests, a source
  snapshot, and SHA-256 manifests.
- The bundle verifies, representative tracked and untracked files match the
  snapshot, and the binary patch applies to a clean checkout of the bundled
  active branch.

## Reconciliation Decisions

- The complete current product was accepted as the pilot release scope.
- Canonical files retained the newer and expanded behavior from divergent
  conflict copies. Identical and superseded `* 2.*` and `*-MacBook Pro (2)*`
  copies were removed after archive verification.
- Next.js conflict caches, temporary review PDFs/reports, extraction output,
  Playwright output, logs, and machine-local artifacts are excluded.
- Booking, HR, finance, fleet, maintenance, analytics, activity tracking,
  platform administration, APIs, rules, migrations, and tests are retained.

## Commit Groups

1. `c7856540` — generated workspace artifacts and ignore rules.
2. `3ae431ff` — accepted pilot product workflows and their tests.
3. `b1db29de` — access control, Firebase rules, login, and administration.
4. Release metadata and verification evidence follow as the final candidate
   commit.

## Release Rule

The draft pull request may be published after automated clean-checkout
verification. Do not create the `v3.1.0-rc.1` tag until the manual role and
workflow checklist in `docs/finalisation-checklist.md` has a named tester and
completion date.
