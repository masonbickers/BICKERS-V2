import assert from "node:assert/strict";
import test from "node:test";

import { auditDeploymentAdminRoles } from "../src/app/config/deploymentAdminAudit.js";

test("deployment administrator audit accepts canonical roles without changing records", () => {
  const users = [
    { id: "mason", data: { email: "MASON@BICKERS.CO.UK", role: "platformAdmin", isEnabled: true } },
    { id: "paul", data: { email: "paul@bickers.co.uk", role: "admin", isEnabled: true } },
  ];
  const before = structuredClone(users);
  const result = auditDeploymentAdminRoles(users, {
    emergencyAdminEmails: ["mason@bickers.co.uk", "paul@bickers.co.uk"],
    emergencyPlatformAdminEmails: ["mason@bickers.co.uk"],
  });
  assert.deepEqual(result, { checked: 2, mismatches: [] });
  assert.deepEqual(users, before);
});

test("deployment administrator audit blocks missing, disabled and incorrect canonical roles", () => {
  const result = auditDeploymentAdminRoles([
    { data: { email: "disabled@example.com", role: "admin", isEnabled: false } },
    { data: { email: "user@example.com", role: "user", isEnabled: true } },
  ], {
    emergencyAdminEmails: ["missing@example.com", "disabled@example.com", "user@example.com"],
    emergencyPlatformAdminEmails: [],
  });
  assert.deepEqual(result.mismatches.map((row) => row.status).sort(), ["disabled", "missing", "role_mismatch"]);
});
