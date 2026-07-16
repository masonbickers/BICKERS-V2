import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGlobalTheme,
  DEFAULT_GLOBAL_THEME,
  contrastRatio,
  deriveDarkTheme,
  normalizeGlobalTheme,
  resolveColorMode,
  themeToCssVariables,
  validateThemeContrast,
} from "../src/app/utils/globalTheme.js";
import {
  DEFAULT_CONTENT_LABELS,
  formatContentLabel,
  normalizeContentLabels,
  validateContentLabels,
} from "../src/app/utils/contentLabels.js";
import {
  appearanceDocumentId,
  createAppearanceState,
  legacyBrandingToLabels,
  legacyBrandingToTheme,
  PLATFORM_APPEARANCE_ID,
  PLATFORM_APPEARANCE_DOCUMENT_ID,
  resolvePublishedAppearance,
} from "../src/app/utils/appearanceModel.js";
import { FIXED_JOB_STATUS_STYLES, getFixedJobStatusStyle } from "../src/app/utils/jobStatusColors.js";

test("theme normalization validates colours and clamps component values", () => {
  const theme = normalizeGlobalTheme({ brandColor: "#ABCDEF", inputHeight: 999, pageWidth: 10, density: "invalid" });
  assert.equal(theme.brandColor, "#abcdef");
  assert.equal(theme.inputHeight, 52);
  assert.equal(theme.pageWidth, 920);
  assert.equal(theme.density, "standard");
});

test("derived dark mode produces readable surfaces and complete CSS variables", () => {
  const dark = deriveDarkTheme(DEFAULT_GLOBAL_THEME);
  assert.ok(contrastRatio(dark.textColor, dark.surfaceColor) >= 4.5);
  const variables = themeToCssVariables(DEFAULT_GLOBAL_THEME, { mode: "dark" });
  assert.equal(variables["--color-canvas"], dark.canvasColor);
  assert.equal(variables["--table-row-height"], "42px");
  assert.equal(variables["--input-height"], "38px");
});

test("critical contrast failures block publishing while advisory checks warn", () => {
  const invalid = validateThemeContrast({ ...DEFAULT_GLOBAL_THEME, brandColor: "#ffffff", primaryTextColor: "#ffffff" });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.blocking.some((check) => check.id === "primary-button"));
});

test("light dark and system preferences resolve deterministically", () => {
  assert.equal(resolveColorMode("system", true, true), "dark");
  assert.equal(resolveColorMode("system", false, true), "light");
  assert.equal(resolveColorMode("dark", true, false), "light");
});

test("legacy platform branding migrates into theme and safe labels", () => {
  const branding = { appName: "Acme Ops", primaryColor: "#112233", loginTitle: "Acme login" };
  assert.equal(legacyBrandingToTheme(branding).brandColor, "#112233");
  assert.equal(legacyBrandingToTheme(branding).appName, "Acme Ops");
  assert.equal(legacyBrandingToLabels(branding)["login.title"], "Acme login");
});

test("company published appearance resolves over platform defaults", () => {
  const platform = createAppearanceState({ companyId: PLATFORM_APPEARANCE_ID, theme: { ...DEFAULT_GLOBAL_THEME, brandColor: "#112233" } });
  const company = createAppearanceState({ companyId: "acme", theme: { ...DEFAULT_GLOBAL_THEME, brandColor: "#445566" } });
  const resolved = resolvePublishedAppearance(platform, company);
  assert.equal(resolved.companyId, "acme");
  assert.equal(resolved.theme.brandColor, "#445566");
});

test("default light theme preserves the current live colour palette", () => {
  const variables = themeToCssVariables(DEFAULT_GLOBAL_THEME, { mode: "light" });
  assert.equal(variables["--color-brand"], "#1f4b7a");
  assert.equal(variables["--color-brand-hover"], "#173b62");
  assert.equal(variables["--color-surface-subtle"], "#f8fafc");
  assert.equal(variables["--color-success-soft"], "#ecfdf5");
  assert.equal(variables["--color-danger"], "#991b1b");
  assert.equal(variables["--color-danger-soft"], "#fef2f2");
  assert.equal(variables["--shell-active-border"], "rgba(133,211,155,.44)");
  assert.equal(variables["--shell-gradient"], "radial-gradient(circle at top left,#cfd8e3 0%,#bcc7d4 34%,#aebac7 100%)");
});

test("applying the default light theme clears runtime colour overrides", () => {
  const removed = [];
  const set = [];
  global.document = {
    documentElement: {
      dataset: {},
      style: {
        colorScheme: "",
        removeProperty: (name) => removed.push(name),
        setProperty: (name, value) => set.push([name, value]),
      },
    },
  };
  applyGlobalTheme(DEFAULT_GLOBAL_THEME, { mode: "light" });
  delete global.document;
  assert.ok(removed.includes("--color-brand"));
  assert.ok(removed.includes("--shell-sidebar-bg"));
  assert.equal(set.length, 0);
});

test("platform appearance uses a Firestore-safe document ID", () => {
  assert.equal(appearanceDocumentId(PLATFORM_APPEARANCE_ID), PLATFORM_APPEARANCE_DOCUMENT_ID);
  assert.equal(appearanceDocumentId("acme"), "acme");
  assert.doesNotMatch(PLATFORM_APPEARANCE_DOCUMENT_ID, /^__.*__$/);
});

test("content labels are allow-listed, HTML-free and retain fallbacks", () => {
  const labels = normalizeContentLabels({ "actions.save": "Store changes", unexpected: "ignored" });
  assert.equal(labels["actions.save"], "Store changes");
  assert.equal(labels["actions.cancel"], DEFAULT_CONTENT_LABELS["actions.cancel"]);
  assert.equal(labels.unexpected, undefined);
  const validation = validateContentLabels({ "actions.save": "<b>Save</b>", unexpected: "No" });
  assert.equal(validation.valid, false);
  assert.equal(formatContentLabel(labels, "actions.save"), "Store changes");
});

test("job status colours remain fixed outside editable global appearance", () => {
  const lightVariables = themeToCssVariables(DEFAULT_GLOBAL_THEME, { mode: "light" });
  const darkVariables = themeToCssVariables(DEFAULT_GLOBAL_THEME, { mode: "dark" });
  assert.equal(Object.keys(lightVariables).some((key) => key.startsWith("--job-status-")), false);
  assert.equal(Object.keys(darkVariables).some((key) => key.startsWith("--job-status-")), false);
  assert.deepEqual(getFixedJobStatusStyle("confirmed"), FIXED_JOB_STATUS_STYLES.Confirmed);
  assert.deepEqual(getFixedJobStatusStyle("completed"), FIXED_JOB_STATUS_STYLES.Complete);
  assert.equal(lightVariables["--job-status-confirmed"], undefined);
});
