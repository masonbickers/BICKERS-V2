#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { listFirestoreDocuments } from "./lib/firebase-admin-readonly.mjs";

const apply = process.argv.includes("--apply");
const companyId = process.env.COMPANY_ID || "bickers-action";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "bickers-booking";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const clientEmail = process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || "";
const privateKey = (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const archives = [
  "/Users/masonbickers/Downloads/OneDrive_2026-08-11 (7).zip",
  "/Users/masonbickers/Downloads/OneDrive_2026-08-11 (3).zip",
  "/Users/masonbickers/Downloads/OneDrive_2026-08-11 (2).zip",
  "/Users/masonbickers/Downloads/OneDrive_2026-08-11 (1).zip",
];
const contentTypes = {
  ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const text = (value) => String(value ?? "").trim();
const bookingDate = (booking) => {
  const raw = booking.firstBookingDate || booking.startDate || booking.bookingDates?.[0] || booking.dates?.[0] || booking.date || booking.bookingDate;
  const date = new Date(raw || 0);
  return Number.isNaN(date.getTime()) ? null : date;
};
const quoteJob = (fileName) => basename(fileName).match(/^Q(\d{4}(?:\.\d+)?)(?=-|\s|$)/i)?.[1] || "";
const safeName = (value) => text(value).replace(/[^a-zA-Z0-9._() -]+/g, "_").replace(/\s+/g, "_").slice(0, 180);
const base64Url = (input) => Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
let cachedToken = "";

async function accessToken() {
  if (cachedToken) return cachedToken;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.full_control", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }))}`;
  const assertion = `${unsigned}.${base64Url(crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error(`Firebase token failed: ${response.status} ${await response.text()}`);
  cachedToken = (await response.json()).access_token;
  return cachedToken;
}

const storageMetadataUrl = (objectPath) => `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(objectPath)}`;

async function ensureUploaded(file) {
  const objectPath = `companies/${companyId}/quotes/${file.job}_${safeName(file.name)}`;
  const token = await accessToken();
  let response = await fetch(storageMetadataUrl(objectPath), { headers: { Authorization: `Bearer ${token}` } });
  let metadata = response.status === 404 ? null : (response.ok ? await response.json() : null);
  if (!metadata) {
    const bytes = execFileSync("unzip", ["-p", file.archive, file.entry], { encoding: null, maxBuffer: 200 * 1024 * 1024 });
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
    const patch = await fetch(storageMetadataUrl(objectPath), { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ metadata: { ...(metadata?.metadata || {}), firebaseStorageDownloadTokens: downloadToken } }) });
    if (!patch.ok) throw new Error(`Download-token update failed for ${file.name}: ${patch.status}`);
  }
  return {
    name: file.name,
    url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(downloadToken)}`,
    contentType: file.contentType,
    size: Number(metadata?.size || 0),
    folder: "quotes",
  };
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)])) } };
  return { stringValue: String(value) };
}

async function patchAttachments(bookingId, attachments) {
  const token = await accessToken();
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bookings/${encodeURIComponent(bookingId)}?updateMask.fieldPaths=attachments`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { attachments: firestoreValue(attachments) } }),
  });
  if (!response.ok) throw new Error(`Booking update failed for ${bookingId}: ${response.status} ${await response.text()}`);
}

const bookingDocs = await listFirestoreDocuments("bookings");
const now = new Date();
const futureBookings = bookingDocs
  .map(({ id, data }) => ({ id, ...data }))
  .filter((booking) => (!booking.companyId || text(booking.companyId) === companyId) && bookingDate(booking) > now && text(booking.jobNumber));
const futureJobs = new Set(futureBookings.map((booking) => text(booking.jobNumber)));
const filesByKey = new Map();

for (const archive of archives) {
  const entries = execFileSync("zipinfo", ["-1", archive], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
  for (const entry of entries) {
    const name = basename(entry);
    const extension = extname(name).toLowerCase();
    const job = quoteJob(name);
    if (!futureJobs.has(job) || !contentTypes[extension] || /^__/.test(entry) || /_Error\.txt$/i.test(entry)) continue;
    const key = `${job}|${name.toLowerCase()}`;
    if (!filesByKey.has(key)) filesByKey.set(key, { archive, entry, name, job, contentType: contentTypes[extension] });
  }
}

const files = [...filesByKey.values()];
const filesByJob = new Map();
files.forEach((file) => {
  if (!filesByJob.has(file.job)) filesByJob.set(file.job, []);
  filesByJob.get(file.job).push(file);
});
const report = { mode: apply ? "apply" : "dry-run", futureBookings: futureBookings.length, matchedJobs: filesByJob.size, matchedFiles: files.length, bookingUpdates: [], unmatchedJobs: [...futureJobs].filter((job) => !filesByJob.has(job)).sort() };

if (apply) {
  const uploadedByKey = new Map();
  for (const file of files) uploadedByKey.set(`${file.job}|${file.name.toLowerCase()}`, await ensureUploaded(file));
  for (const booking of futureBookings) {
    const matched = filesByJob.get(text(booking.jobNumber)) || [];
    if (!matched.length) continue;
    const existing = Array.isArray(booking.attachments) ? booking.attachments : [];
    const existingNames = new Set(existing.map((item) => text(item?.name).toLowerCase()));
    const additions = matched.map((file) => uploadedByKey.get(`${file.job}|${file.name.toLowerCase()}`)).filter((item) => item && !existingNames.has(item.name.toLowerCase()));
    if (additions.length) await patchAttachments(booking.id, [...existing, ...additions]);
    report.bookingUpdates.push({ bookingId: booking.id, jobNumber: text(booking.jobNumber), date: bookingDate(booking)?.toISOString().slice(0, 10), added: additions.length, existing: existing.length });
  }
}

mkdirSync(resolve("tmp"), { recursive: true });
writeFileSync(resolve("tmp/future-quote-attachment-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode: report.mode, futureBookings: report.futureBookings, matchedJobs: report.matchedJobs, matchedFiles: report.matchedFiles, bookingsMatched: apply ? report.bookingUpdates.length : futureBookings.filter((booking) => filesByJob.has(text(booking.jobNumber))).length, attachmentsAdded: report.bookingUpdates.reduce((sum, row) => sum + row.added, 0), unmatchedJobs: report.unmatchedJobs, report: "tmp/future-quote-attachment-report.json" }, null, 2));
