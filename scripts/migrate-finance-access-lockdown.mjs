import {
  CONTACT_FINANCE_PROFILE_COLLECTION,
  buildContactFinanceProfile,
  contactFinanceProfileEquivalent,
} from "../src/app/utils/contactFinanceProfiles.js";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const LEGACY_FINANCE_ROLES = new Set(["finance", "financemanager", "finance manager"]);

const normalizeRows = (rows = []) => rows
  .map((row) => ({ id: row.id, ...(row.data || row) }))
  .sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));

const argumentValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || "";
};

const planHash = (plan) => createHash("sha256").update(JSON.stringify(plan)).digest("hex");

export function planFinanceAccessMigration({ contacts = [], profiles = [], users = [], employees = [] } = {}) {
  const profileById = new Map(normalizeRows(profiles).map((row) => [row.id, row]));
  const normalizedEmployees = normalizeRows(employees);
  const employeeById = new Map(normalizedEmployees.map((row) => [row.id, row]));
  const employeeByUserId = new Map();
  normalizedEmployees.forEach((employee) => {
    const userId = String(employee.authUid || employee.uid || "").trim();
    if (userId && !employeeByUserId.has(userId)) employeeByUserId.set(userId, employee);
  });
  const contactActions = [];
  normalizeRows(contacts).forEach((contact) => {
    if (!contact.financeProfile) return;
    const existing = profileById.get(contact.id);
    const action = !existing
      ? "migrate"
      : contactFinanceProfileEquivalent(existing, contact.financeProfile)
        ? "cleanup_legacy"
        : "conflict";
    contactActions.push({ contactId: contact.id, companyId: contact.companyId || "", action });
  });

  const userActions = normalizeRows(users).flatMap((user) => {
    const legacyRole = String(user.role || "").trim().toLowerCase();
    if (!LEGACY_FINANCE_ROLES.has(legacyRole) || user.financeAccess === true) return [];
    const employeeId = String(user.employeeId || employeeByUserId.get(user.id)?.id || "").trim();
    return [{
      userId: user.id,
      employeeId: employeeById.has(employeeId) ? employeeId : "",
      companyId: user.companyId || "",
      action: "backfill_finance_access",
    }];
  });

  return {
    contactActions,
    userActions,
    summary: {
      contactsToMigrate: contactActions.filter((row) => row.action === "migrate").length,
      legacyFieldsToClean: contactActions.filter((row) => row.action === "cleanup_legacy").length,
      conflicts: contactActions.filter((row) => row.action === "conflict").length,
      usersToBackfill: userActions.length,
    },
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    process.stdout.write([
      "Finance access lockdown migration",
      "",
      "Dry run: npm run migrate:finance-access -- --report=finance-access-dry-run.json",
      "Apply:   npm run migrate:finance-access -- --apply --reviewed-report=finance-access-dry-run.json --report=finance-access-apply.json",
      "",
    ].join("\n"));
    return;
  }
  const apply = process.argv.includes("--apply");
  const reportPath = argumentValue("report");
  const reviewedReportPath = argumentValue("reviewed-report");
  const {
    adminListDocuments,
    adminPatchDocument,
  } = await import("../src/app/api/_firebaseAdminRest.js");
  const [contactRows, profileRows, userRows, employeeRows] = await Promise.all([
    adminListDocuments("contacts", { maxDocuments: 5000 }),
    adminListDocuments(CONTACT_FINANCE_PROFILE_COLLECTION, { maxDocuments: 5000 }),
    adminListDocuments("users", { maxDocuments: 5000 }),
    adminListDocuments("employees", { maxDocuments: 5000 }),
  ]);
  const contacts = normalizeRows(contactRows);
  const profiles = normalizeRows(profileRows);
  const users = normalizeRows(userRows);
  const employees = normalizeRows(employeeRows);
  const plan = planFinanceAccessMigration({ contacts, profiles, users, employees });
  const hash = planHash(plan);

  if (apply) {
    if (!reviewedReportPath) {
      throw new Error("Apply requires --reviewed-report=<dry-run-report.json>.");
    }
    const reviewedReport = JSON.parse(await readFile(reviewedReportPath, "utf8"));
    if (reviewedReport.mode !== "dry-run" || reviewedReport.planHash !== hash) {
      throw new Error("The reviewed dry-run report does not match the current migration plan.");
    }
  }

  if (apply) {
    const contactById = new Map(contacts.map((row) => [row.id, row]));
    for (const action of plan.contactActions) {
      if (action.action === "conflict") continue;
      const contact = contactById.get(action.contactId);
      if (action.action === "migrate") {
        const profile = buildContactFinanceProfile({
          contact,
          incoming: contact.financeProfile,
          actor: { email: "finance-lockdown-migration" },
        });
        await adminPatchDocument(CONTACT_FINANCE_PROFILE_COLLECTION, action.contactId, profile, { mustNotExist: true });
      }
      await adminPatchDocument("contacts", action.contactId, {
        updatedAt: new Date().toISOString(),
      }, { deleteFields: ["financeProfile"] });
    }

    for (const action of plan.userActions) {
      await adminPatchDocument("users", action.userId, {
        financeAccess: true,
        updatedAt: new Date().toISOString(),
        updatedBy: "finance-lockdown-migration",
      });
      if (action.employeeId) {
        await adminPatchDocument("employees", action.employeeId, {
          financeAccess: true,
          updatedAt: new Date().toISOString(),
          updatedBy: "finance-lockdown-migration",
        });
      }
    }
  }

  const report = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    planHash: hash,
    ...plan,
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) await writeFile(reportPath, output, { flag: "wx" });
  process.stdout.write(output);
  if (plan.summary.conflicts) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
