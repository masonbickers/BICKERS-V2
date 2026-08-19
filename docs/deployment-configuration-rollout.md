# Deployment configuration rollout

This change is code-only. It does not require Firestore writes, migrations, Firebase rule deployment, Clerk changes, storage changes, or new variables on the existing Bickers deployment.

## Bickers compatibility gate

Run with all `APP_*` deployment variables absent:

```sh
npm run config:validate
npm run audit:deployment-admins
npm run verify:production
```

The administrator audit is read-only. It compares the configured historical break-glass addresses with canonical `users/{uid}.role` records and exits non-zero for missing, disabled, or mismatched users. Never use it to rewrite live roles.

Before promotion, record in the release ticket:

- current production Vercel deployment ID;
- names (not values) of the current production environment variables;
- named release owner, tester, rollback owner, maintenance date, and maintenance window;
- audit output and the exact candidate commit.

## Isolated customer preview

Use a separate Vercel project connected only to isolated Firebase and Clerk resources. Set `APP_DEPLOYMENT_PROFILE=customer` and every required identity field listed in `.env.example`. Keep emergency bootstrap disabled unless a reviewed recovery procedure explicitly requires it.

Verify login allow/deny behavior, disabled users, MFA, navigation branding, `/manifest.json`, invoice preview and issue snapshots, security-email previews, and invoice-delivery previews. Do not connect this preview to Bickers production data or identity resources.

## Production smoke and rollback

During the named low-risk window, smoke-test one Bickers platform admin, admin, user-only, service-only, disabled, and MFA account, followed by one internal invoice issue and email preview. Monitor configuration failures, authentication denials, appearance resolution, and email failures for 24 hours.

If existing behavior differs, promote the recorded prior Vercel deployment immediately. This change has no database migration, so no database rollback is required.
