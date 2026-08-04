import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
if (status.status !== 0 || status.stdout.trim()) {
  console.error("verify:clean-checkout must start from a clean Git checkout.");
  process.exit(1);
}

run("npm", ["ci"]);
run("npm", ["run", "verify:production"]);
