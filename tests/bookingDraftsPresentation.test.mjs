import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const styles = fs.readFileSync(
  new URL("../src/app/booking-drafts/page.styles.module.css", import.meta.url),
  "utf8"
);

test("booking drafts matches the compact enquiries toolbar and table treatment", () => {
  assert.match(
    styles,
    /\.toolbar\.toolbar\s*\{[^}]*padding:\s*0;[^}]*background:\s*transparent;[^}]*border:\s*0;/s
  );
  assert.match(
    styles,
    /\.table\.table th\s*\{[^}]*height:\s*31px;[^}]*padding:\s*6px 8px;[^}]*font-size:\s*10\.5px;/s
  );
});
