import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
