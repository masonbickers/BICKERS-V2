import nextEnv from "@next/env";
import { GoogleAuth } from "google-auth-library";

import { auditDeploymentAdminRoles } from "../src/app/config/deploymentAdminAudit.js";
import { requireValidDeploymentConfig } from "../src/app/config/deploymentConfigCore.js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function firestoreValueToJs(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return firestoreFieldsToJs(value.mapValue?.fields || {});
  if ("arrayValue" in value) return (value.arrayValue?.values || []).map(firestoreValueToJs);
  return undefined;
}

function firestoreFieldsToJs(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, firestoreValueToJs(value)])
  );
}

async function listCanonicalUsers() {
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
    throw new Error(
      "Firebase service account env vars are required: FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }

  const auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const client = await auth.getClient();
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users`;
  const users = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await client.request({ url: `${baseUrl}?${params.toString()}` });
    for (const document of response.data?.documents || []) {
      users.push({ data: firestoreFieldsToJs(document.fields || {}) });
    }
    pageToken = response.data?.nextPageToken || "";
  } while (pageToken);
  return users;
}

try {
  const config = requireValidDeploymentConfig(process.env);
  const users = await listCanonicalUsers();
  const result = auditDeploymentAdminRoles(users, config);
  if (result.mismatches.length) {
    console.error("Deployment administrator audit failed:");
    result.mismatches.forEach((row) => {
      const rawRole = row.rawRole && row.rawRole !== row.actualRole ? `, stored as ${row.rawRole}` : "";
      console.error(`- ${row.email}: expected ${row.expectedRole}; ${row.status} (${row.actualRole}${rawRole})`);
    });
    process.exitCode = 1;
  } else {
    console.log(`Deployment administrator audit passed (${result.checked} configured addresses checked).`);
  }
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
