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
    ]);
  });
}

test("signed-out, missing-user and disabled-user reads are denied", async () => {
  await seed();
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "bookings", "booking-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("missing").firestore(), "bookings", "booking-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("disabled-a").firestore(), "bookings", "booking-a")));
});

test("tenant reads require a company-filtered query and reject another tenant", async () => {
  await seed();
  const db = env.authenticatedContext("user-a").firestore();
  const snap = await assertSucceeds(getDocs(query(collection(db, "bookings"), where("companyId", "==", "company-a"))));
  assert.equal(snap.size, 1);
  await assertFails(getDoc(doc(db, "bookings", "booking-b")));
  await assertFails(getDocs(collection(db, "bookings")));
});

test("workspace access is enforced", async () => {
  await seed();
  await assertSucceeds(getDoc(doc(env.authenticatedContext("user-a").firestore(), "contacts", "contact-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("service-a").firestore(), "contacts", "contact-a")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("service-a").firestore(), "maintenance", "maintenance-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("user-a").firestore(), "maintenance", "maintenance-a")));
});

test("writes cannot omit or change tenant ownership", async () => {
  await seed();
  const db = env.authenticatedContext("user-a").firestore();
  await assertSucceeds(setDoc(doc(db, "bookings", "new-a"), { companyId: "company-a", title: "new" }));
  await assertFails(setDoc(doc(db, "bookings", "new-b"), { companyId: "company-b", title: "new" }));
  await assertFails(updateDoc(doc(db, "bookings", "booking-a"), { companyId: "company-b" }));
});

test("admin is company-scoped and platform admin is platform-wide", async () => {
  await seed();
  await assertFails(getDoc(doc(env.authenticatedContext("admin-a").firestore(), "bookings", "booking-b")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("platform").firestore(), "bookings", "booking-b")));
});
