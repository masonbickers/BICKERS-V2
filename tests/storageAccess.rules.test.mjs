import test, { after, before, beforeEach } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

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
      setDoc(doc(db, "users", "disabled-a"), { uid: "disabled-a", isEnabled: false, companyId: "company-a", role: "user", appAccess: { user: true, service: true } }),
    ]);
  });
}

const pdf = new Uint8Array([37, 80, 68, 70]);

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
