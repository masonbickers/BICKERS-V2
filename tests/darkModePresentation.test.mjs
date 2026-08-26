import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("operational tables use semantic row surfaces instead of fixed white backgrounds", () => {
  const sources = [
    read("../src/app/vehicles/page.js"),
    read("../src/app/equipment/page.js"),
    read("../src/app/holiday-allowance/page.js"),
    read("../src/app/h-and-s/[id]/page.js"),
  ];

  sources.forEach((source) => {
    assert.doesNotMatch(source, /(?:zebra|const bg)[^\n]*var\(--color-white\)/);
    assert.match(source, /var\(--color-surface\)/);
    assert.match(source, /var\(--table-alternate-bg\)/);
  });
});

test("equipment register headers and neutral counter remain legible in dark mode", () => {
  const equipmentPage = read("../src/app/equipment/page.js");
  const equipmentStyles = read("../src/app/equipment/page.styles.module.css");

  assert.doesNotMatch(equipmentPage, /chip\("var\(--color-white\)"/);
  assert.match(equipmentPage, /chip\("var\(--color-surface-raised\)", UI\.text\)/);
  assert.match(equipmentStyles, /\.extracted7\s*\{[^}]*background:\s*var\(--color-surface-raised\);[^}]*color:\s*var\(--color-text\);[^}]*border-bottom:\s*1px solid var\(--color-border-strong\)/);
});

test("vehicle register headers and neutral counters remain legible in dark mode", () => {
  const vehiclePage = read("../src/app/vehicles/page.js");
  const vehicleStyles = read("../src/app/vehicles/page.styles.module.css");

  assert.doesNotMatch(vehiclePage, /chip\("var\(--color-white\)"/);
  assert.match(vehiclePage, /chip\("var\(--color-surface-raised\)", UI\.text\)/);
  assert.match(vehiclePage, /background:\s*"var\(--color-surface-raised\)"[\s\S]*color:\s*UI\.text[\s\S]*borderBottom:\s*"1px solid var\(--color-border-strong\)"/);
  assert.match(vehicleStyles, /\.extracted10\s*\{[^}]*color:\s*var\(--color-text-muted\)/);
  assert.match(vehicleStyles, /\.retentionTable th\s*\{[^}]*background:\s*var\(--color-surface-raised\);[^}]*color:\s*var\(--color-text\)/);
});

test("dark booking events use muted area fills while compact status colours remain available", () => {
  const theme = read("../src/app/theme.css");
  const dashboard = read("../src/app/dashboard/DashboardPageImpl.js");
  const dashboardCalendar = read("../src/app/dashboard/dashboard.calendar.css");
  const home = read("../src/app/home/page.js");

  assert.match(theme, /--job-status-confirmed-surface:\s*color-mix\(in srgb, var\(--job-status-confirmed\) 20%, var\(--color-surface-raised\)\)/);
  assert.match(theme, /--job-status-night-surface:\s*color-mix\(in srgb, var\(--job-status-night\) 20%, var\(--color-surface-raised\)\)/);
  assert.match(dashboard, /getFixedJobStatusSurfaceStyle\(status\)/);
  assert.match(dashboard, /getVehicleStatusPillStyle[\s\S]*?normalizedStatus === "Confirmed"[\s\S]*?getFixedJobStatusSurfaceStyle\(normalizedStatus\)/);
  assert.match(dashboard, /borderLeft:\s*`6px solid \$\{border\}`/);
  assert.match(dashboard, /let border = getWorkDiaryBorder\(status, tone\.border\)/);
  assert.match(dashboardCalendar, /:root\[data-color-mode="dark"\][^{]*\.rbc-event\.work-diary-job-card\s*\{[^}]*outline:\s*1px solid color-mix/);
  assert.match(home, /\.\.\.getCalendarStatusStyle\(e\.status\)/);
  assert.match(home, /borderColor:\s*tone\.border/);
});

test("primary actions use the shared dark-safe button surface", () => {
  const theme = read("../src/app/theme.css");
  const sharedUi = read("../src/app/components/ui/ui.module.css");
  const healthAndSafety = read("../src/app/h-and-s/[id]/page.js");

  assert.match(theme, /:root\[data-color-mode="dark"\][\s\S]*--button-primary-background:\s*color-mix/);
  assert.match(sharedUi, /\.primary\{[^}]*background:var\(--button-primary-background\)/);
  assert.match(healthAndSafety, /background:\s*"var\(--button-primary-background\)"/);
  assert.doesNotMatch(healthAndSafety, /background:\s*"linear-gradient\(180deg, var\(--color-brand-hover\)/);
});

test("create enquiry columns merge with the dark canvas", () => {
  const enquiryPage = read("../src/app/create-enquiry/page.js");
  const enquiryStyles = read("../src/app/create-enquiry/page.styles.module.css");

  assert.equal((enquiryPage.match(/layoutStyles\.enquiryColumnPanel/g) || []).length, 2);
  assert.match(enquiryStyles, /:global\(:root\[data-color-mode="dark"\]\) \.enquiryColumnPanel\s*\{[^}]*background:\s*var\(--color-canvas\) !important/);
});

test("global dark cards flatten while interactive hierarchy stays raised", () => {
  const globalTheme = read("../src/app/utils/globalTheme.js");
  const sharedUi = read("../src/app/components/ui/ui.module.css");

  assert.match(globalTheme, /const baseSurface = useDark \? theme\.canvasColor : theme\.surfaceColor/);
  assert.match(globalTheme, /"--color-canvas": theme\.canvasColor, "--color-surface": baseSurface/);
  assert.match(sharedUi, /:global\(:root\[data-color-mode="dark"\]\) \.cardInteractive,[\s\S]*\.statCard,[\s\S]*\.emptyState,[\s\S]*\.modal\s*\{[^}]*background:\s*var\(--color-surface-raised\)/);
});

test("quote footer keeps print-paper contrast in dark mode", () => {
  const quoteStyles = read("../src/app/quote/[id]/page.styles.module.css");

  assert.match(quoteStyles, /\.quotePaper\s*\{[\s\S]*--color-text:\s*#111827/);
  assert.match(quoteStyles, /\.extracted80\s*\{[^}]*color:\s*var\(--color-text-secondary\)/);
  assert.match(quoteStyles, /\.extracted83\s*\{[^}]*background:\s*var\(--color-surface\);[^}]*color:\s*var\(--color-text\)/);
  assert.match(quoteStyles, /\.extracted86\s*\{[^}]*background:\s*var\(--color-surface\);[^}]*color:\s*var\(--color-text\)/);
});

test("quote print output is independent from the active dark theme", () => {
  const quotePage = read("../src/app/quote/[id]/page.js");
  const screenStyles = quotePage.match(/@media screen \{[\s\S]*?@media \(max-width: 1450px\)/)?.[0] || "";
  const printStyles = quotePage.match(/@media print \{[\s\S]*?@page \{[\s\S]*?\}\s*\}/)?.[0] || "";

  assert.match(screenStyles, /\.quote-print-page\s*\{[^}]*background:\s*var\(--color-surface\) !important/);
  assert.match(printStyles, /\.quote-print-page\s*\{[^}]*background:\s*#fff !important/);
  assert.match(printStyles, /\.quote-print-paper\s*\{[^}]*background:\s*#fff !important;[^}]*color:\s*#111827 !important/);
  assert.match(printStyles, /\.quote-print-frame\s*\{[^}]*border:\s*1px solid #9ca3af !important;[^}]*background:\s*#fff !important/);
  assert.match(printStyles, /\.quote-print-frame\s*\{[^}]*height:\s*auto !important/);
  assert.match(printStyles, /\.quote-scale-shell\s*\{[^}]*background:\s*#fff !important/);
  assert.doesNotMatch(printStyles, /background:\s*var\(--color-surface\)/);
  assert.match(quotePage, /const paper = \{[\s\S]*?background:\s*"#fff"/);
  assert.match(quotePage, /const printFrame = \{[\s\S]*?background:\s*"#fff"/);
  assert.match(quotePage, /const printFrame = \{[\s\S]*?height:\s*"auto"/);
});
