import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src");
const utilityImport = 'import * as systemDialogs from "@/app/utils/systemNotifications";\n';
const nativeNames = new Set(["alert", "confirm", "prompt"]);

const sourceFiles = [];
const collectFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(absolute);
    else if (/\.(?:js|jsx)$/.test(entry.name) || !entry.name.includes(".")) sourceFiles.push(absolute);
  }
};
collectFiles(sourceRoot);

const nativeDialogName = (expression) => {
  if (ts.isIdentifier(expression) && nativeNames.has(expression.text)) return expression.text;
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "window" &&
    nativeNames.has(expression.name.text)
  ) {
    return expression.name.text;
  }
  return "";
};

const asyncInsertionPoint = (fn, sourceFile, source) => {
  if (ts.isArrowFunction(fn)) return fn.getStart(sourceFile);
  if (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) {
    const start = fn.getStart(sourceFile);
    const end = fn.body?.getStart(sourceFile) ?? fn.end;
    const functionOffset = source.slice(start, end).search(/\bfunction\b/);
    return functionOffset >= 0 ? start + functionOffset : start;
  }
  if (ts.isMethodDeclaration(fn) && fn.name) return fn.name.getStart(sourceFile);
  return -1;
};

let changedFiles = 0;
let migratedAlerts = 0;
let migratedConfirms = 0;
let migratedPrompts = 0;
const failures = [];

for (const filePath of sourceFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)) continue;

  const scriptKind = filePath.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const edits = [];
  const asyncFunctions = new Map();
  let migratedInFile = 0;

  const visit = (node, ancestors = []) => {
    if (ts.isCallExpression(node)) {
      const nativeName = nativeDialogName(node.expression);
      if (nativeName) {
        const replacement = nativeName === "alert"
          ? "systemDialogs.showSystemNotification"
          : nativeName === "confirm"
          ? "systemDialogs.confirmSystem"
          : "systemDialogs.promptSystem";
        edits.push({ start: node.expression.getStart(sourceFile), end: node.expression.end, text: replacement });
        migratedInFile += 1;
        if (nativeName === "alert") migratedAlerts += 1;
        if (nativeName === "confirm") migratedConfirms += 1;
        if (nativeName === "prompt") migratedPrompts += 1;

        if (nativeName !== "alert" && !ts.isAwaitExpression(node.parent)) {
          edits.push({ start: node.getStart(sourceFile), end: node.getStart(sourceFile), text: "await " });
          const fn = [...ancestors].reverse().find((ancestor) => ts.isFunctionLike(ancestor));
          if (!fn) {
            failures.push(`${path.relative(projectRoot, filePath)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} has no containing function`);
          } else if (!fn.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
            const insertionPoint = asyncInsertionPoint(fn, sourceFile, source);
            if (insertionPoint < 0) {
              failures.push(`${path.relative(projectRoot, filePath)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} is inside an unsupported function type`);
            } else {
              asyncFunctions.set(insertionPoint, { start: insertionPoint, end: insertionPoint, text: "async " });
            }
          }
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, [...ancestors, node]));
  };
  visit(sourceFile);

  if (!migratedInFile) continue;
  edits.push(...asyncFunctions.values());
  if (!source.includes('import * as systemDialogs from "@/app/utils/systemNotifications"') && !source.includes("import * as systemDialogs from '@/app/utils/systemNotifications'")) {
    const directiveMatch = source.match(/^([\s\S]*?["']use client["'];\s*\n)/);
    const importPosition = directiveMatch ? directiveMatch[0].length : 0;
    edits.push({ start: importPosition, end: importPosition, text: utilityImport });
  }

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let output = source;
  for (const edit of edits) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  fs.writeFileSync(filePath, output);
  changedFiles += 1;
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}

console.log(JSON.stringify({ changedFiles, migratedAlerts, migratedConfirms, migratedPrompts, failures: failures.length }, null, 2));
