# Release Readiness Runbook

This runbook is for finishing the Bickers Booking System for controlled internal use. It is intentionally about closure, not new features.

## Scope Freeze

During finalisation, accepted changes must fit one of these categories:

- Bug fix
- Security/access fix
- User-flow cleanup
- Documentation or release prep
- Test/checklist coverage

Do not add new product features until the controlled rollout is complete.

## Release Branch Checklist

1. Review `git status --short`.
2. Review `docs/release-worktree-review.md`.
3. Confirm each changed file belongs to the release.
4. Do not delete or revert unrelated user work without explicit approval.
5. Create the release branch only after the working tree has been reviewed.
6. Run all automated checks before deployment.

Required checks:

```powershell
npm.cmd run lint
npm.cmd run test:access
npm.cmd run build
```

## Pre-Deployment Checklist

- README and `docs/finalisation-checklist.md` are current.
- Known issues are recorded in `docs/known-issues.md`.
- Firestore rules and Storage rules are reviewed.
- Firebase data backup/export is available.
- Environment variables are confirmed for Clerk, Firebase, DVLA, OpenAI, MFA, webhook, and cron/API secrets.
- Admin, platform admin, user-only, service-only, hybrid, disabled, and MFA flows have been tested.

## Support During Pilot

- Pilot users report issues to the named support owner.
- Issues are triaged as blocker, high, medium, or low.
- Blockers stop wider rollout until fixed.
- Medium/low issues can stay in known issues if there is a clear workaround.

## Rollback Notes

If rollout has to be reversed:

1. Revert the Vercel deployment to the previous stable deployment.
2. Re-deploy the previous Firestore/Storage rules if rules changed.
3. Use the Firebase backup/export only if data corruption occurred.
4. Record the rollback reason and affected flows in `docs/known-issues.md`.
