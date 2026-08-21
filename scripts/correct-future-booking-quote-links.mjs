#!/usr/bin/env node

import crypto from "node:crypto";
import { listFirestoreDocuments } from "./lib/firebase-admin-readonly.mjs";

const apply = process.argv.includes("--apply");
const exactAddOnly = process.argv.includes("--exact-add-only");
const companyId = process.env.COMPANY_ID || "bickers-action";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "bickers-booking";
const clientEmail = process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || "";
const privateKey = (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const text = (value) => String(value ?? "").trim();
const dateKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const importedMatchEquals = (current = {}, expected = {}) =>
  text(current.method) === text(expected.method) &&
  text(current.bookingId) === text(expected.bookingId) &&
  text(current.jobNumber) === text(expected.jobNumber) &&
  text(current.quoteNumber) === text(expected.quoteNumber) &&
  JSON.stringify((Array.isArray(current.matchedDates) ? current.matchedDates : []).map(text).sort()) ===
    JSON.stringify((Array.isArray(expected.matchedDates) ? expected.matchedDates : []).map(text).sort());

const bookingDates = (booking) => {
  const raw = booking.bookingDates || booking.dates || booking.date || booking.firstBookingDate || booking.startDate;
  return (Array.isArray(raw) ? raw : [raw])
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
};

const attachmentName = (attachment) => text(typeof attachment === "string" ? attachment.split("/").pop() : attachment?.name || attachment?.label);
const quoteNumber = (name) => {
  const source = text(name);
  const match = source.match(/^Q(\d{4}(?:\.\d+)?(?:-\d{3})?)([A-Z])?/i);
  if (!match) return "";
  const revisionSuffix = match[2] && /^ev(?:ision)?\b/i.test(source.slice(match[0].length));
  return `Q${match[1].toUpperCase()}${revisionSuffix ? "" : (match[2] || "").toUpperCase()}`;
};

const months = new Map(Object.entries({
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}));

const datesFromFilename = (name, fallbackYear = 2026) => {
  const values = new Set();
  const source = text(name).replace(/_/g, " ");
  for (const match of source.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/g)) {
    values.add(dateKey(new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])))));
  }
  const pattern = /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:-|–|&|and|to)\s*(\d{1,2})(?:st|nd|rd|th)?)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/gi;
  for (const match of source.matchAll(pattern)) {
    const month = months.get(match[3].toLowerCase());
    const year = Number(match[4] || fallbackYear);
    const startDay = Number(match[1]);
    const endDay = Number(match[2] || match[1]);
    if (month === undefined || startDay < 1 || endDay > 31 || endDay < startDay) continue;
    for (let day = startDay; day <= endDay; day += 1) values.add(dateKey(new Date(Date.UTC(year, month, day))));
  }
  return values;
};

const base64Url = (input) => Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
let cachedToken = "";
const accessToken = async () => {
  if (cachedToken) return cachedToken;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }))}`;
  const assertion = `${unsigned}.${base64Url(crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Firebase token failed: ${response.status} ${await response.text()}`);
  cachedToken = (await response.json()).access_token;
  return cachedToken;
};

const firestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)])) } };
  return { stringValue: String(value) };
};

const patchBooking = async (bookingId, fields) => {
  const token = await accessToken();
  const params = new URLSearchParams();
  Object.keys(fields).forEach((field) => params.append("updateMask.fieldPaths", field));
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bookings/${encodeURIComponent(bookingId)}?${params}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])) }),
  });
  if (!response.ok) throw new Error(`Booking ${bookingId} update failed: ${response.status} ${await response.text()}`);
};

const allBookings = (await listFirestoreDocuments("bookings"))
  .map(({ id, data }) => ({ id, ...data }))
  .filter((booking) => (!booking.companyId || text(booking.companyId) === companyId) && text(booking.jobNumber));
const futureBookings = allBookings.filter((booking) => bookingDates(booking).some((date) => date > new Date()));
const report = [];
for (const booking of futureBookings) {
  const job = text(booking.jobNumber);
  const dates = new Set(bookingDates(booking).map(dateKey));
  const year = bookingDates(booking)[0]?.getUTCFullYear() || 2026;
  const pdfs = (Array.isArray(booking.attachments) ? booking.attachments : [])
    .map((attachment) => ({ attachment, name: attachmentName(attachment) }))
    .filter(({ name }) => new RegExp(`^Q${job.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[\\s._-]|$)`, "i").test(name) && /\.pdf$/i.test(name));
  const families = new Map();
  for (const pdf of pdfs) {
    const number = quoteNumber(pdf.name);
    if (!number) continue;
    if (!families.has(number)) families.set(number, { number, names: [], dates: new Set() });
    const family = families.get(number);
    family.names.push(pdf.name);
    datesFromFilename(pdf.name, year).forEach((value) => family.dates.add(value));
  }
  const datedMatches = [...families.values()].filter((family) => [...family.dates].some((value) => dates.has(value)));
  let selected = "";
  let reason = "review";
  if (datedMatches.length === 1) {
    selected = datedMatches[0].number;
    reason = "exact-date";
  } else if (!families.size) {
    reason = "missing-file";
  } else if (datedMatches.length > 1) {
    reason = "multiple-quotes-same-date";
  } else {
    reason = "no-exact-date-match";
  }
  const current = text(booking.importedQuoteNumber);
  const fields = exactAddOnly ? {} : { quoteNumbers: [] };
  if (selected) {
    const matchedQuoteDates = [...datedMatches[0].dates].filter((value) => dates.has(value)).sort();
    if (!exactAddOnly || !current || current === selected) {
      fields.importedQuoteNumber = selected;
      fields.importedQuoteMatch = {
        method: "exact-job-and-date",
        bookingId: booking.id,
        jobNumber: job,
        quoteNumber: selected,
        matchedDates: matchedQuoteDates,
      };
    } else {
      reason = "existing-quote-conflict";
      selected = "";
    }
  } else if (!exactAddOnly) {
    fields.importedQuoteNumber = null;
    fields.importedQuoteMatch = null;
  }
  const currentProof = booking.importedQuoteMatch ? JSON.stringify(booking.importedQuoteMatch) : "";
  const expectedProof = fields.importedQuoteMatch ? JSON.stringify(fields.importedQuoteMatch) : currentProof;
  const proofMatches = fields.importedQuoteMatch
    ? importedMatchEquals(booking.importedQuoteMatch, fields.importedQuoteMatch)
    : currentProof === expectedProof;
  const hasGuard = Object.prototype.hasOwnProperty.call(booking, "importedQuoteNumber");
  const changed = exactAddOnly
    ? Boolean(selected) && (!hasGuard || current !== selected || !proofMatches)
    : !hasGuard || current !== selected || currentProof !== expectedProof || (Array.isArray(booking.quoteNumbers) && booking.quoteNumbers.length > 0);
  if (apply && changed) await patchBooking(booking.id, fields);
  report.push({ id: booking.id, job, dates: [...dates], location: booking.location || "", selected, reason, changed, existingImportedQuote: current, candidates: [...families.values()].map((family) => ({ quote: family.number, dates: [...family.dates], files: family.names })) });
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  updatePolicy: exactAddOnly ? "exact-add-only" : "reconcile",
  futureRows: report.length,
  selectedRows: report.filter((row) => row.selected).length,
  changedRows: report.filter((row) => row.changed).length,
  reviewRows: report.filter((row) => !row.selected).length,
  reasonCounts: Object.fromEntries([...new Set(report.map((row) => row.reason))].map((reason) => [reason, report.filter((row) => row.reason === reason).length])),
  selected: report.filter((row) => row.selected).map(({ id, job, dates, location, selected, reason }) => ({ id, job, dates, location, selected, reason })),
  review: report.filter((row) => !row.selected),
}, null, 2));
