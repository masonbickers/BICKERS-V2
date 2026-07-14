import fs from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const projectId = "demo-bickers-booking";
const companyId = "bickers-action";
const otherCompanyId = "other-company";
let env;

const userRecord = (overrides = {}) => ({
  companyId,
  isEnabled: true,
  credentialResetRequired: false,
  role: "user",
  appAccess: { user: true, service: true },
  defaultWorkspace: "user",
  ...overrides,
});

async function seedFirestore(entries) {
  await env.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
    storage: { rules: fs.readFileSync("storage.rules", "utf8") },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

after(async () => {
  await env?.cleanup();
});

describe("Firestore tenant and account gates", () => {
  test("denies unauthenticated, missing, disabled, and reset-required users", async () => {
    await seedFirestore([
      ["users/disabled", userRecord({ isEnabled: false })],
      ["users/reset", userRecord({ credentialResetRequired: true })],
      ["vehicles/v1", { companyId, registration: "AB12CDE" }],
    ]);

    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "vehicles/v1")));
    await assertFails(getDoc(doc(env.authenticatedContext("missing").firestore(), "vehicles/v1")));
    await assertFails(getDoc(doc(env.authenticatedContext("disabled").firestore(), "vehicles/v1")));
    await assertFails(getDoc(doc(env.authenticatedContext("reset").firestore(), "vehicles/v1")));
  });

  test("requires a company-constrained query and rejects cross-company records", async () => {
    await seedFirestore([
      ["users/user", userRecord()],
      ["vehicles/own", { companyId, registration: "AB12CDE" }],
      ["vehicles/other", { companyId: otherCompanyId, registration: "XY99ZZZ" }],
    ]);
    const db = env.authenticatedContext("user").firestore();

    await assertSucceeds(getDocs(query(collection(db, "vehicles"), where("companyId", "==", companyId))));
    await assertFails(getDocs(collection(db, "vehicles")));
    await assertFails(getDoc(doc(db, "vehicles/other")));
  });

  test("enforces ordinary-user ownership and the admin mutation matrix", async () => {
    await seedFirestore([
      ["users/user", userRecord()],
      ["users/admin", userRecord({ role: "admin" })],
      ["bookings/b1", { companyId, name: "Protected booking" }],
    ]);
    const userDb = env.authenticatedContext("user", { email: "user@example.test" }).firestore();
    const adminDb = env.authenticatedContext("admin").firestore();

    await assertSucceeds(setDoc(doc(userDb, "holidays/h1"), {
      companyId,
      requestedByUid: "user",
      status: "requested",
      startDate: "2026-07-20",
      endDate: "2026-07-20",
    }));
    await assertSucceeds(setDoc(doc(userDb, "vehicleIssues/i1"), {
      companyId,
      reportedByUid: "user",
      createdAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(userDb, "bookings/b1"), { status: "complete" }));
    await assertSucceeds(updateDoc(doc(adminDb, "bookings/b1"), { status: "complete" }));
  });

  test("keeps platform admins tenant-bound in client rules", async () => {
    await seedFirestore([
      ["users/platform", userRecord({ role: "platformAdmin" })],
      ["vehicles/other", { companyId: otherCompanyId, registration: "XY99ZZZ" }],
    ]);
    const db = env.authenticatedContext("platform").firestore();
    await assertFails(updateDoc(doc(db, "vehicles/other"), { companyId: otherCompanyId, registration: "XY99AAA" }));
  });

  test("checks workspace access", async () => {
    await seedFirestore([
      ["users/user", userRecord({ appAccess: { user: true, service: false } })],
      ["vehicles/v1", { companyId, registration: "AB12CDE" }],
      ["holidays/h1", { companyId, requestedByUid: "user", status: "requested" }],
    ]);
    const db = env.authenticatedContext("user").firestore();
    await assertFails(getDoc(doc(db, "vehicles/v1")));
    await assertSucceeds(getDoc(doc(db, "holidays/h1")));
  });

  test("freezes client writes while maintenance mode is enabled", async () => {
    await seedFirestore([
      ["users/admin", userRecord({ role: "admin" })],
      ["settings/platform", { maintenanceMode: true }],
      ["bookings/b1", { companyId, status: "confirmed" }],
    ]);
    const db = env.authenticatedContext("admin").firestore();
    await assertSucceeds(getDoc(doc(db, "bookings/b1")));
    await assertFails(updateDoc(doc(db, "bookings/b1"), { status: "complete" }));
  });
});

describe("Storage company paths, ownership, MIME, and size", () => {
  test("allows an own issue image but rejects another user's path and unsafe MIME", async () => {
    await seedFirestore([["users/user", userRecord()]]);
    const storage = env.authenticatedContext("user").storage();
    const bytes = new Uint8Array([1, 2, 3]);

    await assertSucceeds(uploadBytes(
      ref(storage, `companies/${companyId}/vehicle-issues/user/photo.png`),
      bytes,
      { contentType: "image/png" }
    ));
    await assertFails(uploadBytes(
      ref(storage, `companies/${companyId}/vehicle-issues/someone-else/photo.png`),
      bytes,
      { contentType: "image/png" }
    ));
    await assertFails(uploadBytes(
      ref(storage, `companies/${companyId}/vehicle-issues/user/script.js`),
      bytes,
      { contentType: "application/javascript" }
    ));
  });

  test("allows same-company admins and denies cross-company paths", async () => {
    await seedFirestore([["users/admin", userRecord({ role: "admin" })]]);
    const storage = env.authenticatedContext("admin").storage();
    const pdf = new Uint8Array([37, 80, 68, 70]);

    await assertSucceeds(uploadBytes(
      ref(storage, `companies/${companyId}/quotes/q1.pdf`),
      pdf,
      { contentType: "application/pdf" }
    ));
    await assertFails(uploadBytes(
      ref(storage, `companies/${otherCompanyId}/quotes/q2.pdf`),
      pdf,
      { contentType: "application/pdf" }
    ));
  });

  test("blocks reset-required users from reads", async () => {
    await seedFirestore([["users/reset", userRecord({ credentialResetRequired: true })]]);
    const storage = env.authenticatedContext("reset").storage();
    await assertFails(getBytes(ref(storage, `companies/${companyId}/quotes/missing.pdf`)));
  });

  test("freezes Storage writes during maintenance mode", async () => {
    await seedFirestore([
      ["users/admin", userRecord({ role: "admin" })],
      ["settings/platform", { maintenanceMode: true }],
    ]);
    const storage = env.authenticatedContext("admin").storage();
    await assertFails(uploadBytes(
      ref(storage, `companies/${companyId}/quotes/frozen.pdf`),
      new Uint8Array([37, 80, 68, 70]),
      { contentType: "application/pdf" }
    ));
  });
});
