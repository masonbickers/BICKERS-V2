import assert from "node:assert/strict";
import test from "node:test";

import { findBookingQuoteDocument } from "../src/app/utils/bookingQuoteDocument.js";

test("finds the uploaded PDF matching the booking quote number", () => {
  const booking = {
    attachments: [
      {
        name: "Q9250-003 - Bluescreen - Pod Car Hire 2026.pdf",
        url: "https://example.test/9250_Q9250-003_-_Pod_Car.pdf",
        contentType: "application/pdf",
      },
      {
        name: "Q9250-002 - Bluescreen - Cheyenne 2026.pdf",
        url: "https://example.test/9250_Q9250-002_-_Cheyenne.pdf",
        contentType: "application/pdf",
      },
    ],
  };

  assert.equal(
    findBookingQuoteDocument(booking, "Q9250-002")?.url,
    "https://example.test/9250_Q9250-002_-_Cheyenne.pdf"
  );
});

test("matches quote numbers in Firebase Storage encoded paths", () => {
  const url =
    "https://firebasestorage.googleapis.com/v0/b/example/o/companies%2Fbickers%2Fbooking_pdfs%2F9250_Q9250-002_-_Quote.pdf?alt=media";
  assert.equal(findBookingQuoteDocument({ attachments: [url] }, "Q9250-002")?.url, url);
});

test("does not confuse adjacent quote numbers", () => {
  const booking = {
    attachments: [{ name: "Q9250-0020.pdf", url: "https://example.test/Q9250-0020.pdf" }],
  };
  assert.equal(findBookingQuoteDocument(booking, "Q9250-002"), null);
});

test("falls back to an explicit legacy quote URL", () => {
  const quoteUrl = "https://example.test/legacy-quote.pdf";
  assert.equal(findBookingQuoteDocument({ quoteUrl }, "Q100-001")?.url, quoteUrl);
});

