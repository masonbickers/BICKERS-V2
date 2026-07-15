import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let environment;

const employee = {
  employeeId: "employee-a",
  employeeCode: "1001",
  employeeEmail: "employee.a@bickers.co.uk",
};

const baseTimesheet = {
  schemaVersion: 1,
  ...employee,
  employeeName: "Employee A",
  weekStart: "2026-07-13",
  days: { monday: { mode: "yard", yardSegments: [{ start: "08:00", end: "16:30" }] } },
  notes: "",
  status: "draft",
  submitted: false,
  approved: false,
  approvedAt: null,
};

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "bickers-timesheet-rules-test",
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "employee-a-auth"), {
      uid: "employee-a-auth",
      email: employee.employeeEmail,
      ...employee,
      role: "user",
      isEnabled: true,
    });
    await setDoc(doc(db, "users", "employee-b-auth"), {
      uid: "employee-b-auth",
      email: "employee.b@bickers.co.uk",
      employeeId: "employee-b",
      employeeCode: "1002",
      role: "user",
      isEnabled: true,
    });
    await setDoc(doc(db, "users", "admin-auth"), {
      uid: "admin-auth",
      email: "admin@bickers.co.uk",
      role: "admin",
      isEnabled: true,
    });
    await setDoc(doc(db, "timesheets", "1001_2026-07-13"), baseTimesheet);
    await setDoc(doc(db, "timesheets", "1001_2026-07-06"), {
      ...baseTimesheet,
      weekStart: "2026-07-06",
      status: "approved",
      submitted: true,
      approved: true,
      approvedAt: "2026-07-10T12:00:00.000Z",
    });
  });
});

after(async () => environment?.cleanup());

test("employees can read only identity-matched timesheets", async () => {
  const ownDb = environment.authenticatedContext("employee-a-auth").firestore();
  const otherDb = environment.authenticatedContext("employee-b-auth").firestore();
  await assertSucceeds(getDoc(doc(ownDb, "timesheets", "1001_2026-07-13")));
  await assertFails(getDoc(doc(otherDb, "timesheets", "1001_2026-07-13")));
});

test("employees can create only their own canonical draft", async () => {
  const db = environment.authenticatedContext("employee-a-auth").firestore();
  await assertSucceeds(setDoc(doc(db, "timesheets", "1001_2026-07-20"), {
    ...baseTimesheet,
    weekStart: "2026-07-20",
  }));
  await assertFails(setDoc(doc(db, "timesheets", "1002_2026-07-20"), {
    ...baseTimesheet,
    employeeCode: "1002",
    weekStart: "2026-07-20",
  }));
});

test("employees may submit revisions but cannot modify approval fields", async () => {
  const db = environment.authenticatedContext("employee-a-auth").firestore();
  const ref = doc(db, "timesheets", "1001_2026-07-13");
  await assertSucceeds(updateDoc(ref, {
    status: "submitted",
    submitted: true,
    submittedAt: "2026-07-15T09:00:00.000Z",
    lastSubmittedAt: "2026-07-15T09:00:00.000Z",
    submissionRevision: 1,
    updatedAt: "2026-07-15T09:00:00.000Z",
  }));
  await assertFails(updateDoc(ref, {
    approved: true,
    approvedAt: "2026-07-15T10:00:00.000Z",
    status: "approved",
  }));
});

test("approved timesheets are read-only for employees and editable by admins", async () => {
  const employeeDb = environment.authenticatedContext("employee-a-auth").firestore();
  const adminDb = environment.authenticatedContext("admin-auth").firestore();
  const employeeRef = doc(employeeDb, "timesheets", "1001_2026-07-06");
  await assertFails(updateDoc(employeeRef, { notes: "changed" }));
  await assertSucceeds(updateDoc(doc(adminDb, "timesheets", "1001_2026-07-06"), { notes: "manager note" }));
});

test("a matching employee id cannot be paired with another employee code", async () => {
  const db = environment.authenticatedContext("employee-a-auth").firestore();
  await assertFails(setDoc(doc(db, "timesheets", "1002_2026-07-27"), {
    ...baseTimesheet,
    employeeCode: "1002",
    weekStart: "2026-07-27",
  }));
});
