import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const manifestPath = path.join(root, ".next", "app-build-manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("Build manifest missing. Run npm run build first.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const budgets = [
  { route: "/dashboard/page", kb: 350, className: "operational" },
  { route: "/home/page", kb: 350, className: "operational" },
  { route: "/vehicle-home/page", kb: 350, className: "operational" },
  { route: "/vehicle-edit/[id]/page", kb: 350, className: "operational" },
  { route: "/u-crane/page", kb: 350, className: "operational" },
  { route: "/workshop/page", kb: 350, className: "operational" },
  { route: "/hr/page", kb: 350, className: "operational" },
  { route: "/employee-home/page", kb: 350, className: "operational" },
  { route: "/holiday-usage/page", kb: 350, className: "operational" },
  { route: "/login/page", kb: 250, className: "routine" },
  { route: "/recce-form/[id]/page", kb: 250, className: "routine" },
  { route: "/platform-admin/companies/[companyId]/page", kb: 250, className: "routine" },
];

const gzipSize = (route) => {
  const files = manifest.pages?.[route];
  if (!Array.isArray(files)) throw new Error(`Route is missing from build manifest: ${route}`);
  return [...new Set(files)]
    .filter((file) => file.endsWith(".js"))
    .reduce((total, file) => {
      const contents = fs.readFileSync(path.join(root, ".next", file));
      return total + zlib.gzipSync(contents).byteLength;
    }, 0);
};

let failed = false;
console.log("First-load JavaScript budgets (gzip)");
for (const budget of budgets) {
  const bytes = gzipSize(budget.route);
  const actualKb = bytes / 1024;
  const passed = bytes <= budget.kb * 1024;
  if (!passed) failed = true;
  console.log(`${passed ? "pass" : "FAIL"} ${budget.className.padEnd(11)} ${budget.route.padEnd(48)} ${actualKb.toFixed(1)} / ${budget.kb} KB`);
}

if (failed) process.exit(1);
