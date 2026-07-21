import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const repo = new URL("../", import.meta.url);

const removedApplicationAuthPaths = [
  "src/app/api/auth/user-code-login/route.js",
  "src/app/api/mfa/_lib.js",
  "src/app/api/mfa/setup/route.js",
  "src/app/api/mfa/verify/route.js",
  "src/app/api/admin/migrate-mfa-secrets/route.js",
  "src/app/api/platform/users/force-mfa-reset/route.js",
  "src/app/api/passkeys/_lib.js",
  "src/app/api/passkeys/login/options/route.js",
  "src/app/api/passkeys/login/verify/route.js",
  "src/app/api/passkeys/register/options/route.js",
  "src/app/api/passkeys/register/verify/route.js",
  "src/app/pages/api/verify-mfa.js",
  "src/app/platform-admin/mfa/page.js",
  "src/app/setup-mfa/page.js",
  "src/app/verify-mfa/page.js",
  "src/app/verify-mfa/page.styles.module.css",
  "src/app/utils/authSecurity.js",
];

async function read(path) {
  return fs.readFile(new URL(path, repo), "utf8");
}

test("application-owned MFA, passkey and setup-code routes are unavailable", async () => {
  for (const path of removedApplicationAuthPaths) {
    await assert.rejects(fs.stat(new URL(path, repo)), { code: "ENOENT" }, path);
  }
});

test("private access depends on canonical authorization rather than browser MFA state", async () => {
  const [layout, context, bootstrap] = await Promise.all([
    read("src/app/components/ProtectedLayout.js"),
    read("src/app/context/authContext.js"),
    read("src/app/api/security/bootstrap-access/route.js"),
  ]);

  assert.doesNotMatch(layout, /setup-mfa|verify-mfa|mfaPassed|mfaReady|phoneReady/i);
  assert.doesNotMatch(context, /mfa:verified|mfaPassed|mfaReady|refreshMfaState/i);
  assert.doesNotMatch(bootstrap, /mfaSecrets|mfaSecret|mfaEnabled|mfaResetRequired/i);
  assert.match(layout, /isPathAllowedForAccess/);
  assert.match(layout, /normalizePlatformRole/);
  assert.match(context, /refreshServerAccess/);
  assert.match(context, /setAccessState\(emptyAccess\)/);
});

test("Clerk remains the login provider and the Firebase bridge remains explicit", async () => {
  const [login, accountSecurity, bridge] = await Promise.all([
    read("src/app/login/page.js"),
    read("src/app/change-password/page.js"),
    read("src/app/api/auth/firebase-token/route.js"),
  ]);

  assert.match(login, /<SignIn/);
  assert.match(accountSecurity, /<UserProfile/);
  assert.match(bridge, /preferredVerifiedEmail/);
  assert.match(bridge, /identityLinkVersion:\s*2/);
  assert.match(bridge, /Explicit employee UID link missing/);
  assert.doesNotMatch(bridge, /mfa|totp|passkey/i);
});

test("runtime rules and device registration do not use custom MFA storage", async () => {
  const [rules, deviceTokens] = await Promise.all([
    read("firestore.rules"),
    read("src/app/api/device-tokens/route.js"),
  ]);

  for (const collection of ["mfaSecrets", "passkeyCredentials", "passkeyChallenges", "setupCodeRateLimits"]) {
    assert.match(rules, new RegExp(`match /${collection}/`));
  }
  assert.equal((rules.match(/allow read, write: if false;/g) || []).length >= 4, true);
  assert.doesNotMatch(deviceTokens, /mfaSecrets|mfaEnabled|mfaMethod|phoneVerified/);
  assert.match(deviceTokens, /requireActiveUserFromRequest/);
});

test("admin APIs retain canonical server-side authorization", async () => {
  const [adminAccess, adminUsers, platformAdmin] = await Promise.all([
    read("src/app/api/admin/_lib.js"),
    read("src/app/api/admin/users/[userId]/route.js"),
    read("src/app/api/platform-admin/route.js"),
  ]);

  assert.match(adminAccess, /hasCanonicalAccessRecord\(userData\)/);
  assert.match(adminAccess, /isAccountDisabled\(userData\)/);
  assert.match(adminAccess, /hasCompanyAccess\(userData\)/);
  assert.match(adminAccess, /\["platformAdmin", "admin"\]\.includes\(normalizedRole\)/);
  assert.match(adminUsers, /requireAdminFromRequest/);
  assert.match(platformAdmin, /requirePlatformAdminFromRequest/);
});
