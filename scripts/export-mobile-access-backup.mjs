import { writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const outputPath = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9);
if (!outputPath) {
  throw new Error("A new backup path is required: --output=/absolute/path.json");
}

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
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
  throw new Error("Firebase service account environment variables are required.");
}

const firebaseApp =
  getApps()[0] ||
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

function serialiseAuthUser(user) {
  return {
    uid: user.uid,
    email: user.email || "",
    emailVerified: user.emailVerified === true,
    disabled: user.disabled === true,
    displayName: user.displayName || "",
    providerIds: (user.providerData || [])
      .map((provider) => provider.providerId)
      .filter(Boolean),
    metadata: {
      creationTime: user.metadata?.creationTime || "",
      lastSignInTime: user.metadata?.lastSignInTime || "",
      lastRefreshTime: user.metadata?.lastRefreshTime || "",
    },
  };
}

const [employeeSnapshot, userSnapshot, authUsers] = await Promise.all([
  db.collection("employees").get(),
  db.collection("users").get(),
  listAllAuthUsers(),
]);

const backup = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  projectId,
  employees: employeeSnapshot.docs.map((document) => ({
    id: document.id,
    data: document.data() || {},
  })),
  users: userSnapshot.docs.map((document) => ({
    id: document.id,
    data: document.data() || {},
  })),
  authUsers: authUsers.map(serialiseAuthUser),
};

const resolvedOutputPath = path.resolve(outputPath);
await writeFile(resolvedOutputPath, `${JSON.stringify(backup, null, 2)}\n`, {
  flag: "wx",
  mode: 0o600,
});

console.log(
  JSON.stringify({
    ok: true,
    output: resolvedOutputPath,
    employees: backup.employees.length,
    users: backup.users.length,
    authUsers: backup.authUsers.length,
  })
);
