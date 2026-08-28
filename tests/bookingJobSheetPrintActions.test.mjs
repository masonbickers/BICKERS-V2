import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createBookingPage = readFileSync(
  new URL("../src/app/create-booking/page.js", import.meta.url),
  "utf8"
);
const editBookingPage = readFileSync(
  new URL("../src/app/edit-booking/[id]/page.js", import.meta.url),
  "utf8"
);

for (const [pageName, source] of [
  ["create booking", createBookingPage],
  ["edit booking", editBookingPage],
]) {
  test(`${pageName} includes the printable action job sheet`, () => {
    assert.match(source, /import EnquiryActionJobSheet from "@\/app\/components\/EnquiryActionJobSheet"/);
    assert.match(source, /onClick=\{\(\) => window\.print\(\)\}/);
    assert.match(source, /<Printer size=\{14\} \/> Print Job Sheet/);
    assert.match(source, /<EnquiryActionJobSheet[\s\S]*?bookingDates: selectedDates,[\s\S]*?selectedVehicles: selectedVehicleDetails/);
  });
}
