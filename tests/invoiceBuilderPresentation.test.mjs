import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/app/invoice/[id]/page.js", import.meta.url),
  "utf8"
);
const styles = fs.readFileSync(
  new URL("../src/app/invoice/[id]/page.styles.module.css", import.meta.url),
  "utf8"
);

test("invoice builder separates active and excluded quoted lines", () => {
  assert.match(source, /const activeLines = indexedInvoiceLines\.filter/);
  assert.match(source, /Number\(line\.quantity \|\| 0\) > 0 \|\| !line\.sourceLineId/);
  assert.match(source, /const excludedLines = indexedInvoiceLines\.filter/);
  assert.match(source, /Excluded items \(\{excludedLines\.length\}\)/);
  assert.match(source, /restoreInvoiceLine\(index\)/);
});

test("quoted lines are excluded while manual lines are deleted", () => {
  assert.match(source, /line\.sourceLineId \?/);
  assert.match(source, /excludeInvoiceLine\(index\)/);
  assert.match(source, /removeInvoiceLine\(index\)/);
});

test("approval controls use canonical readiness and expose blocker navigation", () => {
  assert.match(source, /getInvoiceApprovalReadiness\(invoice\)/);
  assert.match(source, /disabled=\{saving \|\| !approvalReadiness\.ready\}/);
  assert.match(source, /const focusReadinessBlocker = \(blocker\) =>/);
  assert.match(source, /focusReadinessBlocker\(customerBlockers\[0\]\)/);
  assert.match(source, /className=\{layoutStyles\.builderToolbar\}/);
});

test("invoice workspace uses dark-safe semantic surfaces and contrast pairs", () => {
  assert.match(source, /import \{ createPortal \} from "react-dom"/);
  assert.match(source, /return createPortal\([\s\S]*?document\.body/);
  assert.match(styles, /\.formCard,[\s\S]*?background:\s*var\(--color-surface\)/);
  assert.match(styles, /\.customerSelector select,[\s\S]*?background:\s*var\(--color-surface-raised\)/);
  assert.match(styles, /\.drawer\s*\{[\s\S]*?background:\s*var\(--color-surface-raised\)/);
  assert.match(styles, /\.reviewTotals > div:last-child\s*\{[^}]*background:\s*var\(--button-primary-background\);[^}]*color:\s*var\(--button-primary-text\)/);
  assert.doesNotMatch(styles, /\.reviewTotals > div:last-child\s*\{[^}]*var\(--shell-sidebar-bg\)/);
});
