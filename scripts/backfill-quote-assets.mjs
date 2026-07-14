import fs from "node:fs";
import path from "node:path";
import { getAdminDb } from "../src/app/api/_firebaseAdmin.js";
import { deriveQuoteAssets } from "./lib/quoteAssets.mjs";

const apply = process.argv.includes("--apply");
const companyArg = process.argv.find((arg) => arg.startsWith("--company-id="));
const companyId = String(companyArg?.slice("--company-id=".length) || "").trim();

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith("#") || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(\"|')(.*)\1$/, "$2").replace(/\\n/g, "\n");
  }
}
loadEnv(path.resolve(".env.local"));

async function main() {
  if (!companyId) throw new Error("Pass --company-id=<company id>. Dry-run is the default.");
  if (apply && companyId !== "bickers-action") throw new Error("Apply is restricted to bickers-action.");
  const db = getAdminDb();
  const snapshot = await db.collection("bookings").where("companyId", "==", companyId).get();
  const report = { mode: apply ? "apply" : "dry-run", companyId, bookings: snapshot.size, versions: 0, changedBookings: 0, manualReview: [] };

  for (const doc of snapshot.docs) {
    const booking = doc.data() || {};
    const versions = Array.isArray(booking.quoteVersions) ? booking.quoteVersions.filter(Boolean) : [];
    if (!versions.length) continue;
    const nextVersions = versions.map((version) => {
      const resolution = deriveQuoteAssets(booking, version);
      report.versions += 1;
      if (resolution.assetResolutionStatus === "manual-review") {
        report.manualReview.push({ bookingId: doc.id, quoteNumber: version.quoteNumber || "" });
      }
      return { ...version, ...resolution };
    });
    if (JSON.stringify(nextVersions) === JSON.stringify(versions)) continue;
    report.changedBookings += 1;
    if (apply) await doc.ref.set({ quoteVersions: nextVersions, updatedAt: new Date().toISOString() }, { merge: true });
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.manualReview.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Quote asset backfill stopped: ${error?.message || error}`);
  process.exitCode = 1;
});
