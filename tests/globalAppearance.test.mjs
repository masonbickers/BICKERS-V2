import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGlobalTheme,
  createMonochromeDarkPalette,
  DEFAULT_GLOBAL_THEME,
  contrastRatio,
  deriveDarkTheme,
  deriveLightTheme,
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
import {
  INTERFACE_SCALE_OPTIONS,
  normalizeInterfaceScale,
} from "../src/app/utils/interfaceScale.js";
import {
  CARD_STYLE_OPTIONS,
  normalizeCardStyle,
} from "../src/app/utils/cardStyle.js";

test("card presentation preserves the current layout by default and offers a reduced option", () => {
  assert.equal(normalizeCardStyle(undefined), "current");
  assert.equal(normalizeCardStyle("unsupported"), "current");
  assert.equal(normalizeCardStyle("reduced"), "reduced");
  assert.deepEqual(CARD_STYLE_OPTIONS.map((option) => option.value), ["current", "reduced"]);
});

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
  assert.equal(variables["--color-surface"], dark.surfaceColor);
  assert.notEqual(variables["--color-surface"], variables["--color-canvas"]);
  assert.equal(variables["--color-surface-subtle"], "#131518");
  assert.equal(variables["--color-surface-raised"], "#202225");
  assert.equal(variables["--color-surface-hover"], "#232528");
  assert.notEqual(variables["--color-surface-raised"], variables["--color-surface"]);
  assert.notEqual(variables["--color-surface-hover"], variables["--color-surface-raised"]);
  assert.equal(variables["--color-text-secondary"], "#aeb4bb");
  assert.equal(variables["--color-text-subtle"], "#82878c");
  assert.equal(variables["--color-danger-surface"], variables["--color-danger-soft"]);
  assert.equal(variables["--table-row-height"], "42px");
  assert.equal(variables["--input-height"], "38px");
});

test("dark mode palette can be edited independently from light colours", () => {
  const theme = normalizeGlobalTheme({
    ...DEFAULT_GLOBAL_THEME,
    darkCanvasColor: "#05070d",
    darkSurfaceColor: "#111827",
    darkBrandColor: "#7dd3fc",
    darkPrimaryTextColor: "#000000",
  });
  const dark = deriveDarkTheme(theme);
  const variables = themeToCssVariables(theme, { mode: "dark" });
  assert.equal(dark.canvasColor, "#05070d");
  assert.equal(dark.surfaceColor, "#111827");
  assert.equal(variables["--color-surface"], "#111827");
  assert.equal(variables["--table-alternate-bg"], "#111827");
  assert.equal(variables["--color-brand"], "#7dd3fc");
  assert.equal(variables["--color-text-inverse"], "#000000");
});

test("legacy themes without dark fields retain generated dark colours", () => {
  const legacy = normalizeGlobalTheme({ brandColor: "#112233", canvasColor: "#eeeeee", surfaceColor: "#ffffff" });
  assert.equal(legacy.darkBrandColor, "#dfe3e7");
  assert.equal(legacy.darkCanvasColor, "#101214");
  assert.equal(deriveDarkTheme(legacy).brandColor, legacy.darkBrandColor);
});

test("monochrome dark preset creates a black grey and white structural palette", () => {
  const preset = normalizeGlobalTheme(createMonochromeDarkPalette({ ...DEFAULT_GLOBAL_THEME, darkCanvasColor: "#123456" }));
  assert.equal(preset.darkBrandColor, "#dfe3e7");
  assert.equal(preset.darkCanvasColor, "#101214");
  assert.equal(preset.darkSurfaceColor, "#17191c");
  assert.equal(preset.darkBorderColor, "#30343a");
  assert.equal(preset.darkShellColor, "#1b1e21");
  assert.equal(preset.darkPrimaryTextColor, "#111111");
});

test("critical contrast failures block publishing while advisory checks warn", () => {
  const invalid = validateThemeContrast({ ...DEFAULT_GLOBAL_THEME, brandColor: "#ffffff", primaryTextColor: "#ffffff" });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.blocking.some((check) => check.id === "primary-button"));
});

test("critical dark contrast failures block publishing", () => {
  const invalid = validateThemeContrast({ ...DEFAULT_GLOBAL_THEME, darkBrandColor: "#ffffff", darkPrimaryTextColor: "#ffffff" });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.blocking.some((check) => check.id === "dark-primary-button"));
});

test("dark normal and light preferences resolve deterministically", () => {
  assert.equal(resolveColorMode("normal", true, true), "normal");
  assert.equal(resolveColorMode("light", false, true), "light");
  assert.equal(resolveColorMode("dark", true, false), "normal");
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

test("default normal theme preserves the current live colour palette", () => {
  const variables = themeToCssVariables(DEFAULT_GLOBAL_THEME, { mode: "normal" });
  assert.equal(variables["--color-brand"], "#1f4b7a");
  assert.equal(variables["--color-brand-hover"], "#173b62");
  assert.equal(variables["--color-surface-subtle"], "#f8fafc");
  assert.equal(variables["--color-success-soft"], "#ecfdf5");
  assert.equal(variables["--color-danger"], "#991b1b");
  assert.equal(variables["--color-danger-soft"], "#fef2f2");
  assert.equal(variables["--shell-active-border"], "rgba(133,211,155,.44)");
  assert.equal(variables["--shell-gradient"], "radial-gradient(circle at top left,#cfd8e3 0%,#bcc7d4 34%,#aebac7 100%)");
});

test("applying the default normal theme clears runtime colour overrides", () => {
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
  applyGlobalTheme(DEFAULT_GLOBAL_THEME, { mode: "normal" });
  delete global.document;
  assert.ok(removed.includes("--color-brand"));
  assert.ok(removed.includes("--shell-sidebar-bg"));
  assert.equal(set.length, 0);
});

test("extra-light mode derives a complete bright structural palette", () => {
  const light = deriveLightTheme(DEFAULT_GLOBAL_THEME);
  const variables = themeToCssVariables(DEFAULT_GLOBAL_THEME, { mode: "light" });
  assert.equal(light.surfaceColor, "#ffffff");
  assert.equal(light.shellColor, "#ffffff");
  assert.ok(contrastRatio(light.shellTextColor, light.shellColor) >= 4.5);
  assert.equal(variables["--color-canvas"], light.canvasColor);
  assert.equal(variables["--shell-sidebar-bg"], "#ffffff");
  assert.equal(variables["--shell-text"], light.shellTextColor);
  assert.notEqual(variables["--color-canvas"], DEFAULT_GLOBAL_THEME.canvasColor);
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
  const lightVariables = themeToCssVariables(DEFAULT_GLOBAL_THEME, { mode: "normal" });
  const darkVariables = themeToCssVariables(DEFAULT_GLOBAL_THEME, { mode: "dark" });
  assert.equal(Object.keys(lightVariables).some((key) => key.startsWith("--job-status-")), false);
  assert.equal(Object.keys(darkVariables).some((key) => key.startsWith("--job-status-")), false);
  assert.deepEqual(getFixedJobStatusStyle("confirmed"), FIXED_JOB_STATUS_STYLES.Confirmed);
  assert.deepEqual(getFixedJobStatusStyle("completed"), FIXED_JOB_STATUS_STYLES.Complete);
  assert.equal(lightVariables["--job-status-confirmed"], undefined);
});

test("interface size supports compact, standard and large device preferences", () => {
  assert.deepEqual(INTERFACE_SCALE_OPTIONS.map((option) => option.percent), [80, 100, 115]);
  assert.equal(normalizeInterfaceScale("compact"), "compact");
  assert.equal(normalizeInterfaceScale("large"), "large");
  assert.equal(normalizeInterfaceScale("unsupported"), "standard");
});
