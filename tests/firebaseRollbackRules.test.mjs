import fs from "node:fs";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

const projectId = "demo-bickers-booking-rollback";
const companyId = "bickers-action";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync("firestore.rules.secure-compatibility", "utf8") },
    storage: { rules: fs.readFileSync("storage.rules.secure-compatibility", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const base = { companyId, isEnabled: true, role: "user", appAccess: { user: true, service: true } };
    await setDoc(doc(db, "users/user"), { ...base, credentialResetRequired: false });
    await setDoc(doc(db, "users/reset"), { ...base, credentialResetRequired: true });
    await setDoc(doc(db, "bookings/own"), { companyId, status: "confirmed" });
    await setDoc(doc(db, "bookings/other"), { companyId: "other-company", status: "confirmed" });
  });
});

after(async () => env?.cleanup());

test("secure rollback remains tenant-bound and blocks reset-required accounts", async () => {
  const user = env.authenticatedContext("user");
  const reset = env.authenticatedContext("reset");
  await assertSucceeds(updateDoc(doc(user.firestore(), "bookings/own"), { companyId, status: "complete" }));
  await assertFails(getDoc(doc(user.firestore(), "bookings/other")));
  await assertFails(getDoc(doc(reset.firestore(), "bookings/own")));
  await assertSucceeds(uploadBytes(
    ref(user.storage(), `companies/${companyId}/quotes/rollback.pdf`),
    new Uint8Array([37, 80, 68, 70]),
    { contentType: "application/pdf" }
  ));
  await assertFails(uploadBytes(
    ref(user.storage(), "companies/other-company/quotes/cross-company.pdf"),
    new Uint8Array([37, 80, 68, 70]),
    { contentType: "application/pdf" }
  ));
});
