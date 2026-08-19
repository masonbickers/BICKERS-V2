import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dryRun = !process.argv.includes("--write");
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const employeeArg = process.argv.find((arg) => arg.startsWith("--employee="));
const sourceRoot = sourceArg ? path.resolve(sourceArg.slice("--source=".length)) : "";
const employeeFilter = employeeArg ? employeeArg.slice("--employee=".length).trim().toLowerCase() : "";
const reportPath = path.resolve("tmp/personnel-import-report.json");

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".doc", ".docx", ".xls", ".xlsx", ".csv",
]);

const CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".bmp": "image/bmp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
};

const FOLDER_ALIASES = {
  "jamie evans payne": "Jamie Evans",
  "mason 2bickers": "Mason Bickers",
};

const PREFERRED_EMAILS = {
  "paul bickers": "paul@bickers.co.uk",
  "mason bickers": "mason@bickers.co.uk",
};

function loadEnvFileIfNeeded() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.resolve(fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value.replace(/\\n/g, "\n");
    }
  }
}

loadEnvFileIfNeeded();

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "bickers-booking";
const clientEmail = process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || "";
const privateKey = (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

let cachedAccessToken = null;

const base64Url = (input) => Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken() {
  if (cachedAccessToken) return cachedAccessToken;
  if (!clientEmail || !privateKey) throw new Error("Firebase service-account credentials are not configured.");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.full_control",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }))}`;
  const assertion = `${unsigned}.${base64Url(crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Firebase token request failed (${response.status}).`);
  cachedAccessToken = (await response.json()).access_token;
  return cachedAccessToken;
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

const firestoreFieldsToJs = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValueToJs(value)]));

function jsToFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(jsToFirestoreValue) } };
  if (typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsToFirestoreValue(nested)])) } };
  }
  return { stringValue: String(value) };
}

async function listEmployees() {
  const token = await accessToken();
  const rows = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${firestoreBase}/employees?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Employee list failed (${response.status}).`);
    const payload = await response.json();
    for (const document of payload.documents || []) {
      rows.push({ id: String(document.name || "").split("/").pop(), ...firestoreFieldsToJs(document.fields || {}) });
    }
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return rows;
}

async function patchEmployee(employeeId, patch) {
  const token = await accessToken();
  const params = new URLSearchParams();
  Object.keys(patch).forEach((field) => params.append("updateMask.fieldPaths", field));
  const fields = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, jsToFirestoreValue(value)]));
  const response = await fetch(`${firestoreBase}/employees/${encodeURIComponent(employeeId)}?${params.toString()}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`Employee update failed for ${employeeId} (${response.status}).`);
}

function storageMetadataUrl(objectPath) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(objectPath)}`;
}

async function readStorageMetadata(objectPath) {
  const token = await accessToken();
  const response = await fetch(storageMetadataUrl(objectPath), { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage metadata read failed (${response.status}).`);
  return response.json();
}

async function ensureStorageDownloadToken(objectPath, metadata) {
  const existing = String(metadata?.metadata?.firebaseStorageDownloadTokens || "").split(",").find(Boolean);
  if (existing) return existing;
  const token = crypto.randomUUID();
  const authToken = await accessToken();
  const response = await fetch(storageMetadataUrl(objectPath), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ metadata: { ...(metadata?.metadata || {}), firebaseStorageDownloadTokens: token } }),
  });
  if (!response.ok) throw new Error(`Storage token update failed (${response.status}).`);
  return token;
}

async function uploadFile(file, objectPath) {
  let metadata = await readStorageMetadata(objectPath);
  if (!metadata) {
    const token = crypto.randomUUID();
    const authToken = await accessToken();
    const params = new URLSearchParams({ uploadType: "media", name: objectPath, ifGenerationMatch: "0" });
    const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(storageBucket)}/o?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": CONTENT_TYPES[path.extname(file.absolutePath).toLowerCase()] || "application/octet-stream",
        "x-goog-meta-firebasestoragedownloadtokens": token,
      },
      body: fs.readFileSync(file.absolutePath),
    });
    if (!response.ok && response.status !== 412) throw new Error(`Storage upload failed for ${file.relativePath} (${response.status}).`);
    metadata = response.ok ? await response.json() : await readStorageMetadata(objectPath);
  }
  const downloadToken = await ensureStorageDownloadToken(objectPath, metadata);
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
}

const normalizeName = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const safeFileName = (value) => String(value || "document").replace(/[^a-zA-Z0-9._() -]+/g, "_").slice(0, 140) || "document";
const isActiveEmployee = (employee) => !(
  employee.deleted === true || employee.isDeleted === true || employee.archived === true || employee.isArchived === true ||
  employee.active === false || employee.appDisabled === true || ["service", "freelancer", "freelance", "archived"].includes(String(employee.role || "").toLowerCase())
);

function categoryFor(relativePath) {
  const value = relativePath.toLowerCase();
  const fileName = path.basename(value);
  if (fileName.includes("digi card") || fileName.includes("driver card")) return "Driver card";
  if (value.includes("003 - passport") || fileName.includes("passport")) return "Passport";
  if (value.includes("001 - driving licence") || value.includes("driving licence") || value.includes("drivers licence")) return "Driving licence";
  if (value.includes("002 - driver card")) return "Driver card";
  if (value.includes("004 - qualifications")) return "Qualification";
  if (value.includes("005 - misc")) return "Miscellaneous";
  return "Personnel document";
}

const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };

function inferredExpiry(fileName) {
  const value = String(fileName || "");
  if (!/\b(exp|expiry|expires|expres)\b/i.test(value)) return "";
  const named = value.match(/(?:exp\w*\s*)?(\d{1,2})(?:st|nd|rd|th)?[ ._-]+([a-z]{3,9})[ ._-]+(20\d{2})/i);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month) return `${named[3]}-${String(month).padStart(2, "0")}-${String(Number(named[1])).padStart(2, "0")}`;
  }
  const numeric = value.match(/(?:exp\w*\s*)?(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/i);
  if (numeric) return `${numeric[3]}-${String(Number(numeric[2])).padStart(2, "0")}-${String(Number(numeric[1])).padStart(2, "0")}`;
  return "";
}

function collectFiles(folderPath) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const stat = fs.statSync(absolutePath);
        const relativePath = path.relative(folderPath, absolutePath);
        files.push({ absolutePath, relativePath, fileName: entry.name, size: stat.size, modifiedAt: stat.mtime.toISOString(), category: categoryFor(relativePath), expiryDate: inferredExpiry(entry.name) });
      }
    }
  };
  visit(folderPath);
  return files;
}

function primaryScore(file) {
  const value = file.fileName.toLowerCase();
  let score = file.expiryDate ? 1000 + Number(file.expiryDate.replaceAll("-", "")) : 0;
  if (/\bnew\b|current|2025|2026|2027|2028|2029|203\d/.test(value)) score += 200;
  if (/scan|front|card|photo/.test(value)) score += 60;
  if (/summary/.test(value)) score -= 80;
  if (/\bold\b|out of date|expired/.test(value)) score -= 500;
  score += Math.floor(new Date(file.modifiedAt).getTime() / 1e10);
  return score;
}

const selectPrimary = (files, category) =>
  files
    .filter((file) =>
      file.category === category ||
      (category === "Passport" && file.fileName.toLowerCase().includes("passport")) ||
      (category === "Driving licence" && /driving licence|drivers licence/i.test(file.fileName))
    )
    .sort((a, b) => primaryScore(b) - primaryScore(a))[0] || null;

function objectPathFor(employeeId, file) {
  const digest = crypto.createHash("sha256").update(fs.readFileSync(file.absolutePath)).digest("hex").slice(0, 16);
  return `employee-personnel/${employeeId}/archive-import/${digest}-${safeFileName(file.fileName)}`;
}

function folderMap() {
  return new Map(
    fs.readdirSync(sourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !/^\d{2}\s*-/.test(entry.name) && entry.name !== "TEMPLATE FOLDER")
      .map((entry) => [normalizeName(entry.name), { name: entry.name, path: path.join(sourceRoot, entry.name) }])
  );
}

async function run() {
  if (!sourceRoot || !fs.existsSync(sourceRoot)) throw new Error("Pass a valid --source=/path/to/personnel-folder argument.");
  const folders = folderMap();
  const employees = (await listEmployees()).filter(isActiveEmployee);
  const report = { mode: dryRun ? "dry-run" : "write", sourceRoot, startedAt: new Date().toISOString(), employees: [], unmatchedEmployees: [], skippedFolders: [] };
  const matchedFolderNames = new Set();

  for (const employee of employees) {
    const employeeName = String(employee.name || employee.fullName || "").trim();
    if (employeeFilter && !normalizeName(employeeName).includes(normalizeName(employeeFilter))) continue;
    const requestedFolder = FOLDER_ALIASES[normalizeName(employeeName)] || employeeName;
    const folder = folders.get(normalizeName(requestedFolder));
    if (!folder) {
      report.unmatchedEmployees.push({ employeeId: employee.id, name: employeeName });
      continue;
    }
    const preferredEmail = PREFERRED_EMAILS[normalizeName(folder.name)];
    if (preferredEmail && String(employee.email || "").trim().toLowerCase() !== preferredEmail) continue;
    matchedFolderNames.add(normalizeName(folder.name));

    const files = collectFiles(folder.path);
    const primaryPassport = selectPrimary(files, "Passport");
    const primaryLicence = selectPrimary(files, "Driving licence");
    const existingDocuments = Array.isArray(employee.personnelDocuments)
      ? employee.personnelDocuments
      : Array.isArray(employee.personnelFile?.documents)
        ? employee.personnelFile.documents
        : [];
    const existingSources = new Set(existingDocuments.map((item) => String(item?.sourcePath || "")).filter(Boolean));
    const employeeReport = { employeeId: employee.id, name: employeeName, folder: folder.name, files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), primaryPassport: primaryPassport?.relativePath || null, primaryLicence: primaryLicence?.relativePath || null, uploaded: 0, skippedExisting: 0 };

    if (!dryRun) {
      const importedDocuments = [];
      let passportUrl = "";
      let licenceUrl = "";
      const pendingFiles = files.filter((file) => {
        const exists = existingSources.has(`${folder.name}/${file.relativePath}`);
        if (exists) employeeReport.skippedExisting += 1;
        return !exists;
      });
      for (let index = 0; index < pendingFiles.length; index += 4) {
        const batch = pendingFiles.slice(index, index + 4);
        const uploadedBatch = await Promise.all(batch.map(async (file) => {
          const sourcePath = `${folder.name}/${file.relativePath}`;
          const storagePath = objectPathFor(employee.id, file);
          const documentUrl = await uploadFile(file, storagePath);
          return { file, sourcePath, storagePath, documentUrl };
        }));
        for (const { file, sourcePath, storagePath, documentUrl } of uploadedBatch) {
          employeeReport.uploaded += 1;
          if (file === primaryPassport) passportUrl = documentUrl;
          else if (file === primaryLicence) licenceUrl = documentUrl;
          else importedDocuments.push({
            type: file.category,
            title: file.fileName,
            reference: "",
            expiryDate: file.expiryDate,
            documentUrl,
            notes: `Imported from staff personnel archive: ${sourcePath}`,
            sourcePath,
            storagePath,
            sourceModifiedAt: file.modifiedAt,
            importedAt: new Date().toISOString(),
          });
        }
      }

      const passport = { ...(employee.personnelFile?.passport || {}), ...(employee.passport || {}) };
      const drivingLicence = { ...(employee.personnelFile?.drivingLicence || {}), ...(employee.drivingLicence || {}) };
      if (passportUrl) passport.documentUrl = passportUrl;
      if (primaryPassport?.expiryDate) passport.expiryDate = primaryPassport.expiryDate;
      if (licenceUrl) drivingLicence.documentUrl = licenceUrl;
      if (primaryLicence?.expiryDate) drivingLicence.expiryDate = primaryLicence.expiryDate;
      const personnelDocuments = [...existingDocuments, ...importedDocuments];
      const personnelFile = { ...(employee.personnelFile || {}), passport, drivingLicence, documents: personnelDocuments };
      await patchEmployee(employee.id, {
        passport,
        passportDocumentUrl: passport.documentUrl || "",
        passportExpiry: passport.expiryDate || "",
        drivingLicence,
        drivingLicenceDocumentUrl: drivingLicence.documentUrl || "",
        drivingLicenceExpiry: drivingLicence.expiryDate || "",
        personnelDocuments,
        personnelFile,
        updatedAt: new Date().toISOString(),
        updatedBy: "migration:personnel-archive",
      });
    }

    report.employees.push(employeeReport);
    console.log(`${dryRun ? "[plan]" : "[imported]"} ${employeeName}: ${files.length} files, passport=${employeeReport.primaryPassport || "none"}, licence=${employeeReport.primaryLicence || "none"}`);
  }

  for (const folder of folders.values()) {
    if (!matchedFolderNames.has(normalizeName(folder.name))) report.skippedFolders.push(folder.name);
  }
  report.completedAt = new Date().toISOString();
  report.totalFiles = report.employees.reduce((sum, item) => sum + item.files, 0);
  report.totalBytes = report.employees.reduce((sum, item) => sum + item.bytes, 0);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${dryRun ? "Dry run" : "Import"} complete: ${report.employees.length} employees, ${report.totalFiles} supported files, ${(report.totalBytes / 1024 / 1024).toFixed(1)} MB.`);
  console.log(`Report: ${reportPath}`);
}

run().catch((error) => {
  console.error(`Personnel archive import failed: ${error.message}`);
  process.exitCode = 1;
});
