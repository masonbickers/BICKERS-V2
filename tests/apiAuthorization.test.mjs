import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  hasRequiredWorkspaceAccess,
  isModuleEnabledForUser,
} from "../src/app/utils/accountAccess.js";

const repo = new URL("../", import.meta.url);
const assistantPath = new URL("src/app/api/chatgpt/route.js", repo);
const motPath = new URL("src/app/api/dvla/mot-history/route.js", repo);
const vehiclePath = new URL("src/app/api/dvla/vehicle/route.js", repo);
const syncPath = new URL("src/app/api/dvla/mot-history/sync/route.js", repo);

const activeUser = {
  uid: "user-1",
  isEnabled: true,
  companyId: "company-a",
  role: "user",
  appAccess: { user: true, service: false },
};

test("protected APIs deny an active account without a required workspace", () => {
  const user = {
    ...activeUser,
    appAccess: { user: false, service: false },
  };
  assert.equal(hasRequiredWorkspaceAccess(user, ["user", "service"]), false);
});

test("shared fleet APIs accept either user or service workspace", () => {
  const user = {
    ...activeUser,
    appAccess: { user: false, service: true },
  };
  assert.equal(hasRequiredWorkspaceAccess(user, ["user", "service"]), true);
});

test("module denial honors canonical and legacy feature representations", () => {
  const canonical = {
    ...activeUser,
    featureFlags: { assistant: false },
  };
  assert.equal(isModuleEnabledForUser(canonical, "assistant"), false);

  const legacy = {
    ...activeUser,
    features: { assistant: false },
  };
  assert.equal(isModuleEnabledForUser(legacy, "assistant"), false);
});

test("canonical module flags take precedence over legacy aliases", () => {
  const user = {
    ...activeUser,
    featureFlags: { assistant: true },
    features: { assistant: false },
  };
  assert.equal(isModuleEnabledForUser(user, "assistant"), true);
});

test("retained routes declare their intended API authorization scope", async () => {
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

test("company-admin MOT sync uses a company-scoped vehicle query", async () => {
  const source = await fs.readFile(syncPath, "utf8");
  assert.match(source, /documents:runQuery/);
  assert.match(source, /fieldPath:\s*["']companyId["']/);
  assert.match(source, /value:\s*\{\s*stringValue:\s*companyId\s*\}/);
  assert.match(source, /runMotHistorySyncWithUserToken\(user\.idToken,\s*access\.userData\)/);
});
