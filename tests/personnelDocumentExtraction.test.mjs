import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeExtractedDate,
  normalizePersonnelDocumentExtraction,
  normalizePersonnelDocumentType,
} from "../src/app/utils/personnelDocumentExtraction.js";

test("normalizes supported personnel document names", () => {
  assert.equal(normalizePersonnelDocumentType("passport"), "passport");
  assert.equal(normalizePersonnelDocumentType("driving-licence"), "drivingLicence");
  assert.equal(normalizePersonnelDocumentType("driver license"), "drivingLicence");
  assert.equal(normalizePersonnelDocumentType("bank statement"), "");
});

test("normalizes visible document dates without guessing invalid dates", () => {
  assert.equal(normalizeExtractedDate("2031-09-08"), "2031-09-08");
  assert.equal(normalizeExtractedDate("08/09/2031"), "2031-09-08");
  assert.equal(normalizeExtractedDate("31/02/2031"), "");
  assert.equal(normalizeExtractedDate("September 2031"), "");
});

test("keeps only explicit extracted values", () => {
  assert.deepEqual(
    normalizePersonnelDocumentExtraction({
      documentType: "driving licence",
      number: " MORGA753116SM9IJ ",
      countryOfIssue: "United Kingdom",
      expiryDate: "08/09/2031",
      categories: "B, BE",
      points: null,
      visibleFields: ["number", "expiryDate", "categories"],
    }),
    {
      documentType: "drivingLicence",
      number: "MORGA753116SM9IJ",
      countryOfIssue: "United Kingdom",
      issueDate: "",
      expiryDate: "2031-09-08",
      categories: "B, BE",
      points: "",
      checkCode: "",
      visibleFields: ["number", "expiryDate", "categories"],
      warning: "",
    }
  );
});
