import fs from "node:fs";
import path from "node:path";
import {
  deriveRoleFromAccess,
  normalizeAppAccess,
  resolveDefaultWorkspace,
} from "../src/app/utils/accessControl.js";
import {
  DEFAULT_COMPANY_ID,
  buildEmployeeAccessPatch,
  buildUserAccessPatch,
  cleanAccessEmail,
  cleanAccessString,
} from "../src/app/utils/appAccessRecords.js";

const dryRun = !process.argv.includes("--write");
let adminListDocuments;
let adminPatchDocument;

function loadEnvFileIfNeeded() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL && process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return;
  }

  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key]) continue;

      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.replace(/\\n/g, "\n");
    }
  }
}

async function run() {
  loadEnvFileIfNeeded();
  ({ adminListDocuments, adminPatchDocument } = await import("../src/app/api/_firebaseAdminRest.js"));

  const [employeeDocs, userDocs] = await Promise.all([
    adminListDocuments("employees"),
    adminListDocuments("users"),
  ]);
  const rows = employeeDocs.map(({ id, data }) => ({ id, ...(data || {}) }));
  const users = userDocs.map(({ id, data }) => ({ id, ...(data || {}) }));
  const usersByUid = new Map(users.map((user) => [cleanAccessString(user.uid || user.id), user]));
  const usersByEmail = new Map(
    users
      .map((user) => [cleanAccessEmail(user.email), user])
      .filter(([email]) => email)
  );

  if (!rows.length) {
    console.log("No employee documents found.");
    return;
  }

  const writes = [];
  let changed = 0;
  const nowIso = new Date().toISOString();

  rows.forEach((row) => {
    const appAccess = normalizeAppAccess(row);
    const role = deriveRoleFromAccess(appAccess);
    const defaultWorkspace = resolveDefaultWorkspace(row, appAccess);
    const uid = cleanAccessString(row.authUid || row.uid);
    const email = cleanAccessEmail(row.email || row.workEmail || row.personalEmail || row.emailAddress);
    const user = uid ? usersByUid.get(uid) : usersByEmail.get(email);
    const linkedUid = cleanAccessString(uid || user?.uid || user?.id);

    const patch = {
      role,
      isService: !!appAccess.service,
      appAccess,
      defaultWorkspace,
      companyId: cleanAccessString(row.companyId || user?.companyId || DEFAULT_COMPANY_ID),
      updatedAt: nowIso,
      updatedBy: "migration:employee-access",
    };
    if (linkedUid) {
      Object.assign(
        patch,
        buildEmployeeAccessPatch({
          uid: linkedUid,
          employeeId: row.id,
          employee: { ...row, ...patch },
          user,
        })
      );
    } else if (email) {
      patch.email = email;
      patch.emails = [...new Set([...(Array.isArray(row.emails) ? row.emails : []), email])];
      patch.isEnabled = row.isEnabled !== false && row.disabled !== true && row.archived !== true && row.active !== false;
    }

    const same =
      String(row.role || "") === role &&
      row.isService === patch.isService &&
      !!row?.appAccess?.user === appAccess.user &&
      !!row?.appAccess?.service === appAccess.service &&
      String(row.defaultWorkspace || "") === defaultWorkspace &&
      String(row.companyId || "") === String(patch.companyId || "") &&
      (!linkedUid || (
        String(row.authUid || "") === linkedUid &&
        String(row.uid || "") === linkedUid &&
        row?.auth?.uid === linkedUid
      ));

    if (same) return;

    changed += 1;
    console.log(`[migrate] ${row.id}`, patch);

    if (!dryRun) {
      writes.push(adminPatchDocument("employees", row.id, patch));
    }
  });

  rows.forEach((row) => {
    const uid = cleanAccessString(row.authUid || row.uid);
    const email = cleanAccessEmail(row.email || row.workEmail || row.personalEmail || row.emailAddress);
    const user = uid ? usersByUid.get(uid) : usersByEmail.get(email);
    const linkedUid = cleanAccessString(uid || user?.uid || user?.id);
    if (!linkedUid || !user) return;

    const patch = {
      ...buildUserAccessPatch({
        uid: linkedUid,
        employeeId: row.id,
        employee: row,
        user,
      }),
      updatedAt: nowIso,
      updatedBy: "migration:employee-access",
    };
    const same =
      cleanAccessString(user.uid || user.id) === linkedUid &&
      cleanAccessString(user.employeeId) === row.id &&
      cleanAccessString(user.companyId) === cleanAccessString(patch.companyId) &&
      user.isEnabled === patch.isEnabled &&
      !!user?.appAccess?.user === !!patch.appAccess.user &&
      !!user?.appAccess?.service === !!patch.appAccess.service;
    if (same) return;

    changed += 1;
    console.log(`[migrate-user] ${linkedUid}`, patch);

    if (!dryRun) {
      writes.push(adminPatchDocument("users", linkedUid, patch));
    }
  });

  if (!changed) {
    console.log("No employee access changes required.");
    return;
  }

  if (dryRun) {
    console.log(`Dry run complete. ${changed} access record(s) would be updated.`);
    console.log("Run with --write to apply changes.");
    return;
  }

  await Promise.all(writes);
  console.log(`Migration complete. Updated ${changed} access record(s).`);
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
