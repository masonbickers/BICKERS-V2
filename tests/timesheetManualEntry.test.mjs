import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manual timesheet editor offers and saves a mobile-compatible turnaround day", async () => {
  const page = await readFile(
    new URL("../src/app/timesheet-id/[id]/page.js", import.meta.url),
    "utf8"
  );

  assert.match(page, /<option value="turnaround">Turnaround Day<\/option>/);
  assert.match(
    page,
    /if \(mode === "turnaround"\) \{[\s\S]*?mode: "yard",[\s\S]*?isTurnaround: true,[\s\S]*?turnaroundDay: true,[\s\S]*?yardSegments: \[\]/
  );
});
