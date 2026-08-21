#!/usr/bin/env node

import crypto from "node:crypto";
import { listFirestoreDocuments } from "./lib/firebase-admin-readonly.mjs";

const apply = process.argv.includes("--apply");
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

const SOURCE = "Sage Vehicle List August 2026.xlsx";
const assignments = [
  ["xMYmjitJjd0RTwj4C0ak", "serialNumber", "C241289", "061", "0061"],
  ["tGM3rfPlR8BiYgG13lwE", "serialNumber", "C402638", "062", "0062"],
  ["qyolncUMl6SJuVAsS3Do", "serialNumber", "BA3", "063", "0063"],
  ["C6GeNwtJSdYJtoSErjkb", "serialNumber", "U341 0384", "065", "0065"],
  ["KvzFQLS0pG0C55Po5O4H", "serialNumber", "U638 3731", "065", "0066"],
  ["aXk0xSkFPvmLIRWkr7eR", "serialNumber", "R94 2572", "067", "0067"],
  ["cE63Z2sthaiyderfka1j", "serialNumber", "H479 5054", "068", "0068"],
  ["CkpZGiTZLmqJ9CUMehEm", "serialNumber", "ADAA75", "069", "0069"],
  ["Ln6Q3vDdIJ5dO5eerEix", "name", "Brian James Trailer - Small Process Trailer", "071", "0071"],
  ["ToIMY2jJVm4iYGoEGIKe", "serialNumber", "GD84 Mk3 No. 0596527", "072", "0072"],
  ["u3j51W1sS5qJjQZMgI4K", "serialNumber", "G473 4294", "073", "0073"],
  ["TOgGpbr5yhfMxbLqKvqF", "name", "Ifor Williams Medium Box Trailer", "073", "0073"],
  ["k6ORY3j9QDkDc7vDvcvu", "serialNumber", "C302151", "070", "0074"],
  ["tsQcVHi23JU5dOcm7CdS", "serialNumber", "C234735", "076", "0076"],
  ["Ijc77vRhnFwXfCN9Ms4T", "name", "Invertor Power Packs", "091", "0091"],
  ["LkEckHQD9aOKTkD8gaYL", "name", "Heavy Duty Tow Dolly", "092", "0092"],
  ["J2D04q1voElXjYuh4mHj", "name", "Medium Tow Dolly (Braked)", "093", "0092"],
  ["Nl8PlYiQxSFcMBc7y9Wz", "name", "Mini Low Loader trailer", "096", "0096"],
  ["mW2hVfcVUuANI5IjtghM", "serialNumber", "C608232", "109", "0109"],
  ["NJjG7ENYuOTw9haY9kOO", "name", "Process Trailer - Tohaco Air Ride trailer", "0114", "0114"],
  ["W2AAEUMniXsboqo02Zil", "name", "Small Tow Dolly (Braked)", "118", "0118"],
].map(([id, matchField, expectedIdentity, expectedAsset, assetNumber]) => ({
  id,
  matchField,
  expectedIdentity,
  expectedAsset,
  assetNumber,
}));

const normalizeIdentity = (value) =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const base64Url = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

let cachedToken = "";
async function accessToken() {
  if (cachedToken) return cachedToken;
  if (!clientEmail || !privateKey) {
    throw new Error("Firebase service account environment variables are required.");
  }
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  )}`;
  const assertion = `${unsigned}.${base64Url(
    crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey)
  )}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Firebase token failed: ${response.status} ${await response.text()}`);
  }
  cachedToken = (await response.json()).access_token;
  return cachedToken;
}

async function patchEquipment(id, assetNumber) {
  const token = await accessToken();
  const fields = {
    asset: { stringValue: assetNumber },
    assetNumber: { stringValue: assetNumber },
    sageAssetNumber: { stringValue: assetNumber },
    assetNumberSource: { stringValue: SOURCE },
    assetNumberAssignedAt: { timestampValue: new Date().toISOString() },
  };
  const params = new URLSearchParams();
  Object.keys(fields).forEach((field) => params.append("updateMask.fieldPaths", field));
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/equipment/${encodeURIComponent(id)}?${params}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!response.ok) {
    throw new Error(`Equipment ${id} update failed: ${response.status} ${await response.text()}`);
  }
}

const currentEquipment = new Map(
  (await listFirestoreDocuments("equipment")).map(({ id, data }) => [id, data || {}])
);
const report = [];

for (const assignment of assignments) {
  const current = currentEquipment.get(assignment.id);
  const currentIdentity = current?.[assignment.matchField] || "";
  const currentAsset = String(
    current?.asset || current?.assetNumber || current?.sageAssetNumber || ""
  ).trim();
  const aliasesComplete =
    current?.asset === assignment.assetNumber &&
    current?.assetNumber === assignment.assetNumber &&
    current?.sageAssetNumber === assignment.assetNumber;
  let status = "ready";
  if (!current) status = "missing-equipment";
  else if (
    normalizeIdentity(currentIdentity) !== normalizeIdentity(assignment.expectedIdentity)
  ) {
    status = "identity-changed";
  } else if (
    currentAsset !== assignment.expectedAsset &&
    currentAsset !== assignment.assetNumber
  ) {
    status = "asset-number-changed";
  } else if (aliasesComplete) {
    status = "already-assigned";
  }

  if (apply && status === "ready") {
    await patchEquipment(assignment.id, assignment.assetNumber);
    status = "updated";
  }

  report.push({
    ...assignment,
    currentIdentity,
    currentAsset,
    status,
  });
}

const blocking = report.filter((row) =>
  ["missing-equipment", "identity-changed", "asset-number-changed"].includes(row.status)
);
console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      source: SOURCE,
      planned: assignments.length,
      ready: report.filter((row) => row.status === "ready").length,
      updated: report.filter((row) => row.status === "updated").length,
      alreadyAssigned: report.filter((row) => row.status === "already-assigned").length,
      blocking,
    },
    null,
    2
  )
);

if (blocking.length) process.exitCode = 1;
