import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  themeSettingsToCssVariables,
} from "../src/app/utils/themeSettings.js";

test("theme settings use safe defaults for missing or invalid values", () => {
  const settings = normalizeThemeSettings({
    brandColor: "red",
    baseFontSize: 200,
    cornerRadius: -10,
  });

  assert.equal(settings.brandColor, DEFAULT_THEME_SETTINGS.brandColor);
  assert.equal(settings.baseFontSize, 18);
  assert.equal(settings.cornerRadius, 0);
  assert.equal(settings.canvasColor, DEFAULT_THEME_SETTINGS.canvasColor);
  assert.equal("unknownSetting" in settings, false);
});

test("theme settings convert only approved values to CSS variables", () => {
  const variables = themeSettingsToCssVariables({
    brandColor: "#123abc",
    controlHeight: 41,
    pageMaxWidth: 1280,
  });

  assert.equal(variables["--color-brand"], "#123abc");
  assert.equal(variables["--control-height-md"], "41px");
  assert.equal(variables["--page-max-width"], "1280px");
  assert.equal(variables["--not-approved"], undefined);
});
