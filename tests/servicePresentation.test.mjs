import assert from "node:assert/strict";
import test from "node:test";

import {
  SERVICE_WARNING_DAYS,
  getServiceDuePresentation,
  getServiceRecordPresentation,
  reconcileServiceSchedule,
  resolveServiceRecordDate,
} from "../src/app/utils/servicePresentation.js";

test("service due presentation uses the configured four-week warning window", () => {
  assert.equal(SERVICE_WARNING_DAYS, 28);
  assert.equal(
    getServiceDuePresentation(
      { nextService: "2026-09-17" },
      { referenceDate: new Date(2026, 7, 20) }
    ).status,
    "soon"
  );
});

test("service exemptions remain not applicable even when a due requirement is supplied", () => {
  const result = getServiceDuePresentation(
    { serviceNotApplicable: true },
    { dueDate: "2026-08-01", referenceDate: new Date(2026, 7, 20) }
  );

  assert.equal(result.status, "not-applicable");
  assert.equal(result.dateDisplay, "N/A");
  assert.equal(result.dueDate, null);
});

test("service record presentation prioritises the actual service date", () => {
  const record = {
    serviceDateOnly: "2026-03-21",
    completedAt: "2026-03-22T09:00:00.000Z",
    updatedAt: "2026-03-23T09:00:00.000Z",
    serviceType: "Full service",
  };

  assert.equal(resolveServiceRecordDate(record), "2026-03-21");
  assert.equal(getServiceRecordPresentation(record).title, "Full service");
});

test("a completed service supersedes an older due date", () => {
  const schedule = reconcileServiceSchedule(
    {
      lastService: "2025-08-18",
      nextService: "2026-08-18",
    },
    { completedDate: "2026-08-19" }
  );

  assert.equal(schedule.lastServiceDate, "2026-08-19");
  assert.equal(schedule.nextServiceDate, "");
  assert.equal(schedule.supersededDueDate, true);
  assert.equal(
    getServiceDuePresentation(
      { nextService: "2026-08-18" },
      { dueDate: schedule.nextServiceDate, referenceDate: new Date(2026, 7, 21) }
    ).status,
    "unknown"
  );
});

test("a completed service advances the due date when a frequency is configured", () => {
  const schedule = reconcileServiceSchedule(
    {
      lastService: "2025-08-18",
      nextService: "2026-08-18",
      serviceFreq: 52,
    },
    { completedDate: "2026-08-19" }
  );

  assert.equal(schedule.lastServiceDate, "2026-08-19");
  assert.equal(schedule.nextServiceDate, "2027-08-18");
});

test("an already-advanced service due date remains authoritative without a frequency", () => {
  const schedule = reconcileServiceSchedule(
    {
      lastService: "2026-08-19",
      nextService: "2027-08-19",
    },
    { completedDate: "2026-08-19" }
  );

  assert.equal(schedule.nextServiceDate, "2027-08-19");
  assert.equal(schedule.supersededDueDate, false);
});
