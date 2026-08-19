import crypto from "node:crypto";

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
const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const base64Url = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const accessToken = async () => {
  if (!clientEmail || !privateKey) {
    throw new Error(
      "Firebase service account env vars are required: FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Firebase admin token failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).access_token;
};

const valueToJs = (value) => {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return fieldsToJs(value.mapValue?.fields || {});
  if ("arrayValue" in value) return (value.arrayValue?.values || []).map(valueToJs);
  return undefined;
};

const fieldsToJs = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, valueToJs(value)]));

export async function listFirestoreDocuments(collection) {
  const token = await accessToken();
  const documents = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${firestoreBaseUrl}/${collection}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Firestore read failed for ${collection}: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    (body.documents || []).forEach((document) => {
      documents.push({
        id: String(document.name || "").split("/").pop(),
        data: fieldsToJs(document.fields || {}),
      });
    });
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return documents;
}

export async function listFirestoreDocumentsRaw(collection) {
  const token = await accessToken();
  const documents = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${firestoreBaseUrl}/${collection}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Firestore read failed for ${collection}: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    documents.push(...(body.documents || []));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return documents;
}
