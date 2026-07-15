import fs from "node:fs";

const migratedCode = [
  "src/app/components/HeaderSidebarLayout.jsx",
  "src/app/home/page.js",
  "src/app/dashboard/DashboardPageImpl.js",
];
const migratedCss = [
  "src/app/components/HeaderSidebarLayout.styles.module.css",
  "src/app/home/page.styles.module.css",
  "src/app/home/home.layout.css",
  "src/app/dashboard/DashboardPageImpl.styles.module.css",
  "src/app/dashboard/dashboard.calendar.css",
  "src/app/calendar-integration.css",
];

const details = migratedCode.map((file) => {
  const source = fs.readFileSync(file, "utf8");
  const unapprovedStyles = source.split(/\r?\n/).filter((line) => line.includes("style=") && !line.includes('"--')).length;
  return {
    file,
    unapprovedStyles,
    hardCodedColours: (source.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length,
    localPalettes: (source.match(/^\s*const\s+UI\s*=\s*\{/gm) || []).length,
    embeddedCss: (source.match(/<style\b/g) || []).length,
    nativeControls: (source.match(/<(?:button|input|select|textarea)\b/g) || []).length,
  };
});
const cssHardCodedColours = migratedCss.reduce((total, file) => total + (fs.readFileSync(file, "utf8").match(/#[0-9a-fA-F]{3,8}\b/g) || []).length, 0);
console.log("Phase 2 global styling audit");
console.table(details);
console.log(`CSS hard-coded colours: ${cssHardCodedColours}`);
const failed = details.some(({ file, ...metrics }) => Object.values(metrics).some(Boolean)) || cssHardCodedColours > 0;
if (process.argv.includes("--check") && failed) process.exitCode = 1;
