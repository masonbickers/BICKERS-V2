import test from "node:test";
import assert from "node:assert/strict";

import {
  getHolidayApprovalQueueCounts,
  isHolidayAwaitingApproval,
} from "../src/app/utils/holidayApprovalQueue.js";

test("counts every holiday request awaiting approval for the selected year", () => {
  const holidays = Array.from({ length: 125 }, (_, index) => ({
    status: index < 123 ? "approved" : "requested",
    startDate: "2026-08-20",
    endDate: "2026-08-20",
  }));

  holidays.push({
    status: "delete_requested",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
  });

  assert.deepEqual(getHolidayApprovalQueueCounts(holidays, 2026), {
    requests: 2,
    deletes: 1,
  });
});

test("matches the HR queue's legacy missing-status and year rules", () => {
  assert.equal(
    isHolidayAwaitingApproval({ startDate: "2026-08-20", endDate: "2026-08-21" }, 2026),
    true
  );
  assert.equal(
    isHolidayAwaitingApproval(
      { status: "requested", startDate: "2027-01-02", endDate: "2027-01-03" },
      2026
    ),
    false
  );
});
