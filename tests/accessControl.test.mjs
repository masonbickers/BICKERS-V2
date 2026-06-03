import test from "node:test";
import assert from "node:assert/strict";

import {
  getWorkspaceForPath,
  inferAccessFromLegacyFields,
  isAdminPath,
  isPathAllowedForAccess,
  normalizePlatformRole,
  resolveEmployeeAccess,
  selectLandingRoute,
  validateEmployeeAccessDraft,
} from "../src/app/utils/accessControl.js";

import {
  isAdminEmail,
  isPlatformAdminEmail,
} from "../src/app/utils/adminAccess.js";

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
  assert.equal(isAdminPath("/employees"), true);
  assert.equal(isAdminPath("/edit-employee/abc123"), true);
  assert.equal(isAdminPath("/deleted-bookings"), true);
  assert.equal(isAdminPath("/dashboard"), false);
});

test("keeps admin and platform-admin allowlists explicit", () => {
  assert.equal(isAdminEmail("mason@bickers.co.uk"), true);
  assert.equal(isAdminEmail("paul@bickers.co.uk"), true);
  assert.equal(isAdminEmail("adam@bickers.co.uk"), true);
  assert.equal(isPlatformAdminEmail("mason@bickers.co.uk"), true);
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

test("allows service-only users only on service workspace routes", () => {
  const access = resolveEmployeeAccess({
    appAccess: { user: false, service: true },
    defaultWorkspace: "service",
  });

  assert.equal(selectLandingRoute(access), "/service/home");
  assert.equal(isPathAllowedForAccess("/service-overview", access), true);
  assert.equal(isPathAllowedForAccess("/dashboard", access), false);
});
