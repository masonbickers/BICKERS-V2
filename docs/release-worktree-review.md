# Release Worktree Review

This file records what must be reviewed before creating a clean release branch.

## Current Release-Critical Changes

These are expected finish-phase changes:

- Lint/build gate cleanup.
- Access/admin allowlist consistency.
- Login landing route cleanup.
- Visible text encoding cleanup.
- Finalisation, known issues, release readiness, and access-control docs.
- Access-control test expansion.
- Lint-warning cleanup in legacy and workflow pages.

## Needs Owner Confirmation Before Release Branch

The current working tree also contains broader platform/admin and security changes that should be reviewed before release:

- `src/app/api/platform/`
- `src/app/platform-admin/branding/`
- `src/app/platform-admin/feature-control/`
- Platform admin component/page rewrites.
- Firebase rules and access-control note changes.
- Vehicle page changes.
- Dashboard security/access related changes.

## Do Not Remove Without Approval

- `.codex-worktree-vehicle`
- Any modified platform-admin or vehicle files
- Any untracked platform API routes

These may be intentional work from earlier passes. Treat them as pending owner review, not cleanup debris.

## Release Branch Rule

Create the release branch only after every file in `git status --short` is either:

- included intentionally,
- parked in a separate branch,
- or explicitly removed with owner approval.
