import assert from "node:assert/strict";
import test from "node:test";

import { shouldDeductYardLunch } from "../src/app/utils/timesheetLunch.js";

test("Saturday yard hours never deduct lunch", () => {
  assert.equal(shouldDeductYardLunch({}, "Saturday"), false);
  assert.equal(shouldDeductYardLunch({ managerLunchDeduct: true }, "Saturday"), false);
  assert.equal(shouldDeductYardLunch({ lunchTaken: true }, "saturday"), false);
});

test("weekday lunch deduction rules remain unchanged", () => {
  assert.equal(shouldDeductYardLunch({}, "Monday"), true);
  assert.equal(shouldDeductYardLunch({ managerLunchDeduct: false }, "Monday"), false);
  assert.equal(shouldDeductYardLunch({ lunchSup: true }, "Friday"), false);
});
