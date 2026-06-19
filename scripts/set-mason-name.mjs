import fs from "node:fs";
import path from "node:path";

const TARGET_UID = "f49HckHaOGSEvqQW3IisuM81Id93";
const TARGET_EMPLOYEE_ID = "9FJIHUb6q1545yfkdv1N";
const TARGET_NAME = "Mason 2Bickers";

let adminPatchDocument;
let adminReadDocument;

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

async function main() {
  loadEnvFileIfNeeded();
  ({ adminPatchDocument, adminReadDocument } = await import("../src/app/api/_firebaseAdminRest.js"));

  const dryRun = !process.argv.includes("--write");
  const nowIso = new Date().toISOString();
  const userBefore = await adminReadDocument("users", TARGET_UID);
  const employeeBefore = await adminReadDocument("employees", TARGET_EMPLOYEE_ID);

  const userPatch = {
    name: TARGET_NAME,
    displayName: TARGET_NAME,
    updatedAt: nowIso,
    updatedBy: "repair:set-mason-name",
  };
  const employeePatch = {
    name: TARGET_NAME,
    fullName: TARGET_NAME,
    employeeName: TARGET_NAME,
    nameAliases: ["Mason Bickers", TARGET_NAME],
    aliases: ["Mason Bickers", TARGET_NAME],
    updatedAt: nowIso,
    updatedBy: "repair:set-mason-name",
  };

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "write",
        user: { id: TARGET_UID, before: userBefore, patch: userPatch },
        employee: { id: TARGET_EMPLOYEE_ID, before: employeeBefore, patch: employeePatch },
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log("Dry run only. Run with --write to apply.");
    return;
  }

  await Promise.all([
    adminPatchDocument("users", TARGET_UID, userPatch),
    adminPatchDocument("employees", TARGET_EMPLOYEE_ID, employeePatch),
  ]);
  console.log(`Updated Mason canonical name to ${TARGET_NAME}.`);
}

main().catch((error) => {
  console.error("Set Mason name failed:", error);
  process.exitCode = 1;
});
