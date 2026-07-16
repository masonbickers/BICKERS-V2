import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require("next/dist/compiled/babel/parser");
function collectCodeFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["api", "generated", "node_modules", ".next"].includes(entry.name)) return [];
      return collectCodeFiles(absolute);
    }
    return /\.(?:js|jsx)$/.test(entry.name) ? [path.relative(process.cwd(), absolute)] : [];
  });
}

const targets = process.argv.includes("--all")
  ? collectCodeFiles(path.resolve("src/app"))
  : process.argv.filter((value) => !value.startsWith("--")).slice(2);
const dryRun = process.argv.includes("--dry-run");
const unitless = new Set(["animationIterationCount","borderImageOutset","borderImageSlice","borderImageWidth","boxFlex","boxFlexGroup","boxOrdinalGroup","columnCount","columns","flex","flexGrow","flexPositive","flexShrink","flexNegative","flexOrder","gridArea","gridColumn","gridColumnEnd","gridColumnSpan","gridColumnStart","gridRow","gridRowEnd","gridRowSpan","gridRowStart","fontWeight","lineClamp","lineHeight","opacity","order","orphans","scale","tabSize","widows","zIndex","zoom"]);

function kebab(value) { return value.replace(/^ms-/, "-ms-").replace(/^Webkit/, "-webkit-").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`); }
function cssValue(property, value) { return typeof value === "number" && value !== 0 && !unitless.has(property) ? `${value}px` : String(value); }

for (const relative of targets) {
  const file = path.resolve(relative);
  const source = fs.readFileSync(file, "utf8");
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "dynamicImport"] });
  const declarations = new Map();
  for (const statement of ast.program.body) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) if (declaration.id?.type === "Identifier" && declaration.init) declarations.set(declaration.id.name, declaration.init);
  }

  const resolving = new Set();
  function primitive(node) {
    if (!node) return { ok: false };
    if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(node.type)) return { ok: true, value: node.value };
    if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "NumericLiteral") return { ok: true, value: -node.argument.value };
    if (node.type === "TemplateLiteral" && node.expressions.length === 0) return { ok: true, value: node.quasis[0].value.cooked };
    if (node.type === "Identifier" && declarations.has(node.name) && !resolving.has(node.name)) { resolving.add(node.name); const value = primitive(declarations.get(node.name)); resolving.delete(node.name); return value; }
    if (node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier" && declarations.has(node.object.name)) {
      const object = objectValue(declarations.get(node.object.name));
      return object.ok && Object.hasOwn(object.value, node.property.name) ? { ok: true, value: object.value[node.property.name] } : { ok: false };
    }
    return { ok: false };
  }
  function objectValue(node) {
    if (!node) return { ok: false };
    if (node.type === "Identifier" && declarations.has(node.name) && !resolving.has(node.name)) { resolving.add(node.name); const value = objectValue(declarations.get(node.name)); resolving.delete(node.name); return value; }
    if (node.type !== "ObjectExpression") return { ok: false };
    const result = {};
    for (const property of node.properties) {
      if (property.type === "SpreadElement") { const spread = objectValue(property.argument); if (!spread.ok) return { ok: false }; Object.assign(result, spread.value); continue; }
      if (property.type !== "ObjectProperty" || property.computed) return { ok: false };
      const key = property.key.name ?? property.key.value;
      const value = primitive(property.value);
      if (!value.ok || typeof key !== "string") return { ok: false };
      result[key] = value.value;
    }
    return { ok: true, value: result };
  }

  const edits = [];
  const rules = [];
  const moduleName = `${path.basename(file).replace(/\.[^.]+$/, "")}.styles.module.css`;
  const modulePath = path.join(path.dirname(file), moduleName);
  const existingCss = fs.existsSync(modulePath) ? fs.readFileSync(modulePath, "utf8") : "";
  let index = Math.max(0,...[...existingCss.matchAll(/\.extracted(\d+)/g)].map((match)=>Number(match[1])));
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "JSXOpeningElement") {
      const styleAttribute = node.attributes.find((attr) => attr.type === "JSXAttribute" && attr.name?.name === "style");
      const classAttribute = node.attributes.find((attr) => attr.type === "JSXAttribute" && attr.name?.name === "className");
      if (styleAttribute && styleAttribute.value?.type === "JSXExpressionContainer") {
        const resolved = objectValue(styleAttribute.value.expression);
        if (resolved.ok && Object.keys(resolved.value).length) {
          index += 1;
          const className = `extracted${index}`;
          if (!classAttribute) edits.push({ start: styleAttribute.start, end: styleAttribute.end, text: `className={layoutStyles.${className}}` });
          else if (classAttribute.value?.type === "StringLiteral") {
            edits.push({ start: classAttribute.start, end: classAttribute.end, text: `className={\`${classAttribute.value.value} \${layoutStyles.${className}}\`}` });
            edits.push({ start: styleAttribute.start, end: styleAttribute.end, text: "" });
          } else { index -= 1; return; }
          const declarationsText = Object.entries(resolved.value).map(([property, value]) => `  ${kebab(property)}: ${cssValue(property, value)};`).join("\n");
          rules.push(`.${className} {\n${declarationsText}\n}`);
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "extra", "errors", "comments", "tokens"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object" && value.type) walk(value);
    }
  }
  walk(ast.program);
  console.log(`${relative}: ${edits.length} static style props extractable`);
  if (dryRun || !edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits) output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
  if (!output.includes(`import layoutStyles from "./${moduleName}"`)) {
    const directiveNode = ast.program.directives?.find((directive) => directive.value?.value === "use client");
    const directiveEnd = directiveNode ? output.indexOf("\n", directiveNode.end) + 1 : 0;
    output = `${output.slice(0, directiveEnd)}\nimport layoutStyles from "./${moduleName}";${output.slice(directiveEnd)}`;
  }
  function writeWithRetry(target, contents) {
    let lastError;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try { fs.writeFileSync(target, contents); return; }
      catch (error) {
        lastError = error;
        if (!["EBUSY", "EPERM"].includes(error.code)) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
      }
    }
    throw lastError;
  }
  writeWithRetry(file, output);
  writeWithRetry(modulePath, `${existingCss.trim()}\n\n${rules.join("\n\n")}\n`);
}
