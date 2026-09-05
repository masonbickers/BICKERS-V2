import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const FIREBASE_PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "bickers-booking";

const SERVICE_ACCOUNT_CLIENT_EMAIL =
  process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL ||
  process.env.FIREBASE_CLIENT_EMAIL ||
  "";

const SERVICE_ACCOUNT_PRIVATE_KEY = (
  process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY ||
  process.env.FIREBASE_PRIVATE_KEY ||
  ""
).replace(/\\n/g, "\n");

const ADMIN_APP_NAME = "bickers-booking-auth-admin";

function getFirebaseAuthAdminApp() {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) return existing;

  if (!SERVICE_ACCOUNT_CLIENT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error(
      "Firebase service account env vars are required for mobile account invitations."
    );
  }

  return initializeApp(
    {
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: SERVICE_ACCOUNT_CLIENT_EMAIL,
        privateKey: SERVICE_ACCOUNT_PRIVATE_KEY,
      }),
      projectId: FIREBASE_PROJECT_ID,
    },
    ADMIN_APP_NAME
  );
}

export function getFirebaseAuthAdmin() {
  return getAuth(getFirebaseAuthAdminApp());
}
