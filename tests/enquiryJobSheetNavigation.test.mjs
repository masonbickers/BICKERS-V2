import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const enquiryPage = readFileSync(
  new URL("../src/app/enquiry/page.js", import.meta.url),
  "utf8"
);
const jobNumberPage = readFileSync(
  new URL("../src/app/job-numbers/[id]/page.js", import.meta.url),
  "utf8"
);

test("each enquiry row provides a direct job sheet action", () => {
  assert.match(enquiryPage, /title="Open job sheet"/);
  assert.match(
    enquiryPage,
    /router\.push\(`\/job-numbers\/\$\{encodeURIComponent\(booking\.id\)\}\?returnTo=\$\{encodeURIComponent\("\/enquiry"\)\}`\)/
  );
  assert.match(enquiryPage, /<ClipboardList size=\{13\} \/> Job sheet/);
});

test("job sheet back action honours a safe return destination", () => {
  assert.match(jobNumberPage, /const searchParams = useSearchParams\(\)/);
  assert.match(
    jobNumberPage,
    /safeInternalPath\(searchParams\.get\("returnTo"\), "\/job-home"\)/
  );
  assert.match(jobNumberPage, /<Btn onClick=\{\(\) => router\.push\(returnHref\)\}/);
});
