import fs from "node:fs";
import path from "node:path";
import { Parser } from "acorn";
import jsx from "acorn-jsx";
import { TENANT_COLLECTION_MANIFEST } from "../src/app/config/tenantCollections.js";

const root = process.cwd();
const appDir = path.join(root, "src", "app");
const JsxParser = Parser.extend(jsx());
const tenantCollections = new Set(TENANT_COLLECTION_MANIFEST);
const failures = [];
const audited = { clientFiles: 0, tenantQueries: 0, tenantWrites: 0, storageFiles: 0 };

const storageRoots = /^(booking_pdfs|h-and-s|hr|images|invoice_documents|job_attachments|maintenance-quotes|profilePhotos|quotes|recce-photos|vehicles)\//;

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(js|jsx|mjs)$/.test(entry.name) ? [file] : [];
  });
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value.type === "string") walk(value, visit);
  }
}

function callName(node) {
  return node?.type === "CallExpression" && node.callee?.type === "Identifier" ? node.callee.name : "";
}

function literalValue(node) {
  if (node?.type === "Literal") return typeof node.value === "string" ? node.value : "";
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value?.cooked || "";
  return "";
}

function containsCall(node, names) {
  let found = false;
  walk(node, (child) => {
    if (names.has(callName(child))) found = true;
  });
  return found;
}

function collectionFromNode(node, { calls = new Set(["collection", "doc"]), rootOnly = false } = {}) {
  let collection = "";
  walk(node, (child) => {
    const name = callName(child);
    if (collection || !calls.has(name)) return;
    const args = child.arguments || [];
    if (rootOnly && name === "collection" && args.length !== 2) return;
    const candidates = args.map(literalValue).filter(Boolean);
    const match = candidates.find((value) => tenantCollections.has(value));
    if (match) collection = match;
  });
  return collection;
}

function hasCompanyWhere(node) {
  let found = false;
  walk(node, (child) => {
    if (callName(child) === "where" && literalValue(child.arguments?.[0]) === "companyId") found = true;
  });
  return found;
}

function line(node) {
  return node?.loc?.start?.line || 0;
}

for (const file of sourceFiles(appDir)) {
  const source = fs.readFileSync(file, "utf8");
  if (!/^\s*["']use client["']/m.test(source)) continue;
  audited.clientFiles += 1;
  let ast;
  try {
    ast = JsxParser.parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true, allowHashBang: true });
  } catch (error) {
    failures.push(`${rel(file)}: parse failed: ${error.message}`);
    continue;
  }

  const tenantPayloadVars = new Set();
  let hasStorageUpload = false;
  let usesCompanyStoragePath = false;
  walk(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && containsCall(node.init, new Set(["tenantPayload"]))) {
      tenantPayloadVars.add(node.id.name);
    }
    if (callName(node) === "companyStoragePath") usesCompanyStoragePath = true;
    if (["uploadBytes", "uploadBytesResumable", "uploadString"].includes(callName(node))) hasStorageUpload = true;
  });

  walk(ast, (node) => {
    const name = callName(node);
    if (["getDocs", "onSnapshot"].includes(name)) {
      const collection = collectionFromNode(node.arguments?.[0], {
        calls: new Set(["collection"]),
        rootOnly: true,
      });
      if (!collection) return;
      audited.tenantQueries += 1;
      if (!containsCall(node.arguments?.[0], new Set(["tenantCollectionQuery"])) && !hasCompanyWhere(node.arguments?.[0])) {
        failures.push(`${rel(file)}:${line(node)} ${name} reads ${collection} without a companyId query constraint.`);
      }
    }

    if (["addDoc", "setDoc", "updateDoc"].includes(name)) {
      const collection = collectionFromNode(node.arguments?.[0]);
      if (!collection) return;
      audited.tenantWrites += 1;
      const payload = node.arguments?.[1];
      const stamped = containsCall(payload, new Set(["tenantPayload"]))
        || (payload?.type === "Identifier" && tenantPayloadVars.has(payload.name));
      if (!stamped) failures.push(`${rel(file)}:${line(node)} ${name} writes ${collection} without tenantPayload.`);
    }

    if (["ref", "storageRef"].includes(name)) {
      const rawPath = literalValue(node.arguments?.[1]);
      if (storageRoots.test(rawPath)) {
        failures.push(`${rel(file)}:${line(node)} creates a legacy Storage path (${rawPath}).`);
      }
    }
  });

  if (hasStorageUpload) {
    audited.storageFiles += 1;
    if (!usesCompanyStoragePath) {
      failures.push(`${rel(file)} uploads to Storage without companyStoragePath.`);
    }
  }
}

const firestoreRules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const storageRules = fs.readFileSync(path.join(root, "storage.rules"), "utf8");
const tenantHelper = fs.readFileSync(path.join(appDir, "utils", "firestoreAccess.js"), "utf8");
const storageHelper = fs.readFileSync(path.join(appDir, "utils", "storageAccess.js"), "utf8");
const middleware = fs.readFileSync(path.join(root, "src", "middleware.js"), "utf8");

const semanticChecks = [
  [!/TEMPORARY EMERGENCY|emergency-broad-read-fallback|canEmergencyRead/.test(`${firestoreRules}\n${tenantHelper}`), "Emergency broad-read fallback remains."],
  [/exists\(userPath\(\)\)/.test(firestoreRules), "Firestore active-user helper does not require a user document."],
  [/isEnabled == true/.test(firestoreRules), "Firestore rules do not require isEnabled == true."],
  [/credentialResetRequired/.test(firestoreRules), "Firestore rules do not block reset-required users."],
  [/resource\.data\.companyId == companyId\(\)/.test(firestoreRules), "Firestore reads are not tied to current company."],
  [/request\.resource\.data\.companyId == companyId\(\)/.test(firestoreRules), "Firestore writes are not tied to current company."],
  [/match \/\{document=\*\*\}[\s\S]*allow read, write: if false/.test(firestoreRules), "Firestore catch-all is not deny-all."],
  [!/allow\s+(read|write|read, write):\s*if\s+isSignedIn\(\)/.test(firestoreRules), "Firestore contains broad signed-in access."],
  [/where\("companyId", "==", gate\.companyId\)/.test(tenantHelper), "tenantCollectionQuery does not add companyId."],
  [/companyId: gate\.companyId/.test(tenantHelper), "tenantPayload does not stamp companyId."],
  [/companies\/\$\{gate\.companyId\}/.test(storageHelper), "companyStoragePath does not prefix the company."],
  [/credentialResetRequired/.test(storageRules) && /userData\(\)\.companyId == companyId/.test(storageRules), "Storage rules lack reset/company enforcement."],
  [/(auth\.protect\(\)|session\.userId[\s\S]*NextResponse\.redirect)/.test(middleware), "Clerk middleware does not protect non-public pages."],
];
for (const [passed, message] of semanticChecks) if (!passed) failures.push(message);

for (const collection of TENANT_COLLECTION_MANIFEST) {
  const explicitName = new RegExp(`["']${collection}["']`).test(firestoreRules);
  const explicitMatch = new RegExp(`match\\s+\\/${collection}\\/`).test(firestoreRules);
  if (!explicitName && !explicitMatch) {
    failures.push(`Tenant manifest collection ${collection} is missing from Firestore rules.`);
  }
}

for (const removedRoute of [
  "src/app/api/dvla/vehicle/route.js",
  "src/app/api/security/login-attempt/route.js",
  "src/app/api/auth/user-code-login/route.js",
  "src/app/api/passkeys/login/options/route.js",
]) {
  if (fs.existsSync(path.join(root, removedRoute))) failures.push(`Obsolete public/legacy route still exists: ${removedRoute}`);
}

console.log("BAS semantic security audit");
console.log(JSON.stringify({ ...audited, tenantCollections: TENANT_COLLECTION_MANIFEST.length, failures: failures.length }, null, 2));
if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Security audit passed.");
}
