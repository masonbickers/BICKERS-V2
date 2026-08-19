import test from "node:test";
import assert from "node:assert/strict";

import {
  getWorkspaceForPath,
  inferAccessFromLegacyFields,
  isAdminPath,
  isFinanceHandoffPath,
  isPathAllowedForAccess,
  isPersonalSettingsPath,
  normalizeAppAccess,
  normalizePlatformRole,
  resolveEmployeeAccess,
  selectLandingRoute,
  validateEmployeeAccessDraft,
} from "../src/app/utils/accessControl.js";

import {
  isAdminEmail,
  isPlatformAdminEmail,
} from "../src/app/utils/adminAccess.js";
import { hasServiceWorkspaceAccess } from "../src/app/utils/accountAccess.js";

test("maintenance mutations require service/workshop access unless the user is an admin", () => {
  assert.equal(hasServiceWorkspaceAccess({ role: "user", appAccess: { service: false } }), false);
  assert.equal(hasServiceWorkspaceAccess({ role: "user", appAccess: { service: true } }), true);
  assert.equal(hasServiceWorkspaceAccess({ role: "service", isService: true }), true);
  assert.equal(hasServiceWorkspaceAccess({ role: "admin", appAccess: { service: false } }), true);
  assert.equal(hasServiceWorkspaceAccess({ role: "platformAdmin", appAccess: { service: false } }), true);
});

test("infers service-only access from legacy isService", () => {
  assert.deepEqual(inferAccessFromLegacyFields({ isService: true }), {
    user: false,
    service: true,
  });
});

test("resolves workspace access from appAccess", () => {
  const access = resolveEmployeeAccess({
    appAccess: { user: true, service: true },
    defaultWorkspace: "service",
  });

  assert.equal(access.role, "user");
  assert.equal(access.hasUserAccess, true);
  assert.equal(access.hasServiceAccess, true);
  assert.equal(access.defaultWorkspace, "service");
});

test("validates that at least one workspace is enabled", () => {
  const result = validateEmployeeAccessDraft({
    appAccess: { user: false, service: false },
    defaultWorkspace: "user",
  });

  assert.equal(result.isValid, false);
  assert.equal(typeof result.errors.appAccess, "string");
});

test("preserves an explicit denial of both workspaces", () => {
  assert.deepEqual(normalizeAppAccess({ appAccess: { user: false, service: false } }), {
    user: false,
    service: false,
  });
});

test("selects service landing route when preferred workspace is allowed", () => {
  const route = selectLandingRoute(
    resolveEmployeeAccess({
      appAccess: { user: true, service: true },
      defaultWorkspace: "user",
    }),
    "service"
  );

  assert.equal(route, "/service/home");
});

test("maps service paths to service workspace", () => {
  assert.equal(getWorkspaceForPath("/service/home"), "service");
  assert.equal(getWorkspaceForPath("/service-overview"), "service");
  assert.equal(getWorkspaceForPath("/screens/homescreen"), "user");
  assert.equal(getWorkspaceForPath("/bookings"), "user");
});

test("identifies admin-only routes", () => {
  assert.equal(isAdminPath("/admin"), true);
  assert.equal(isAdminPath("/settings"), false);
  assert.equal(isAdminPath("/settings/ai-business-rules"), true);
  assert.equal(isAdminPath("/employees"), false);
  assert.equal(isAdminPath("/edit-employee/abc123"), false);
  assert.equal(isAdminPath("/deleted-bookings"), false);
  assert.equal(isAdminPath("/dashboard"), false);
});

test("keeps personal settings available without exposing admin settings", () => {
  const userOnly = resolveEmployeeAccess({
    appAccess: { user: true, service: false },
    defaultWorkspace: "user",
  });
  const serviceOnly = resolveEmployeeAccess({
    appAccess: { user: false, service: true },
    defaultWorkspace: "service",
  });

  assert.equal(isPersonalSettingsPath("/settings"), true);
  assert.equal(isPersonalSettingsPath("/settings/ai-business-rules"), false);
  assert.equal(isPathAllowedForAccess("/settings", userOnly), true);
  assert.equal(isPathAllowedForAccess("/settings", serviceOnly), true);
});

test("client admin email allowlists remain disabled", () => {
  assert.equal(isAdminEmail("mason@bickers.co.uk"), false);
  assert.equal(isAdminEmail("paul@bickers.co.uk"), false);
  assert.equal(isAdminEmail("adam@bickers.co.uk"), false);
  assert.equal(isPlatformAdminEmail("mason@bickers.co.uk"), false);
  assert.equal(isPlatformAdminEmail("paul@bickers.co.uk"), false);
});

test("normalizes v1 roles and legacy aliases to Platform Admin, Admin, or User", () => {
  assert.equal(normalizePlatformRole("platformAdmin"), "platformAdmin");
  assert.equal(normalizePlatformRole("Platform Admin"), "platformAdmin");
  assert.equal(normalizePlatformRole("companyAdmin"), "admin");
  assert.equal(normalizePlatformRole("manager"), "user");
  assert.equal(normalizePlatformRole("employee"), "user");
  assert.equal(normalizePlatformRole("read-only user"), "user");
});

test("blocks disabled or archived employees from both workspaces", () => {
  const access = resolveEmployeeAccess({
    role: "archived",
    appAccess: { user: true, service: true },
    defaultWorkspace: "service",
  });

  assert.equal(access.hasUserAccess, false);
  assert.equal(access.hasServiceAccess, false);
});

test("allows service-only users on service routes and the shared diary", () => {
  const access = resolveEmployeeAccess({
    appAccess: { user: false, service: true },
    defaultWorkspace: "service",
  });

  assert.equal(selectLandingRoute(access), "/service/home");
  assert.equal(isPathAllowedForAccess("/service-overview", access), true);
  assert.equal(isPathAllowedForAccess("/dashboard", access), true);
  assert.equal(isPathAllowedForAccess("/create-booking", access), true);
  assert.equal(isPathAllowedForAccess("/edit-booking/abc123", access), true);
});

test("allows user-workspace accounts to open fleet hub pages", () => {
  const access = resolveEmployeeAccess({
    appAccess: { user: true, service: false },
    defaultWorkspace: "user",
  });

  [
    "/vehicle-home",
    "/vehicles",
    "/equipment",
    "/add-vehicle",
    "/general",
    "/immediate",
    "/defects/declined",
    "/maintenance-jobs",
    "/mot-overview",
    "/service-overview",
    "/vehicle-activity",
    "/usage-overview",
    "/vehicle-checks",
  ].forEach((path) => {
    assert.equal(isPathAllowedForAccess(path, access), true, path);
  });
});

test("identifies the operational quote-to-invoice handoff routes", () => {
  assert.equal(isFinanceHandoffPath("/finance-queue"), true);
  assert.equal(isFinanceHandoffPath("/invoice/booking-123"), true);
  assert.equal(isFinanceHandoffPath("/invoice-view/booking-123"), true);
  assert.equal(isFinanceHandoffPath("/invoiced"), true);
  assert.equal(isFinanceHandoffPath("/paid"), true);
  assert.equal(isFinanceHandoffPath("/finance-home"), false);
});
