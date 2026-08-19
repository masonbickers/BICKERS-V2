import fs from "node:fs";
import path from "node:path";

const dryRun = !process.argv.includes("--write");

function loadEnvFileIfNeeded() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL && process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) return;
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value.replace(/\\n/g, "\n");
    }
  }
}

function monthFromTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).format(date).slice(0, 7);
}

async function run() {
  loadEnvFileIfNeeded();
  const [{ adminCommitDocumentPatches, adminListDocuments }, receiptUtils] = await Promise.all([
    import("../src/app/api/_firebaseAdminRest.js"),
    import("../src/app/utils/receipts.js"),
  ]);
  const { normalizeReceiptStatus, receiptGroupId, suggestedVatPence } = receiptUtils;
  const [receiptDocs, groupDocs] = await Promise.all([adminListDocuments("receipts"), adminListDocuments("receiptGroups")]);
  const existingGroups = new Set(groupDocs.map((row) => row.id));
  const groupsToCreate = new Map();
  const writes = [];
  const skipped = [];

  for (const document of receiptDocs) {
    const row = document.data || {};
    const monthKey = row.monthKey || monthFromTimestamp(row.createdAt || document.createTime || row.updatedAt || document.updateTime);
    if (!monthKey) {
      skipped.push(document.id);
      continue;
    }
    const companyId = String(row.companyId || "bickers-action");
    const submitterUid = String(row.submitterUid || "");
    if (!submitterUid) {
      skipped.push(document.id);
      continue;
    }
    const groupId = receiptGroupId(companyId, submitterUid, monthKey);
    const patch = {
      monthKey,
      groupId,
      suggestedVatPence: Number(row.suggestedVatPence ?? suggestedVatPence(row.valuePence)),
      status: normalizeReceiptStatus(row.status),
      updatedAt: new Date().toISOString(),
      migratedBy: "migration:receipt-groups",
    };
    writes.push({ collection: "receipts", documentId: document.id, patch });
    if (!existingGroups.has(groupId) && !groupsToCreate.has(groupId)) {
      groupsToCreate.set(groupId, {
        collection: "receiptGroups",
        documentId: groupId,
        exists: false,
        patch: {
          companyId,
          submitterUid,
          submitterName: row.submitterName || row.submitterEmail || "User",
          monthKey,
          status: "submitted",
          declaredNoReceipts: false,
          submittedAt: row.createdAt || document.createTime || new Date().toISOString(),
          submittedByUid: submitterUid,
          submittedByName: row.submitterName || "User",
          createdAt: row.createdAt || document.createTime || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          migratedBy: "migration:receipt-groups",
        },
      });
    }
  }

  const allWrites = [...groupsToCreate.values(), ...writes];
  console.log(`Receipt migration ${dryRun ? "dry run" : "write"}: ${writes.length} receipt(s), ${groupsToCreate.size} group(s), ${skipped.length} skipped.`);
  if (skipped.length) console.log(`Skipped receipt IDs: ${skipped.join(", ")}`);
  if (dryRun) {
    console.log("Run with --write to apply these changes.");
    return;
  }
  for (let index = 0; index < allWrites.length; index += 200) {
    await adminCommitDocumentPatches(allWrites.slice(index, index + 200));
  }
  console.log("Receipt group migration complete.");
}

run().catch((error) => {
  console.error("Receipt group migration failed:", error);
  process.exitCode = 1;
});
