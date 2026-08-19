import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const separator = process.argv.indexOf("--");
const command = separator >= 0 ? process.argv.slice(separator + 1) : process.argv.slice(2);
if (!command.length) throw new Error("Usage: node scripts/run-with-jdk21.mjs -- <command> [...args]");

const candidates = [
  process.env.JAVA_HOME,
  "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
  "/usr/lib/jvm/java-21-openjdk-amd64",
  "/usr/lib/jvm/java-21-openjdk",
].filter(Boolean);

const javaHome = candidates.find((candidate) => {
  const java = `${candidate}/bin/java`;
  if (!existsSync(java)) return false;
  const version = spawnSync(java, ["-version"], { encoding: "utf8" });
  return /version "21(?:\.|\")/.test(`${version.stdout}${version.stderr}`);
});

if (!javaHome) {
  console.error("JDK 21 is required. Install OpenJDK 21 and set JAVA_HOME before running Firebase emulator tests.");
  process.exit(1);
}

console.log(`Using JDK 21 from ${javaHome}`);
const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${javaHome}/bin:${process.env.PATH || ""}`,
  },
});
process.exit(result.status ?? 1);
