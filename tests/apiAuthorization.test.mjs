import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  hasCanonicalAccessRecord,
  hasCompanyAccess,
  hasRequiredWorkspaceAccess,
  isAccountDisabled,
  isModuleEnabledForUser,
} from "../src/app/utils/accountAccess.js";

const repo = new URL("../", import.meta.url);
const adminLibPath = new URL("src/app/api/admin/_lib.js", repo);
const statisticsAuthPath = new URL("src/app/api/statistics/_auth.js", repo);
const assistantPath = new URL("src/app/api/chatgpt/route.js", repo);
const motPath = new URL("src/app/api/dvla/mot-history/route.js", repo);
const vehiclePath = new URL("src/app/api/dvla/vehicle/route.js", repo);
const syncPath = new URL("src/app/api/dvla/mot-history/sync/route.js", repo);

const [adminLibSource, statisticsAuthSource, syncSource] = await Promise.all([
  fs.readFile(adminLibPath, "utf8"),
  fs.readFile(statisticsAuthPath, "utf8"),
  fs.readFile(syncPath, "utf8"),
]);

const activeUser = {
  uid: "user-1",
  email: "user@example.test",
  isEnabled: true,
  companyId: "company-a",
  role: "user",
  appAccess: { user: true, service: false },
  featureFlags: { assistant: true, statistics: true },
};

function context(overrides = {}) {
  return vm.createContext({
    Buffer,
    console,
    Headers,
    process,
    Request,
    Response,
    URL,
    URLSearchParams,
    ...overrides,
  });
}

function synthetic(ctx, exports) {
  return new vm.SyntheticModule(
    Object.keys(exports),
    function initialise() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    },
    { context: ctx }
  );
}

function bearerRequest(token = "header.eyJ1aWQiOiJ1c2VyLTEifQ.signature") {
  return new Request("https://example.test/api", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function loadAdminLib(userData, { signedOut = false } = {}) {
  const ctx = context({
    fetch: async (url) => {
      assert.match(String(url), /identitytoolkit\.googleapis\.com/);
      if (signedOut) return Response.json({}, { status: 401 });
      return Response.json({
        users: [{ localId: userData?.uid || "user-1", email: userData?.email || "user@example.test" }],
      });
    },
  });
  const modules = {
    "../_firebaseAdminRest": synthetic(ctx, {
      adminCreateDocument: async () => {},
      adminReadDocument: async (collection, id) =>
        collection === "users" && id === (userData?.uid || "user-1")
          ? structuredClone(userData)
          : null,
    }),
    "@/app/utils/accountAccess": synthetic(ctx, {
      hasCanonicalAccessRecord,
      hasCompanyAccess,
      hasRequiredWorkspaceAccess,
      isAccountDisabled,
      isModuleEnabledForUser,
    }),
  };
  const sourceModule = new vm.SourceTextModule(adminLibSource, {
    context: ctx,
    identifier: adminLibPath.href,
  });
  await sourceModule.link(async (specifier) => {
    assert.ok(modules[specifier], `Unexpected admin helper import: ${specifier}`);
    return modules[specifier];
  });
  await sourceModule.evaluate();
  return { ctx, sourceModule, namespace: sourceModule.namespace };
}

async function loadStatisticsAuth(userData) {
  const admin = await loadAdminLib(userData);
  const sourceModule = new vm.SourceTextModule(statisticsAuthSource, {
    context: admin.ctx,
    identifier: statisticsAuthPath.href,
  });
  await sourceModule.link(async (specifier) => {
    assert.equal(specifier, "@/app/api/admin/_lib");
    return admin.sourceModule;
  });
  await sourceModule.evaluate();
  return sourceModule.namespace.requireStatisticsUser;
}

async function loadMotSync(userData) {
  const requests = [];
  const ctx = context({
    process: {
      env: {
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
        DVSA_MOT_HISTORY_TOKEN_URL: "https://mot.example.test/token",
        DVSA_MOT_HISTORY_CLIENT_ID: "client-id",
        DVSA_MOT_HISTORY_CLIENT_SECRET: "client-secret",
        DVSA_MOT_HISTORY_API_KEY: "api-key",
      },
    },
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes("documents:runQuery")) return Response.json([]);
      if (String(url).includes("/documents/vehicles")) return Response.json({ documents: [] });
      if (String(url).includes("/documents/settings/motHistorySync")) return Response.json({});
      throw new Error(`Unexpected MOT sync fetch: ${url}`);
    },
  });
  const modules = {
    axios: synthetic(ctx, {
      default: {
        post: async () => ({ data: { access_token: "mot-token", expires_in: 3600 } }),
        get: async () => {
          throw new Error("No vehicle should be fetched in this focused authorization test.");
        },
      },
    }),
    "firebase/firestore": synthetic(ctx, {
      collection: () => ({}),
      doc: () => ({}),
      getDocs: async () => ({ docs: [] }),
      updateDoc: async () => {},
    }),
    "../../../../../../firebaseConfig": synthetic(ctx, { db: {} }),
    "@/app/api/admin/_lib": synthetic(ctx, {
      requireAdminFromRequest: async () => ({
        idToken: "firebase-token",
        verifiedUser: { uid: userData.uid, email: userData.email },
        userData: structuredClone(userData),
      }),
    }),
  };
  const sourceModule = new vm.SourceTextModule(syncSource, {
    context: ctx,
    identifier: syncPath.href,
  });
  await sourceModule.link(async (specifier) => {
    assert.ok(modules[specifier], `Unexpected MOT sync import: ${specifier}`);
    return modules[specifier];
  });
  await sourceModule.evaluate();
  return { POST: sourceModule.namespace.POST, requests };
}

test("signed-out request is rejected by the real active-user guard", async () => {
  const { namespace } = await loadAdminLib(activeUser, { signedOut: true });
  const result = await namespace.requireActiveUserFromRequest(bearerRequest(""));
  assert.equal(result.error.status, 401);
});

test("disabled canonical user is rejected by the real active-user guard", async () => {
  const { namespace } = await loadAdminLib({ ...activeUser, isEnabled: false });
  const result = await namespace.requireActiveUserFromRequest(bearerRequest());
  assert.equal(result.error.status, 403);
});

test("wrong workspace is rejected by the real active-user guard", async () => {
  const { namespace } = await loadAdminLib({
    ...activeUser,
    appAccess: { user: false, service: false },
  });
  const result = await namespace.requireActiveUserFromRequest(bearerRequest(), {
    workspaces: ["user", "service"],
  });
  assert.equal(result.error.status, 403);
});

test("disabled assistant module is rejected for canonical and legacy flags", async () => {
  for (const flags of [
    { featureFlags: { assistant: false }, features: undefined },
    { featureFlags: undefined, features: { assistant: false } },
  ]) {
    const { namespace } = await loadAdminLib({ ...activeUser, ...flags });
    const result = await namespace.requireActiveUserFromRequest(bearerRequest(), {
      module: "assistant",
      workspaces: ["user"],
    });
    assert.equal(result.error.status, 403);
  }
});

test("company-less canonical Platform Admin statistics uses the compatibility company", async () => {
  const requireStatisticsUser = await loadStatisticsAuth({
    ...activeUser,
    role: "platformAdmin",
    companyId: "",
    appAccess: { user: true, service: true },
  });
  const result = await requireStatisticsUser(bearerRequest());
  assert.equal(result.companyId, "bickers-action");
  assert.equal(result.role, "platformAdmin");
});

test("ordinary and Company Admin accounts without company access fail closed", async () => {
  for (const role of ["user", "admin"]) {
    const requireStatisticsUser = await loadStatisticsAuth({
      ...activeUser,
      role,
      companyId: "",
    });
    const result = await requireStatisticsUser(bearerRequest());
    assert.equal(result.error.status, 403);
    assert.equal(result.companyId, undefined);
  }
});

test("Company Admin MOT synchronization executes a company-scoped query", async () => {
  const { POST, requests } = await loadMotSync({
    ...activeUser,
    role: "admin",
  });
  const response = await POST(new Request("https://example.test/api/dvla/mot-history/sync", {
    method: "POST",
  }));
  assert.equal(response.status, 200);
  assert.match(requests[0].url, /documents:runQuery$/);
  assert.equal(requests[0].options.method, "POST");
  const query = JSON.parse(requests[0].options.body).structuredQuery;
  assert.deepEqual(query.where.fieldFilter, {
    field: { fieldPath: "companyId" },
    op: "EQUAL",
    value: { stringValue: "company-a" },
  });
});

test("Platform Admin MOT synchronization remains fleet-wide", async () => {
  const { POST, requests } = await loadMotSync({
    ...activeUser,
    role: "platformAdmin",
    companyId: "",
    appAccess: { user: true, service: true },
  });
  const response = await POST(new Request("https://example.test/api/dvla/mot-history/sync", {
    method: "POST",
  }));
  assert.equal(response.status, 200);
  assert.match(requests[0].url, /\/documents\/vehicles\?pageSize=1000$/);
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.body, undefined);
});

test("retained lookup routes declare the intended API authorization scope", async () => {
  const [assistant, mot, vehicle] = await Promise.all([
    fs.readFile(assistantPath, "utf8"),
    fs.readFile(motPath, "utf8"),
    fs.readFile(vehiclePath, "utf8"),
  ]);
  assert.match(assistant, /module:\s*["']assistant["']/);
  assert.match(assistant, /workspaces:\s*\[["']user["']\]/);
  assert.match(mot, /workspaces:\s*\[["']user["'],\s*["']service["']\]/);
  assert.match(vehicle, /workspaces:\s*\[["']user["'],\s*["']service["']\]/);
});
