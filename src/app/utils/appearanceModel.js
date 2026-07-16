import { DEFAULT_CONTENT_LABELS, normalizeContentLabels } from "./contentLabels.js";
import { APPEARANCE_SCHEMA_VERSION, DEFAULT_GLOBAL_THEME, normalizeGlobalTheme } from "./globalTheme.js";

export const PLATFORM_APPEARANCE_ID = "__platform__";

export function normalizeCompanyId(value, fallback = "") {
  const id = String(value || "").trim().toLowerCase();
  if (id === PLATFORM_APPEARANCE_ID) return id;
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id) ? id : fallback;
}

export function legacyBrandingToTheme(branding = {}, base = DEFAULT_GLOBAL_THEME) {
  return normalizeGlobalTheme({
    ...base,
    appName: branding.appName || base.appName,
    companyLogo: branding.companyLogo || base.companyLogo,
    platformLogo: branding.platformLogo || base.platformLogo,
    brandColor: branding.primaryColor || base.brandColor,
    infoColor: branding.secondaryColor || base.infoColor,
    accentColor: branding.accentColor || base.accentColor,
    shellColor: branding.sidebarColor || base.shellColor,
  });
}

export function legacyBrandingToLabels(branding = {}, base = DEFAULT_CONTENT_LABELS) {
  return normalizeContentLabels({
    ...base,
    "app.name": branding.appName || base["app.name"],
    "login.title": branding.loginTitle || base["login.title"],
    "login.subtitle": branding.loginSubtitle || base["login.subtitle"],
  });
}

export function createAppearanceState({ companyId = PLATFORM_APPEARANCE_ID, theme, labels, existing = {} } = {}) {
  const resolvedTheme = normalizeGlobalTheme(theme || existing?.theme?.published || DEFAULT_GLOBAL_THEME);
  const resolvedLabels = normalizeContentLabels(labels || existing?.labels?.published || DEFAULT_CONTENT_LABELS);
  return {
    schemaVersion: APPEARANCE_SCHEMA_VERSION,
    companyId: normalizeCompanyId(companyId, PLATFORM_APPEARANCE_ID),
    theme: {
      draft: normalizeGlobalTheme(existing?.theme?.draft || resolvedTheme),
      published: normalizeGlobalTheme(existing?.theme?.published || resolvedTheme),
      version: Math.max(0, Number(existing?.theme?.version || 0)),
      history: Array.isArray(existing?.theme?.history) ? existing.theme.history : [],
      draftUpdatedAt: existing?.theme?.draftUpdatedAt || "",
      draftUpdatedBy: existing?.theme?.draftUpdatedBy || "",
      publishedAt: existing?.theme?.publishedAt || "",
      publishedBy: existing?.theme?.publishedBy || "",
    },
    labels: {
      draft: normalizeContentLabels(existing?.labels?.draft || resolvedLabels),
      published: normalizeContentLabels(existing?.labels?.published || resolvedLabels),
      version: Math.max(0, Number(existing?.labels?.version || 0)),
      history: Array.isArray(existing?.labels?.history) ? existing.labels.history : [],
      draftUpdatedAt: existing?.labels?.draftUpdatedAt || "",
      draftUpdatedBy: existing?.labels?.draftUpdatedBy || "",
      publishedAt: existing?.labels?.publishedAt || "",
      publishedBy: existing?.labels?.publishedBy || "",
    },
  };
}

export function resolvePublishedAppearance(platformState, companyState = null) {
  const platform = createAppearanceState({ companyId: PLATFORM_APPEARANCE_ID, existing: platformState || {} });
  if (!companyState) return { companyId: PLATFORM_APPEARANCE_ID, theme: platform.theme.published, labels: platform.labels.published, themeVersion: platform.theme.version, labelsVersion: platform.labels.version };
  const company = createAppearanceState({ companyId: companyState.companyId, theme: platform.theme.published, labels: platform.labels.published, existing: companyState });
  return { companyId: company.companyId, theme: normalizeGlobalTheme({ ...platform.theme.published, ...company.theme.published }), labels: normalizeContentLabels({ ...platform.labels.published, ...company.labels.published }), themeVersion: company.theme.version, labelsVersion: company.labels.version };
}

export function appearanceVersionId(companyId, section, version) {
  return `${normalizeCompanyId(companyId, PLATFORM_APPEARANCE_ID)}--${section}--v${Math.max(0, Number(version || 0))}`;
}
