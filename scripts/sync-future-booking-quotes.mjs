#!/usr/bin/env node

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { listFirestoreDocuments } from "./lib/firebase-admin-readonly.mjs";

const apply = process.argv.includes("--apply");
const option = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
};

const companyId = process.env.COMPANY_ID || "bickers-action";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "bickers-booking";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const clientEmail = process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || "";
const privateKey = (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const extraJob = option("extra-job").trim();
const extraFile = option("extra-file") ? resolve(option("extra-file")) : "";

const text = (value) => String(value ?? "").trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bookingDate = (booking) => {
  const raw = booking.firstBookingDate || booking.startDate || booking.bookingDates?.[0] || booking.dates?.[0] || booking.date || booking.bookingDate;
  const date = new Date(raw || 0);
  return Number.isNaN(date.getTime()) ? null : date;
};
const attachmentName = (attachment) => text(typeof attachment === "string" ? attachment.split("/").pop() : attachment?.name || attachment?.label);
const belongsToJob = (name, job) => new RegExp(`^Q?${escapeRegex(job)}(?=[\\s._-]|$)`, "i").test(name);
const isQuoteFile = (attachment, job) => {
  const name = attachmentName(attachment);
  return belongsToJob(name, job) && /\.(pdf|xlsx?)$/i.test(name) && !/_Error\.txt$/i.test(name);
};

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

const firestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)])) } };
  return { stringValue: String(value) };
};

async function uploadPdf(filePath, job) {
  const name = basename(filePath);
  if (!belongsToJob(name, job) || !/\.pdf$/i.test(name)) throw new Error(`Extra file must be a PDF named for job ${job}: ${name}`);
  const objectPath = `companies/${companyId}/quotes/${job}_${name.replace(/[^a-zA-Z0-9._() -]+/g, "_").replace(/\s+/g, "_")}`;
  const token = await accessToken();
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(objectPath)}`;
  let response = await fetch(metadataUrl, { headers: { Authorization: `Bearer ${token}` } });
  let metadata = response.status === 404 ? null : (response.ok ? await response.json() : null);
  if (!metadata) {
    const downloadToken = crypto.randomUUID();
    const params = new URLSearchParams({ uploadType: "media", name: objectPath, ifGenerationMatch: "0" });
    response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(storageBucket)}/o?${params}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf", "x-goog-meta-firebasestoragedownloadtokens": downloadToken },
      body: readFileSync(filePath),
    });
    if (!response.ok && response.status !== 412) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
    metadata = response.ok ? await response.json() : await (await fetch(metadataUrl, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  let downloadToken = text(metadata?.metadata?.firebaseStorageDownloadTokens).split(",")[0];
  if (!downloadToken) {
    downloadToken = crypto.randomUUID();
    const response = await fetch(metadataUrl, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { ...(metadata?.metadata || {}), firebaseStorageDownloadTokens: downloadToken } }),
    });
    if (!response.ok) throw new Error(`Download-token update failed: ${response.status} ${await response.text()}`);
  }
  return {
    name,
    url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(downloadToken)}`,
    contentType: "application/pdf",
    size: Number(metadata?.size || 0),
    folder: "quotes",
  };
}

async function patchBooking(bookingId, fields) {
  const token = await accessToken();
  const params = new URLSearchParams();
  Object.keys(fields).forEach((field) => params.append("updateMask.fieldPaths", field));
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bookings/${encodeURIComponent(bookingId)}?${params}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])) }),
  });
  if (!response.ok) throw new Error(`Booking ${bookingId} update failed: ${response.status} ${await response.text()}`);
}

if (Boolean(extraJob) !== Boolean(extraFile)) throw new Error("Use --extra-job and --extra-file together.");
const bookings = (await listFirestoreDocuments("bookings"))
  .map(({ id, data }) => ({ id, ...data }))
  .filter((booking) => (!booking.companyId || text(booking.companyId) === companyId) && bookingDate(booking) > new Date() && text(booking.jobNumber));

const extraAttachment = extraFile && apply ? await uploadPdf(extraFile, extraJob) : null;
const report = [];
for (const booking of bookings) {
  const job = text(booking.jobNumber);
  const originalAttachments = Array.isArray(booking.attachments) ? booking.attachments : [];
  const attachments = [...originalAttachments];
  if (extraAttachment && job === extraJob && !attachments.some((value) => attachmentName(value).toLowerCase() === extraAttachment.name.toLowerCase())) {
    attachments.push(extraAttachment);
  }
  const quoteFiles = attachments.filter((attachment) => isQuoteFile(attachment, job));
  const pdfFiles = quoteFiles.filter((attachment) => /\.pdf$/i.test(attachmentName(attachment)));
  const fields = {};
  if (attachments.length !== originalAttachments.length) fields.attachments = attachments;
  if (apply && Object.keys(fields).length) await patchBooking(booking.id, fields);
  report.push({ id: booking.id, job, quoteFiles: quoteFiles.length, pdfFiles: pdfFiles.length, updatedFields: Object.keys(fields) });
}

const jobs = [...new Set(report.map((row) => row.job))];
const coveredJobs = jobs.filter((job) => report.some((row) => row.job === job && row.pdfFiles > 0));
const missingJobs = jobs.filter((job) => !coveredJobs.includes(job)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  futureBookingRows: report.length,
  uniqueFutureJobs: jobs.length,
  jobsWithViewableQuote: coveredJobs.length,
  missingJobs,
  updatedRows: report.filter((row) => row.updatedFields.length).length,
  updates: report.filter((row) => row.updatedFields.length),
}, null, 2));
