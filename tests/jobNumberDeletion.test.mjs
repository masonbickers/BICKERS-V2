import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/app/job-numbers/[id]/page.js", import.meta.url),
  "utf8"
);

test("job number deletion archives the complete booking before removing it", () => {
  assert.match(source, /Reason for deleting this booking \(required\)/);
  assert.match(source, /doc\(db, "deletedBookings", String\(id\)\)/);
  assert.match(source, /deletedAt: serverTimestamp\(\)/);
  assert.match(source, /deletedBy:/);
  assert.match(source, /deleteReasons: \["Other"\]/);
  assert.match(source, /deleteReasonOther: deleteReason/);
  assert.match(source, /data: bookingSnapshot\.data\(\)/);
  assert.match(source, /batch\.delete\(bookingRef\)/);
  assert.match(source, /await batch\.commit\(\)/);
  assert.doesNotMatch(source, /await deleteDoc\(doc\(db, "bookings", id\)\)/);
});

test("job number deletion returns to the page that opened the job sheet", () => {
  assert.match(source, /router\.push\(returnHref\)/);
  assert.match(source, /stored in Deleted Bookings and can be restored/);
});
