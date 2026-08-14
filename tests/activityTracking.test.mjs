import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WORK_SCHEDULE,
  activityCategoryForPath,
  buildActivitySessions,
  isInsideWorkSchedule,
  normalizeActivitySettings,
  normalizeWorkSchedule,
  zonedDateParts,
} from "../src/app/utils/activityTracking.js";

test("default schedule matches the existing Bickers weekday hours", () => {
  const schedule = normalizeWorkSchedule({});
  assert.deepEqual(schedule, DEFAULT_WORK_SCHEDULE);
  assert.equal(isInsideWorkSchedule("2026-08-10T09:00:00Z", schedule), true);
  assert.equal(isInsideWorkSchedule("2026-08-10T17:00:00Z", schedule), false);
  assert.equal(isInsideWorkSchedule("2026-08-09T10:00:00Z", schedule), false);
});

test("Europe/London schedule comparison honours daylight-saving time", () => {
  const schedule = normalizeWorkSchedule({});
  assert.equal(zonedDateParts("2026-01-12T08:15:00Z", "Europe/London").time, "08:15");
  assert.equal(zonedDateParts("2026-07-13T07:15:00Z", "Europe/London").time, "08:15");
  assert.equal(isInsideWorkSchedule("2026-07-13T07:15:00Z", schedule), true);
});

test("overnight schedules include the next calendar day's early hours", () => {
  const schedule = normalizeWorkSchedule({
    days: { monday: { working: true, start: "22:00", end: "06:00" } },
  });
  assert.equal(isInsideWorkSchedule("2026-08-10T22:30:00+01:00", schedule), true);
  assert.equal(isInsideWorkSchedule("2026-08-11T05:30:00+01:00", schedule), true);
  assert.equal(isInsideWorkSchedule("2026-08-11T07:00:00+01:00", schedule), false);
});

test("activity buckets merge only for the same user within the configured gap", () => {
  const buckets = [
    { id: "a", uid: "u1", bucketStart: "2026-08-10T08:00:00Z", bucketEnd: "2026-08-10T08:05:00Z", activeSeconds: 300, inHours: true, category: "Jobs & quotes", workspace: "user" },
    { id: "b", uid: "u1", bucketStart: "2026-08-10T08:05:00Z", bucketEnd: "2026-08-10T08:10:00Z", activeSeconds: 300, inHours: false, category: "Jobs & quotes", workspace: "user" },
    { id: "c", uid: "u2", bucketStart: "2026-08-10T08:10:00Z", bucketEnd: "2026-08-10T08:15:00Z", activeSeconds: 300, inHours: true, category: "General", workspace: "user" },
  ];
  const sessions = buildActivitySessions(buckets);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].activeSeconds, 600);
  assert.equal(sessions[0].outOfHoursSeconds, 300);
});

test("interleaved account buckets still form independent sessions", () => {
  const buckets = [
    { id: "a", uid: "u1", bucketStart: "2026-08-10T08:00:00Z", bucketEnd: "2026-08-10T08:05:00Z", activeSeconds: 300, inHours: true },
    { id: "b", uid: "u2", bucketStart: "2026-08-10T08:01:00Z", bucketEnd: "2026-08-10T08:06:00Z", activeSeconds: 300, inHours: true },
    { id: "c", uid: "u1", bucketStart: "2026-08-10T08:05:00Z", bucketEnd: "2026-08-10T08:10:00Z", activeSeconds: 300, inHours: true },
  ];
  const sessions = buildActivitySessions(buckets);
  assert.equal(sessions.length, 2);
  assert.equal(sessions.find((row) => row.uid === "u1").activeSeconds, 600);
});

test("settings and route categories are constrained to safe values", () => {
  const settings = normalizeActivitySettings({ idleMinutes: 999, flagMinutes: 1 });
  assert.equal(settings.idleMinutes, 30);
  assert.equal(settings.flagMinutes, 5);
  assert.equal(activityCategoryForPath("/quote/123?secret=value"), "Jobs & quotes");
  assert.equal(activityCategoryForPath("/maintenance-alerts"), "Fleet & maintenance");
});
