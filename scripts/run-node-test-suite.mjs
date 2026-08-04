import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync(new URL("../tests", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs") && !entry.name.includes(".rules."))
  .map((entry) => `tests/${entry.name}`)
  .sort();

const result = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", ...files], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: "" },
});
process.exit(result.status ?? 1);
