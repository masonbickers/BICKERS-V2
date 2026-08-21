import assert from "node:assert/strict";
import test from "node:test";

import { createServerErrorEvent } from "../src/app/utils/productionMonitoring.js";

test("server error events include deployment and route context", () => {
  const event = createServerErrorEvent(
    Object.assign(new Error("Database unavailable"), { digest: "digest-123" }),
    { method: "post", path: "/api/bookings?accountId=private" },
    {
      routerKind: "App Router",
      routePath: "/app/api/bookings/route",
      routeType: "route",
      renderSource: "server-rendering",
    },
    {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "abc123",
      VERCEL_REGION: "lhr1",
    },
  );

  assert.equal(event.event, "production_server_error");
  assert.equal(event.error.message, "Database unavailable");
  assert.equal(event.error.digest, "digest-123");
  assert.deepEqual(event.request, { method: "POST", path: "/api/bookings" });
  assert.equal(event.route.type, "route");
  assert.deepEqual(event.deployment, {
    environment: "production",
    commitSha: "abc123",
    region: "lhr1",
  });
  assert.match(event.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
});
test("server error events redact common secrets and omit request data", () => {
  const event = createServerErrorEvent(
    new Error("authorization=Bearer super-secret token=abc123 password:hunter2"),
    {
      method: "GET",
      path: "/vehicle-edit/id?token=abc123",
      headers: { authorization: "Bearer should-never-appear" },
      body: { customer: "should-never-appear" },
    },
    {},
    {},
  );

  assert.equal(event.request.path, "/vehicle-edit/id");
  assert.doesNotMatch(JSON.stringify(event), /super-secret|abc123|hunter2|should-never-appear/);
  assert.match(event.error.message, /\[REDACTED\]/);
});
