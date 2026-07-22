import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { analyzeIdentityInventory } from "../scripts/identity-access-inventory.mjs";

const repo = new URL("../", import.meta.url);
const bridgePath = new URL("src/app/api/auth/firebase-token/route.js", repo);
const bootstrapPath = new URL("src/app/api/security/bootstrap-access/route.js", repo);
const verifierPath = new URL("src/app/api/admin/_lib.js", repo);
const authContextPath = new URL("src/app/context/authContext.js", repo);
const bridgeSource = await fs.readFile(bridgePath, "utf8");
const bootstrapSource = await fs.readFile(bootstrapPath, "utf8");
const verifierSource = await fs.readFile(verifierPath, "utf8");
const authContextSource = await fs.readFile(authContextPath, "utf8");

function synthetic(context, exports) {
  const names = Object.keys(exports);
  return new vm.SyntheticModule(names, function setExports() {
    for (const name of names) this.setExport(name, exports[name]);
  }, { context });
}

function context(extra = {}) {
  return vm.createContext({
    console: { ...console, error() {} },
    Array,
    Date,
    JSON,
    Number,
    Object,
    Promise,
    Set,
    String,
    Buffer,
    URLSearchParams,
    process: { env: {} },
    Response: {
      json(body, options = {}) {
        return { body, status: options.status ?? 200 };
      },
    },
    ...extra,
  });
}

function isDisabled(record = {}) {
  return record.isEnabled === false || record.active === false || record.archived === true ||
    record.isArchived === true || record.disabled === true || record.appDisabled === true ||
    String(record.role || "").trim().toLowerCase() === "archived";
}

function verifiedEmail(user) {
  const addresses = Array.isArray(user?.emailAddresses) ? user.emailAddresses : [];
  const selected = addresses.find((row) => row.id === user?.primaryEmailAddressId) || addresses[0];
  return String(selected?.verification?.status || "").toLowerCase() === "verified"
    ? String(selected?.emailAddress || "").trim().toLowerCase()
    : "";
}

function request() {
  return {
    headers: { get() { return ""; } },
    async json() { throw new Error("Identity routes must not read a request body"); },
  };
}

function baseBridgeState() {
  return {
    session: { isAuthenticated: true, userId: "clerk-1" },
    clerkUser: {
      id: "clerk-1",
      externalId: "user-1",
      privateMetadata: { firebaseUid: "user-1" },
      primaryEmailAddressId: "primary",
      emailAddresses: [{
        id: "primary",
        emailAddress: "user@bickers.co.uk",
        verification: { status: "verified" },
      }],
    },
    users: [],
    employees: [{
      id: "employee-1",
      data: {
        authUid: "user-1",
        uid: "user-1",
        email: "user@bickers.co.uk",
        companyId: "company-1",
        appAccess: { user: true, service: false },
        defaultWorkspace: "user",
      },
    }],
    logs: [],
    token: null,
  };
}

async function loadBridge(state) {
  const ctx = context();
  const modules = {
    "@clerk/nextjs/server": synthetic(ctx, {
      auth: async () => state.session,
      currentUser: async () => state.clerkUser,
    }),
    "@/app/api/_firebaseAdminRest": synthetic(ctx, {
      adminCreateDocument: async (collection, data) => state.logs.push([collection, structuredClone(data)]),
      adminListDocuments: async (collection) => structuredClone(collection === "users" ? state.users : state.employees),
      createFirebaseCustomToken: (uid, claims) => {
        state.token = { uid, claims: structuredClone(claims) };
        return "custom-token";
      },
    }),
    "@/app/utils/accountAccess": synthetic(ctx, { isAccountDisabled: isDisabled }),
    "@/app/utils/clerkFirebaseLink": synthetic(ctx, { preferredVerifiedEmail: verifiedEmail }),
  };
  const sourceModule = new vm.SourceTextModule(bridgeSource, { context: ctx, identifier: bridgePath.href });
  await sourceModule.link(async (specifier) => {
    assert.ok(modules[specifier], `Unexpected bridge import: ${specifier}`);
    return modules[specifier];
  });
  await sourceModule.evaluate();
  return sourceModule.namespace.POST;
}

function baseBootstrapState() {
  return {
    verifiedUser: {
      uid: "user-1",
      email: "user@bickers.co.uk",
      authMethod: "clerk",
      clerkUserId: "clerk-1",
      companyEmail: "user@bickers.co.uk",
      verifiedClerkEmail: true,
      identityLinkVersion: 2,
      identityEmployeeId: "employee-1",
      identityCompanyId: "company-1",
    },
    docs: {
      users: {
        "user-1": {
          uid: "user-1",
          email: "user@bickers.co.uk",
          companyId: "company-1",
          role: "user",
          isEnabled: true,
          employeeId: "employee-1",
          appAccess: { user: true, service: false },
          defaultWorkspace: "user",
          isService: false,
        },
      },
      mfaSecrets: {},
      settings: {},
      platformCompanies: {},
    },
    employees: [{
      id: "employee-1",
      data: {
        authUid: "user-1",
        uid: "user-1",
        email: "user@bickers.co.uk",
        companyId: "company-1",
        appAccess: { user: true, service: false },
        defaultWorkspace: "user",
      },
    }],
    patches: [],
    logs: [],
    failPatch: false,
    failAudit: false,
  };
}

async function loadBootstrap(state) {
  const ctx = context();
  const modules = {
    "../../_firebaseAdminRest": synthetic(ctx, {
      adminCreateDocument: async (collection, data) => {
        state.logs.push([collection, structuredClone(data)]);
        if (state.failAudit && collection === "adminAuditLogs") throw new Error("audit failed");
      },
      adminListDocuments: async (collection) => structuredClone(collection === "employees" ? state.employees : []),
      adminReadDocument: async (collection, id) => structuredClone(state.docs[collection]?.[id] ?? null),
      adminPatchDocument: async (collection, id, patch) => {
        state.patches.push([collection, id, structuredClone(patch)]);
        if (state.failPatch) throw new Error("write failed");
        state.docs[collection] ||= {};
        state.docs[collection][id] = { ...(state.docs[collection][id] || {}), ...structuredClone(patch) };
      },
    }),
    "../../admin/_lib": synthetic(ctx, {
      readBearerToken: () => "firebase-token",
      verifyFirebaseIdToken: async () => state.verifiedUser,
    }),
    "@/app/utils/accountAccess": synthetic(ctx, { isAccountDisabled: isDisabled }),
  };
  const sourceModule = new vm.SourceTextModule(bootstrapSource, { context: ctx, identifier: bootstrapPath.href });
  await sourceModule.link(async (specifier) => {
    assert.ok(modules[specifier], `Unexpected bootstrap import: ${specifier}`);
    return modules[specifier];
  });
  await sourceModule.evaluate();
  return sourceModule.namespace.POST;
}

async function loadVerifier(payload) {
  const ctx = context({
    fetch: async () => ({
      ok: true,
      async json() {
        return { users: [{ localId: payload.uid, email: "firebase@example.com" }] };
      },
    }),
  });
  const modules = {
    "../_firebaseAdminRest": synthetic(ctx, {
      adminCreateDocument: async () => {},
      adminReadDocument: async () => null,
    }),
    "@/app/utils/accountAccess": synthetic(ctx, {
      hasCanonicalAccessRecord: () => true,
      hasCompanyAccess: () => true,
      hasRequiredWorkspaceAccess: () => true,
      isAccountDisabled: () => false,
      isModuleEnabledForUser: () => true,
    }),
  };
  const sourceModule = new vm.SourceTextModule(verifierSource, { context: ctx, identifier: verifierPath.href });
  await sourceModule.link(async (specifier) => {
    assert.ok(modules[specifier], `Unexpected verifier import: ${specifier}`);
    return modules[specifier];
  });
  await sourceModule.evaluate();
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return sourceModule.namespace.verifyFirebaseIdToken(`header.${encoded}.signature`);
}

test("bridge rejects a signed-out request", async () => {
  const state = baseBridgeState();
  state.session = { isAuthenticated: false, userId: null };
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 401);
  assert.equal(state.token, null);
});

test("validated Firebase token claims retain the hardened Clerk assurance fields", async () => {
  const verified = await loadVerifier({
    uid: "user-1",
    authMethod: "clerk",
    clerkUserId: "clerk-1",
    companyEmail: "User@Bickers.co.uk",
    verifiedClerkEmail: true,
    identityLinkVersion: 2,
    identityEmployeeId: "employee-1",
    identityCompanyId: "company-1",
  });
  assert.equal(verified.uid, "user-1");
  assert.equal(verified.authMethod, "clerk");
  assert.equal(verified.clerkUserId, "clerk-1");
  assert.equal(verified.companyEmail, "user@bickers.co.uk");
  assert.equal(verified.verifiedClerkEmail, true);
  assert.equal(verified.identityLinkVersion, 2);
  assert.equal(verified.identityEmployeeId, "employee-1");
  assert.equal(verified.identityCompanyId, "company-1");
});

test("bridge rejects an unverified Clerk email", async () => {
  const state = baseBridgeState();
  state.clerkUser.emailAddresses[0].verification.status = "unverified";
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 403);
  assert.equal(state.token, null);
});

test("bridge mints only a versioned token for a valid explicit employee UID link", async () => {
  const state = baseBridgeState();
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.uid, "user-1");
  assert.equal(state.token.claims.identityLinkVersion, 2);
  assert.equal(state.token.claims.verifiedClerkEmail, true);
  assert.equal(state.token.claims.identityEmployeeId, "employee-1");
});

test("email match without an explicit Clerk UID link is diagnostic only", async () => {
  const state = baseBridgeState();
  state.clerkUser.externalId = null;
  state.clerkUser.privateMetadata = {};
  state.employees[0].data.email = "user@bickers.co.uk";
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 403);
  assert.match(response.body.error, /explicit UID link/i);
});

test("employee document ID equality is not an identity link", async () => {
  const state = baseBridgeState();
  state.employees = [{ id: "user-1", data: {
    email: "user@bickers.co.uk", companyId: "company-1", appAccess: { user: true, service: false },
  } }];
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 403);
});

test("employee linked to another UID fails closed", async () => {
  const state = baseBridgeState();
  state.employees[0].data.authUid = "user-2";
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 403);
  assert.equal(state.token, null);
});

test("duplicate employee links for one UID fail closed", async () => {
  const state = baseBridgeState();
  state.employees.push({ id: "employee-2", data: { ...state.employees[0].data } });
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 403);
});

test("bridge rejects a UID-field conflict even when the conflicting employee email differs", async () => {
  const state = baseBridgeState();
  state.employees.push({
    id: "employee-conflict",
    data: {
      authUid: "user-1",
      uid: "user-2",
      email: "different@bickers.co.uk",
      companyId: "company-1",
      appAccess: { user: true, service: false },
    },
  });
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 403);
  assert.equal(state.token, null);
});

test("bridge rejects a mismatched canonical UID", async () => {
  const state = baseBridgeState();
  state.users = [{ id: "user-1", data: {
    uid: "user-2", clerkUserId: "clerk-1", email: "user@bickers.co.uk",
    companyId: "company-1", role: "user", appAccess: { user: true, service: false },
  } }];
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 403);
});

test("conflicting canonical Clerk links fail closed", async () => {
  const state = baseBridgeState();
  state.users = [{ id: "user-1", data: {
    uid: "user-1",
    clerkUserId: "clerk-1",
    auth: { clerkUserId: "clerk-2" },
    email: "user@bickers.co.uk",
    companyId: "company-1",
    role: "user",
  } }];
  assert.equal((await (await loadBridge(state))(request())).status, 403);

  const bootstrap = baseBootstrapState();
  bootstrap.docs.users["user-1"].clerkUserId = "clerk-1";
  bootstrap.docs.users["user-1"].auth = { clerkUserId: "clerk-2" };
  assert.equal((await (await loadBootstrap(bootstrap))(request())).status, 403);
});

test("bridge rejects canonical and employee company mismatch", async () => {
  const state = baseBridgeState();
  state.users = [{ id: "user-1", data: {
    uid: "user-1", email: "user@bickers.co.uk", companyId: "company-2", role: "user",
  } }];
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 403);
});

test("bridge rejects missing company and disabled records", async () => {
  const missingCompany = baseBridgeState();
  missingCompany.employees[0].data.companyId = "";
  assert.equal((await (await loadBridge(missingCompany))(request())).status, 403);

  const disabledCanonical = baseBridgeState();
  disabledCanonical.users = [{ id: "user-1", data: {
    uid: "user-1", email: "user@bickers.co.uk", companyId: "company-1", isEnabled: false,
  } }];
  assert.equal((await (await loadBridge(disabledCanonical))(request())).status, 403);

  const disabledEmployee = baseBridgeState();
  disabledEmployee.employees[0].data.status = "disabled";
  assert.equal((await (await loadBridge(disabledEmployee))(request())).status, 403);
});

test("missing workspace configuration fails while explicit denial remains explicit", async () => {
  const missing = baseBridgeState();
  delete missing.employees[0].data.appAccess;
  assert.equal((await (await loadBridge(missing))(request())).status, 403);

  const denied = baseBridgeState();
  denied.employees[0].data.appAccess = { user: false, service: false };
  const response = await (await loadBridge(denied))(request());
  assert.equal(response.status, 200);
  assert.equal(stateTokenClaim(denied, "identityEmployeeId"), "employee-1");
});

function stateTokenClaim(state, key) {
  return state.token?.claims?.[key];
}

test("valid canonical Platform Admin remains explicit and email allowlists are irrelevant", async () => {
  const state = baseBridgeState();
  state.clerkUser.externalId = null;
  state.clerkUser.privateMetadata = {};
  state.users = [{ id: "platform-1", data: {
    uid: "platform-1",
    clerkUserId: "clerk-1",
    email: "user@bickers.co.uk",
    role: "platformAdmin",
    appAccess: { user: true, service: true },
    isEnabled: true,
  } }];
  state.employees = [];
  const response = await (await loadBridge(state))(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.uid, "platform-1");
  assert.equal(state.token.claims.identityEmployeeId, "");
});

test("bootstrap rejects missing Firebase identity and non-versioned assurance", async () => {
  const missing = baseBootstrapState();
  missing.verifiedUser = null;
  assert.equal((await (await loadBootstrap(missing))(request())).status, 401);

  const legacy = baseBootstrapState();
  legacy.verifiedUser.identityLinkVersion = 0;
  assert.equal((await (await loadBootstrap(legacy))(request())).status, 403);
});

test("bootstrap refreshes a valid explicit employee link", async () => {
  const state = baseBootstrapState();
  const response = await (await loadBootstrap(state))(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.access.uid, "user-1");
  assert.equal(response.body.access.companyId, "company-1");
});

test("bootstrap creates a missing canonical record only from the proven employee link", async () => {
  const state = baseBootstrapState();
  state.docs.users["user-1"] = null;
  const response = await (await loadBootstrap(state))(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.repaired, true);
  assert.equal(state.patches.length, 1);
  assert.equal(state.docs.users["user-1"].uid, "user-1");
  assert.equal(state.docs.users["user-1"].employeeId, "employee-1");
  assert.equal(state.docs.users["user-1"].role, "user");
});

test("bootstrap rejects employee document ID fallback, other UID, and duplicates", async () => {
  const documentId = baseBootstrapState();
  documentId.employees = [{ id: "user-1", data: {
    email: "user@bickers.co.uk", companyId: "company-1", appAccess: { user: true, service: false },
  } }];
  assert.equal((await (await loadBootstrap(documentId))(request())).status, 403);

  const otherUid = baseBootstrapState();
  otherUid.employees[0].data.authUid = "user-2";
  assert.equal((await (await loadBootstrap(otherUid))(request())).status, 403);

  const duplicate = baseBootstrapState();
  duplicate.employees.push({ id: "employee-2", data: { ...duplicate.employees[0].data } });
  assert.equal((await (await loadBootstrap(duplicate))(request())).status, 403);
});

test("bootstrap rejects canonical UID, employee ID, and company conflicts", async () => {
  const uidConflict = baseBootstrapState();
  uidConflict.docs.users["user-1"].uid = "user-2";
  assert.equal((await (await loadBootstrap(uidConflict))(request())).status, 403);

  const employeeConflict = baseBootstrapState();
  employeeConflict.docs.users["user-1"].employeeId = "employee-2";
  assert.equal((await (await loadBootstrap(employeeConflict))(request())).status, 403);

  const companyConflict = baseBootstrapState();
  companyConflict.employees[0].data.companyId = "company-2";
  assert.equal((await (await loadBootstrap(companyConflict))(request())).status, 403);
});

test("bootstrap rejects missing company and disabled canonical or employee records", async () => {
  const company = baseBootstrapState();
  company.docs.users["user-1"].companyId = "";
  company.employees[0].data.companyId = "";
  company.verifiedUser.identityCompanyId = "";
  assert.equal((await (await loadBootstrap(company))(request())).status, 403);

  const canonical = baseBootstrapState();
  canonical.docs.users["user-1"].active = false;
  assert.equal((await (await loadBootstrap(canonical))(request())).status, 403);

  const employee = baseBootstrapState();
  employee.employees[0].data.isEnabled = false;
  assert.equal((await (await loadBootstrap(employee))(request())).status, 403);
});

test("bootstrap does not infer missing workspace access and preserves explicit denial", async () => {
  const missing = baseBootstrapState();
  delete missing.employees[0].data.appAccess;
  assert.equal((await (await loadBootstrap(missing))(request())).status, 403);

  const denied = baseBootstrapState();
  denied.employees[0].data.appAccess = { user: false, service: false };
  const response = await (await loadBootstrap(denied))(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.access.appAccess.user, false);
  assert.equal(response.body.access.appAccess.service, false);
  assert.equal(response.body.access.defaultWorkspace, "");
});

test("missing module configuration disables modules and explicit grants are honored", async () => {
  const missing = baseBootstrapState();
  const missingResponse = await (await loadBootstrap(missing))(request());
  assert.equal(missingResponse.status, 200);
  assert.equal(missingResponse.body.access.featureFlags.finance, false);
  assert.equal(missingResponse.body.access.featureFlags.settings, false);
  assert.equal(missing.docs.users["user-1"].featureFlags.finance, false);

  const explicit = baseBootstrapState();
  explicit.docs.settings.platformFeatures = { featureFlags: { finance: true, settings: false } };
  const explicitResponse = await (await loadBootstrap(explicit))(request());
  assert.equal(explicitResponse.status, 200);
  assert.equal(explicitResponse.body.access.featureFlags.finance, true);
  assert.equal(explicitResponse.body.access.featureFlags.settings, false);
  assert.equal(explicit.docs.users["user-1"].featureFlags.finance, true);
});

test("request-body identity and access injection is ignored", async () => {
  const state = baseBootstrapState();
  const response = await (await loadBootstrap(state))(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.access.uid, "user-1");
  assert.equal(response.body.access.role, "user");
  assert.equal(response.body.access.companyId, "company-1");
});

test("valid canonical Platform Admin remains explicit", async () => {
  const state = baseBootstrapState();
  state.verifiedUser = {
    ...state.verifiedUser,
    uid: "platform-1",
    identityEmployeeId: "",
    identityCompanyId: "",
  };
  state.docs.users = { "platform-1": {
    uid: "platform-1",
    email: "user@bickers.co.uk",
    role: "platformAdmin",
    isEnabled: true,
    appAccess: { user: true, service: true },
    defaultWorkspace: "user",
    isService: true,
  } };
  state.employees = [];
  const response = await (await loadBootstrap(state))(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.access.role, "platformAdmin");
});

test("repeated valid bootstrap is idempotent", async () => {
  const state = baseBootstrapState();
  const post = await loadBootstrap(state);
  assert.equal((await post(request())).body.repaired, true);
  assert.equal((await post(request())).body.repaired, false);
  assert.equal(state.patches.length, 1);
});

test("bootstrap audit snapshots exclude unrelated canonical-user data", async () => {
  const state = baseBootstrapState();
  state.docs.users["user-1"].privateNote = "do-not-copy";
  const response = await (await loadBootstrap(state))(request());
  assert.equal(response.status, 200);
  const audit = state.logs.find(([collection]) => collection === "adminAuditLogs")?.[1];
  assert.ok(audit);
  assert.equal(audit.before.privateNote, undefined);
  assert.equal(audit.after.privateNote, undefined);
  assert.equal(audit.after.uid, "user-1");
  assert.equal(audit.after.companyId, "company-1");
});

test("browser access resolution fails closed when bootstrap is denied", () => {
  const refreshSource = authContextSource.match(
    /async function refreshServerAccess[\s\S]*?\n}\n\nasync function resolveFeatureFlags/
  )?.[0] || "";
  assert.match(refreshSource, /if \(!res\.ok \|\| !data\?\.access\)/);
  assert.match(refreshSource, /throw new Error/);
  assert.doesNotMatch(refreshSource, /if \(!res\.ok\) return null/);

  const failureSource = authContextSource.match(
    /console\.error\("\[authContext\] access resolution failed:"[\s\S]*?signOutClerk\(\{ redirectUrl: "\/login\?access=denied" \}\)/
  )?.[0] || "";
  assert.match(failureSource, /clearAccessCache\(\)/);
  assert.match(failureSource, /setAccessState\(emptyAccess\)/);
  assert.match(failureSource, /signOutFirebase\(auth\)/);
});

test("read-only identity inventory distinguishes confirmed links from email-only hints", async () => {
  const inventory = analyzeIdentityInventory({
    users: [{ id: "user-1", data: {
      uid: "user-1", employeeId: "employee-1", clerkUserId: "clerk-1", companyId: "company-1",
      isEnabled: true, appAccess: { user: true, service: false },
    } }],
    employees: [
      { id: "employee-1", data: {
        authUid: "user-1", uid: "user-1", companyId: "company-2",
        appAccess: { user: true, service: false },
      } },
      { id: "employee-email-only", data: { email: "hint@bickers.co.uk" } },
    ],
    clerkUsers: [
      { id: "clerk-1", external_id: "user-1", private_metadata: { firebaseUid: "user-1" } },
      { id: "clerk-hint", email_addresses: [{
        email_address: "hint@bickers.co.uk", verification: { status: "verified" },
      }] },
    ],
    settings: [{ id: "platformFeatures", data: { featureFlags: { finance: true } } }],
    platformCompanies: [{ id: "company-1", data: { modules: { finance: true } } }],
  });
  assert.equal(inventory.summary.crossCompanyLinkConflicts, 1);
  assert.equal(inventory.summary.employeesMissingFirebaseUid, 1);
  assert.equal(inventory.uncertain.emailOnlyMatches.length, 1);
  assert.equal(inventory.uncertain.emailOnlyMatches[0].employeeId, "employee-email-only");

  const inventorySource = await fs.readFile(new URL("scripts/identity-access-inventory.mjs", repo), "utf8");
  assert.doesNotMatch(inventorySource, /admin(?:Create|Patch|Delete)Document/);
  assert.doesNotMatch(inventorySource, /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/);
});

test("canonical write failure returns 500 without an audit or partial record", async () => {
  const state = baseBootstrapState();
  state.docs.users["user-1"] = null;
  state.failPatch = true;
  const response = await (await loadBootstrap(state))(request());
  assert.equal(response.status, 500);
  assert.equal(state.docs.users["user-1"], null);
  assert.equal(state.logs.some(([collection]) => collection === "adminAuditLogs"), false);
});
