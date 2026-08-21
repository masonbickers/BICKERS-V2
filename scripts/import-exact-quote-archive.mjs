#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename, extname, resolve } from "node:path";
import { listFirestoreDocuments } from "./lib/firebase-admin-readonly.mjs";

const apply = process.argv.includes("--apply");
const option = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
};

const archive = resolve(option("archive") || "/Users/masonbickers/Downloads/OneDrive_2026-08-21.zip");
const companyId = process.env.COMPANY_ID || "bickers-action";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "bickers-booking";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const clientEmail = process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || "";
const privateKey = (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

const exactMatches = [
  ["Q9300-001 - Ordinary Renditions - 6th August - London - Low Loader No.1 - 2026", "9Ok9sZ6yYbTTIbbQJ7p5", "9300"],
  ["Q9300-002 - Ordinary Renditions - 29th August - London - Low Loader No.1 - 2026", "XcB3ESFtfzV8ZMhk2tJr", "9300"],
  ["Q9301-001 - Code Zero S1 - 26th August - Roath Park - Cheyenne Elite Tracking Vehicle 2026", "VtKZgXekVigwQbIoQfsj", "9301"],
  ["Q9301-002 - Code Zero S1 - 10th September - Cardiff - Merc GLE AMG  U-CRANE Quote April 2026", "ui8tAeNLwrJJJEdX99yr", "9301"],
  ["Q9301-002 - Code Zero S1 - 5th September - Cardiff - Cheyenne OR Explorer Elite Tracking Vehicle 2026", "5g6kujhpsX7EzaWJDPT8", "9301"],
  ["Q9301-003 - Code Zero S1 - 11th September - Cardiff - Cheyenne OR Explorer Elite Tracking Vehicle 2026", "n6h4RAPdwPIlb1lAC0pc", "9301"],
  ["Q9301-003 - Code Zero S1 - 15th September - Cardiff - Merc GLE AMG  U-CRANE Quote April 2026", "bPb7BIqJ8NpEF8QbQEww", "9301"],
  ["Q9301-004 - Code Zero S1 - 20th September - Newport - Merc GLE AMG  U-CRANE Quote April 2026", "1mYwZufZBepHuJHMfbx4", "9301"],
  ["Q9301-004 - Code Zero S1 - 22nd & 24th September - Cardiff - Trojan or Twizzy Electric 2026", "kB1DAqC4HQzLuS5WuEDQ", "9301"],
  ["Q9301-005 - Code Zero S1 - 5th October - Cardiff - Cheyenne OR Explorer Elite Tracking Vehicle 2026", "rTywKqri5fQQjNiOIbJC", "9301"],
  ["Q9301-006 - Code Zero S1 - 5th October - Cardiff - Trojan or Twizzy Electric 2026", "pOkYQ3tRPGaE8VWW1exE", "9301"],
  ["Q9301-007 - Code Zero S1 - 13th October - Cardiff - Low Loader No.2 - 2026", "xqJykMTL2GWC76FTSuwi", "9301"],
  ["Q9301-007 - Code Zero S1 - 13th October - Swansea - Merc GLE AMG  U-CRANE Quote April 2026", "BP1MWXEtVi5JH71dIeLK", "9301"],
  ["Q9304-001 - Zoltar - 10th September - Saltburn - Cheyenne Elite Tracking Vehicle 2026", "B9U2xwa0ez736ZTQR0QJ", "9304"],
  ["Q9304-002 - Zoltar - 10th September - Saltburn - Silverado Elite 2026", "B9U2xwa0ez736ZTQR0QJ", "9304"],
  ["Q9305-001 - Laird - 9th October - Beauly - Merc GLE AMG  U-CRANE Quote April 2026", "W0WGh4AIleKcwdjzv0qD", "9305"],
  ["Q9306-001 The Cadburys-Twizzy Electric-Friday 4th Sep 2026-Wolverhampton", "YI95KAEuCLbOxtPhuYST", "9306"],
  ["Q9308  Explorer Elite  2026 London", "MN4tyjAgPum1zIZawuDZ", "9308"],
  ["Q9309-001 Farerwell My Lovely Low Loader No.1 OR No.2 London - Oct-2026", "oi2VY8uhjo0BQafhcZtz", "9309"],
  ["Q9309-002 Farewell My Lovely Pod Car Hire Oct 2026", "oi2VY8uhjo0BQafhcZtz", "9309"],
  ["Q9309-003 Farewell My Lovely Sprinter No.2 Video Pursuit Vehicle Oct 2026", "oi2VY8uhjo0BQafhcZtz", "9309"],
  ["Q9310-001 Horse Rig 2026 - HUMANN", "Er5Jq7Lm1xjBbHk9Dgz3", "9310"],
  ["Q9310-001A Horse Rig 2026 - HUMANN", "Er5Jq7Lm1xjBbHk9Dgz3", "9310"],
  ["Q9311-001 The Gate Films Twizzy Electric 15th to 17th Sep 2026-Maidstone", "YXRZ7hp8Sq4NaxX4NXx1", "9311"],
  ["Q9311-002 The Gate Films Trojan Electric 15th to 17th Sep 2026-Maidstone", "YXRZ7hp8Sq4NaxX4NXx1", "9311"],
  ["Q9312-001 Shoot To Kill Films Low Loader No.1 - Tues 25th Aug 2026-Cleethorpes Area", "iC2vFusaQoTVPYrLIwBa", "9312"],
  ["Q9313-001 - TK Maxx - 3rd OR 4th September - London - Low Loader No.1 - 2026", "K0EijyP5rWCMzDLAHMwF", "9313"],
  ["Q9314-001 - Chipotle - 26th August - Dartford - Dominator Quad OR Trojan Electric 2026", "RaIXnMUGcqoh2qhP7qYo", "9314"],
  ["Q9315-001 - Bad Blood - 10th September - Capheaton - Silverado Elite with Motorcycle Banking Rig 2026", "KyN9t77h56wWqmnZ4via", "9315"],
  ["Q9315-002 - Bad Blood - 6th October - Washington - Silverado Elite with Motorcycle Banking Rig 2026", "2zLWeCL8LR2rNaWLbpKF", "9315"],
  ["Q9316-001 Sideshow Motorcle Banking Rig 22nd to 28th Nov 2026-Morocco", "6X2ZEpbmxcZ6DoOBGPET", "9316"],
  ["Q9321-001 Objective Entertainment- GMC Video Pursuit Wed 16th Sep 2026-Brentwood", "17ZbmK9c6ZsvrYSpgvHm", "9321"],
].map(([stem, bookingId, jobNumber]) => ({ stem, bookingId, jobNumber }));

const contentTypes = {
  ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const text = (value) => String(value ?? "").trim();
const safeName = (value) => text(value).replace(/[^a-zA-Z0-9._() -]+/g, "_").replace(/\s+/g, "_").slice(0, 180);
const attachmentName = (value) => text(typeof value === "string" ? value.split("/").pop() : value?.name || value?.label);
const base64Url = (input) => Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

let cachedToken = "";
async function accessToken() {
  if (cachedToken) return cachedToken;
  if (!clientEmail || !privateKey) throw new Error("Firebase service account environment variables are required.");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.full_control", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }))}`;
  const assertion = `${unsigned}.${base64Url(crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Firebase token failed: ${response.status} ${await response.text()}`);
  cachedToken = (await response.json()).access_token;
  return cachedToken;
}

const storageMetadataUrl = (objectPath) => `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(objectPath)}`;

async function ensureUploaded(file) {
  const objectPath = `companies/${companyId}/quotes/${file.jobNumber}_${safeName(file.name)}`;
  const token = await accessToken();
  let response = await fetch(storageMetadataUrl(objectPath), { headers: { Authorization: `Bearer ${token}` } });
  let metadata = response.status === 404 ? null : (response.ok ? await response.json() : null);
  if (!metadata) {
    const bytes = execFileSync("unzip", ["-p", archive, file.entry], { encoding: null, maxBuffer: 200 * 1024 * 1024 });
    const downloadToken = crypto.randomUUID();
    const params = new URLSearchParams({ uploadType: "media", name: objectPath, ifGenerationMatch: "0" });
    response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(storageBucket)}/o?${params}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": file.contentType, "x-goog-meta-firebasestoragedownloadtokens": downloadToken },
      body: bytes,
    });
    if (!response.ok && response.status !== 412) throw new Error(`Upload failed for ${file.name}: ${response.status} ${await response.text()}`);
    metadata = response.ok ? await response.json() : await (await fetch(storageMetadataUrl(objectPath), { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  let downloadToken = text(metadata?.metadata?.firebaseStorageDownloadTokens).split(",")[0];
  if (!downloadToken) {
    downloadToken = crypto.randomUUID();
    const patch = await fetch(storageMetadataUrl(objectPath), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { ...(metadata?.metadata || {}), firebaseStorageDownloadTokens: downloadToken } }),
    });
    if (!patch.ok) throw new Error(`Download-token update failed for ${file.name}: ${patch.status} ${await patch.text()}`);
  }
  return {
    name: file.name,
    url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(downloadToken)}`,
    contentType: file.contentType,
    size: Number(metadata?.size || 0),
    folder: "quotes",
  };
}

const firestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)])) } };
  return { stringValue: String(value) };
};

async function patchAttachments(bookingId, attachments) {
  const token = await accessToken();
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bookings/${encodeURIComponent(bookingId)}?updateMask.fieldPaths=attachments`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { attachments: firestoreValue(attachments) } }),
  });
  if (!response.ok) throw new Error(`Booking ${bookingId} update failed: ${response.status} ${await response.text()}`);
}

const bookings = new Map((await listFirestoreDocuments("bookings")).map(({ id, data }) => [id, { id, ...data }]));
const entries = execFileSync("zipinfo", ["-1", archive], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
const manifestByStem = new Map(exactMatches.map((match) => [match.stem.toLowerCase(), match]));
const files = [];

for (const match of exactMatches) {
  const booking = bookings.get(match.bookingId);
  if (!booking) throw new Error(`Missing target booking ${match.bookingId} for ${match.stem}`);
  if (text(booking.jobNumber) !== match.jobNumber) throw new Error(`Target booking ${match.bookingId} is job ${booking.jobNumber}, expected ${match.jobNumber}`);
  if (!new RegExp(`^Q${match.jobNumber}(?=[\\s._-]|$)`, "i").test(match.stem)) throw new Error(`Manifest filename does not exactly match job ${match.jobNumber}: ${match.stem}`);
}

for (const entry of entries) {
  const name = basename(entry);
  const extension = extname(name).toLowerCase();
  if (!contentTypes[extension]) continue;
  const stem = name.slice(0, -extension.length);
  const match = manifestByStem.get(stem.toLowerCase());
  if (!match) continue;
  files.push({ ...match, entry, name, contentType: contentTypes[extension] });
}

const missingManifestFiles = exactMatches.filter((match) => !files.some((file) => file.stem.toLowerCase() === match.stem.toLowerCase()));
if (missingManifestFiles.length) throw new Error(`Archive is missing ${missingManifestFiles.length} validated quote groups: ${missingManifestFiles.map((row) => row.stem).join(" | ")}`);

const additionsByBooking = new Map();
const alreadyAttached = [];
for (const file of files) {
  const booking = bookings.get(file.bookingId);
  const existingNames = new Set((Array.isArray(booking.attachments) ? booking.attachments : []).map((item) => attachmentName(item).toLowerCase()));
  if (existingNames.has(file.name.toLowerCase())) {
    alreadyAttached.push(file);
    continue;
  }
  if (!additionsByBooking.has(file.bookingId)) additionsByBooking.set(file.bookingId, []);
  additionsByBooking.get(file.bookingId).push(file);
}

const applied = [];
if (apply) {
  for (const [bookingId, pendingFiles] of additionsByBooking) {
    const uploaded = await Promise.all(pendingFiles.map(ensureUploaded));
    const booking = bookings.get(bookingId);
    const existing = Array.isArray(booking.attachments) ? booking.attachments : [];
    await patchAttachments(bookingId, [...existing, ...uploaded]);
    applied.push({ bookingId, jobNumber: text(booking.jobNumber), added: uploaded.map((item) => item.name) });
  }
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  archive,
  validatedQuoteGroups: exactMatches.length,
  validatedFiles: files.length,
  alreadyAttachedFiles: alreadyAttached.length,
  bookingsToUpdate: additionsByBooking.size,
  filesToAdd: [...additionsByBooking.values()].reduce((sum, rows) => sum + rows.length, 0),
  updates: [...additionsByBooking].map(([bookingId, pendingFiles]) => ({ bookingId, jobNumber: text(bookings.get(bookingId)?.jobNumber), files: pendingFiles.map((file) => file.name) })),
  applied,
}, null, 2));
