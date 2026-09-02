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

test("signed-in users receive a one-time Review Queue update notice", () => {
  assert.match(protectedLayoutSource, /<ReleaseUpdateNotice userKey=/);
  assert.match(noticeSource, /RELEASE_UPDATE_NOTICE_ID/);
  assert.match(noticeSource, /localStorage\.getItem\(storageKey\)/);
  assert.match(noticeSource, /localStorage\.setItem\(storageKey, "dismissed"\)/);
  assert.match(noticeSource, /Review Queue updated/);
});

test("the notice explains Complete and Ready to Invoice separately", () => {
  assert.match(noticeSource, /marked <strong>Complete<\/strong> with an empty review form/);
  assert.match(noticeSource, /required before selecting <strong>Ready to Invoice<\/strong>/);
  assert.match(noticeSource, /Linked jobs have also been improved/);
});
