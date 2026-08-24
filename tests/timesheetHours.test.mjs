import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTimesheetDayBreakdown,
  computeTimesheetWeekHours,
  getLunchBreakDeductionMinutes,
} from "../src/app/utils/timesheetHours.js";

test("weekday and weekend yard lunch rules match the app", () => {
  assert.equal(getLunchBreakDeductionMinutes("Monday", false, 8 * 60), 30);
  assert.equal(getLunchBreakDeductionMinutes("Friday", false, 15), 15);
  assert.equal(getLunchBreakDeductionMinutes("Saturday", false, 8 * 60), 0);
  assert.equal(getLunchBreakDeductionMinutes("Sunday", false, 8 * 60), 0);
  assert.equal(getLunchBreakDeductionMinutes("Tuesday", true, 8 * 60), 0);
  assert.equal(getLunchBreakDeductionMinutes("Tuesday", false, 0), 0);
});

test("yard blocks, paid travel and overnight work match the app", () => {
  const weekday = computeTimesheetDayBreakdown(
    {
      mode: "yard",
      yardSegments: [
        { start: "08:00", end: "12:00" },
        { start: "13:00", end: "16:00" },
      ],
      yardTravelEnabled: true,
      yardTravelLeaveTime: "16:00",
      yardTravelArriveTime: "17:00",
    },
    "Monday"
  );
  assert.equal(weekday.yardWork, 7 * 60);
  assert.equal(weekday.yardTravel, 60);
  assert.equal(weekday.breakDeduction, 30);
  assert.equal(weekday.total, 7.5 * 60);

  const overnight = computeTimesheetDayBreakdown(
    { mode: "yard", yardSegments: [{ start: "22:00", end: "02:00" }] },
    "Saturday"
  );
  assert.equal(overnight.total, 4 * 60);
});

test("travel and turnaround use the app ten-hour payroll value", () => {
  const travel = computeTimesheetDayBreakdown(
    { mode: "travel", leaveTime: "08:00", arriveTime: "14:00" },
    "Tuesday"
  );
  assert.equal(travel.travelDay, 6 * 60);
  assert.equal(travel.travelGuarantee, 4 * 60);
  assert.equal(travel.total, 10 * 60);

  assert.equal(
    computeTimesheetDayBreakdown({ mode: "yard", isTurnaround: true }, "Wednesday").total,
    10 * 60
  );
});

test("workshop rows and segments match the app", () => {
  assert.equal(
    computeTimesheetDayBreakdown(
      { mode: "workshop", workshopJobs: [{ hours: "4" }, { hours: "3,5" }] },
      "Thursday"
    ).total,
    7.5 * 60
  );
  assert.equal(
    computeTimesheetDayBreakdown(
      { mode: "workshop", yardSegments: [{ start: "22:00", end: "02:00" }] },
      "Thursday"
    ).total,
    4 * 60
  );
});

test("on-set totals and overtime buckets match the app", () => {
  const standard = computeTimesheetDayBreakdown(
    {
      mode: "onset",
      leaveTime: "06:00",
      arriveTime: "07:00",
      precallDuration: "07:30",
      callTime: "08:00",
      wrapTime: "18:00",
      arriveBack: "19:00",
    },
    "Thursday"
  );
  assert.equal(standard.outboundTravel, 60);
  assert.equal(standard.paidEarly, 30);
  assert.equal(standard.precall, 30);
  assert.equal(standard.onSetStandard, 10 * 60);
  assert.equal(standard.returnTravel, 60);
  assert.equal(standard.total, 13 * 60);

  const shortDay = computeTimesheetDayBreakdown(
    { mode: "onset", callTime: "08:00", wrapTime: "14:00" },
    "Friday"
  );
  assert.equal(shortDay.onSetStandard, 6 * 60);
  assert.equal(shortDay.total, 6 * 60);

  const earlyCall = computeTimesheetDayBreakdown(
    { mode: "onset", callTime: "05:00", wrapTime: "15:00" },
    "Friday"
  );
  assert.equal(earlyCall.onSetStandard, 8 * 60);
  assert.equal(earlyCall.onSetOvertime, 2 * 60);
  assert.equal(earlyCall.total, 10 * 60);
});

test("weekly total uses current day data instead of a stale stored value", () => {
  const offWeek = Object.fromEntries(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
      (day) => [day, { mode: "off" }]
    )
  );
  const timesheet = {
    totalHours: 99,
    days: {
      ...offWeek,
      Monday: { mode: "yard", yardSegments: [{ start: "08:00", end: "16:30" }] },
      Saturday: { mode: "yard", yardSegments: [{ start: "08:00", end: "16:30" }] },
    },
  };
  assert.equal(computeTimesheetWeekHours(timesheet), 16.5);
});
