import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const noticeSource = fs.readFileSync(
  new URL("../src/app/components/ReleaseUpdateNotice.jsx", import.meta.url),
  "utf8"
);
const protectedLayoutSource = fs.readFileSync(
  new URL("../src/app/components/ProtectedLayout.js", import.meta.url),
  "utf8"
);

test("signed-in users receive a one-time completed inspection update notice", () => {
  assert.match(protectedLayoutSource, /<ReleaseUpdateNotice userKey=/);
  assert.match(noticeSource, /RELEASE_UPDATE_NOTICE_ID/);
  assert.match(noticeSource, /localStorage\.getItem\(storageKey\)/);
  assert.match(noticeSource, /localStorage\.setItem\(storageKey, "dismissed"\)/);
  assert.match(noticeSource, /Completed inspections made easier/);
});

test("the notice explains inspection entry and existing records", () => {
  assert.match(noticeSource, /Record completed inspections/);
  assert.match(noticeSource, /upload their certificates/);
  assert.match(noticeSource, /without creating a duplicate/);
});
