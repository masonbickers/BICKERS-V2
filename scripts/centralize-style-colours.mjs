import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve("src/app");
const themeFile = path.join(appRoot, "theme.css");
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ignored = /(?:^|\/)(?:generated|ui)(?:\/|$)|(?:^|[-_.])(?:backup|legacy|old)(?:$|[-_.])/i;
const startMarker = "  /* Legacy exact-colour compatibility registry. */";
const endMarker = "  /* End legacy exact-colour compatibility registry. */";

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path.relative(appRoot, file).split(path.sep).join("/");
    if (ignored.test(relative)) return [];
    if (entry.isDirectory()) return files(file);
    return extensions.has(path.extname(file)) ? [file] : [];
  });
}

const sourceFiles = files(appRoot);
const colours = new Set();
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) colours.add(match[0].slice(1).toLowerCase());
}

const ordered = [...colours].sort();
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  const migrated = source.replace(/#[0-9a-fA-F]{3,8}\b/g, (value) => `var(--legacy-color-${value.slice(1).toLowerCase()})`);
  if (migrated !== source) fs.writeFileSync(file, migrated);
}

let theme = fs.readFileSync(themeFile, "utf8");
const registry = [
  startMarker,
  "  /* These preserve exact legacy accents during migration. New code must use semantic tokens. */",
  ...ordered.map((hex) => `  --legacy-color-${hex}: #${hex};`),
  endMarker,
].join("\n");

const existingStart = theme.indexOf(startMarker);
const existingEnd = theme.indexOf(endMarker);
if (existingStart >= 0 && existingEnd >= existingStart) {
  theme = `${theme.slice(0, existingStart)}${registry}${theme.slice(existingEnd + endMarker.length)}`;
} else {
  theme = theme.replace(/\n}\s*$/, `\n\n${registry}\n}\n`);
}
fs.writeFileSync(themeFile, theme);

console.log(`Centralised ${ordered.length} exact legacy colours in src/app/theme.css.`);
