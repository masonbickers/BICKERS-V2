import test from "node:test";
import assert from "node:assert/strict";
import { evaluateActiveMember } from "../src/app/api/_accessPolicy.js";
import { normalizeVrm, validateAiRequestPayload } from "../src/app/api/_requestValidation.js";
import { quotaExceededResponse } from "../src/app/api/_rateLimit.js";

test("active-member policy returns documented authentication and authorization outcomes", () => {
  assert.equal(evaluateActiveMember({}).status, 401);
  assert.equal(evaluateActiveMember({ verifiedUser: { uid: "u" }, userData: null, role: "user" }).status, 403);
  assert.equal(evaluateActiveMember({ verifiedUser: { uid: "u" }, userData: { isEnabled: false }, role: "user" }).status, 403);
  assert.equal(evaluateActiveMember({ verifiedUser: { uid: "u" }, userData: { isEnabled: true, credentialResetRequired: true, companyId: "c" }, role: "user" }).status, 403);
  assert.equal(evaluateActiveMember({ verifiedUser: { uid: "u" }, userData: { isEnabled: true, companyId: "c" }, role: "user" }).allowed, true);
  assert.equal(evaluateActiveMember({ verifiedUser: { uid: "u" }, userData: { isEnabled: true, companyId: "c" }, role: "user", allowedRoles: ["admin"] }).status, 403);
});

test("DVLA VRMs are normalized and rejected outside 2–8 alphanumerics", () => {
  assert.equal(normalizeVrm(" ab 12 cde "), "AB12CDE");
  assert.equal(normalizeVrm("A"), "");
  assert.equal(normalizeVrm("AB-12"), "");
  assert.equal(normalizeVrm("ABCDEFGHI"), "");
});

test("AI request validation enforces prompt, history, message, and context limits", () => {
  const valid = validateAiRequestPayload({ prompt: "status", messages: [], clientContext: { metrics: {} } });
  assert.equal(valid.ok, true);
  assert.equal(validateAiRequestPayload({ prompt: "x".repeat(4001), clientContext: {} }).status, 413);
  assert.equal(validateAiRequestPayload({ prompt: "x", messages: Array(9).fill({ role: "user", content: "x" }), clientContext: {} }).status, 413);
  assert.equal(validateAiRequestPayload({ prompt: "x", messages: [{ role: "system", content: "x" }], clientContext: {} }).status, 413);
  assert.equal(validateAiRequestPayload({ prompt: "x", clientContext: { value: "x".repeat(129 * 1024) } }).status, 413);
});

test("quota exhaustion returns 429 and Retry-After without an upstream call", async () => {
  const response = quotaExceededResponse({ retryAfter: 75, limit: "user-hour" });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "75");
  assert.equal((await response.json()).limit, "user-hour");
});
