import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const protectedLayout = await readFile(new URL("../src/app/components/ProtectedLayout.js", import.meta.url), "utf8");
const platformShell = await readFile(new URL("../src/app/platform-admin/_components/PlatformAdminShell.jsx", import.meta.url), "utf8");
const platformPage = await readFile(new URL("../src/app/platform-admin/_components/PlatformAdminSectionPage.jsx", import.meta.url), "utf8");

test("Platform Admin renders outside the ordinary Bickers application shell", () => {
  assert.match(protectedLayout, /isPlatformAdminWorkspace/);
  assert.match(protectedLayout, /isPlatformAdminWorkspace \? children : <HeaderSidebarLayout>/);
});

test("Platform Admin uses deployment branding instead of legacy BAS identity", () => {
  assert.match(platformShell, /useDeploymentConfig/);
  assert.match(platformShell, /deployment\.companyLogoUrl/);
  assert.doesNotMatch(platformShell, /bas-software-logo|BAS Software/i);
});

test("Platform Admin does not present zero totals before data has loaded", () => {
  assert.match(platformPage, /const \[loaded, setLoaded\] = useState\(false\)/);
  assert.match(platformPage, /!loaded \? \(/);
  assert.match(platformPage, /No totals are shown until a verified response is received/);
});
