import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePayAdviceRowTotal,
  calculatePayAdviceTotals,
  computePayAdvicePayrollRow,
  normalisePayAdviceRates,
  normalisePayAdviceRowOverride,
} from "../src/app/utils/timesheetPayAdvice.js";

const rates = normalisePayAdviceRates({
  workshopRate: 18.5,
  overtimeRate: 27.75,
  travelRate: 18,
  sundayRate: 30,
  onSetRate: 375,
  onSetOvertimeRate: 56.25,
  precisionDriverRate: 400,
  precisionDriverOvertimeRate: 60,
  weekendSupplementRate: 187.5,
  overnightRate: 30,
  travelMealRate: 20,
});

const darrenWeek = [
  {
    card: {
      day: "Monday",
      mode: "travel",
      entry: {
        mode: "travel",
        leaveTime: "11:30",
        arriveTime: "18:30",
        overnight: true,
        travelLunchSup: true,
      },
    },
    primaryJob: { dayNoteType: "Travel Day" },
  },
  {
    card: {
      day: "Tuesday",
      mode: "onset",
      previousDayOvernight: true,
      entry: {
        mode: "onset",
        arriveTime: "10:30",
        precallDuration: "10:30",
        callTime: "11:00",
        wrapTime: "20:30",
        overnight: true,
      },
    },
    primaryJob: { dayNoteType: "Split Day" },
  },
  {
    card: {
      day: "Wednesday",
      mode: "travel",
      previousDayOvernight: true,
      entry: {
        mode: "travel",
        leaveTime: "08:00",
        arriveTime: "13:30",
        travelLunchSup: true,
      },
    },
    primaryJob: { dayNoteType: "Travel Day" },
  },
  {
    card: {
      day: "Thursday",
      mode: "yard",
      entry: {
        mode: "yard",
        yardSegments: [{ start: "08:00", end: "11:30" }],
        yardTravelEnabled: true,
        yardTravelLeaveTime: "11:30",
        yardTravelArriveTime: "18:30",
        managerLunchDeduct: true,
        overnight: true,
      },
    },
    primaryJob: { dayNoteType: "1/2 Day Travel" },
  },
  {
    card: {
      day: "Friday",
      mode: "onset",
      previousDayOvernight: true,
      entry: {
        mode: "onset",
        arriveTime: "08:00",
        callTime: "08:00",
        wrapTime: "19:30",
        overnight: true,
      },
    },
    primaryJob: { dayNoteType: "Rehearsal Day" },
  },
  {
    card: {
      day: "Saturday",
      mode: "onset",
      previousDayOvernight: true,
      entry: {
        mode: "onset",
        arriveTime: "06:30",
        precallDuration: "06:30",
        callTime: "07:30",
        wrapTime: "11:30",
        arriveBack: "16:30",
        mealSup: false,
      },
    },
    primaryJob: { dayNoteType: "On Set" },
  },
  {
    card: {
      day: "Sunday",
      mode: "travel",
      entry: { mode: "travel" },
    },
    primaryJob: { jobNumber: "8968", dayNoteType: "" },
  },
];

test("Darren Short's corrected week produces the approved pay advice", () => {
  const rows = darrenWeek.map((input) => {
    const row = computePayAdvicePayrollRow(input);
    return { ...row, totalMonetary: calculatePayAdviceRowTotal(row, rates) };
  });
  const totals = calculatePayAdviceTotals(rows, rates);

  assert.deepEqual(
    rows.map((row) => ({
      workshop: row.workshopHrs,
      onSet: row.onSetHrs,
      trackingOvertime: row.onSetOvertimeHrs,
      weekend: row.weekendSupplementUnits,
      overnight: row.overnightUnits,
      meal: row.travelMealUnits,
    })),
    [
      { workshop: 0, onSet: 1, trackingOvertime: 0, weekend: 0, overnight: 1, meal: 1 },
      { workshop: 0, onSet: 1, trackingOvertime: 0.5, weekend: 0, overnight: 1, meal: 0 },
      { workshop: 0, onSet: 1, trackingOvertime: 0, weekend: 0, overnight: 0, meal: 1 },
      { workshop: 3.5, onSet: 0.5, trackingOvertime: 0, weekend: 0, overnight: 1, meal: 1 },
      { workshop: 0, onSet: 1, trackingOvertime: 1.5, weekend: 0, overnight: 1, meal: 0 },
      { workshop: 0, onSet: 1, trackingOvertime: 1, weekend: 0, overnight: 0, meal: 1 },
      { workshop: 0, onSet: 0, trackingOvertime: 0, weekend: 0, overnight: 0, meal: 0 },
    ]
  );
  assert.equal(totals.workshopHrs, 3.5);
  assert.equal(totals.overtimeHrs, 0);
  assert.equal(totals.onSetHrs, 5.5);
  assert.equal(totals.onSetOvertimeHrs, 3);
  assert.equal(totals.weekendSupplementUnits, 0);
  assert.equal(totals.overnightUnits, 4);
  assert.equal(totals.travelMealUnits, 4);
  assert.equal(totals.totalMonetary, 2496);
});

test("a linked booking with no payable Sunday activity produces no pay", () => {
  const row = computePayAdvicePayrollRow(darrenWeek[6]);

  assert.equal(row.onSetHrs, 0);
  assert.equal(row.sundayHrs, 0);
  assert.equal(row.weekendSupplementUnits, 0);
  assert.equal(calculatePayAdviceRowTotal(row, rates), 0);
});

test("Sunday travel hours are paid in the Sunday column only", () => {
  const row = computePayAdvicePayrollRow({
    card: {
      day: "Sunday",
      mode: "travel",
      entry: { mode: "travel", leaveTime: "08:00", arriveTime: "13:00" },
    },
  });

  assert.equal(row.travelHrs, 0);
  assert.equal(row.sundayHrs, 5);
  assert.equal(row.weekendSupplementUnits, 0);
});

test("a five-hour non-overnight return journey earns one travel meal", () => {
  const qualifying = computePayAdvicePayrollRow(darrenWeek[5]);
  const tooShort = computePayAdvicePayrollRow({
    card: {
      day: "Friday",
      mode: "onset",
      entry: {
        mode: "onset",
        callTime: "08:00",
        wrapTime: "12:00",
        arriveBack: "16:59",
      },
    },
    primaryJob: { dayNoteType: "On Set" },
  });

  assert.equal(qualifying.travelMealUnits, 1);
  assert.equal(tooShort.travelMealUnits, 0);
});

test("on-set pay is expressed in ten-hour tracking units", () => {
  assert.equal(rates.onSetRate, 375);
  assert.equal(
    normalisePayAdviceRowOverride({ onSetHrs: 10 }, { legacyTrackingUnits: true }).onSetHrs,
    1
  );
  assert.equal(
    normalisePayAdviceRowOverride({ onSetHrs: 5 }, { legacyTrackingUnits: true }).onSetHrs,
    0.5
  );
  assert.equal(normalisePayAdviceRowOverride({ onSetHrs: 1 }).onSetHrs, 1);
});

test("Ben Kerry's photographed pay advice totals £2,375.25", () => {
  const rows = [
    { travelHrs: 2.5, onSetHrs: 1, onSetOvertimeHrs: 1 },
    { workshopHrs: 8 },
    { workshopHrs: 6 },
    { onSetHrs: 1, overnightUnits: 1, travelMealUnits: 1 },
    { precisionDriverHrs: 1, precisionDriverOvertimeHrs: 0.25, overnightUnits: 1 },
    { onSetHrs: 1, travelMealUnits: 1 },
    { onSetHrs: 1 },
  ];
  const totals = calculatePayAdviceTotals(rows, rates);

  assert.equal(totals.workshopHrs, 14);
  assert.equal(totals.travelHrs, 2.5);
  assert.equal(totals.onSetHrs, 4);
  assert.equal(totals.onSetOvertimeHrs, 1);
  assert.equal(totals.precisionDriverHrs, 1);
  assert.equal(totals.precisionDriverOvertimeHrs, 0.25);
  assert.equal(totals.weekendSupplementUnits, 0);
  assert.equal(totals.overnightUnits, 2);
  assert.equal(totals.travelMealUnits, 2);
  assert.equal(totals.hoursPaid, 22.75);
  assert.equal(totals.hoursWtd, 26.75);
  assert.equal(totals.totalMonetary, 2375.25);
});
