# Bickers Booking System

Internal operations platform for Bickers Action. The app manages bookings, diary views, jobs, HR, timesheets, vehicles, equipment, maintenance, finance queues, H&S records, U-Crane workflows, security setup, and platform/admin tooling.

## Status

Current release readiness target: controlled pilot use before final business rollout.

Green checks required before rollout:

- `npm.cmd run lint`
- `npm.cmd run test:access`
- `npm.cmd run build`
- Manual pilot checklist in `docs/finalisation-checklist.md`

## Local Setup

1. Install dependencies with `npm.cmd install`.
2. Create `.env.local` with the Firebase and service keys used by this deployment.
3. Run the app with `npm.cmd run dev`.
4. Open `http://localhost:3000`.

PowerShell may block `npm.ps1` on some Windows machines. Use `npm.cmd` for all commands.

## Main Commands

- `npm.cmd run dev` starts the local Next.js dev server.
- `npm.cmd run build` creates a production build.
- `npm.cmd run lint` runs ESLint through the supported CLI.
- `npm.cmd run test:access` runs access-control unit tests.
- `npm.cmd run migrate:employee-access` migrates employee access fields when needed.

## Access Model

JS-side admin/platform allowlists live in `src/app/utils/adminAccess.js`.

- Admin emails: Mason, Paul, and Adam.
- Platform admin email: Mason only.
- Firestore rules keep their own explicit allowlist because Firebase rules cannot import app code.

Employee and user access is based on:

- `role`
- `isService`
- `appAccess.user`
- `appAccess.service`
- `defaultWorkspace`
- `isEnabled`

The app resolves landing routes from the active workspace. User workspace lands on `/screens/homescreen`; service workspace lands on `/service/home`.

## Deployment Notes

- Deploy the Next.js app through the configured Vercel project.
- Deploy Firestore and Storage rules after changes with the Firebase CLI.
- Confirm disabled users, MFA setup, trusted-device MFA, and service-only accounts before releasing.
- Keep a recent Firebase backup/export before final rollout.
- Follow `docs/release-readiness.md` before any final pilot deployment.
- Track pilot blockers and accepted workarounds in `docs/known-issues.md`.

## Admin Recovery

If access becomes inconsistent:

1. Confirm the affected Firebase Auth user exists and is enabled.
2. Confirm `users/{uid}` has `isEnabled: true`.
3. Confirm `role`, `appAccess`, and `defaultWorkspace` match the intended workspace.
4. Run the bootstrap access flow by signing in, or use the admin/security tooling to re-sync.
5. For platform admin access, confirm the email is listed in `src/app/utils/adminAccess.js` and in Firestore rules where required.
