import { adminReadDocument } from "@/app/api/_firebaseAdminRest";
import {
  createAppearanceState,
  appearanceDocumentId,
  legacyBrandingToLabels,
  legacyBrandingToTheme,
  PLATFORM_APPEARANCE_ID,
  resolvePublishedAppearance,
} from "@/app/utils/appearanceModel";
import { DEFAULT_CONTENT_LABELS } from "@/app/utils/contentLabels";
import { DEFAULT_GLOBAL_THEME, normalizeGlobalTheme } from "@/app/utils/globalTheme";

export async function loadPlatformAppearanceState({ includeLegacy = false } = {}) {
  const [canonical, legacyTheme, legacyBranding] = await Promise.all([
    adminReadDocument("companyAppearances", appearanceDocumentId(PLATFORM_APPEARANCE_ID)),
    includeLegacy ? adminReadDocument("settings", "globalStyling") : Promise.resolve(null),
    includeLegacy ? adminReadDocument("settings", "platformBranding") : Promise.resolve(null),
  ]);
  const branding = legacyBranding?.branding || legacyBranding || {};
  const migratedTheme = includeLegacy
    ? legacyBrandingToTheme(branding, normalizeGlobalTheme(legacyTheme?.theme || DEFAULT_GLOBAL_THEME))
    : DEFAULT_GLOBAL_THEME;
  const migratedLabels = includeLegacy ? legacyBrandingToLabels(branding, DEFAULT_CONTENT_LABELS) : DEFAULT_CONTENT_LABELS;
  return createAppearanceState({ companyId: PLATFORM_APPEARANCE_ID, theme: migratedTheme, labels: migratedLabels, existing: canonical || {} });
}

export async function loadCompanyAppearanceState(companyId, platformState = null, { includeLegacy = false } = {}) {
  const platform = platformState || await loadPlatformAppearanceState({ includeLegacy });
  const [canonical, company] = await Promise.all([
    adminReadDocument("companyAppearances", companyId),
    includeLegacy ? adminReadDocument("platformCompanies", companyId) : Promise.resolve(null),
  ]);
  const branding = company?.branding || {};
  const migratedTheme = includeLegacy ? legacyBrandingToTheme(branding, platform.theme.published) : platform.theme.published;
  const migratedLabels = includeLegacy ? legacyBrandingToLabels(branding, platform.labels.published) : platform.labels.published;
  return createAppearanceState({ companyId, theme: migratedTheme, labels: migratedLabels, existing: canonical || {} });
}

export async function resolveAppearanceForCompany(companyId = "") {
  const platform = await loadPlatformAppearanceState();
  if (!companyId || companyId === PLATFORM_APPEARANCE_ID) return resolvePublishedAppearance(platform);
  const company = await loadCompanyAppearanceState(companyId, platform);
  return resolvePublishedAppearance(platform, company);
}
