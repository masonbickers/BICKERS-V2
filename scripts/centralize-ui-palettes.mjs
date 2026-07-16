import fs from "node:fs";
import path from "node:path";
import * as acorn from "acorn";
import jsx from "acorn-jsx";

const Parser = acorn.Parser.extend(jsx());
const root = path.resolve("src/app");
const importLine = 'import { UI_TOKENS } from "@/app/utils/uiTokens";';

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

function walk(node, parent, visit) {
  if (!node || typeof node !== "object") return;
  visit(node, parent);
  Object.values(node).forEach((value) => {
    if (Array.isArray(value)) value.forEach((child) => walk(child, node, visit));
    else if (value && typeof value === "object") walk(value, node, visit);
  });
}

let changed = 0;
function writeWithRetry(file, value) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { fs.writeFileSync(file, value); return; }
    catch (error) { lastError = error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * (attempt + 1)); }
  }
  throw lastError;
}
for (const file of files(root).filter((name) => /\.(js|jsx)$/.test(name))) {
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try { ast = Parser.parse(source, { ecmaVersion: "latest", sourceType: "module" }); }
  catch { continue; }
  const declarations = [];
  walk(ast, null, (node, parent) => {
    if (node.type === "VariableDeclarator" && node.id?.name === "UI" && node.init?.type === "ObjectExpression" && parent?.type === "VariableDeclaration") declarations.push(parent);
  });
  if (!declarations.length) continue;
  const edits = declarations.map((declaration) => ({ start: declaration.start, end: declaration.end, text: "const UI = UI_TOKENS;" }));
  if (!source.includes(importLine)) {
    const imports = ast.body.filter((node) => node.type === "ImportDeclaration");
    const position = imports.length ? imports.at(-1).end : 0;
    edits.push({ start: position, end: position, text: `${position ? "\n" : ""}${importLine}` });
  }
  let next = source;
  edits.sort((a, b) => b.start - a.start).forEach((edit) => { next = next.slice(0, edit.start) + edit.text + next.slice(edit.end); });
  writeWithRetry(file, next);
  changed += 1;
}
console.log(`Centralized UI palettes in ${changed} files.`);
