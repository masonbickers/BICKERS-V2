import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith("#")) return env;
    env[match[1]] = match[2].replace(/^(\"|')(.*)\1$/, "$2");
    return env;
  }, {});
}

const env = { ...loadEnv(path.join(root, ".env.local")), ...process.env };
const apply = process.argv.includes("--apply");
const incidentArg = process.argv.find((arg) => arg.startsWith("--incident-at="));
const companyArg = process.argv.find((arg) => arg.startsWith("--company-id="));
const incidentAt = String(incidentArg?.slice("--incident-at=".length) || "").trim();
const companyId = String(companyArg?.slice("--company-id=".length) || "bickers-action").trim();
const incidentMs = Date.parse(incidentAt);

function required(name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function clerkRequest(pathname, options = {}) {
  const response = await fetch(`https://api.clerk.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${required("CLERK_SECRET_KEY")}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Clerk request ${pathname} failed with HTTP ${response.status}.`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function listClerkUsers() {
  const users = [];
  for (let offset = 0; ; offset += 100) {
    const page = await clerkRequest(`/users?limit=100&offset=${offset}`);
    const rows = Array.isArray(page) ? page : page?.data || [];
    users.push(...rows);
    if (rows.length < 100) return users;
  }
}

function preferredEmail(user) {
  const addresses = Array.isArray(user?.email_addresses) ? user.email_addresses : [];
  return normalizeEmail(
    addresses.find((entry) => entry.id === user.primary_email_address_id)?.email_address ||
      addresses[0]?.email_address
  );
}

async function revokeClerkSessions(userId) {
  const sessions = await clerkRequest(`/users/${encodeURIComponent(userId)}/sessions`);
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (["revoked", "ended", "expired"].includes(String(session?.status || ""))) continue;
    await clerkRequest(`/sessions/${encodeURIComponent(session.id)}/revoke`, { method: "POST" });
  }
}

async function main() {
  if (!incidentAt || !Number.isFinite(incidentMs)) {
    throw new Error("Pass a valid --incident-at=<ISO timestamp>.");
  }
  if (apply && !process.argv.includes("--confirm-compromised-hashes")) {
    throw new Error("Apply mode also requires --confirm-compromised-hashes.");
  }

  const projectId = String(env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");
  const app = getApps()[0] || initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: required("FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL"),
      privateKey: required("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
  const firestore = getFirestore(app);
  const firebaseAuth = getAuth(app);
  const [clerkUsers, accessSnapshot] = await Promise.all([
    listClerkUsers(),
    firestore.collection("users").get(),
  ]);

  const affected = clerkUsers.filter((user) => {
    const email = preferredEmail(user);
    return Boolean(user?.external_id && user?.password_enabled && email.endsWith("@bickers.co.uk"));
  });
  const accessRecords = accessSnapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
  let matched = 0;
  let changed = 0;
  let unmatched = 0;

  for (const clerkUser of affected) {
    const email = preferredEmail(clerkUser);
    const externalId = String(clerkUser.external_id || "").trim();
    const access = accessRecords.find(({ id, data }) =>
      id === externalId || String(data?.uid || "") === externalId || normalizeEmail(data?.email) === email
    );
    if (!access) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    if (!apply) continue;

    await firestore.collection("users").doc(access.id).set({
      clerkUserId: clerkUser.id,
      companyId: String(access.data?.companyId || companyId),
      credentialResetRequired: true,
      credentialIncidentAt: new Date(incidentMs).toISOString(),
      credentialResetCompletedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await clerkRequest(`/users/${encodeURIComponent(clerkUser.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        public_metadata: {
          ...(clerkUser.public_metadata || {}),
          credentialResetRequired: true,
          credentialIncidentAt: new Date(incidentMs).toISOString(),
        },
      }),
    });
    await Promise.all([
      revokeClerkSessions(clerkUser.id),
      firebaseAuth.revokeRefreshTokens(externalId || access.id),
    ]);
    changed += 1;
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    identification: "Clerk password-enabled @bickers.co.uk users with a Firebase external_id",
    affected: affected.length,
    matched,
    unmatched,
    changed,
    companyId,
    incidentAt: new Date(incidentMs).toISOString(),
  }, null, 2));

  if (unmatched) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Credential containment stopped: ${error?.message || error}`);
  process.exitCode = 1;
});
