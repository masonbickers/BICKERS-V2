import test from "node:test";
import assert from "node:assert/strict";
import { isAccountDisabled, hasCanonicalAccessRecord } from "../src/app/utils/accountAccess.js";
import { chooseLinkedUid, preferredVerifiedEmail } from "../src/app/utils/clerkFirebaseLink.js";

test("requires a verified Clerk email", () => {
  const base = {
    primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: "User@Bickers.co.uk", verification: { status: "unverified" } }],
  };
  assert.equal(preferredVerifiedEmail(base), "");
  assert.equal(preferredVerifiedEmail({
    ...base,
    emailAddresses: [{ ...base.emailAddresses[0], verification: { status: "verified" } }],
  }), "user@bickers.co.uk");
});

test("does not invent a Firebase UID from an employee document id", () => {
  assert.equal(chooseLinkedUid([], [{ id: "employee-document", data: { email: "user@bickers.co.uk" } }]), "");
  assert.equal(chooseLinkedUid([], [{ id: "employee-document", data: { authUid: "firebase_uid" } }]), "firebase_uid");
});

test("disabled and missing canonical accounts fail closed", () => {
  assert.equal(isAccountDisabled({ isEnabled: false }), true);
  assert.equal(isAccountDisabled({ active: false }), true);
  assert.equal(isAccountDisabled({ appDisabled: true }), true);
  assert.equal(hasCanonicalAccessRecord(null), false);
  assert.equal(hasCanonicalAccessRecord({ email: "user@bickers.co.uk" }), false);
  assert.equal(hasCanonicalAccessRecord({ uid: "firebase_uid" }), true);
});
