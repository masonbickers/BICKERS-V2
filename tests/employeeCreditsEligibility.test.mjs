import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("employee credits include valid suffixed job numbers", async () => {
  const overview = await readFile(
    new URL("../src/app/employee-home/page.js", import.meta.url),
    "utf8"
  );

  assert.match(overview, /if \(!isCreditBookingStatus\(status\)\) return;/);
  assert.match(overview, /function isCreditJobNumber\(value\)/);
  assert.match(overview, /\^\\d\{4\}\(\?:\\\.\\d\+\)\?\$/);
  assert.match(overview, /if \(!isCreditJobNumber\(booking\.jobNumber\)\) return;/);
  assert.doesNotMatch(overview, /isFourDigitJobNumber/);
});
