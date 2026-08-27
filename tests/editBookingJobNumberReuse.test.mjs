import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const editBookingPage = readFileSync(
  new URL("../src/app/edit-booking/[id]/page.js", import.meta.url),
  "utf8"
);

test("edit booking checks other bookings when the job number changes", () => {
  assert.match(editBookingPage, /buildExistingJobDetailsLookup/);
  assert.match(editBookingPage, /\.filter\(\(docSnap\) => docSnap\.id !== bookingId\)/);
  assert.match(editBookingPage, /getExistingJobDetailMismatches/);
  assert.match(editBookingPage, /Use job details & contacts/);
  assert.match(editBookingPage, /Keep this booking/);
});
