import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildMobileAccessMigrationReport } from "../scripts/mobile-access-migration-lib.mjs";

const [routeSource, editEmployeeSource, addEmployeeSource, migrationSource, backupSource] = await Promise.all([
  readFile(
    new URL("../src/app/api/admin/employees/[employeeId]/mobile-access/route.js", import.meta.url),
    "utf8"
  ),
  readFile(new URL("../src/app/edit-employee/[id]/page.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app/add-employee/page.js", import.meta.url), "utf8"),
  readFile(new URL("../scripts/migrate-mobile-access.mjs", import.meta.url), "utf8"),
  readFile(new URL("../scripts/export-mobile-access-backup.mjs", import.meta.url), "utf8"),
]);

test("new employees start with mobile access pending", () => {
  assert.match(addEmployeeSource, /mobileAccess:\s*\{\s*status:\s*"pending"\s*\}/);
});

test("employee mobile approval is authenticated and sends a Firebase setup email", () => {
  assert.match(routeSource, /requireAdminFromRequest\(req\)/);
  assert.match(routeSource, /canAccessCompany/);
  assert.match(routeSource, /getFirebaseAuthAdmin/);
  assert.match(routeSource, /accounts:sendOobCode/);
  assert.match(routeSource, /requestType:\s*"PASSWORD_RESET"/);
  assert.match(routeSource, /revokeRefreshTokens\(canonicalUid\)/);
  assert.match(routeSource, /hasPasswordProvider\(existingAuthUser\)/);
  assert.match(routeSource, /existingPasswordPreserved/);
  assert.doesNotMatch(routeSource, /api\.resend\.com\/emails/);
  assert.doesNotMatch(routeSource, /setupUrl/);
});

test("employee editor exposes approval and resend without credentials", () => {
  assert.match(editEmployeeSource, /Approve and send setup email/);
  assert.match(editEmployeeSource, /Resend setup email/);
  assert.match(editEmployeeSource, /invalidateEmail/);
  assert.doesNotMatch(editEmployeeSource, /temporary password/i);
});

test("migration fixes Next env loading and requires explicit apply confirmation", () => {
  assert.match(migrationSource, /import nextEnv from "@next\/env"/);
  assert.match(migrationSource, /--confirm=grandfather-prior-mobile-users/);
  assert.match(migrationSource, /report\.summary\.conflicts > 0/);
  assert.match(migrationSource, /revokeRefreshTokens/);
  assert.match(migrationSource, /mode: 0o600/);
  assert.match(migrationSource, /const verbose = process\.argv\.includes\("--verbose"\)/);
});

test("production backup is read-only, exclusive, and owner-readable", () => {
  assert.match(backupSource, /collection\("employees"\)\.get\(\)/);
  assert.match(backupSource, /collection\("users"\)\.get\(\)/);
  assert.match(backupSource, /auth\.listUsers/);
  assert.match(backupSource, /flag: "wx"/);
  assert.match(backupSource, /mode: 0o600/);
  assert.doesNotMatch(backupSource, /\.set\(|\.update\(|\.delete\(/);
});

test("migration grandfathers only prior Firebase users and preserves passwords", () => {
  const employees = [
    {
      id: "employee-password",
      data: {
        name: "Password User",
        email: "password@example.com",
        companyId: "company-a",
        authUid: "user-password",
        appAccess: { user: true, service: false },
      },
    },
    {
      id: "employee-setup",
      data: {
        name: "Setup User",
        email: "setup@example.com",
        companyId: "company-a",
        codeLoginUid: "user-setup",
        appAccess: { user: true, service: false },
      },
    },
    {
      id: "employee-new",
      data: {
        name: "Never Signed In",
        email: "new@example.com",
        companyId: "company-a",
        authUid: "user-new",
        appAccess: { user: true, service: false },
      },
    },
    {
      id: "employee-disabled",
      data: {
        name: "Disabled User",
        email: "disabled@example.com",
        companyId: "company-a",
        authUid: "user-disabled",
        appAccess: { user: true, service: false },
        active: false,
      },
    },
  ];
  const users = employees.map(({ id, data }) => ({
    id: data.authUid || data.codeLoginUid,
    data: {
      employeeId: id,
      uid: data.authUid || data.codeLoginUid,
      authUid: data.authUid || data.codeLoginUid,
      companyId: "company-a",
      isEnabled: true,
    },
  }));
  const authUsers = [
    {
      uid: "user-password",
      email: "password@example.com",
      providerData: [{ providerId: "password" }],
      metadata: { lastSignInTime: "2026-08-20T10:00:00.000Z" },
    },
    {
      uid: "user-setup",
      email: null,
      providerData: [],
      metadata: { lastSignInTime: "2026-08-20T10:00:00.000Z" },
    },
    {
      uid: "user-new",
      email: "new@example.com",
      providerData: [{ providerId: "password" }],
      metadata: {},
    },
    {
      uid: "user-disabled",
      email: "disabled@example.com",
      providerData: [{ providerId: "password" }],
      metadata: { lastSignInTime: "2026-08-20T10:00:00.000Z" },
    },
  ];

  const report = buildMobileAccessMigrationReport({ employees, users, authUsers });
  const byId = new Map(report.rows.map((row) => [row.employeeId, row]));
  assert.equal(byId.get("employee-password").classification, "grandfather_active");
  assert.equal(byId.get("employee-password").passwordPreserved, true);
  assert.equal(byId.get("employee-password").setupEmailRequired, false);
  assert.equal(byId.get("employee-setup").classification, "grandfather_invited");
  assert.equal(byId.get("employee-setup").setupEmailRequired, true);
  assert.equal(byId.get("employee-new").classification, "pending");
  assert.equal(byId.get("employee-disabled").classification, "disabled");
  assert.equal(report.summary.conflicts, 0);
});

test("migration blocks duplicate and mismatched identities", () => {
  const employees = [
    {
      id: "employee-a",
      data: {
        email: "duplicate@example.com",
        companyId: "company-a",
        authUid: "user-a",
        appAccess: { user: true, service: false },
      },
    },
    {
      id: "employee-b",
      data: {
        email: "duplicate@example.com",
        companyId: "company-a",
        authUid: "user-b",
        appAccess: { user: true, service: false },
      },
    },
  ];
  const users = [
    { id: "user-a", data: { employeeId: "employee-a", uid: "user-a", authUid: "user-a", companyId: "company-a", isEnabled: true } },
    { id: "user-b", data: { employeeId: "employee-b", uid: "user-b", authUid: "user-b", companyId: "company-a", isEnabled: true } },
  ];
  const authUsers = [
    { uid: "user-a", email: "wrong@example.com", providerData: [], metadata: { lastSignInTime: "2026-08-20" } },
    { uid: "user-b", email: "duplicate@example.com", providerData: [], metadata: { lastSignInTime: "2026-08-20" } },
  ];

  const report = buildMobileAccessMigrationReport({ employees, users, authUsers });
  assert.equal(report.summary.conflicts, 2);
  assert.ok(report.rows.every((row) => row.classification === "conflict"));
  assert.ok(report.rows[0].issues.includes("duplicate_employee_email"));
  assert.ok(report.rows[0].issues.includes("firebase_email_mismatch"));
});

test("migration keeps an employee without a Firebase Auth record pending", () => {
  const report = buildMobileAccessMigrationReport({
    employees: [
      {
        id: "employee-no-auth",
        data: {
          email: "pending@example.com",
          companyId: "company-a",
          authUid: "missing-auth-user",
          appAccess: { user: true, service: false },
        },
      },
    ],
    users: [
      {
        id: "missing-auth-user",
        data: {
          employeeId: "employee-no-auth",
          uid: "missing-auth-user",
          authUid: "missing-auth-user",
          companyId: "company-a",
          isEnabled: true,
        },
      },
    ],
    authUsers: [],
  });

  assert.equal(report.summary.conflicts, 0);
  assert.equal(report.rows[0].classification, "pending");
  assert.equal(report.rows[0].passwordPreserved, false);
});
