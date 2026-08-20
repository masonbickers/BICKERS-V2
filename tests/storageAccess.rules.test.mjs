import test, { after, before, beforeEach } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

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

test("platform admins can upload their own receipt images for a company", async () => {
  await seedUsers();
  const path = "companies/bickers-action/receipts/platform/receipt-1/receipt.png";
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext("platform").storage(), path), png, { contentType: "image/png" }));
});
