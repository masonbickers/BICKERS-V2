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
  const enquiryQueue = read("../src/app/enquiry/page.js");

  assert.match(theme, /:root\[data-color-mode="dark"\][\s\S]*--button-primary-background:\s*color-mix/);
  assert.match(sharedUi, /\.primary\{[^}]*background:var\(--button-primary-background\)/);
  assert.match(healthAndSafety, /background:\s*"var\(--button-primary-background\)"/);
  assert.doesNotMatch(healthAndSafety, /background:\s*"linear-gradient\(180deg, var\(--color-brand-hover\)/);
  assert.match(enquiryQueue, /background:\s*kind === "primary" \? "var\(--button-primary-background\)"/);
  assert.match(enquiryQueue, /color:\s*kind === "primary" \? "var\(--button-primary-text\)"/);
});

test("create enquiry columns merge with the dark canvas", () => {
  const enquiryPage = read("../src/app/create-enquiry/page.js");
  const enquiryStyles = read("../src/app/create-enquiry/page.styles.module.css");

  assert.equal((enquiryPage.match(/layoutStyles\.enquiryColumnPanel/g) || []).length, 2);
  assert.match(enquiryStyles, /:global\(:root\[data-color-mode="dark"\]\) \.enquiryColumnPanel\s*\{[^}]*background:\s*var\(--color-canvas\) !important/);
});

test("job number actions use semantic dark-mode control surfaces", () => {
  const jobNumberPage = read("../src/app/job-numbers/[id]/page.js");
  const jobNumberStyles = read("../src/app/job-numbers/[id]/page.styles.module.css");

  assert.match(jobNumberPage, /background:\s*"var\(--button-primary-background\)"/);
  assert.match(jobNumberPage, /width:\s*"100%",\s*minHeight:\s*"100%",\s*backgroundColor:\s*UI\.bg/);
  assert.doesNotMatch(jobNumberPage, /minHeight:\s*"100vh",\s*backgroundColor:\s*UI\.bg/);
  assert.match(jobNumberPage, /color:\s*"var\(--button-primary-text\)"/);
  assert.match(jobNumberPage, /background:\s*"var\(--color-surface-raised\)"/);
  assert.match(jobNumberPage, /borderTop:\s*isExpanded \? UI\.border : "none"/);
  assert.match(jobNumberPage, /borderRight:\s*isExpanded \? UI\.border : "none"/);
  assert.doesNotMatch(jobNumberPage, /border:\s*isExpanded \? UI\.border : "none"/);
  assert.match(jobNumberPage, /background:\s*"transparent",\s*\n\s*border:\s*"none"/);
  assert.doesNotMatch(jobNumberPage, /title="Job prefix"/);
  assert.doesNotMatch(jobNumberPage, /invoiceBadge/);
  assert.match(jobNumberPage, /className=\{layoutStyles\.bookingMetaText\}/);
  assert.match(jobNumberPage, /aria-label="More actions"[\s\S]*?•••/);
  assert.match(jobNumberPage, /crewCount\.required > 0 && crewCount\.allocated < crewCount\.required/);
  assert.match(jobNumberPage, /className=\{layoutStyles\.bookingWarningSummary\}/);
  assert.match(jobNumberPage, /rowWarnings\.join\(" · "\)/);
  assert.match(jobNumberPage, /invoiceStage \? "Invoice readiness" : "Booking readiness"/);
  assert.match(jobNumberPage, /showPoWarning && !String\(job\.po/);
  assert.match(jobNumberPage, /invoiceStage && timesheets\.length === 0/);
  assert.match(jobNumberPage, /isLockedStatus\(status\) \|\| !isInvoiceStageStatus\(status\)/);
  assert.match(jobNumberPage, /className=\{layoutStyles\.financeDetails\} open=\{invoiceStage\}/);
  assert.match(jobNumberStyles, /\.bookingMetaText\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(jobNumberStyles, /\.bookingWarningDot\s*\{[^}]*background:\s*var\(--color-warning\)/);
  assert.match(jobNumberStyles, /\.compactEmptyState\s*\{[^}]*padding:\s*3px 0 5px/);
  assert.match(jobNumberStyles, /\.bookingSection:not\(\[data-expanded="true"\]\):hover\s*\{[^}]*background:\s*var\(--color-surface-hover\) !important/);
});

test("job number workspace uses a compact list-first summary", () => {
  const jobNumberPage = read("../src/app/job-numbers/[id]/page.js");
  const jobNumberStyles = read("../src/app/job-numbers/[id]/page.styles.module.css");

  assert.match(jobNumberPage, /const isGroupedJobNumber = allJobs\.length > 1/);
  assert.match(jobNumberPage, /const currentJobRecordId = allJobs\.find\(\(job\) => job\.id === jobId\)\?\.id \|\| allJobs\[0\]\?\.id \|\| jobId/);
  assert.match(jobNumberPage, /if \(currentJobRecordId\) next\[currentJobRecordId\] = true/);
  assert.match(jobNumberPage, /data-current=\{job\.id === currentJobRecordId \? "true" : undefined\}/);
  assert.match(jobNumberPage, /className=\{layoutStyles\.workspaceListTools\}/);
  assert.match(jobNumberPage, /aria-label="Search bookings"/);
  assert.match(jobNumberPage, /aria-label="Filter bookings by status"/);
  assert.match(jobNumberPage, /aria-live="polite"[\s\S]*?\{filteredJobs\.length\} of \{allJobs\.length\}/);
  assert.match(jobNumberPage, /title="Expand all bookings"/);
  assert.match(jobNumberPage, /title="Collapse all bookings except the current booking"/);
  assert.match(jobNumberPage, /<details className=\{layoutStyles\.sharedSummary\}>/);
  assert.match(jobNumberPage, /View shared details/);
  assert.match(jobNumberPage, /Hide shared details/);
  assert.match(jobNumberPage, /getPrimaryContactName\(allJobs\)/);
  assert.match(jobNumberPage, /connectedSummary\.vehicles\.length/);
  assert.doesNotMatch(jobNumberPage, /\{filteredJobs\.length\} shown/);
  assert.doesNotMatch(jobNumberPage, />Bookings<\/div>/);

  assert.match(jobNumberStyles, /\.workspaceFrame\s*\{[^}]*max-width:\s*1800px/);
  assert.match(jobNumberStyles, /\.sharedSummary\s*\{[^}]*background:\s*var\(--color-surface\)/);
  assert.match(jobNumberStyles, /\.sharedSummaryDetails\s*\{[^}]*background:\s*var\(--color-surface-subtle\)/);
  assert.match(jobNumberStyles, /@media \(max-width: 820px\)[\s\S]*?\.sharedSummaryDetails\s*\{[^}]*repeat\(2/);
  assert.match(jobNumberStyles, /@media \(max-width: 560px\)[\s\S]*?\.sharedSummaryDetails\s*\{[^}]*minmax\(0, 1fr\)/);
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
