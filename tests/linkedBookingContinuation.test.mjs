import test from "node:test";
import assert from "node:assert/strict";
import {
  alignLinkedContinuationCalendarEvents,
  buildLinkedContinuationPayload,
  linkedContinuationAllowsResourceOverlap,
  linkedJobNumberLabel,
} from "../src/app/utils/linkedBookingContinuation.js";

const previousBooking = {
  id: "booking-9144",
  jobNumber: "9144",
  bookingDates: ["2026-08-24", "2026-08-25"],
  vehicles: ["vehicle-1"],
  employees: [{ role: "Precision Driver", name: "Alex Driver" }],
};

test("builds a continuation for the single boundary handover date", () => {
  const result = buildLinkedContinuationPayload({
    formValue: {
      fromBookingId: "booking-9144",
      handoverDate: "2026-08-25",
      continueVehicles: true,
      continueCrew: true,
    },
    previousBooking,
    bookingDates: ["2026-08-25", "2026-08-26"],
    vehicles: ["vehicle-1"],
    employees: [{ role: "Precision Driver", name: "Alex Driver" }],
  });

  assert.equal(result.error, "");
  assert.deepEqual(result.value.sharedVehicleIds, ["vehicle-1"]);
  assert.deepEqual(result.value.sharedEmployeeNames, ["alex driver"]);
});

test("blocks links with more than one overlapping day", () => {
  const result = buildLinkedContinuationPayload({
    formValue: { fromBookingId: "booking-9144", continueVehicles: true },
    previousBooking,
    bookingDates: ["2026-08-24", "2026-08-25", "2026-08-26"],
    vehicles: ["vehicle-1"],
    employees: [],
  });

  assert.match(result.error, /exactly one handover date/i);
});

test("allows only explicitly linked resources on the handover day", () => {
  const currentContinuation = {
    fromBookingId: "booking-9144",
    fromJobNumber: "9144",
    handoverDate: "2026-08-25",
    continueVehicles: true,
    continueCrew: true,
    sharedVehicleIds: ["vehicle-1"],
    sharedEmployeeNames: ["alex driver"],
  };

  assert.equal(linkedContinuationAllowsResourceOverlap({
    currentContinuation,
    otherBooking: previousBooking,
    overlapDates: ["2026-08-25"],
    resourceType: "vehicle",
    resourceKey: "vehicle-1",
  }), true);
  assert.equal(linkedContinuationAllowsResourceOverlap({
    currentContinuation,
    otherBooking: previousBooking,
    overlapDates: ["2026-08-25"],
    resourceType: "vehicle",
    resourceKey: "vehicle-2",
  }), false);
  assert.equal(linkedContinuationAllowsResourceOverlap({
    currentContinuation,
    otherBooking: previousBooking,
    overlapDates: ["2026-08-24", "2026-08-25"],
    resourceType: "vehicle",
    resourceKey: "vehicle-1",
  }), false);
});

test("recognises the inverse link when editing the previous job", () => {
  const nextBooking = {
    id: "booking-9256",
    linkedContinuation: {
      fromBookingId: "booking-9144",
      fromJobNumber: "9144",
      handoverDate: "2026-08-25",
      continueVehicles: true,
      sharedVehicleIds: ["vehicle-1"],
    },
  };

  assert.equal(linkedContinuationAllowsResourceOverlap({
    currentBookingId: "booking-9144",
    currentContinuation: null,
    otherBooking: nextBooking,
    overlapDates: ["2026-08-25"],
    resourceType: "vehicle",
    resourceKey: "vehicle-1",
  }), true);
});

test("formats linked diary job numbers without changing the stored job number", () => {
  assert.equal(linkedJobNumberLabel({
    jobNumber: "9256",
    linkedContinuation: { fromBookingId: "booking-9144", fromJobNumber: "9144" },
  }), "9144 → 9256");
});

test("aligns linked diary cards on one lane without changing saved booking dates", () => {
  const source = {
    id: "booking-9144__date_group__0",
    __bookingId: "booking-9144",
    jobNumber: "9144",
    start: new Date(2026, 7, 24),
    end: new Date(2026, 7, 27),
    bookingDates: ["2026-08-24", "2026-08-25", "2026-08-26"],
  };
  const target = {
    id: "booking-9256__date_group__0",
    __bookingId: "booking-9256",
    jobNumber: "9256",
    start: new Date(2026, 7, 26),
    end: new Date(2026, 7, 28),
    bookingDates: ["2026-08-26", "2026-08-27"],
    linkedContinuation: {
      fromBookingId: "booking-9144",
      fromJobNumber: "9144",
      handoverDate: "2026-08-26",
    },
  };

  const [alignedSource, alignedTarget] = alignLinkedContinuationCalendarEvents([source, target]);

  assert.equal(alignedSource.end.getTime(), new Date(2026, 7, 26).getTime());
  assert.deepEqual(alignedSource.bookingDates, source.bookingDates);
  assert.equal(alignedSource.__linkedContinuationRole, "from");
  assert.equal(alignedTarget.__linkedContinuationRole, "to");
  assert.equal(alignedTarget.start.getTime(), target.start.getTime());
});
