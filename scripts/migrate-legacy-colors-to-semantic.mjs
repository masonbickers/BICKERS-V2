import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src/app");
const extensions = new Set([".js", ".jsx", ".css"]);
const excluded = new Set([path.resolve(root, "theme.css"), path.resolve(root, "utils/globalTheme.js")]);

const semantic = [
  ["--color-black", "#000000"], ["--color-white", "#ffffff"],
  ["--color-text", "#0f172a"], ["--color-text-muted", "#64748b"],
  ["--color-canvas", "#f3f6f9"], ["--color-surface", "#ffffff"],
  ["--color-surface-subtle", "#f8fafc"], ["--color-surface-hover", "#f1f5f9"],
  ["--color-border", "#d7dee8"], ["--color-border-strong", "#c8d6e3"],
  ["--color-brand", "#1f4b7a"], ["--color-brand-hover", "#173b62"],
  ["--color-brand-soft", "#edf3f8"], ["--color-brand-border", "#c8d6e3"],
  ["--color-accent", "#8b5e3c"], ["--color-accent-soft", "#f5ede6"],
  ["--color-success", "#166534"], ["--color-success-soft", "#ecfdf5"],
  ["--color-success-border", "#bbf7d0"], ["--color-success-accent", "#6bb37f"],
  ["--color-warning", "#9a3412"], ["--color-warning-soft", "#fff7ed"],
  ["--color-warning-border", "#fed7aa"], ["--color-danger", "#991b1b"],
  ["--color-danger-hover", "#7f1d1d"], ["--color-danger-soft", "#fef2f2"],
  ["--color-danger-border", "#fecaca"], ["--color-info", "#1d4ed8"],
  ["--color-info-soft", "#eff6ff"], ["--color-info-border", "#bfdbfe"],
  ["--shell-sidebar-bg", "#000000"], ["--shell-text", "#f8fbff"], ["--shell-muted", "#b4c0cf"],
];

const explicit = new Map([
  ["fff", "--color-white"], ["ffffff", "--color-white"], ["000", "--color-black"], ["000000", "--color-black"],
  ["0f172a", "--color-text"], ["111827", "--color-text"], ["1f2937", "--color-text"],
  ["334155", "--color-text-muted"], ["374151", "--color-text-muted"], ["475569", "--color-text-muted"], ["64748b", "--color-text-muted"], ["6b7280", "--color-text-muted"], ["9ca3af", "--color-text-muted"],
  ["f3f6f9", "--color-canvas"], ["f3f4f6", "--color-canvas"], ["f8fafc", "--color-surface-subtle"], ["f9fafb", "--color-surface-subtle"], ["f1f5f9", "--color-surface-hover"],
  ["e5e7eb", "--color-border"], ["d7dee8", "--color-border"], ["d1d5db", "--color-border"], ["e2e8f0", "--color-border"], ["cbd5e1", "--color-border-strong"], ["c8d6e3", "--color-border-strong"],
  ["1f4b7a", "--color-brand"], ["1d4ed8", "--color-brand"], ["2563eb", "--color-brand"], ["2a5f96", "--color-brand-hover"], ["edf3f8", "--color-brand-soft"], ["dbeafe", "--color-brand-soft"],
  ["166534", "--color-success"], ["16a34a", "--color-success"], ["15803d", "--color-success"], ["ecfdf5", "--color-success-soft"], ["dcfce7", "--color-success-soft"], ["bbf7d0", "--color-success-border"], ["86efac", "--color-success-border"],
  ["9a3412", "--color-warning"], ["b45309", "--color-warning"], ["92400e", "--color-warning"], ["fff7ed", "--color-warning-soft"], ["fffbeb", "--color-warning-soft"], ["fef9c3", "--color-warning-soft"], ["fed7aa", "--color-warning-border"], ["fde68a", "--color-warning-border"],
  ["991b1b", "--color-danger"], ["b91c1c", "--color-danger"], ["dc2626", "--color-danger"], ["ef4444", "--color-danger"], ["7f1d1d", "--color-danger-hover"], ["fef2f2", "--color-danger-soft"], ["fff1f2", "--color-danger-soft"], ["fecaca", "--color-danger-border"], ["fca5a5", "--color-danger-border"],
  ["0369a1", "--color-info"], ["0ea5e9", "--color-info"], ["eff6ff", "--color-info-soft"], ["e0f2fe", "--color-info-soft"], ["bfdbfe", "--color-info-border"], ["bae6fd", "--color-info-border"],
]);

const toRgb = (hex) => {
  const clean = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex.slice(0, 6);
  return [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16));
};

const distance = (a, b) => {
  const ar = toRgb(a), br = toRgb(b);
  return Math.sqrt(ar.reduce((sum, channel, index) => sum + (channel - br[index]) ** 2, 0));
};

function semanticReplacement(raw) {
  const clean = raw.toLowerCase();
  const rgb = clean.length === 8 ? clean.slice(0, 6) : clean.length === 4 ? clean.slice(0, 3) : clean;
  const alphaHex = clean.length === 8 ? clean.slice(6) : clean.length === 4 ? clean.slice(3).repeat(2) : "ff";
  const variable = explicit.get(rgb) || semantic.reduce((best, [name, hex]) => distance(rgb, hex.slice(1)) < best.distance ? { name, distance: distance(rgb, hex.slice(1)) } : best, { name: "--color-text", distance: Infinity }).name;
  const alpha = parseInt(alphaHex, 16) / 255;
  return alpha < .995 ? `color-mix(in srgb, var(${variable}) ${Math.round(alpha * 100)}%, transparent)` : `var(${variable})`;
}

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

let changed = 0;
for (const file of files(root)) {
  if (!extensions.has(path.extname(file)) || excluded.has(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  const isServerOutput = file.includes(`${path.sep}api${path.sep}`);
  let next = source.replace(/var\(--legacy-color-([0-9a-fA-F]{3,8})\)/g, (_, colour) => isServerOutput ? `#${colour}` : semanticReplacement(colour));
  if (!isServerOutput) next = next.replace(/#[0-9a-fA-F]{3,8}\b/g, (colour) => semanticReplacement(colour.slice(1)));
  if (next !== source) {
    fs.writeFileSync(file, next);
    changed += 1;
  }
}
const themeFile = path.resolve(root, "theme.css");
const themeSource = fs.readFileSync(themeFile, "utf8");
const themeNext = themeSource.replace(/\n\s*\/\* Legacy exact-colour compatibility registry\. \*\/[\s\S]*?\/\* End legacy exact-colour compatibility registry\. \*\//, "");
if (themeNext !== themeSource) fs.writeFileSync(themeFile, themeNext);
console.log(`Migrated legacy and literal colours in ${changed} files.`);
