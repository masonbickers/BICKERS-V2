import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve("src/app");
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ignoredDirectories = new Set(["generated", "components/ui"]);
const ignoredFiles = new Set(["backup-jobnumber.js"]);
const ignoredNames = /(?:^|[-_.])(backup|legacy|old)(?:$|[-_.])/i;
const allowMarker = "style-audit-allow runtime";

// Frozen active-app debt. `--check` prevents this from increasing while route
// families migrate; `--strict` is the zero-debt final acceptance gate.
const baseline = {
  inlineStyles: 4467,
  hardCodedColours: 0,
  localPalettes: 86,
  embeddedMediaFiles: 43,
  nativeControls: 1473,
  cssHardCodedColours: 0,
};

const fullyMigratedFiles = new Set([
  "src/app/booking-page/page.js",
  "src/app/service-home/page.js",
]);

function isIgnored(relativePath, isDirectory = false) {
  const normalized = relativePath.split(path.sep).join("/");
  if (ignoredDirectories.has(normalized)) return true;
  if (!isDirectory && ignoredFiles.has(path.basename(relativePath))) return true;
  return normalized.split("/").some((segment) => ignoredNames.test(segment));
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file);
    if (isIgnored(relative, entry.isDirectory())) return [];
    if (entry.isDirectory()) return sourceFiles(file);
    return extensions.has(path.extname(file)) ? [file] : [];
  });
}

function countUnapprovedInlineStyles(source) {
  const lines = source.split(/\r?\n/);
  return lines.reduce((count, line, index) => {
    const occurrences = (line.match(/style=\{\{/g) || []).length;
    if (!occurrences) return count;
    const context = `${lines[index - 1] || ""}\n${line}`;
    return context.includes(allowMarker) ? count : count + occurrences;
  }, 0);
}

const details = [];
const totals = { inlineStyles: 0, hardCodedColours: 0, localPalettes: 0, embeddedMediaFiles: 0, nativeControls: 0, cssHardCodedColours: 0 };

function cssFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(file);
    return entry.name.endsWith(".css") && entry.name !== "theme.css" ? [file] : [];
  });
}

for (const file of cssFiles(root)) {
  const source = fs.readFileSync(file, "utf8");
  totals.cssHardCodedColours += (source.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
}

for (const file of sourceFiles(root)) {
  const source = fs.readFileSync(file, "utf8");
  const importsSharedControls = /from\s+["']@\/app\/components\/ui["']/.test(source);
  const metrics = {
    inlineStyles: countUnapprovedInlineStyles(source),
    hardCodedColours: (source.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length,
    localPalettes: (source.match(/^\s*const\s+UI\s*=\s*\{/gm) || []).length,
    embeddedMediaFiles: /@media/.test(source) ? 1 : 0,
    nativeControls: importsSharedControls ? 0 : (source.match(/<(?:button|input|select|textarea)\b/g) || []).length,
  };
  for (const [key, value] of Object.entries(metrics)) totals[key] += value;
  if (Object.values(metrics).some(Boolean)) details.push({ file: path.relative(process.cwd(), file), ...metrics });
}

details.sort((a, b) => b.inlineStyles - a.inlineStyles || b.hardCodedColours - a.hardCodedColours);
console.log("Active application style migration audit");
console.table(totals);
console.table(details.slice(0, 25));

const migratedRegressions = details.filter(({ file, ...metrics }) => fullyMigratedFiles.has(file) && Object.values(metrics).some(Boolean));
const regressions = Object.entries(totals).filter(([key, value]) => value > baseline[key]);

if (process.argv.includes("--check") && (regressions.length || migratedRegressions.length)) {
  console.error("Styling debt increased:", regressions.map(([key, value]) => `${key} ${baseline[key]} -> ${value}`).join(", "));
  if (migratedRegressions.length) console.error("Fully migrated routes contain legacy styling:", migratedRegressions.map(({ file }) => file).join(", "));
  process.exitCode = 1;
}

if (process.argv.includes("--strict")) {
  const remaining = Object.entries(totals).filter(([, value]) => value > 0);
  if (remaining.length) {
    console.error("Strict global-style gate failed:", remaining.map(([key, value]) => `${key}=${value}`).join(", "));
    process.exitCode = 1;
  }
}
