import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";

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
      setDoc(doc(db, "users", "finance-a"), { uid: "finance-a", isEnabled: true, companyId: "company-a", role: "user", financeAccess: true, appAccess: { user: true, service: false } }),
      setDoc(doc(db, "users", "service-b"), { uid: "service-b", isEnabled: true, companyId: "company-b", role: "user", appAccess: { user: false, service: true } }),
      setDoc(doc(db, "users", "platform"), { uid: "platform", isEnabled: true, role: "platformAdmin", appAccess: { user: true, service: true } }),
      setDoc(doc(db, "employees", "employee-a"), { companyId: "company-a", authUid: "user-a", financeAccess: false, name: "Employee A" }),
      setDoc(doc(db, "employeePersonnel", "employee-a"), { companyId: "company-a", dateOfBirth: "1990-01-01" }),
      setDoc(doc(db, "bookings", "booking-a"), { companyId: "company-a", title: "A" }),
      setDoc(doc(db, "bookings", "booking-b"), { companyId: "company-b", title: "B" }),
      setDoc(doc(db, "contacts", "contact-a"), { companyId: "company-a", name: "A" }),
      setDoc(doc(db, "contacts", "contact-basic"), { companyId: "company-a", name: "Basic" }),
      setDoc(doc(db, "contacts", "contact-legacy-finance"), { companyId: "company-a", name: "Legacy", financeProfile: { defaultPaymentTerms: 30 } }),
      setDoc(doc(db, "invoiceQueue", "invoice-a"), { companyId: "company-a", status: "draft" }),
      setDoc(doc(db, "invoiceQueue", "invoice-b"), { companyId: "company-b", status: "draft" }),
      setDoc(doc(db, "contactFinanceProfiles", "contact-a"), { companyId: "company-a", sageCustomerId: "SAGE-A" }),
      setDoc(doc(db, "maintenance", "maintenance-a"), { companyId: "company-a", title: "A" }),
      setDoc(doc(db, "maintenanceBookings", "maintenance-booking-a"), {
        companyId: "company-a",
        status: "Booked",
        maintenanceTypeIds: ["pmi"],
      }),
      setDoc(doc(db, "maintenanceBookings", "maintenance-booking-b"), {
        companyId: "company-b",
        status: "Booked",
        maintenanceTypeIds: ["service"],
      }),
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
      setDoc(doc(db, "userActivityBuckets", "bucket-a"), { companyId: "company-a", uid: "user-a", activeSeconds: 300 }),
      setDoc(doc(db, "userActivitySessions", "session-a"), { companyId: "company-a", uid: "user-a", activeSeconds: 300 }),
      setDoc(doc(db, "activityReviews", "review-a"), { companyId: "company-a", status: "unreviewed" }),
      setDoc(doc(db, "activityTrackingSettings", "company-a"), { companyId: "company-a", enabled: true }),
      setDoc(doc(db, "receiptGroups", "group-a"), { companyId: "company-a", submitterUid: "user-a", monthKey: "2026-08", status: "draft", declaredNoReceipts: false }),
      setDoc(doc(db, "receiptGroups", "group-other-a"), { companyId: "company-a", submitterUid: "service-a", monthKey: "2026-08", status: "submitted", declaredNoReceipts: false }),
      setDoc(doc(db, "receiptGroups", "group-b"), { companyId: "company-b", submitterUid: "service-b", monthKey: "2026-08", status: "submitted", declaredNoReceipts: false }),
      setDoc(doc(db, "receipts", "receipt-a"), { companyId: "company-a", submitterUid: "user-a", monthKey: "2026-08", groupId: "group-a", purpose: "Fuel A", valuePence: 1200, suggestedVatPence: 200, status: "pending" }),
      setDoc(doc(db, "receipts", "receipt-other-a"), { companyId: "company-a", submitterUid: "service-a", monthKey: "2026-08", groupId: "group-other-a", purpose: "Parts A", valuePence: 2400, suggestedVatPence: 400, status: "pending" }),
      setDoc(doc(db, "receipts", "receipt-b"), { companyId: "company-b", submitterUid: "service-b", monthKey: "2026-08", groupId: "group-b", purpose: "Fuel B", valuePence: 1200, suggestedVatPence: 200, status: "pending" }),
    ]);
  });
}

test("signed-out, missing-user and disabled-user reads are denied", async () => {
  await seed();
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "bookings", "booking-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("missing").firestore(), "bookings", "booking-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("disabled-a").firestore(), "bookings", "booking-a")));
});

test("working terms acceptance is signed once and remains readable", async () => {
  await seed();
  const userDb = env.authenticatedContext("user-a").firestore();
  const acceptanceRef = doc(userDb, "workingTermsAcceptances", "user-a", "versions", "1.1");
  const acceptance = {
    accepted: true,
    acceptedAt: serverTimestamp(),
    companyId: "company-a",
    documentEffectiveDate: "19/08/2026",
    documentTitle: "Bickers Action Working Terms",
    documentVersion: "1.1",
    employeeId: "employee-a",
    email: "employee@example.com",
    fullName: "Employee A",
    signatureSvgPath: "M 10 10 L 20 20 L 30 10",
    signedFromAppVersion: "5.0.7",
    signedFromPlatform: "ios",
    userId: "user-a",
  };

  await assertSucceeds(setDoc(acceptanceRef, acceptance));
  await assertSucceeds(getDoc(acceptanceRef));
  await assertFails(setDoc(acceptanceRef, acceptance));
  await assertFails(deleteDoc(acceptanceRef));
  await assertFails(getDoc(doc(env.authenticatedContext("service-a").firestore(), "workingTermsAcceptances", "user-a", "versions", "1.1")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("admin-a").firestore(), "workingTermsAcceptances", "user-a", "versions", "1.1")));
});

test("mobile expense claims are owner-controlled and finance-readable", async () => {
  await seed();
  const userDb = env.authenticatedContext("user-a").firestore();
  const expenseRef = doc(userDb, "expenses", "expense-a");
  await assertSucceeds(setDoc(expenseRef, {
    ownerUid: "user-a",
    employeeId: "employee-a",
    employeeCode: "0001",
    employeeName: "Employee A",
    type: "Parking",
    paymentMethod: "personal",
    amount: 12.5,
    note: "Production parking",
    status: "submitted",
  }));
  await assertSucceeds(getDoc(expenseRef));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("finance-a").firestore(), "expenses", "expense-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("service-a").firestore(), "expenses", "expense-a")));
  await assertSucceeds(updateDoc(expenseRef, { note: "Updated parking note" }));
  await assertFails(updateDoc(expenseRef, { status: "approved" }));
  await assertSucceeds(deleteDoc(expenseRef));
  await assertFails(setDoc(doc(userDb, "expenses", "spoofed"), {
    ownerUid: "service-a",
    type: "Parking",
    paymentMethod: "personal",
    amount: 10,
    status: "submitted",
  }));
});

test("equipment inspections are available only to service-workspace accounts", async () => {
  await seed();
  const serviceDb = env.authenticatedContext("service-a").firestore();
  const inspectionRef = doc(serviceDb, "equipmentInspections", "inspection-a");
  await assertSucceeds(setDoc(inspectionRef, {
    equipmentName: "Camera crane",
    inspectionDateISO: "2026-08-26",
    overallResult: "pass",
  }));
  await assertSucceeds(getDoc(inspectionRef));
  await assertSucceeds(updateDoc(inspectionRef, { overallResult: "fail" }));
  await assertSucceeds(deleteDoc(inspectionRef));
  await assertFails(setDoc(
    doc(env.authenticatedContext("user-a").firestore(), "equipmentInspections", "inspection-user"),
    { equipmentName: "Not permitted" },
  ));
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

test("personnel files are available only to administrators", async () => {
  await seed();
  const userDb = env.authenticatedContext("user-a").firestore();
  const adminDb = env.authenticatedContext("admin-a").firestore();
  const platformDb = env.authenticatedContext("platform").firestore();

  await assertFails(getDocs(collection(userDb, "employeePersonnel")));
  await assertSucceeds(getDocs(collection(adminDb, "employeePersonnel")));
  await assertSucceeds(getDocs(collection(platformDb, "employeePersonnel")));
  await assertFails(updateDoc(doc(adminDb, "employeePersonnel", "employee-a"), { dateOfBirth: "1990-02-01" }));
  await assertFails(updateDoc(doc(platformDb, "employeePersonnel", "employee-a"), { dateOfBirth: "1990-02-01" }));
});

test("activity tracking collections are server-only even for administrators", async () => {
  await seed();
  for (const uid of ["user-a", "admin-a", "platform"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "userActivityBuckets", "bucket-a")));
    await assertFails(getDoc(doc(db, "userActivitySessions", "session-a")));
    await assertFails(getDoc(doc(db, "activityReviews", "review-a")));
    await assertFails(getDoc(doc(db, "activityTrackingSettings", "company-a")));
    await assertFails(setDoc(doc(db, "userActivityBuckets", `spoof-${uid}`), { companyId: "company-a", uid, activeSeconds: 9999 }));
  }
});

test("receipt records are private to the submitter and available to company finance", async () => {
  await seed();
  const userDb = env.authenticatedContext("user-a").firestore();
  await assertSucceeds(getDoc(doc(userDb, "receipts", "receipt-a")));
  await assertFails(getDoc(doc(userDb, "receipts", "receipt-other-a")));
  const ownRows = await assertSucceeds(getDocs(query(collection(userDb, "receipts"), where("companyId", "==", "company-a"), where("submitterUid", "==", "user-a"))));
  assert.equal(ownRows.size, 1);
  await assertFails(getDocs(collection(userDb, "receipts")));
  const batch = writeBatch(userDb);
  batch.set(doc(userDb, "receiptGroups", "new-group"), {
    companyId: "company-a",
    submitterUid: "user-a",
    monthKey: "2026-07",
    status: "draft",
    declaredNoReceipts: false,
  });
  batch.set(doc(userDb, "receipts", "new-receipt"), {
    companyId: "company-a",
    submitterUid: "user-a",
    monthKey: "2026-07",
    groupId: "new-group",
    purpose: "Hotel for job 2451",
    valuePence: 12500,
    suggestedVatPence: 2083,
    status: "pending",
  });
  await assertSucceeds(batch.commit());
  await assertFails(setDoc(doc(userDb, "receipts", "missing-details"), {
    companyId: "company-a",
    submitterUid: "user-a",
    status: "pending",
  }));
  await assertFails(updateDoc(doc(userDb, "receipts", "receipt-a"), { status: "approved" }));

  const financeDb = env.authenticatedContext("finance-a").firestore();
  await assertSucceeds(getDoc(doc(financeDb, "receipts", "receipt-other-a")));
  await assertSucceeds(getDoc(doc(financeDb, "receiptGroups", "group-other-a")));
  await assertFails(getDoc(doc(financeDb, "receipts", "receipt-b")));
  const companyRows = await assertSucceeds(getDocs(query(collection(financeDb, "receipts"), where("companyId", "==", "company-a"))));
  assert.equal(companyRows.size, 3);
  await assertFails(updateDoc(doc(financeDb, "receipts", "receipt-a"), { status: "checked" }));
  await assertSucceeds(updateDoc(doc(userDb, "receipts", "receipt-a"), { purpose: "Corrected fuel", valuePence: 1300, suggestedVatPence: 217 }));
  await assertFails(updateDoc(doc(userDb, "receiptGroups", "group-a"), { status: "submitted" }));
});

test("invoice records are private to same-company finance and customer finance profiles are server-only", async () => {
  await seed();
  await assertFails(getDoc(doc(env.authenticatedContext("user-a").firestore(), "invoiceQueue", "invoice-a")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("finance-a").firestore(), "invoiceQueue", "invoice-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("finance-a").firestore(), "invoiceQueue", "invoice-b")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("admin-a").firestore(), "invoiceQueue", "invoice-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("admin-a").firestore(), "invoiceQueue", "invoice-b")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("platform").firestore(), "invoiceQueue", "invoice-b")));
  for (const uid of ["user-a", "finance-a", "admin-a", "platform"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "contactFinanceProfiles", "contact-a")));
    await assertFails(updateDoc(doc(db, "invoiceQueue", "invoice-a"), { status: "approved" }));
  }
});

test("ordinary staff can delete basic contacts but not contacts with finance data", async () => {
  await seed();
  const ordinaryDb = env.authenticatedContext("user-a").firestore();
  await assertSucceeds(deleteDoc(doc(ordinaryDb, "contacts", "contact-basic")));
  await assertFails(deleteDoc(doc(ordinaryDb, "contacts", "contact-a")));
  await assertFails(deleteDoc(doc(ordinaryDb, "contacts", "contact-legacy-finance")));
  await assertSucceeds(deleteDoc(doc(env.authenticatedContext("finance-a").firestore(), "contacts", "contact-a")));
});

test("finance grants cannot be changed by direct browser writes", async () => {
  await seed();
  const adminDb = env.authenticatedContext("admin-a").firestore();
  await assertFails(updateDoc(doc(adminDb, "users", "user-a"), { financeAccess: true }));
  await assertFails(updateDoc(doc(adminDb, "employees", "employee-a"), { financeAccess: true }));
  await assertSucceeds(updateDoc(doc(adminDb, "employees", "employee-a"), { name: "Employee A Updated" }));
});

test("browser clients cannot manufacture or transition legal maintenance records", async () => {
  await seed();
  for (const uid of ["service-a", "admin-a", "platform"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(db, "maintenanceBookings", `direct-${uid}`), {
      companyId: "company-a",
      status: "Completed",
      completedAtISO: "2026-08-04",
      maintenanceTypeIds: ["pmi"],
    }));
    await assertFails(updateDoc(doc(db, "maintenanceBookings", "maintenance-booking-a"), {
      status: "Completed",
      completedAtISO: "2026-08-04",
    }));
  }
});

test("maintenance permissions distinguish ordinary, service, admin and cross-company users", async () => {
  await seed();
  await assertSucceeds(getDoc(doc(env.authenticatedContext("user-a").firestore(), "maintenanceBookings", "maintenance-booking-a")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("service-a").firestore(), "maintenanceBookings", "maintenance-booking-a")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("admin-a").firestore(), "maintenanceBookings", "maintenance-booking-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("service-b").firestore(), "maintenanceBookings", "maintenance-booking-a")));
  await assertFails(getDoc(doc(env.authenticatedContext("admin-a").firestore(), "maintenanceBookings", "maintenance-booking-b")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("platform").firestore(), "maintenanceBookings", "maintenance-booking-b")));
});

test("vehicle clients cannot write legal completion history but may edit ordinary fields", async () => {
  await seed();
  const db = env.authenticatedContext("service-a").firestore();
  await assertFails(updateDoc(doc(db, "vehicles", "vehicle-locked"), {
    pmiHistory: [{ completedDate: "2026-08-03", bookingId: "valid-completion" }],
  }));
  await assertSucceeds(updateDoc(doc(db, "vehicles", "vehicle-locked"), {
    name: "Locked HGV updated",
  }));
  await assertFails(updateDoc(doc(db, "vehicles", "vehicle-locked"), {
    eightWeekInspectionHistory: [{ completedDate: "2026-11-23", bookingId: "stale-replay" }],
  }));
  await assertFails(updateDoc(doc(db, "vehicles", "vehicle-unlocked"), {
    eightWeekInspectionHistory: [{ completedDate: "2026-07-01", bookingId: "legacy-valid" }],
  }));
  await assertFails(updateDoc(doc(db, "vehicles", "vehicle-unlocked"), {
    lastMOT: "2026-08-04",
    motHistory: [{ completedDate: "2026-08-04" }],
  }));
});
