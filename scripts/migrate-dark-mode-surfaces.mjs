import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require("next/dist/compiled/babel/parser");
const ROOT = path.resolve("src/app");
const checkOnly = process.argv.includes("--check");
const CODE = new Set([".js", ".jsx"]);
const CSS = new Set([".css"]);

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return ["api", "generated"].includes(entry.name) ? [] : collect(absolute);
    return CODE.has(path.extname(entry.name)) || CSS.has(path.extname(entry.name)) ? [absolute] : [];
  });
}

function surfaceValue(value) {
  return value
    .replaceAll("var(--color-white)", "var(--color-surface)")
    .replaceAll("var(--shell-text)", "var(--color-surface-subtle)")
    .replaceAll("var(--color-text)", "var(--shell-sidebar-bg)")
    .replaceAll("var(--color-black)", "var(--shell-sidebar-bg)")
    .replace(/\bblack\b/gi, "var(--shell-sidebar-bg)")
    .replace(/\bpurple\b/gi, "var(--color-accent)")
    .replace(/\bwhite\b/gi, "var(--color-surface)");
}

function foregroundValue(value) {
  return value
    .replaceAll("var(--color-black)", "var(--color-text)")
    .replace(/\bblack\b/gi, "var(--color-text)")
    .replace(/\bred\b/gi, "var(--color-danger)");
}

function borderValue(value) {
  return value
    .replaceAll("var(--color-black)", "var(--color-border-strong)")
    .replace(/\bblack\b/gi, "var(--color-border-strong)");
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

let changedFiles = 0;
let replacements = 0;
for (const file of collect(ROOT)) {
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
  if (output !== source) { writeWithRetry(file, output); changedFiles += 1; }
}

// Any remaining black alias is a foreground/status/border use. Keep it palette-aware.
for (const file of collect(ROOT)) {
  const source = fs.readFileSync(file, "utf8");
  const replacement = file.includes(`${path.sep}quote${path.sep}[id]${path.sep}`)
    ? "var(--color-border-strong)"
    : "var(--color-text)";
  const output = source.replaceAll("var(--color-black)", replacement);
  if (output !== source) { writeWithRetry(file, output); changedFiles += 1; }
}

console.log(`Migrated ${replacements} light-only backgrounds across ${changedFiles} files.`);
if (checkOnly && changedFiles > 0) process.exitCode = 1;
