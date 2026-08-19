#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { listFirestoreDocuments } from "./lib/firebase-admin-readonly.mjs";
import { quoteIdentity, summariseExtractedLines } from "../src/app/utils/quoteExtraction.js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const pastOnly = args.has("--past-only");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = Math.max(1, Number(limitArg?.split("=")[1] || 12));
const companyId = process.env.COMPANY_ID || "bickers-action";
const python = process.env.QUOTE_EXTRACTION_PYTHON || "/Users/masonbickers/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const soffice = process.env.SOFFICE_BIN || "/Users/masonbickers/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice";
const parser = resolve("scripts/extract-quote-workbook.py");

const text = (value) => String(value ?? "").trim();
const canonicalJob = (value) => text(value).toUpperCase().replace(/\s+/g, "");
const isSpreadsheet = (attachment = {}) => /\.xlsx?$/i.test(text(attachment.name || attachment.label || attachment.url).split("?")[0]);
const asDate = (value) => {
  if (!value) return null;
  if (typeof value === "object" && Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const isPast = (booking) => {
  if (/complete|invoiced|paid|cancelled|declined/i.test(text(booking.status))) return true;
  const raw = booking.bookingDates || booking.dates || booking.date || booking.firstBookingDate || booking.startDate;
  const dates = (Array.isArray(raw) ? raw : [raw]).map(asDate).filter(Boolean);
  return dates.length && Math.max(...dates.map((date) => date.getTime())) < Date.now();
};

const base64Url = (input) => Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "bickers-booking";
const clientEmail = process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || "";
const privateKey = (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function adminToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64Url(signature)}` }) });
  if (!response.ok) throw new Error(`Firebase token failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

const firestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)])) } };
  return { stringValue: String(value) };
};

async function writeExtraction(token, id, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
  const response = await fetch(`${firestoreBase}/quoteExtractions/${encodeURIComponent(id)}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error(`Firestore write failed: ${response.status} ${await response.text()}`);
}

function convertWorkbook(source, workdir) {
  if (/\.xlsx$/i.test(source)) return source;
  const profile = join(workdir, `lo-profile-${crypto.randomUUID()}`);
  mkdirSync(profile, { recursive: true });
  execFileSync(soffice, [`-env:UserInstallation=file://${profile}`, "--headless", "--convert-to", "xlsx", "--outdir", workdir, source], { stdio: "pipe" });
  return join(workdir, `${basename(source, extname(source))}.xlsx`);
}

const bookingDocs = await listFirestoreDocuments("bookings");
const candidates = bookingDocs
  .filter(({ data }) => (!data.companyId || text(data.companyId) === companyId) && (!pastOnly || isPast(data)))
  .map(({ id, data }) => ({ id, ...data, quoteSheets: (data.attachments || []).filter(isSpreadsheet) }))
  .filter((booking) => booking.quoteSheets.length)
  .sort((a, b) => text(a.jobNumber).localeCompare(text(b.jobNumber), undefined, { numeric: true }))
  .slice(0, limit);

const workdir = mkdtempSync(join(tmpdir(), "bickers-quote-backfill-"));
const output = [];
const tasks = candidates.flatMap((booking) => booking.quoteSheets.map((attachment) => ({ booking, attachment })));
let processed = 0;

async function processAttachment(booking, attachment) {
    const name = text(attachment.name || attachment.label) || basename(new URL(attachment.url).pathname);
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const source = join(workdir, `${crypto.randomUUID()}${extname(name).toLowerCase() || ".xlsx"}`);
      writeFileSync(source, Buffer.from(await response.arrayBuffer()));
      const workbook = convertWorkbook(source, workdir);
      const parsed = JSON.parse(execFileSync(python, [parser, workbook], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }))[0];
      if (parsed.error) throw new Error(parsed.error);
      const jobNumber = text(parsed.header.jobNumber || booking.jobNumber);
      const quoteRef = /^Q/i.test(text(parsed.header.quoteNumber)) ? text(parsed.header.quoteNumber) : `Q${jobNumber}-${text(parsed.header.quoteNumber).padStart(3, "0")}`;
      const identity = quoteIdentity(`${quoteRef} ${name}`);
      const filenameIdentity = quoteIdentity(name);
      const summary = summariseExtractedLines(parsed.lineItems);
      const expectedJob = canonicalJob(booking.jobNumber);
      const workbookJob = canonicalJob(parsed.header.jobNumber);
      const expectedPrefix = `Q${expectedJob}-`;
      const workbookJobMatches = Boolean(expectedJob && workbookJob && workbookJob === expectedJob);
      const filenameJobMatches = Boolean(expectedJob && filenameIdentity.quoteNumber.startsWith(expectedPrefix));
      const quoteReferenceMatches = Boolean(expectedJob && identity.quoteNumber.startsWith(expectedPrefix));
      const exactJobMatch = workbookJobMatches && filenameJobMatches && quoteReferenceMatches;
      const matchIssues = [
        ...parsed.confidence.issues,
        ...(!workbookJobMatches ? [`Workbook Job No '${workbookJob || "missing"}' does not exactly match booking '${expectedJob}'`] : []),
        ...(!filenameJobMatches ? [`Filename quote '${filenameIdentity.quoteNumber || "missing"}' does not match booking '${expectedJob}'`] : []),
        ...(!quoteReferenceMatches ? [`Workbook quote reference '${identity.quoteNumber || "missing"}' does not match booking '${expectedJob}'`] : []),
      ];
      const highConfidence = parsed.confidence.level === "high" && exactJobMatch;
      const record = {
        schemaVersion: 1,
        companyId,
        bookingId: booking.id,
        jobNumber: text(booking.jobNumber),
        bookingStatus: text(booking.status),
        bookingMonth: text(booking.firstBookingDate || booking.startDate).slice(0, 7),
        quoteNumber: identity.quoteNumber,
        quoteFamily: identity.family,
        revision: identity.revision,
        productionCompany: parsed.header.productionCompany,
        production: parsed.header.production,
        location: parsed.header.location,
        shootDates: parsed.header.shootDates,
        serviceDescription: parsed.header.serviceDescription,
        documentTotal: parsed.documentTotal,
        calculatedTotal: summary.calculatedTotal,
        categoryTotals: summary.categoryTotals,
        lineItems: summary.activeLines,
        matchConfidence: exactJobMatch ? "exact" : "mismatch",
        matchEvidence: {
          bookingJobNumber: expectedJob,
          workbookJobNumber: workbookJob,
          filenameQuoteNumber: filenameIdentity.quoteNumber,
          workbookQuoteNumber: identity.quoteNumber,
          workbookJobMatches,
          filenameJobMatches,
          quoteReferenceMatches,
        },
        confidence: { ...parsed.confidence, issues: matchIssues, jobMatches: exactJobMatch },
        reviewStatus: highConfidence ? "auto_verified" : "needs_review",
        includedInInsights: highConfidence,
        source: { name, url: attachment.url, contentType: attachment.contentType || "" },
        extractedAt: new Date().toISOString(),
      };
      const id = crypto.createHash("sha256").update(`${booking.id}|${attachment.url}`).digest("hex").slice(0, 32);
      return { id, ...record };
    } catch (error) {
      return { bookingId: booking.id, jobNumber: booking.jobNumber, source: { name }, error: error.message };
    }
}

async function worker(queue) {
  while (queue.length) {
    const task = queue.shift();
    if (!task) return;
    output.push(await processAttachment(task.booking, task.attachment));
    processed += 1;
    if (processed % 25 === 0 || processed === tasks.length) {
      console.log(`Processed ${processed}/${tasks.length} quote spreadsheets`);
    }
  }
}

const queue = [...tasks];
await Promise.all(Array.from({ length: Math.min(6, tasks.length) }, () => worker(queue)));

if (apply) {
  const token = await adminToken();
  const writes = output.filter((item) => !item.error);
  let writeIndex = 0;
  async function writer() {
    while (writeIndex < writes.length) {
      const row = writes[writeIndex];
      writeIndex += 1;
      await writeExtraction(token, row.id, row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(10, writes.length) }, () => writer()));
}
mkdirSync(resolve("tmp"), { recursive: true });
writeFileSync(resolve("tmp/quote-extraction-pilot.json"), JSON.stringify({ mode: apply ? "apply" : "dry-run", bookingLimit: limit, generatedAt: new Date().toISOString(), rows: output }, null, 2));
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", bookings: candidates.length, extracted: output.filter((row) => !row.error).length, highConfidence: output.filter((row) => row.reviewStatus === "auto_verified").length, needsReview: output.filter((row) => row.reviewStatus === "needs_review").length, errors: output.filter((row) => row.error).length, report: "tmp/quote-extraction-pilot.json" }, null, 2));
