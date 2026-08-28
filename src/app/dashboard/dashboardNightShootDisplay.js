export const NIGHT_SHOOT_DISPLAY_MODES = Object.freeze({
  FULL_BLOCK: "full-block",
  JOB_NUMBER: "job-number",
});

const NIGHT_SHOOT_DISPLAY_STATUSES = new Set([
  "confirmed",
  "first pencil",
  "second pencil",
  "action required",
  "dnh",
]);

export const normalizeNightShootDisplayMode = (value) =>
  value === NIGHT_SHOOT_DISPLAY_MODES.JOB_NUMBER
    ? NIGHT_SHOOT_DISPLAY_MODES.JOB_NUMBER
    : NIGHT_SHOOT_DISPLAY_MODES.FULL_BLOCK;

export const isNightShootDisplayBooking = (event) =>
  String(event?.shootType || "").trim().toLowerCase() === "night" &&
  NIGHT_SHOOT_DISPLAY_STATUSES.has(
    String(event?.status || "").trim().toLowerCase()
  );

export const shouldUseFullNightShootBlock = (event, mode) =>
  isNightShootDisplayBooking(event) &&
  normalizeNightShootDisplayMode(mode) === NIGHT_SHOOT_DISPLAY_MODES.FULL_BLOCK;

export const shouldHighlightNightShootJobNumber = (event, mode) =>
  isNightShootDisplayBooking(event) &&
  normalizeNightShootDisplayMode(mode) === NIGHT_SHOOT_DISPLAY_MODES.JOB_NUMBER;
