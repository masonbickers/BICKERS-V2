import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import {
  buildMobileAccessMigrationReport,
  clean,
  hasPasswordProvider,
} from "./mobile-access-migration-lib.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const verbose = process.argv.includes("--verbose");
const confirmation = process.argv.find((arg) => arg.startsWith("--confirm="))?.split("=")[1];
const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.slice(9);
if (apply && confirmation !== "grandfather-prior-mobile-users") {
  throw new Error(
    "Applying this migration requires --confirm=grandfather-prior-mobile-users. Run without --apply for a dry run."
  );
}

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "bickers-booking";
const clientEmail =
  process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL ||
  process.env.FIREBASE_CLIENT_EMAIL ||
  "";
const privateKey = (
  process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY ||
  process.env.FIREBASE_PRIVATE_KEY ||
  ""
).replace(/\\n/g, "\n");
const firebaseWebApiKey =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";

if (!clientEmail || !privateKey) {
  throw new Error("Firebase service account environment variables are required.");
}

const firebaseApp =
  getApps()[0] ||
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function sendFirebasePasswordSetupEmail(email) {
  if (!firebaseWebApiKey) {
    throw new Error("FIREBASE_API_KEY is required to send setup emails.");
  }
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(
      firebaseWebApiKey
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-Locale": "en-GB",
      },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
    }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      `Firebase setup email failed for ${email}: ${clean(payload?.error?.message) || response.status}`
    );
  }
}

const [employeeSnapshot, userSnapshot, authUsers] = await Promise.all([
  db.collection("employees").get(),
  db.collection("users").get(),
  listAllAuthUsers(),
]);
const employees = employeeSnapshot.docs.map((row) => ({ id: row.id, data: row.data() || {} }));
const users = userSnapshot.docs.map((row) => ({ id: row.id, data: row.data() || {} }));
const authUserByUid = new Map(authUsers.map((user) => [user.uid, user]));
const existingUserIds = new Set(users.map(({ id }) => id));
const report = buildMobileAccessMigrationReport({ employees, users, authUsers });
const output = {
  mode: apply ? "apply" : "dry-run",
  generatedAt: new Date().toISOString(),
  projectId,
  ...report,
};

if (verbose) {
  for (const row of report.rows) {
    console.log(JSON.stringify({ mode: output.mode, ...row }));
  }
}
console.log(JSON.stringify({ mode: output.mode, ...report.summary }));

if (reportPath) {
  await writeFile(path.resolve(reportPath), `${JSON.stringify(output, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}

if (report.summary.conflicts > 0) {
  process.exitCode = 2;
  if (apply) {
    throw new Error("Migration blocked: resolve every reported identity conflict first.");
  }
}

if (apply && report.summary.conflicts === 0) {
  for (const row of report.rows) {
    const employeeRef = db.collection("employees").doc(row.employeeId);
    const now = new Date().toISOString();
    const userDocIds = [...new Set([...row.linkedUserIds, ...row.candidateUids])]
      .filter((id) => existingUserIds.has(id));

    if (row.classification === "disabled") {
      const batch = db.batch();
      batch.set(
        employeeRef,
        {
          mobileAccess: {
            status: "disabled",
            approvedEmail: "",
            migratedAt: now,
            migratedBy: "mobile-access-migration",
          },
        },
        { merge: true }
      );
      for (const userId of userDocIds) {
        batch.set(
          db.collection("users").doc(userId),
          { mobileAccessStatus: "disabled", isEnabled: false, updatedAt: now },
          { merge: true }
        );
      }
      await batch.commit();
      for (const uid of row.candidateUids) {
        await auth.revokeRefreshTokens(uid).catch((error) => {
          if (error?.code !== "auth/user-not-found") throw error;
        });
      }
      continue;
    }

    if (row.classification === "pending") {
      const batch = db.batch();
      batch.set(
        employeeRef,
        {
          mobileAccess: {
            status: "pending",
            approvedEmail: "",
            migratedAt: now,
            migratedBy: "mobile-access-migration",
          },
        },
        { merge: true }
      );
      for (const userId of userDocIds) {
        batch.set(
          db.collection("users").doc(userId),
          { mobileAccessStatus: "pending", updatedAt: now },
          { merge: true }
        );
      }
      await batch.commit();
      for (const uid of row.candidateUids) {
        await auth.revokeRefreshTokens(uid).catch((error) => {
          if (error?.code !== "auth/user-not-found") throw error;
        });
      }
      continue;
    }

    const authUser = authUserByUid.get(row.uid);
    if (!authUser) {
      throw new Error(`Firebase Auth user disappeared during migration: ${row.uid}`);
    }

    if (row.setupEmailRequired) {
      const authUpdate = {
        email: row.email,
        displayName: row.name || authUser.displayName || undefined,
        disabled: false,
      };
      if (!hasPasswordProvider(authUser)) {
        authUpdate.password = crypto.randomBytes(48).toString("base64url");
      }
      await auth.updateUser(row.uid, authUpdate);
    }
    await auth.revokeRefreshTokens(row.uid);
    if (row.setupEmailRequired) {
      await sendFirebasePasswordSetupEmail(row.email);
    }

    const targetStatus = row.targetStatus;
    const employee = employees.find(({ id }) => id === row.employeeId)?.data || {};
    const linkedUser = users.find(({ id }) => id === row.uid)?.data || {};
    const batch = db.batch();
    batch.set(
      employeeRef,
      {
        uid: row.uid,
        authUid: row.uid,
        auth: {
          ...(employee.auth || {}),
          uid: row.uid,
          email: row.email,
          passwordEnabled: true,
        },
        mobileAccess: {
          ...(employee.mobileAccess || {}),
          status: targetStatus,
          approvedEmail: row.email,
          grandfatheredAt: now,
          grandfatheredBy: "mobile-access-migration",
          ...(row.setupEmailRequired ? { inviteSentAt: now } : { activatedAt: now }),
        },
      },
      { merge: true }
    );
    batch.set(
      db.collection("users").doc(row.uid),
      {
        uid: row.uid,
        authUid: row.uid,
        employeeId: row.employeeId,
        email: row.email,
        companyId: employee.companyId,
        displayName: employee.name || employee.displayName || linkedUser.displayName || "Employee",
        appAccess: employee.appAccess || linkedUser.appAccess || { user: true, service: false },
        defaultWorkspace: employee.defaultWorkspace || linkedUser.defaultWorkspace || "user",
        isEnabled: true,
        mobileAccessStatus: targetStatus,
        updatedAt: now,
      },
      { merge: true }
    );
    await batch.commit();
  }

  console.log(JSON.stringify({ mode: "apply", applied: report.rows.length, ...report.summary }));
}
