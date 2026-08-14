import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourceRoot = path.resolve("src");

const collectSourceFiles = (directory, results = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(absolute, results);
    else if (/\.(?:js|jsx)$/.test(entry.name) || !entry.name.includes(".")) results.push(absolute);
  }
  return results;
};

const nativeDialogName = (expression) => {
  if (ts.isIdentifier(expression) && ["alert", "confirm", "prompt"].includes(expression.text)) {
    return expression.text;
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "window" &&
    ["alert", "confirm", "prompt"].includes(expression.name.text)
  ) {
    return `window.${expression.name.text}`;
  }
  return "";
};

test("application source does not use native browser dialogs", () => {
  const violations = [];
  for (const filePath of collectSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS
    );
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const name = nativeDialogName(node.expression);
        if (name) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          violations.push(`${path.relative(process.cwd(), filePath)}:${position.line + 1} uses ${name}()`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  assert.deepEqual(violations, [], violations.join("\n"));
});
