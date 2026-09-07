import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildUserAccessPatch } from "../src/app/utils/appAccessRecords.js";

test("personnel edits preserve account roles when the employee workspace role is user", async () => {
  for (const role of ["platformAdmin", "admin", "user"]) {
    const patch = buildUserAccessPatch({
      uid: "existing-login",
      employeeId: "employee-1",
      employee: { role: "user", appAccess: { user: true, service: true } },
      user: { role },
    });
    assert.equal(patch.role, role);
    assert.deepEqual(patch.appAccess, { user: true, service: true });
  }
  const page = await readFile(new URL("../src/app/edit-employee/[id]/page.js", import.meta.url), "utf8");
  assert.match(page, /linkedUserSnapshot = userRef \? await getDoc\(userRef\)/);
  assert.match(page, /user: \{ role: linkedUserSnapshot\?\.data\(\)\?\.role \|\| effectiveRole \}/);
});

test("employee personnel and payroll rates save through the protected admin route", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../src/app/edit-employee/[id]/page.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/app/api/admin/employees/[employeeId]/personnel/route.js", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(page, /\/api\/admin\/employees\/\$\{encodeURIComponent\(employeeId\)\}\/personnel/);
  assert.doesNotMatch(page, /batch\.set\(personnelRef/);
  assert.match(page, /if \(!personnelResponse\.ok\)/);
  assert.match(route, /requireAdminFromRequest\(req\)/);
  assert.match(route, /canAccessCompany\(auth\.userData, companyId\)/);
  assert.match(route, /pickPrivateEmployeeFields\(body\.privateRecord\)/);
  assert.match(route, /collection: "employeePersonnel"/);
  assert.match(route, /adminCommitDocumentPatches/);
});
