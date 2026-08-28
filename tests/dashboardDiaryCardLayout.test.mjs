import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(
  new URL("../src/app/dashboard/DashboardPageImpl.styles.module.css", import.meta.url),
  "utf8"
);

test("Diary employee initials stay paired inside their badge", () => {
  assert.match(styles, /\.extracted11\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(styles, /\.extracted11\s*>\s*span\s*\{[^}]*white-space:\s*nowrap/);
});

test("narrow Diary cards reflow their header instead of squeezing the initials", () => {
  assert.match(styles, /container:\s*diary-card\s*\/\s*inline-size/);
  assert.match(
    styles,
    /@container diary-card \(max-width:\s*150px\)[\s\S]*?\.extracted10\s*\{[^}]*flex-wrap:\s*wrap/
  );
  assert.match(
    styles,
    /@container diary-card \(max-width:\s*150px\)[\s\S]*?\.extracted12\s*\{[^}]*flex:\s*1 1 100%[^}]*flex-wrap:\s*wrap/
  );
});
