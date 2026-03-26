import test from "node:test";
import assert from "node:assert/strict";

import {
  getWorkspaceForPath,
  inferAccessFromLegacyFields,
  isAdminPath,
  resolveEmployeeAccess,
  selectLandingRoute,
  validateEmployeeAccessDraft,
} from "../src/app/utils/accessControl.js";

test("infers service-only access from legacy isService", () => {
  assert.deepEqual(inferAccessFromLegacyFields({ isService: true }), {
    user: false,
    service: true,
  });
});

test("resolves hybrid access from appAccess", () => {
  const access = resolveEmployeeAccess({
    appAccess: { user: true, service: true },
    defaultWorkspace: "service",
  });

  assert.equal(access.role, "hybrid");
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
});

test("identifies admin-only routes", () => {
  assert.equal(isAdminPath("/admin"), true);
  assert.equal(isAdminPath("/employees"), true);
  assert.equal(isAdminPath("/edit-employee/abc123"), true);
  assert.equal(isAdminPath("/deleted-bookings"), true);
  assert.equal(isAdminPath("/dashboard"), false);
});
