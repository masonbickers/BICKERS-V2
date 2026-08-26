import test, { after, before, beforeEach } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, listAll, ref, uploadBytes } from "firebase/storage";

const projectId = "demo-bickers-storage-access-rules";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
    storage: { rules: await readFile(new URL("../storage.rules", import.meta.url), "utf8") },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

async function seedUsers() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "user-a"), { uid: "user-a", isEnabled: true, companyId: "company-a", role: "user", appAccess: { user: true, service: false } }),
      setDoc(doc(db, "users", "service-a"), { uid: "service-a", isEnabled: true, companyId: "company-a", role: "user", appAccess: { user: false, service: true } }),
      setDoc(doc(db, "users", "admin-a"), { uid: "admin-a", isEnabled: true, companyId: "company-a", role: "admin", appAccess: { user: true, service: true } }),
      setDoc(doc(db, "users", "finance-a"), { uid: "finance-a", isEnabled: true, companyId: "company-a", role: "user", financeAccess: true, appAccess: { user: true, service: false } }),
      setDoc(doc(db, "users", "service-b"), { uid: "service-b", isEnabled: true, companyId: "company-b", role: "user", appAccess: { user: false, service: true } }),
      setDoc(doc(db, "users", "platform"), { uid: "platform", isEnabled: true, role: "platformAdmin", appAccess: { user: true, service: true } }),
      setDoc(doc(db, "users", "disabled-a"), { uid: "disabled-a", isEnabled: false, companyId: "company-a", role: "user", appAccess: { user: true, service: true } }),
    ]);
  });
}

const pdf = new Uint8Array([37, 80, 68, 70]);
const png = new Uint8Array([137, 80, 78, 71]);

test("signed-out, missing and disabled users cannot upload", async () => {
  await seedUsers();
  const path = "companies/company-a/quotes/test.pdf";
  await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), path), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("missing").storage(), path), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("disabled-a").storage(), path), pdf, { contentType: "application/pdf" }));
});

test("company and workspace checks protect scoped files", async () => {
  await seedUsers();
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext("user-a").storage(), "companies/company-a/quotes/test.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("user-a").storage(), "companies/company-b/quotes/test.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("service-a").storage(), "companies/company-a/quotes/test.pdf"), pdf, { contentType: "application/pdf" }));
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext("service-a").storage(), "companies/company-a/maintenance-quotes/test.pdf"), pdf, { contentType: "application/pdf" }));
});

test("maintenance evidence permissions distinguish ordinary, service, admin and cross-company users", async () => {
  await seedUsers();
  const path = "companies/company-a/maintenance-quotes/inspection.pdf";
  await assertFails(uploadBytes(ref(env.authenticatedContext("user-a").storage(), path), pdf, { contentType: "application/pdf" }));
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext("service-a").storage(), path), pdf, { contentType: "application/pdf" }));
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext("admin-a").storage(), path), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("service-b").storage(), path), pdf, { contentType: "application/pdf" }));
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext("platform").storage(), path), pdf, { contentType: "application/pdf" }));
});

test("receipt evidence is writable by its owner and readable by company finance", async () => {
  await seedUsers();
  const path = "companies/company-a/receipts/user-a/receipt-1/fuel.pdf";
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext("user-a").storage(), path), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("service-a").storage(), path), pdf, { contentType: "application/pdf" }));
  await assertSucceeds(getBytes(ref(env.authenticatedContext("user-a").storage(), path)));
  await assertFails(getBytes(ref(env.authenticatedContext("service-a").storage(), path)));
  await assertSucceeds(getBytes(ref(env.authenticatedContext("finance-a").storage(), path)));
  await assertFails(getBytes(ref(env.authenticatedContext("service-b").storage(), path)));
});

test("issued invoice PDFs are server-only even for finance and administrators", async () => {
  await seedUsers();
  const path = "companies/company-a/issued-invoices/invoice-a/invoice.pdf";
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), path), pdf, { contentType: "application/pdf" });
  });
  for (const uid of ["user-a", "finance-a", "admin-a", "platform"]) {
    await assertFails(getBytes(ref(env.authenticatedContext(uid).storage(), path)));
  }
});

test("platform admins can upload their own receipt images for a company", async () => {
  await seedUsers();
  const path = "companies/bickers-action/receipts/platform/receipt-1/receipt.png";
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext("platform").storage(), path), png, { contentType: "image/png" }));
});

test("Recce photos support current location folders and the legacy path", async () => {
  await seedUsers();
  const userStorage = env.authenticatedContext("user-a").storage();
  const currentPath = "recces/booking-a/2026-08-26/user-a/location-1/photo.jpg";
  const legacyPath = "recces/booking-a/2026-08-26/user-a/photo.jpg";

  await assertSucceeds(uploadBytes(ref(userStorage, currentPath), png, { contentType: "image/jpeg" }));
  await assertSucceeds(uploadBytes(ref(userStorage, legacyPath), png, { contentType: "image/jpeg" }));
  await assertSucceeds(getBytes(ref(userStorage, currentPath)));
  await assertFails(uploadBytes(
    ref(env.authenticatedContext("admin-a").storage(), "recces/booking-a/2026-08-26/user-a/location-1/admin.jpg"),
    png,
    { contentType: "image/jpeg" },
  ));
  await assertFails(uploadBytes(
    ref(userStorage, "recces/booking-a/2026-08-26/user-a/location-1/not-an-image.pdf"),
    pdf,
    { contentType: "application/pdf" },
  ));
});

test("employee app upload families remain available without cross-user writes", async () => {
  await seedUsers();
  const userStorage = env.authenticatedContext("user-a").storage();
  const serviceStorage = env.authenticatedContext("service-a").storage();
  const userPaths = [
    "vehicle-checks/user-a/check-a/photo.jpg",
    "uploads/photos/user-a/2026/08/photo.jpg",
    "expenses/user-a/expense-a.jpg",
    "profilePictures/user-a.jpg",
  ];
  const servicePaths = [
    "serviceRecords/service-a/checks/photo.jpg",
    "defectReports/defect-a/vehicle-a/photo.jpg",
    "equipmentInspections/inspection-a/photos/photo.jpg",
  ];

  for (const path of userPaths) {
    await assertSucceeds(uploadBytes(ref(userStorage, path), png, { contentType: "image/jpeg" }));
    await assertSucceeds(getBytes(ref(userStorage, path)));
  }
  for (const path of servicePaths) {
    await assertSucceeds(uploadBytes(ref(serviceStorage, path), png, { contentType: "image/jpeg" }));
    await assertSucceeds(getBytes(ref(serviceStorage, path)));
  }

  await assertFails(uploadBytes(
    ref(env.authenticatedContext("admin-a").storage(), "vehicle-checks/user-a/check-a/admin.jpg"),
    png,
    { contentType: "image/jpeg" },
  ));
  await assertFails(uploadBytes(
    ref(env.authenticatedContext("admin-a").storage(), "profilePictures/user-a.jpg"),
    png,
    { contentType: "image/jpeg" },
  ));
  await assertFails(uploadBytes(
    ref(userStorage, "serviceRecords/service-a/checks/user.jpg"),
    png,
    { contentType: "image/jpeg" },
  ));
});

test("technical library files are readable by user-workspace accounts only", async () => {
  await seedUsers();
  await env.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage();
    await Promise.all([
      uploadBytes(ref(storage, "insurance/employers-liability.pdf"), pdf, { contentType: "application/pdf" }),
      uploadBytes(ref(storage, "spec sheets/crane-specification.pdf"), pdf, { contentType: "application/pdf" }),
    ]);
  });

  const userStorage = env.authenticatedContext("user-a").storage();
  await assertSucceeds(listAll(ref(userStorage, "insurance")));
  await assertSucceeds(getBytes(ref(userStorage, "insurance/employers-liability.pdf")));
  await assertSucceeds(listAll(ref(userStorage, "spec sheets")));
  await assertSucceeds(getBytes(ref(userStorage, "spec sheets/crane-specification.pdf")));

  for (const context of [
    env.unauthenticatedContext(),
    env.authenticatedContext("missing"),
    env.authenticatedContext("disabled-a"),
    env.authenticatedContext("service-a"),
  ]) {
    await assertFails(listAll(ref(context.storage(), "insurance")));
    await assertFails(listAll(ref(context.storage(), "spec sheets")));
  }

  await assertFails(uploadBytes(ref(userStorage, "insurance/replacement.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(userStorage, "spec sheets/replacement.pdf"), pdf, { contentType: "application/pdf" }));
});
