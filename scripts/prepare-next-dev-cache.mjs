import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeBuildInfo } from "./write-build-info.mjs";

const root = process.cwd();
const devCacheDir = path.join(root, ".next-dev");

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function seedDevCacheManifests() {
  const prerenderManifestPath = path.join(devCacheDir, "prerender-manifest.json");
  if (fs.existsSync(prerenderManifestPath)) return;

  const prerenderManifest = {
    version: 4,
    routes: {},
    dynamicRoutes: {},
    notFoundRoutes: [],
    preview: {
      previewModeId: randomBytes(16).toString("hex"),
      previewModeSigningKey: randomBytes(32).toString("hex"),
      previewModeEncryptionKey: randomBytes(32).toString("hex"),
    },
  };

  fs.writeFileSync(prerenderManifestPath, `${JSON.stringify(prerenderManifest, null, 2)}\n`);
}

function removeDevCache() {
  const rmOptions = { recursive: true, force: true, maxRetries: 5, retryDelay: 150 };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      fs.rmSync(devCacheDir, rmOptions);
      fs.mkdirSync(devCacheDir, { recursive: true });
      seedDevCacheManifests();
      return;
    } catch (error) {
      if (!["ENOTEMPTY", "EBUSY", "EPERM"].includes(error?.code)) throw error;
      sleep(150 * (attempt + 1));
    }
  }

  const staleDir = path.join(root, `.next-dev-stale-${process.pid}-${Date.now()}`);
  try {
    if (fs.existsSync(devCacheDir)) fs.renameSync(devCacheDir, staleDir);
  } catch (error) {
    console.warn(`Could not clear .next-dev cache (${error?.code || error?.message}). Continuing with existing cache.`);
  }

  fs.mkdirSync(devCacheDir, { recursive: true });
  seedDevCacheManifests();

  try {
    if (fs.existsSync(staleDir)) fs.rmSync(staleDir, rmOptions);
  } catch (error) {
    console.warn(`Moved old .next-dev cache aside but could not delete it yet (${error?.code || error?.message}).`);
  }
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

writeBuildInfo();
removeDevCache();
pinOneDriveFolder();
