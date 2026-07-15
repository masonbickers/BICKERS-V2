import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const blockedBasenames = [
  /^firebase-users.*\.json$/i,
  /migration[-_]?export/i,
  /^service-account.*\.json$/i,
];

const blockedContent = [
  /\"passwordHash\"\s*:/i,
  /\"password_hash\"\s*:/i,
  /\"salt\"\s*:\s*\"[^\"]+\"/i,
];

const stagedOnly = process.argv.includes("--staged");
const historyScan = process.argv.includes("--history");
if (stagedOnly && historyScan) {
  console.error("--staged and --history cannot be used together.");
  process.exit(2);
}

const args = stagedOnly
  ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
  : historyScan
    ? ["log", "--all", "--name-only", "--pretty=format:"]
    : ["ls-files"];
const files = execFileSync("git", args, { encoding: "utf8" })
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

const filenameFailures = files.filter((file) =>
  blockedBasenames.some((pattern) => pattern.test(path.basename(file)))
);

const refs = historyScan
  ? [
      "HEAD",
      ...execFileSync("git", ["for-each-ref", "--format=%(refname)"], { encoding: "utf8" })
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    ]
  : [];
const grepArgs = stagedOnly
  ? ["diff", "--cached", "--no-ext-diff", "--unified=0"]
  : historyScan
    ? ["grep", "-I", "-l", "-E", blockedContent.map((pattern) => pattern.source).join("|"), ...new Set(refs)]
    : ["grep", "-I", "-n", "-E", blockedContent.map((pattern) => pattern.source).join("|")];
const scan = spawnSync("git", grepArgs, {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
const contentFailures = stagedOnly
  ? blockedContent.filter((pattern) => pattern.test(scan.stdout || "")).map(String)
  : scan.status === 0 && scan.stdout.trim()
    ? [scan.stdout.trim()]
    : [];
if (scan.status !== 0 && scan.status !== 1) {
  console.error(scan.stderr || "Git content scan failed.");
  process.exit(scan.status || 1);
}
if (filenameFailures.length || contentFailures.length) {
  console.error("Credential export material detected; refusing to continue.");
  filenameFailures.forEach((file) => console.error(`- blocked filename: ${file}`));
  contentFailures.forEach((matches) => console.error(`- blocked content:\n${matches}`));
  process.exit(1);
}

const scope = historyScan ? "historical file paths across every Git ref" : stagedOnly ? "staged files" : "tracked files";
console.log(`Secret-file check passed (${files.length} ${scope}).`);
