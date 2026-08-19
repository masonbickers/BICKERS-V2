import assert from "node:assert/strict";
import test from "node:test";

import { formatEmailFrom } from "../src/app/utils/emailIdentity.js";

test("email delivery uses deployment display name with the existing Resend address", () => {
  assert.equal(formatEmailFrom("Example Transport", "invoices@example.com"), "Example Transport <invoices@example.com>");
  assert.equal(formatEmailFrom("Bickers Action", "Bickers Action <bookings@bickers.co.uk>"), "Bickers Action <bookings@bickers.co.uk>");
});

test("email display names cannot inject headers", () => {
  assert.equal(formatEmailFrom("Example\r\nBcc: victim@example.com", "sender@example.com"), "ExampleBcc: victim@example.com <sender@example.com>");
});
