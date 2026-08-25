import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("employee navigation opens the personnel register", async () => {
  const shell = await readFile(
    new URL("../src/app/components/HeaderSidebarLayout.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    shell,
    /label: contentLabel\("navigation\.employees"\), path: "\/employees"/
  );
  assert.match(
    shell,
    /label: "Employees", path: "\/employees", Icon: Users, keywords: "staff people crew"/
  );
});
