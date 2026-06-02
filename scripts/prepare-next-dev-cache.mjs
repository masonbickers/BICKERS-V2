import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const devCacheDir = path.join(root, ".next-dev");

function removeDevCache() {
  fs.rmSync(devCacheDir, { recursive: true, force: true });
  fs.mkdirSync(devCacheDir, { recursive: true });
}

function pinOneDriveFolder() {
  if (process.platform !== "win32") return;

  try {
    execFileSync("attrib", ["+P", "-U", devCacheDir, "/S", "/D"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // OneDrive pinning is best-effort. Clearing the cache is the important part.
  }
}

removeDevCache();
pinOneDriveFolder();
