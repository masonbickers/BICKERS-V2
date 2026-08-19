import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the deployment manifest remains public before authentication", async () => {
  const middleware = await readFile(new URL("../src/middleware.js", import.meta.url), "utf8");
  assert.match(middleware, /createRouteMatcher\(\[[\s\S]*["']\/manifest\.json\(\.\*\)["']/);
});
