import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  financeAccessDecision,
  hasFinanceAccess as hasServerFinanceAccess,
} from "../src/app/utils/financeAccess.js";
import { isFinancePath } from "../src/app/utils/accessControl.js";
import {
  buildContactFinanceProfile,
  contactFinanceProfileEquivalent,
} from "../src/app/utils/contactFinanceProfiles.js";
import { planFinanceAccessMigration } from "../scripts/migrate-finance-access-lockdown.mjs";

test("server finance predicate denies ordinary users and allows finance/admin users", () => {
  assert.equal(hasServerFinanceAccess({ role: "user" }), false);
  assert.equal(hasServerFinanceAccess({ role: "user", financeAccess: true }), true);
  assert.equal(hasServerFinanceAccess({ role: "admin" }), true);
  assert.equal(hasServerFinanceAccess({ role: "platformAdmin" }), true);
  assert.equal(financeAccessDecision({ role: "user" }).status, 403);
  assert.equal(financeAccessDecision({ role: "user", financeAccess: true }).allowed, true);
});

test("human finance routes require the central finance guard", async () => {
  const routes = [
    "src/app/api/invoices/[id]/lifecycle/route.js",
    "src/app/api/invoices/[id]/issued-document/route.js",
    "src/app/api/invoices/[id]/delivery/route.js",
    "src/app/api/integrations/sage50/export-jobs/route.js",
    "src/app/api/integrations/sage50/export-jobs/[jobId]/reconcile/route.js",
    "src/app/api/integrations/sage50/customer-lookups/route.js",
    "src/app/api/integrations/sage50/customer-lookups/[lookupJobId]/confirm/route.js",
    "src/app/api/finance/contact-profiles/route.js",
    "src/app/api/finance/contact-profiles/[contactId]/route.js",
  ];
  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.match(source, /requireFinanceFromRequest\(req\)/, route);
  }
});

test("finance denial is a 403 and is enforced before finance data reads", async () => {
  const source = await readFile(new URL("../src/app/api/admin/_lib.js", import.meta.url), "utf8");
  const guardIndex = source.indexOf("export async function requireFinanceFromRequest");
  const activeCheckIndex = source.indexOf("requireActiveUserFromRequest(req)", guardIndex);
  const financeCheckIndex = source.indexOf("financeAccessError(active.userData)", guardIndex);
  assert.ok(guardIndex >= 0 && activeCheckIndex > guardIndex && financeCheckIndex > activeCheckIndex);
  assert.match(source, /financeAccessDecision\(userData\)/);
  assert.match(source, /jsonError\(decision\.error, decision\.status\)/);
});

test("editable finance profile updates preserve Sage-owned mapping fields", () => {
  const next = buildContactFinanceProfile({
    contact: { id: "contact-1", companyId: "company-a", name: "Example" },
    incoming: { defaultPaymentTerms: 45, sageCustomerId: "TAMPERED" },
    existing: { sageCustomerId: "SAGE-1", sageCustomerMappingStatus: "mapped" },
    actor: { email: "finance@example.com" },
    now: "2026-08-23T12:00:00.000Z",
  });
  assert.equal(next.defaultPaymentTerms, 45);
  assert.equal(next.sageCustomerId, "SAGE-1");
  assert.equal(next.sageCustomerMappingStatus, "mapped");
  assert.equal(next.companyId, "company-a");
});

test("migration planning is dry-run safe, idempotent and conflict preserving", () => {
  const embedded = { defaultPaymentTerms: 30, sageCustomerId: "SAGE-1", sageCustomerMappingStatus: "mapped" };
  const plan = planFinanceAccessMigration({
    contacts: [
      { id: "new", companyId: "company-a", financeProfile: embedded },
      { id: "same", companyId: "company-a", financeProfile: embedded },
      { id: "conflict", companyId: "company-a", financeProfile: embedded },
    ],
    profiles: [
      { id: "same", companyId: "company-a", ...embedded },
      { id: "conflict", companyId: "company-a", defaultPaymentTerms: 60, sageCustomerId: "SAGE-2" },
    ],
    users: [{ id: "finance-user", role: "finance" }],
    employees: [{ id: "employee-1", authUid: "finance-user" }],
  });
  assert.deepEqual(plan.summary, {
    contactsToMigrate: 1,
    legacyFieldsToClean: 1,
    conflicts: 1,
    usersToBackfill: 1,
  });
  assert.equal(plan.userActions[0].employeeId, "employee-1");
  assert.equal(contactFinanceProfileEquivalent(embedded, embedded), true);
});

test("migration apply requires an archived matching dry-run report", async () => {
  const source = await readFile(
    new URL("../scripts/migrate-finance-access-lockdown.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /--reviewed-report=<dry-run-report\.json>/);
  assert.match(source, /reviewedReport\.mode !== "dry-run"/);
  assert.match(source, /reviewedReport\.planHash !== hash/);
  assert.match(source, /writeFile\(reportPath, output, \{ flag: "wx" \}\)/);
});

test("admin finance grants patch both account records and write an audit event", async () => {
  const source = await readFile(
    new URL("../src/app/api/admin/users/[userId]/finance-access/route.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /requireAdminFromRequest\(req\)/);
  assert.match(source, /collection: "users"[\s\S]*collection: "employees"/);
  assert.match(source, /adminCommitDocumentPatches\(writes\)/);
  assert.match(source, /finance_access_granted/);
  assert.match(source, /finance_access_revoked/);
});

test("admin role selector exposes Finance through the protected finance grant", async () => {
  const [adminPage, overviewRoute] = await Promise.all([
    readFile(new URL("../src/app/admin/page.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/admin/overview/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(adminPage, /<option value="finance">finance<\/option>/);
  assert.match(adminPage, /selectedRole === "finance"/);
  assert.match(adminPage, /canonicalRole = financeAccess \? "user" : selectedRole/);
  assert.match(adminPage, /\/finance-access/);
  assert.match(overviewRoute, /financeAccess: employee\.financeAccess === true/);
});

test("operations handoff stays available while finance pages and discovery are gated", async () => {
  assert.equal(isFinancePath("/review-queue"), false);
  assert.equal(isFinancePath("/job-summary/job-1"), false);
  assert.equal(isFinancePath("/ready-invoice"), true);
  const [reviewQueue, protectedLayout, navigation, jobSummary] = await Promise.all([
    readFile(new URL("../src/app/review-queue/page.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/components/ProtectedLayout.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/components/HeaderSidebarLayout.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/job-summary/[id]/page.js", import.meta.url), "utf8"),
  ]);
  assert.match(reviewQueue, /const readyToInvoice = typeof serverPatch\.readyToInvoice/);
  assert.match(reviewQueue, /: nextStatus === "Ready to Invoice";/);
  assert.match(protectedLayout, /\(!financePath \|\| financeAllowed\)/);
  assert.match(navigation, /isFinancePath\(path\) && !hasFinanceAccess\(userDoc\)/);
  assert.match(jobSummary, /const canAccessInvoiceRecords = hasFinanceAccess\(userDoc\)/);
  assert.match(jobSummary, /if \(!jobId \|\| !canAccessInvoiceRecords\)[\s\S]*?doc\(db, "invoiceQueue", jobId\)/);
});

test("rules keep invoice and customer finance records server controlled", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/contactFinanceProfiles\/\{contactId\}[\s\S]*?allow read, write: if false/);
  assert.match(rules, /match \/invoiceQueue\/\{docId\}[\s\S]*?allow read: if hasUserAccess\(\)[\s\S]*?isFinanceReviewer\(\)[\s\S]*?financeCompanyAllowed\(resource\.data\)/);
  assert.match(rules, /allow create, update, delete: if false/);
  assert.match(rules, /match \/users\/\{uid\}[\s\S]*?allow update: if financeAccessUnchanged\(\)/);
  assert.match(rules, /match \/employees\/\{employeeId\}[\s\S]*?&& financeAccessUnchanged\(\)/);
});
