import assert from "node:assert/strict";
import test from "node:test";

import {
  computeOnSetBreakdown,
  computePaidEarlyArrivalHours,
} from "../src/app/utils/timesheetOnSetHours.js";

const thursday = {
  mode: "onset",
  leaveTime: "04:30",
  arriveTime: "06:30",
  precallDuration: "07:30",
  callTime: "08:00",
  wrapTime: "19:00",
};

test("on-set totals include the app's paid early-arrival allowance", () => {
  const breakdown = computeOnSetBreakdown(thursday);

  assert.equal(breakdown.travelToHrs, 2);
  assert.equal(breakdown.paidEarlyArrivalHrs, 1);
  assert.equal(breakdown.preCallHrs, 0.5);
  assert.equal(breakdown.onSetPaidHrs, 10);
  assert.equal(breakdown.onSetOvertimeHrs, 1);
  assert.equal(breakdown.travelBackHrs, 0);
  assert.equal(breakdown.totalHrs, 14.5);
});

test("the screenshot week now totals the same 52 hours as the app", () => {
  const friday = computeOnSetBreakdown({
    mode: "onset",
    callTime: "08:00",
    wrapTime: "19:45",
    arriveBack: "22:00",
  });

  assert.equal(friday.totalHrs, 14);
  assert.equal(friday.onSetPaidHrs, 10);
  assert.equal(friday.onSetOvertimeHrs, 1.75);
  assert.equal(friday.travelBackHrs, 2.25);
  assert.equal(friday.travelInsideTenHrs, 0);
  assert.equal(friday.travelAfterTenHrs, 2.25);
  assert.equal(8.5 + 7.5 + 7.5 + computeOnSetBreakdown(thursday).totalHrs + friday.totalHrs, 52);
});

test("return travel inside the standard block is not added twice", () => {
  const breakdown = computeOnSetBreakdown({
    callTime: "08:00",
    wrapTime: "17:00",
    arriveBack: "18:00",
  });

  assert.equal(breakdown.onSetOvertimeHrs, 0);
  assert.equal(breakdown.travelBackHrs, 1);
  assert.equal(breakdown.travelInsideTenHrs, 1);
  assert.equal(breakdown.travelAfterTenHrs, 0);
  assert.equal(breakdown.totalHrs, 10);
});

test("paid early arrival is capped at one hour", () => {
  assert.equal(
    computePaidEarlyArrivalHours({ arriveTime: "05:00", precallDuration: "07:30", callTime: "08:00" }),
    1
  );
});

test("an invalid pre-call sequence falls back to paid time before call", () => {
  assert.equal(
    computePaidEarlyArrivalHours({ arriveTime: "07:45", precallDuration: "07:30", callTime: "08:00" }),
    0.25
  );
});

test("future timesheets use the same rule across supported time patterns", () => {
  const cases = [
    {
      name: "partial early arrival",
      entry: { arriveTime: "07:10", precallDuration: "07:30", callTime: "08:00" },
      expected: 1 / 3,
    },
    {
      name: "arrival exactly at pre-call",
      entry: { arriveTime: "07:30", precallDuration: "07:30", callTime: "08:00" },
      expected: 0,
    },
    {
      name: "legacy numeric pre-call duration",
      entry: { arriveTime: "07:00", precallDuration: 30, callTime: "08:00" },
      expected: 1,
    },
    {
      name: "overnight call sequence",
      entry: { arriveTime: "23:30", precallDuration: "00:30", callTime: "01:00" },
      expected: 1,
    },
    {
      name: "missing arrival",
      entry: { precallDuration: "07:30", callTime: "08:00" },
      expected: 0,
    },
  ];

  cases.forEach(({ name, entry, expected }) => {
    assert.equal(computePaidEarlyArrivalHours(entry), expected, name);
  });
});

test("short on-set days use actual app hours rather than a web-only guarantee", () => {
  const breakdown = computeOnSetBreakdown({
    mode: "onset",
    callTime: "08:00",
    wrapTime: "14:00",
  });

  assert.equal(breakdown.onSetPaidHrs, 6);
  assert.equal(breakdown.totalHrs, 6);
});
