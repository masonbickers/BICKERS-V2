import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve("src/app");
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".css"]);
const excludedDirectories = new Set(["api", "generated"]);
const canonicalColourFiles = new Set([
  path.resolve("src/app/theme.css"),
  path.resolve("src/app/utils/globalTheme.js"),
]);

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return excludedDirectories.has(entry.name) ? [] : collect(absolute);
    return CODE_EXTENSIONS.has(path.extname(entry.name)) ? [absolute] : [];
  });
}

const files = collect(ROOT);
const sources = files.map((file) => ({ file, source: fs.readFileSync(file, "utf8") }));
const count = (source, pattern) => (source.match(pattern) || []).length;
const metrics = {
  files: files.length,
  legacyColourReferences: sources.reduce((total, item) => total + count(item.source, /--legacy-color-/g), 0),
  hardCodedUiColours: sources.reduce((total, item) => total + (canonicalColourFiles.has(item.file) ? 0 : count(item.source, /#[0-9a-fA-F]{3,8}\b/g)), 0),
  localUiPalettes: sources.reduce((total, item) => total + count(item.source, /^\s*const\s+UI\s*=\s*\{/gm), 0),
};

const extraction = spawnSync(process.execPath, ["scripts/extract-static-styles.mjs", "--all", "--dry-run"], { encoding: "utf8" });
if (extraction.status !== 0) {
  process.stderr.write(extraction.stderr || extraction.stdout);
  process.exit(1);
}
metrics.extractableStaticInlineStyles = [...extraction.stdout.matchAll(/: (\d+) static style props extractable/g)]
  .reduce((total, match) => total + Number(match[1]), 0);
metrics.runtimeInlineStyles = sources.reduce((total, item) => total + count(item.source, /\bstyle\s*=/g), 0);
metrics.runtimeEmbeddedStyles = sources.reduce((total, item) => total + count(item.source, /<style\b/g), 0);

const darkCompatibility = spawnSync(process.execPath, ["scripts/migrate-dark-mode-surfaces.mjs", "--check"], { encoding: "utf8" });
metrics.darkModeCompatibility = darkCompatibility.status === 0 ? 0 : 1;

console.log("Repository-wide global styling audit");
console.table(metrics);
console.log("Runtime styles are informational: static styles are rejected; dynamic styles must use semantic tokens or CSS custom properties.");

const failed = metrics.legacyColourReferences > 0
  || metrics.hardCodedUiColours > 0
  || metrics.localUiPalettes > 0
  || metrics.extractableStaticInlineStyles > 0
  || metrics.darkModeCompatibility > 0;
if (process.argv.includes("--check") && failed) process.exitCode = 1;
