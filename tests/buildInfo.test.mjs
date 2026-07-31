import assert from "node:assert/strict";
import test from "node:test";

import { resolveBuildCommit } from "../scripts/write-build-info.mjs";

test("explicit release commit is used for archive deployments", () => {
  assert.equal(
    resolveBuildCommit({
      env: {
        RELEASE_COMMIT_SHA: "046acacc1234567890abcdef1234567890abcdef",
        VERCEL_GIT_COMMIT_SHA: "1111111111111111111111111111111111111111",
      },
      gitCommit: "2222222222222222222222222222222222222222",
    }),
    "046acacc1234567890abcdef1234567890abcdef"
  );
});

test("Vercel commit is used when no explicit release commit is supplied", () => {
  assert.equal(
    resolveBuildCommit({
      env: {
        VERCEL_GIT_COMMIT_SHA: "3333333333333333333333333333333333333333",
      },
      gitCommit: "",
    }),
    "3333333333333333333333333333333333333333"
  );
});

test("local Git commit remains the fallback", () => {
  assert.equal(
    resolveBuildCommit({
      env: {},
      gitCommit: "4444444444444444444444444444444444444444",
    }),
    "4444444444444444444444444444444444444444"
  );
});

test("invalid environment values do not replace a valid Git commit", () => {
  assert.equal(
    resolveBuildCommit({
      env: {
        RELEASE_COMMIT_SHA: "not-a-commit",
        VERCEL_GIT_COMMIT_SHA: "also-invalid",
      },
      gitCommit: "5555555555555555555555555555555555555555",
    }),
    "5555555555555555555555555555555555555555"
  );
});
