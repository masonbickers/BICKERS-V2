import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import {
  deriveRoleFromAccess,
  normalizeAppAccess,
  resolveDefaultWorkspace,
} from "../src/app/utils/accessControl.js";

const dryRun = !process.argv.includes("--write");

async function run() {
  const snap = await getDocs(collection(db, "employees"));
  const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));

  if (!rows.length) {
    console.log("No employee documents found.");
    return;
  }

  const batch = writeBatch(db);
  let changed = 0;

  rows.forEach((row) => {
    const appAccess = normalizeAppAccess(row);
    const role = deriveRoleFromAccess(appAccess);
    const defaultWorkspace = resolveDefaultWorkspace(row, appAccess);

    const patch = {
      role,
      isService: !!appAccess.service,
      appAccess,
      defaultWorkspace,
      updatedAt: serverTimestamp(),
      updatedBy: "migration:employee-access",
    };

    const same =
      String(row.role || "") === role &&
      row.isService === patch.isService &&
      !!row?.appAccess?.user === appAccess.user &&
      !!row?.appAccess?.service === appAccess.service &&
      String(row.defaultWorkspace || "") === defaultWorkspace;

    if (same) return;

    changed += 1;
    console.log(`[migrate] ${row.id}`, patch);

    if (!dryRun) {
      batch.set(doc(db, "employees", row.id), patch, { merge: true });
    }
  });

  if (!changed) {
    console.log("No employee access changes required.");
    return;
  }

  if (dryRun) {
    console.log(`Dry run complete. ${changed} employee record(s) would be updated.`);
    console.log("Run with --write to apply changes.");
    return;
  }

  await batch.commit();
  console.log(`Migration complete. Updated ${changed} employee record(s).`);
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
