import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const enable = process.argv.includes("--enable");
const disable = process.argv.includes("--disable");
if (enable === disable) {
  console.error("Choose exactly one of --enable or --disable. Dry-run is the default; mutation also requires --apply.");
  process.exit(1);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith("#")) return env;
    env[match[1]] = match[2].replace(/^("|')(.*)\1$/, "$2");
    return env;
  }, {});
}

const env = { ...loadEnv(path.resolve(".env.local")), ...process.env };
const required = (name) => {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

async function main() {
  if (apply && !process.argv.includes("--confirm-maintenance-change")) {
    throw new Error("Apply mode also requires --confirm-maintenance-change.");
  }
  const projectId = String(env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");
  const app = getApps()[0] || initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: required("FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL"),
      privateKey: required("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
  const db = getFirestore(app);
  const ref = db.collection("settings").doc("platform");
  const before = (await ref.get()).data() || {};
  const maintenanceMode = enable;
  if (apply) {
    await ref.set({
      maintenanceMode,
      maintenanceModeChangedAt: FieldValue.serverTimestamp(),
      maintenanceModeChangedBy: "cutover-script",
    }, { merge: true });
  }
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    projectId,
    before: before.maintenanceMode === true,
    after: maintenanceMode,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Maintenance-mode change stopped: ${error?.message || error}`);
  process.exitCode = 1;
});
