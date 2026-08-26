import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require("next/dist/compiled/babel/parser");
const ROOT = path.resolve("src/app");
const checkOnly = process.argv.includes("--check");
const CODE = new Set([".js", ".jsx"]);
const CSS = new Set([".css"]);
const PRINT_SURFACE_FILES = new Set([
  path.resolve("src/app/invoice-view/[id]/page.module.css"),
  path.resolve("src/app/quote/[id]/page.js"),
]);

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return ["api", "generated"].includes(entry.name) ? [] : collect(absolute);
    return CODE.has(path.extname(entry.name)) || CSS.has(path.extname(entry.name)) ? [absolute] : [];
  });
}

function replaceExactPaletteAlias(value, replacements) {
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  let core = value.trim();
  const quote = ["\"", "'", "`"].includes(core[0]) && core.at(-1) === core[0] ? core[0] : "";
  if (quote) core = core.slice(1, -1).trim();
  const important = /\s*!important$/i.test(core) ? " !important" : "";
  if (important) core = core.replace(/\s*!important$/i, "").trim();
  const replacement = replacements.get(core.toLowerCase());
  if (!replacement) return value;
  return `${leading}${quote}${replacement}${important}${quote}${trailing}`;
}

const surfaceAliases = new Map([
  ["var(--color-white)", "var(--color-surface)"],
  ["var(--shell-text)", "var(--color-surface-subtle)"],
  ["var(--color-text)", "var(--shell-sidebar-bg)"],
  ["var(--color-black)", "var(--shell-sidebar-bg)"],
  ["#fff", "var(--color-surface)"],
  ["#ffffff", "var(--color-surface)"],
  ["white", "var(--color-surface)"],
  ["black", "var(--shell-sidebar-bg)"],
  ["purple", "var(--color-accent)"],
]);
const foregroundAliases = new Map([
  ["var(--color-black)", "var(--color-text)"],
  ["black", "var(--color-text)"],
  ["red", "var(--color-danger)"],
]);
const borderAliases = new Map([
  ["var(--color-black)", "var(--color-border-strong)"],
  ["black", "var(--color-border-strong)"],
]);

function surfaceValue(value) { return replaceExactPaletteAlias(value, surfaceAliases); }

function foregroundValue(value) { return replaceExactPaletteAlias(value, foregroundAliases); }

function borderValue(value) {
  return replaceExactPaletteAlias(value, borderAliases);
}

function writeWithRetry(file, value) {
  if (checkOnly) return;
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { fs.writeFileSync(file, value); return; }
    catch (error) {
      lastError = error;
      if (!["EBUSY", "EPERM"].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
  throw lastError;
}

function changedLines(file, source, output) {
  const before = source.split("\n");
  const after = output.split("\n");
  return before.flatMap((line, index) => {
    const explicitlyAllowed = line.includes("style-audit-allow light-control")
      || before[index - 1]?.includes("style-audit-allow light-control");
    if (line === after[index] || explicitlyAllowed) return [];
    return [{
    file: path.relative(process.cwd(), file),
    line: index + 1,
    source: line.trim().slice(0, 180),
    }];
  });
}

let changedFiles = 0;
let replacements = 0;
const violations = [];
const files = collect(ROOT).filter((file) => !PRINT_SURFACE_FILES.has(file));
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  let output = source;
  if (CSS.has(path.extname(file))) {
    output = source.replace(/(background(?:-color)?\s*:\s*)([^;}\n]+)/gi, (match, prefix, value) => {
      const next = surfaceValue(value);
      if (next !== value) replacements += 1;
      return `${prefix}${next}`;
    });
    output = output.replace(/((?:^|[;}])\s*(?:color|fill|stroke)\s*:\s*)([^;}\n]+)/gim, (match, prefix, value) => `${prefix}${foregroundValue(value)}`);
    output = output.replace(/((?:^|[;}])\s*border(?:-color)?\s*:\s*)([^;}\n]+)/gim, (match, prefix, value) => `${prefix}${borderValue(value)}`);
  } else {
    const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "dynamicImport"] });
    const edits = [];
    function walk(node) {
      if (!node || typeof node !== "object") return;
      if ((node.type === "ObjectProperty" || node.type === "ObjectMethod") && !node.computed) {
        const key = node.key?.name ?? node.key?.value;
        if (["background", "backgroundColor", "color", "fill", "stroke", "border", "borderColor"].includes(key) && node.value?.start != null) {
          const current = source.slice(node.value.start, node.value.end);
          const next = ["background", "backgroundColor"].includes(key)
            ? surfaceValue(current)
            : (["border", "borderColor"].includes(key) ? borderValue(current) : foregroundValue(current));
          if (next !== current) edits.push({ start: node.value.start, end: node.value.end, text: next });
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (["loc", "start", "end", "extra", "errors", "comments", "tokens"].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object" && value.type) walk(value);
      }
    }
    walk(ast.program);
    edits.sort((a, b) => b.start - a.start);
    for (const edit of edits) output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
    replacements += edits.length;

    output = output.replace(/(background(?:-color)?\s*:\s*)([^;}\n`]+)/gi, (match, prefix, value) => {
      const next = surfaceValue(value);
      if (next !== value) replacements += 1;
      return `${prefix}${next}`;
    });
    output = output.replace(/((?:^|[;}])\s*(?:color|fill|stroke)\s*:\s*)([^;}\n`]+)/gim, (match, prefix, value) => `${prefix}${foregroundValue(value)}`);
    output = output.replace(/((?:^|[;}])\s*border(?:-color)?\s*:\s*)([^;}\n`]+)/gim, (match, prefix, value) => `${prefix}${borderValue(value)}`);
  }
  if (output !== source) {
    const fileViolations = checkOnly ? changedLines(file, source, output) : [];
    if (checkOnly) violations.push(...fileViolations);
    writeWithRetry(file, output);
    if (!checkOnly || fileViolations.length > 0) changedFiles += 1;
  }
}

// Any remaining black alias is a foreground/status/border use. Keep it palette-aware.
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const replacement = file.includes(`${path.sep}quote${path.sep}[id]${path.sep}`)
    ? "var(--color-border-strong)"
    : "var(--color-text)";
  const output = source.replaceAll("var(--color-black)", replacement);
  if (output !== source) {
    const fileViolations = checkOnly ? changedLines(file, source, output) : [];
    if (checkOnly) violations.push(...fileViolations);
    writeWithRetry(file, output);
    if (!checkOnly || fileViolations.length > 0) changedFiles += 1;
  }
}

const uniqueViolations = [...new Map(violations.map((violation) => [`${violation.file}:${violation.line}`, violation])).values()];
if (checkOnly && uniqueViolations.length > 0) {
  console.log("Dark-mode compatibility violations:");
  uniqueViolations.forEach((violation) => console.log(`- ${violation.file}:${violation.line} ${violation.source}`));
}
console.log(`${checkOnly ? "Found" : "Migrated"} ${checkOnly ? uniqueViolations.length : replacements} light-only backgrounds across ${changedFiles} files.`);
if (checkOnly && changedFiles > 0) process.exitCode = 1;
