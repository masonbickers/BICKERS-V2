import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const projectId = "demo-bickers-service-access-rules";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "user-a"), { uid: "user-a", isEnabled: true, companyId: "company-a", role: "user", appAccess: { user: true, service: false } }),
      setDoc(doc(db, "users", "service-a"), { uid: "service-a", isEnabled: true, companyId: "company-a", role: "user", appAccess: { user: false, service: true } }),
      setDoc(doc(db, "users", "disabled-a"), { uid: "disabled-a", isEnabled: false, companyId: "company-a", role: "user", appAccess: { user: true, service: true } }),
      setDoc(doc(db, "users", "admin-a"), { uid: "admin-a", isEnabled: true, companyId: "company-a", role: "admin", appAccess: { user: true, service: true } }),
      setDoc(doc(db, "users", "platform"), { uid: "platform", isEnabled: true, role: "platformAdmin", appAccess: { user: true, service: true } }),
      setDoc(doc(db, "bookings", "booking-a"), { companyId: "company-a", title: "A" }),
      setDoc(doc(db, "bookings", "booking-b"), { companyId: "company-b", title: "B" }),
      setDoc(doc(db, "contacts", "contact-a"), { companyId: "company-a", name: "A" }),
      setDoc(doc(db, "maintenance", "maintenance-a"), { companyId: "company-a", title: "A" }),
      setDoc(doc(db, "vehicles", "vehicle-locked"), {
        companyId: "company-a",
        name: "Locked HGV",
        futurePmiHistoryCleanupLocked: true,
        pmiHistory: [],
        eightWeekInspectionHistory: [],
      }),
      setDoc(doc(db, "vehicles", "vehicle-unlocked"), {
        companyId: "company-a",
        name: "Unlocked HGV",
        pmiHistory: [],
        eightWeekInspectionHistory: [],
      }),
    ]);
  });
}

test("signed-out, missing-user and disabled-user reads are denied", async () => {
  await seed();
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "bookings", "booking-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("missing").firestore(), "bookings", "booking-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("disabled-a").firestore(), "bookings", "booking-a")));
});

test("single-company users can read legacy and company-stamped booking records", async () => {
  await seed();
  const db = env.authenticatedContext("user-a").firestore();
  const snap = await assertSucceeds(getDocs(query(collection(db, "bookings"), where("companyId", "==", "company-a"))));
  assert.equal(snap.size, 1);
  await assertSucceeds(getDoc(doc(db, "bookings", "booking-b")));
  const broadSnap = await assertSucceeds(getDocs(collection(db, "bookings")));
  assert.equal(broadSnap.size, 2);
});

test("workspace access is enforced", async () => {
  await seed();
  await assertSucceeds(getDoc(doc(env.authenticatedContext("user-a").firestore(), "contacts", "contact-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("service-a").firestore(), "contacts", "contact-a")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("service-a").firestore(), "maintenance", "maintenance-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("user-a").firestore(), "maintenance", "maintenance-a")));
});

test("single-company writes remain compatible with legacy ownership fields", async () => {
  await seed();
  const db = env.authenticatedContext("user-a").firestore();
  await assertSucceeds(setDoc(doc(db, "bookings", "new-a"), { companyId: "company-a", title: "new" }));
  await assertSucceeds(setDoc(doc(db, "bookings", "legacy-new"), { title: "legacy compatible" }));
  await assertSucceeds(updateDoc(doc(db, "bookings", "booking-a"), { title: "updated" }));
});

test("admin and platform admin can both read the single Bickers data set", async () => {
  await seed();
  await assertSucceeds(getDoc(doc(env.authenticatedContext("admin-a").firestore(), "bookings", "booking-b")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("platform").firestore(), "bookings", "booking-b")));
});

test("cleaned vehicles reject legacy PMI-history replay but allow canonical history and normal edits", async () => {
  await seed();
  const db = env.authenticatedContext("service-a").firestore();
  await assertSucceeds(updateDoc(doc(db, "vehicles", "vehicle-locked"), {
    pmiHistory: [{ completedDate: "2026-08-03", bookingId: "valid-completion" }],
  }));
  await assertSucceeds(updateDoc(doc(db, "vehicles", "vehicle-locked"), {
    name: "Locked HGV updated",
  }));
  await assertFails(updateDoc(doc(db, "vehicles", "vehicle-locked"), {
    eightWeekInspectionHistory: [{ completedDate: "2026-11-23", bookingId: "stale-replay" }],
  }));
  await assertSucceeds(updateDoc(doc(db, "vehicles", "vehicle-unlocked"), {
    eightWeekInspectionHistory: [{ completedDate: "2026-07-01", bookingId: "legacy-valid" }],
  }));
});
