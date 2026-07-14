import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function adminApp() {
  if (getApps().length) return getApps()[0];

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "bickers-booking";
  const clientEmail =
    process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL ||
    process.env.FIREBASE_CLIENT_EMAIL ||
    "";
  const privateKey = (
    process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    process.env.FIREBASE_PRIVATE_KEY ||
    ""
  ).replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Firebase Admin service-account configuration is missing.");
  }

  return initializeApp({
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export const getAdminDb = () => getFirestore(adminApp());
export const getAdminAuth = () => getAuth(adminApp());
export const getAdminStorage = () => getStorage(adminApp());
