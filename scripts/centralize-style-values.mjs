import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve("src/app");
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ignored = /(?:^|\/)(?:generated|ui)(?:\/|$)|(?:^|[-_.])(?:backup|legacy|old)(?:$|[-_.])/i;

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path.relative(appRoot, file).split(path.sep).join("/");
    if (ignored.test(relative)) return [];
    if (entry.isDirectory()) return files(file);
    return extensions.has(path.extname(file)) ? [file] : [];
  });
}

const spacing = new Map([
  ["4", "--space-1"], ["8", "--space-2"], ["12", "--space-3"],
  ["16", "--space-4"], ["20", "--space-5"], ["24", "--space-6"],
  ["32", "--space-8"], ["40", "--space-10"], ["48", "--space-12"],
]);
const radii = new Map([["6", "--radius-sm"], ["8", "--radius-md"], ["12", "--radius-lg"], ["18", "--radius-xl"], ["999", "--radius-pill"]]);
const fontSizes = new Map([["12", "--font-size-xs"], ["13", "--font-size-sm"], ["14", "--font-size-md"], ["16", "--font-size-lg"], ["22", "--font-size-xl"]]);
const heights = new Map([["32", "--control-height-sm"], ["36", "--control-height-md"], ["44", "--control-height-lg"]]);

const spacingProperty = "(?:gap|rowGap|columnGap|padding|paddingTop|paddingRight|paddingBottom|paddingLeft|paddingInline|paddingBlock|margin|marginTop|marginRight|marginBottom|marginLeft|marginInline|marginBlock)";

function replaceNumericProperty(source, propertyPattern, values) {
  const choices = [...values.keys()].sort((a, b) => Number(b) - Number(a)).join("|");
  const pattern = new RegExp(`(${propertyPattern}\\s*:\\s*)(${choices})(?=\\s*[,}])`, "g");
  return source.replace(pattern, (_, prefix, value) => `${prefix}"var(${values.get(value)})"`);
}

let changedFiles = 0;
for (const file of files(appRoot)) {
  const source = fs.readFileSync(file, "utf8");
  let migrated = replaceNumericProperty(source, spacingProperty, spacing);
  migrated = replaceNumericProperty(migrated, "borderRadius", radii);
  migrated = replaceNumericProperty(migrated, "fontSize", fontSizes);
  migrated = replaceNumericProperty(migrated, "(?:height|minHeight)", heights);
  if (migrated !== source) {
    fs.writeFileSync(file, migrated);
    changedFiles += 1;
  }
}

console.log(`Centralised common visual values in ${changedFiles} active source files.`);
