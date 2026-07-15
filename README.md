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
2. Copy `.env.example` to `.env.local` and add the Clerk, Firebase, and service keys used by this deployment.
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

Clerk owns interactive sign-in, password recovery, passkeys, and the browser session. After Clerk signs a user in, the server maps the verified `@bickers.co.uk` email to the existing employee/user record and issues a short-lived Firebase custom token. This compatibility session lets the existing Firestore rules continue to use the established Firebase UID while Clerk is the source of login identity.

Before running the app, create a Clerk application and add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env.local`. Disable public sign-up in Clerk and restrict access to the `bickers.co.uk` domain; the server bridge also enforces the domain and requires an existing active employee/user record.

Legacy Firebase setup-code and passkey login token routes return `410` by default. `ALLOW_LEGACY_FIREBASE_LOGIN=true` exists only as a short-term emergency rollback switch and should remain off after Clerk is live. Disable Firebase Email/Password sign-in in the Firebase console once the Clerk rollout has been validated; Firebase custom-token sign-in must remain enabled for Firestore compatibility.

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

1. Confirm the affected Clerk user exists and uses the same `@bickers.co.uk` email as the employee/user record.
2. Confirm the mapped `users/{uid}` record has `isEnabled: true`.
3. During the compatibility phase, confirm the mapped Firebase Auth UID still exists and is enabled so Firestore can accept the bridged session.
4. Confirm `role`, `appAccess`, and `defaultWorkspace` match the intended workspace.
5. Run the bootstrap access flow by signing in, or use the admin/security tooling to re-sync.
6. For platform admin access, confirm the email is listed in `src/app/utils/adminAccess.js` and in Firestore rules where required.
