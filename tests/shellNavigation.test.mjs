import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldShowShellBackButton } from "../src/app/utils/shellNavigation.js";

test("shell Back button stays hidden on primary navigation pages", () => {
  assert.equal(shouldShowShellBackButton({
    pathname: "/home",
    landingRoute: "/screens/homescreen",
    hasPrimaryNavigationMatch: true,
  }), false);

  assert.equal(shouldShowShellBackButton({
    pathname: "/settings",
    landingRoute: "/screens/homescreen",
    hasPrimaryNavigationMatch: true,
  }), false);
});

test("shell Back button appears on drill-down pages", () => {
  assert.equal(shouldShowShellBackButton({
    pathname: "/book-work/booking-1",
    landingRoute: "/screens/homescreen",
    hasPrimaryNavigationMatch: false,
  }), true);
});

test("shell Back button supports an explicit page override", () => {
  assert.equal(shouldShowShellBackButton({
    override: true,
    pathname: "/settings",
    landingRoute: "/screens/homescreen",
    hasPrimaryNavigationMatch: true,
  }), true);

  assert.equal(shouldShowShellBackButton({
    override: false,
    pathname: "/book-work/booking-1",
    landingRoute: "/screens/homescreen",
    hasPrimaryNavigationMatch: false,
  }), false);
});

test("nested pages can suppress the persistent shell Back button", async () => {
  const shell = await readFile(
    new URL("../src/app/components/HeaderSidebarLayout.jsx", import.meta.url),
    "utf8"
  );

  assert.match(shell, /function NestedShellPreferences/);
  assert.match(shell, /setNestedBackButtonOverride\(showBackButton\)/);
  assert.match(shell, /override: typeof nestedBackButtonOverride === "boolean"/);
});

test("Recce detail pages keep Diary highlighted in the sidebar", async () => {
  const shell = await readFile(
    new URL("../src/app/components/HeaderSidebarLayout.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    shell,
    /path === "\/dashboard" && String\(pathname \|\| ""\)\.startsWith\("\/recce-form\/"\)/
  );
});
