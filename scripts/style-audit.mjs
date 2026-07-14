import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve("src/app");
const baseline = {
  inlineStyles: 4546,
  hardCodedColours: 4729,
  localPalettes: 87,
  embeddedMediaFiles: 42,
};
const fullyMigratedFiles = new Set(["src/app/booking-page/page.js"]);

const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ignoredSegments = [ `${path.sep}generated${path.sep}`, `${path.sep}components${path.sep}ui${path.sep}` ];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (ignoredSegments.some((segment) => file.includes(segment))) return [];
    if (entry.isDirectory()) return sourceFiles(file);
    return extensions.has(path.extname(file)) ? [file] : [];
  });
}

const details = [];
const totals = { inlineStyles: 0, hardCodedColours: 0, localPalettes: 0, embeddedMediaFiles: 0 };

for (const file of sourceFiles(root)) {
  const source = fs.readFileSync(file, "utf8");
  const metrics = {
    inlineStyles: (source.match(/style=\{\{/g) || []).length,
    hardCodedColours: (source.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length,
    localPalettes: (source.match(/^\s*const\s+UI\s*=\s*\{/gm) || []).length,
    embeddedMediaFiles: /@media/.test(source) ? 1 : 0,
  };
  for (const key of Object.keys(totals)) totals[key] += metrics[key];
  if (Object.values(metrics).some(Boolean)) details.push({ file: path.relative(process.cwd(), file), ...metrics });
}

details.sort((a, b) => b.inlineStyles - a.inlineStyles || b.hardCodedColours - a.hardCodedColours);
console.log("Style migration audit");
console.table(totals);
console.table(details.slice(0, 20));

if (process.argv.includes("--check")) {
  const regressions = Object.entries(totals).filter(([key, value]) => value > baseline[key]);
  const migratedRegressions = details.filter(
    ({ file, ...metrics }) => fullyMigratedFiles.has(file) && Object.values(metrics).some(Boolean)
  );
  if (regressions.length || migratedRegressions.length) {
    console.error("Styling debt increased:", regressions.map(([key, value]) => `${key} ${baseline[key]} -> ${value}`).join(", "));
    if (migratedRegressions.length) {
      console.error("Fully migrated routes contain legacy styling:", migratedRegressions.map(({ file }) => file).join(", "));
    }
    process.exitCode = 1;
  }
}
