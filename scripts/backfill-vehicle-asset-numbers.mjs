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
  ["NcAtrqZESuScDZBaF4iv", "LUI 6241", "0002"],
  ["l6M0bWlIfW1UgNRTP1BI", "AY65 LNO", "0003"],
  ["2Tj1pDB9ot9jAQrph32U", "75 PDB", "0004"],
  ["nMiYcN7an2H7NqwBv5eE", "DE15 LFB", "0005"],
  ["MKZ2d1BHb2VXp6MewURc", "KS15 YVX", "0006"],
  ["oytHanbVwCu84NiUelBK", "R3 RSB", "0007"],
  ["hlIOJ4MYo7wRZ4GaX2v6", "CC14 UDE", "0008"],
  ["5FGT9nJB4RS3fM8R15ai", "H10 ADS", "0009"],
  ["GhjkSvMaLCCTTS3ElGO2", "M2 SON", "0011"],
  ["RlICOj0MecDqUM2JLPqE", "AO13 XMY", "0013"],
  ["pUpVzQC9rPtwWX0tAOT3", "LUI 6733", "0014"],
  ["0aPMXFA9lcCuO7zxDiXv", "WP62 UTN", "0015"],
  ["n9nNX3Sf4zxPqPkLrXaX", "LUI 6297", "0017"],
  ["f5R8E14K5OV34vuZsEpR", "DX13 DZY", "0018"],
  ["Znai8BCH0n6ALxgSj4gI", "RV55 ARM", "0022"],
  ["7UciYdY3cn1uomTMSgjG", "LUI 6229", "0024"],
  ["FtFFQQg8Oll3gDd7GZ5Z", "B25 ETV", "0025"],
  ["kfS8809RZJRQyf0gNSw0", "AK67 UYN", "0026"],
  ["q9Z3f1oaz4I01p7bkKG3", "LUI 6732", "0029"],
  ["ZP6vDsq7YIAgfsnQYxpr", "PJ11 KHC", "0030"],
  ["qvz8MvQIWVc4Wl2M7uef", "YN18 CZJ", "0031"],
  ["OTRbY1h1k9R1ZXco5Cfw", "RU55 RAP", "0032"],
  ["ikMQHudQKaYITK9xyV4A", "RU55 GLC", "0033"],
  ["uxEHB7DbD67AKpx3U0dO", "TNZ 9671", "0034"],
  ["z2pyn7L4I6mkIymciCcA", "AY19 DDL", "0035"],
  ["ptBZBdkcV1r2qxTPHdip", "B26 ETV", "0036"],
  ["DsIg5h9OQRXIzXupUww4", "WA12 NRJ", "0037"],
  ["ihwgZKAbK3EpZVfkWbPV", "AV61 HND", "0038"],
  ["GPgXybA2pjFtZMrga7VN", "A15 BSW", "0041"],
  ["M1O5EGmHAYqTO9BVRDrc", "MX05 VHW", "0044"],
  ["blTnJWPe1sKvOrZ16YxN", "MAZ 7579", "0046"],
  ["xLnUgk5DOFm07UH2606T", "RV04 USA", "0047"],
  ["zIr9cU9c6oAgQcO06dff", "AY59 AUU", "0048"],
  ["YQyc15lIQAFbohrAszXA", "AY60 DXM", "0049"],
  ["r6S4rrwpwgbhThrR0h0V", "DV15 JUW", "0050"],
  ["yUrVZKvPHNTB8pyxyllO", "RU54 ARM", "0052"],
  ["SZJ68LZ1xsxf7gDHzqaM", "Q532 LRS", "0053"],
  ["Q4IWn1yjHnvkzpELafop", "VX17 EFS", "0055"],
  ["RL5mKw7nmmrL5opdyXkm", "AE16 EHH", "0056"],
  ["F6QSoOmaXcYpK3Uw8oig", "Q502 AAN", "0057"],
  ["utN7nah2W0EERdZSTRLG", "AU09 APO", "0060"],
  ["Rl3b7kv5JWpb6COvYjqQ", "C241289", "0061"],
  ["FdmC2Vcvnecac9pwUxAw", "C402638", "0062"],
  ["8ffP8LXj4kviQedBrppS", "C302151", "0074"],
  ["ORz9B32K6gEK4r9lTlxv", "C234735", "0076"],
  ["O6DjklXgBLeuefhlbsAK", "HC 6847", "0078"],
  ["hkP9ghuoluZGhLOsJoC6", "MX64BHP", "0088"],
  ["0tLNXAXE3d8WqzuJQcto", "N/A", "0089"],
  ["x5V8Ld1x0ZjqyGO9tc3t", "HN12 LBF", "0090"],
  ["KiiTuQZISEKuGwCHocRO", "LR10 UVB", "0093"],
  ["FTfF1VNRy6tBlRCXxXzT", "OXZ 750", "0095"],
  ["rfHOyK6W95aZRv9lZ5Bg", "SH66 BVL", "0097"],
  ["Hw45KXX9ivnlEryJtmNO", "YX65 BMV", "0099"],
  ["0LiwRCiTPU2fBDpXTTfx", "CK17 VCX", "0101"],
  ["HDAwUIQNlQNDr7VkITOu", "LM17 WFG", "0102"],
  ["L6lq9BPyp8SyKi3cEtXO", "XUY 312V", "0103"],
  ["ucMQseaFvkeneDsgvlDv", "R400 PBC", "0104"],
  ["ZGTyMcUWfzKxPL8FpnXc", "ML62 FUT", "0105"],
  ["hHEtb9HI1u2KQSY2RHO2", "AV63 UVL", "0106"],
  ["wQ0V34QdEzpPnKCCQqCT", "AY65 FNV", "0108"],
  ["HK3QEJuHF4Uuz8dKUJ1B", "C608232", "0109"],
  ["cYOiKafFORkoea83hnCH", "E-TRIKE", "0110"],
  ["5modp1pos6JNbqfrDeiP", "EO74 AOJ", "0116"],
  ["aad9C98UfiF0sBdnOoK6", "TNZ 977", "0117"],
  ["s2M2BF3MqSI3Ms6jjv4z", "WT16 SEO", "0119"],
  ["LkMuTAval4NSRLrxE4Iy", "AY25 CYT", "0120"],
  ["HZnsN7VSz23T4hnfTGJy", "NY73 AHE", "0121"],
  ["CmkPy5O3sWMXnSajgk3f", "AO75 SGX", "0122"],
  ["uHbgcq5LWMVk7n0qCrRI", "LL13 VHZ", "0123"],
  ["wa6eLx8Rzd6dAOaCSWuG", "AO26 ZCK", "0128"],
].map(([id, registration, assetNumber]) => ({ id, registration, assetNumber }));

const cleanRegistration = (value) =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const duplicateAssetNumbers = assignments.filter(
  (assignment, index) =>
    assignments.findIndex((candidate) => candidate.assetNumber === assignment.assetNumber) !== index
);
if (duplicateAssetNumbers.length) {
  throw new Error(
    `Duplicate asset numbers in migration plan: ${duplicateAssetNumbers
      .map((row) => row.assetNumber)
      .join(", ")}`
  );
}

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

async function patchVehicle(id, assetNumber) {
  const token = await accessToken();
  const fields = {
    assetNumber: { stringValue: assetNumber },
    sageAssetNumber: { stringValue: assetNumber },
    assetNumberSource: { stringValue: SOURCE },
    assetNumberAssignedAt: { timestampValue: new Date().toISOString() },
  };
  const params = new URLSearchParams();
  Object.keys(fields).forEach((field) => params.append("updateMask.fieldPaths", field));
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/vehicles/${encodeURIComponent(id)}?${params}`,
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
    throw new Error(`Vehicle ${id} update failed: ${response.status} ${await response.text()}`);
  }
}

const currentVehicles = new Map(
  (await listFirestoreDocuments("vehicles")).map(({ id, data }) => [id, data || {}])
);
const report = [];

for (const assignment of assignments) {
  const current = currentVehicles.get(assignment.id);
  const currentRegistration =
    current?.registration || current?.reg || current?.registrationNumber || "";
  const currentAssetNumber = String(
    current?.assetNumber || current?.sageAssetNumber || ""
  ).trim();
  let status = "ready";
  if (!current) status = "missing-vehicle";
  else if (
    cleanRegistration(currentRegistration) !== cleanRegistration(assignment.registration)
  ) {
    status = "registration-changed";
  } else if (currentAssetNumber && currentAssetNumber !== assignment.assetNumber) {
    status = "asset-number-conflict";
  } else if (currentAssetNumber === assignment.assetNumber) {
    status = "already-assigned";
  }

  if (apply && status === "ready") {
    await patchVehicle(assignment.id, assignment.assetNumber);
    status = "updated";
  }

  report.push({
    ...assignment,
    currentRegistration,
    currentAssetNumber,
    status,
  });
}

const blocking = report.filter((row) =>
  ["missing-vehicle", "registration-changed", "asset-number-conflict"].includes(row.status)
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
