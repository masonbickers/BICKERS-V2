import crypto from "node:crypto";

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

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

let cachedToken = null;

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function ensureServiceAccountConfig() {
  if (!SERVICE_ACCOUNT_CLIENT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error(
      "Firebase service account env vars are required: FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }
}

function createServiceAccountJwt() {
  ensureServiceAccountConfig();

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: SERVICE_ACCOUNT_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(SERVICE_ACCOUNT_PRIVATE_KEY);

  return `${unsigned}.${base64Url(signature)}`;
}

export async function getFirebaseAdminAccessToken() {
  ensureServiceAccountConfig();

  if (cachedToken?.accessToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken;
  }

  const assertion = createServiceAccountJwt();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firebase admin token failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 0) * 1000),
  };
  return cachedToken.accessToken;
}

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
  return Object.entries(fields).reduce((acc, [key, value]) => {
    acc[key] = firestoreValueToJs(value);
    return acc;
  }, {});
}

export function jsToFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(jsToFirestoreValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.entries(value).reduce((acc, [key, nested]) => {
          acc[key] = jsToFirestoreValue(nested);
          return acc;
        }, {}),
      },
    };
  }
  return { stringValue: String(value) };
}

function updateMask(fieldPaths) {
  const params = new URLSearchParams();
  fieldPaths.forEach((fieldPath) => params.append("updateMask.fieldPaths", fieldPath));
  return params.toString();
}

export async function adminReadDocument(collection, documentId) {
  const token = await getFirebaseAdminAccessToken();
  const res = await fetch(
    `${FIRESTORE_BASE_URL}/${collection}/${encodeURIComponent(documentId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Admin Firestore read failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return firestoreFieldsToJs(data.fields || {});
}

export async function adminPatchDocument(collection, documentId, patch, options = {}) {
  const token = await getFirebaseAdminAccessToken();
  const deleteFields = options.deleteFields || [];
  const fieldPaths = [...Object.keys(patch), ...deleteFields];
  const fields = Object.entries(patch).reduce((acc, [key, value]) => {
    if (!deleteFields.includes(key)) acc[key] = jsToFirestoreValue(value);
    return acc;
  }, {});

  const res = await fetch(
    `${FIRESTORE_BASE_URL}/${collection}/${encodeURIComponent(documentId)}?${updateMask(fieldPaths)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );

  if (!res.ok) throw new Error(`Admin Firestore update failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function adminCreateDocument(collection, data) {
  const token = await getFirebaseAdminAccessToken();
  const fields = Object.entries(data).reduce((acc, [key, value]) => {
    acc[key] = jsToFirestoreValue(value);
    return acc;
  }, {});

  const res = await fetch(`${FIRESTORE_BASE_URL}/${collection}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) throw new Error(`Admin Firestore create failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function adminListDocuments(collection) {
  const token = await getFirebaseAdminAccessToken();
  const docs = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${FIRESTORE_BASE_URL}/${collection}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`Admin Firestore list failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    (data.documents || []).forEach((doc) => {
      docs.push({
        id: String(doc.name || "").split("/").pop(),
        data: firestoreFieldsToJs(doc.fields || {}),
      });
    });
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return docs;
}
