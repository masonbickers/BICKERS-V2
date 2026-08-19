import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const adminPage = await fs.readFile(
  new URL("../src/app/admin/page.js", import.meta.url),
  "utf8"
);
const overviewRoute = await fs.readFile(
  new URL("../src/app/api/admin/overview/route.js", import.meta.url),
  "utf8"
);

test("admin sick leave loads the sick overview section", () => {
  assert.match(
    adminPage,
    /fetchAdminOverviewDataFromServer = async \(section = "access", day = ""\)/
  );
  assert.match(adminPage, /new URLSearchParams\(\{ section \}\)/);
  assert.match(adminPage, /fetchAdminOverviewData\("sick"\)/);
  assert.match(adminPage, /activeTab === Tabs\.SICK\) void fetchSickLeaves\(\)/);
  assert.match(overviewRoute, /sick: \["employees", "sickLeave"\]/);
});

test("admin holiday loading retains legacy allowance records", () => {
  assert.match(adminPage, /fetchAdminOverviewDataFromServer\("holiday"\)/);
  assert.match(
    overviewRoute,
    /holiday: \["employees", "holidays", "holidayAllowances"\]/
  );
  assert.match(overviewRoute, /holidayAllowances: scopedHolidayAllowances\.map\(withId\)/);
});
