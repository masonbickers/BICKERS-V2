import { adminReadDocument } from "@/app/api/_firebaseAdminRest";
import {
  createAppearanceState,
  legacyBrandingToLabels,
  legacyBrandingToTheme,
  PLATFORM_APPEARANCE_ID,
  resolvePublishedAppearance,
} from "@/app/utils/appearanceModel";
import { DEFAULT_CONTENT_LABELS } from "@/app/utils/contentLabels";
import { DEFAULT_GLOBAL_THEME, normalizeGlobalTheme } from "@/app/utils/globalTheme";

export async function loadPlatformAppearanceState() {
  const [canonical, legacyTheme, legacyBranding] = await Promise.all([
    adminReadDocument("companyAppearances", PLATFORM_APPEARANCE_ID),
    adminReadDocument("settings", "globalStyling"),
    adminReadDocument("settings", "platformBranding"),
  ]);
  const branding = legacyBranding?.branding || legacyBranding || {};
  const migratedTheme = legacyBrandingToTheme(branding, normalizeGlobalTheme(legacyTheme?.theme || DEFAULT_GLOBAL_THEME));
  const migratedLabels = legacyBrandingToLabels(branding, DEFAULT_CONTENT_LABELS);
  return createAppearanceState({ companyId: PLATFORM_APPEARANCE_ID, theme: migratedTheme, labels: migratedLabels, existing: canonical || {} });
}

export async function loadCompanyAppearanceState(companyId, platformState = null) {
  const platform = platformState || await loadPlatformAppearanceState();
  const [canonical, company] = await Promise.all([
    adminReadDocument("companyAppearances", companyId),
    adminReadDocument("platformCompanies", companyId),
  ]);
  const branding = company?.branding || {};
  const migratedTheme = legacyBrandingToTheme(branding, platform.theme.published);
  const migratedLabels = legacyBrandingToLabels(branding, platform.labels.published);
  return createAppearanceState({ companyId, theme: migratedTheme, labels: migratedLabels, existing: canonical || {} });
}

export async function resolveAppearanceForCompany(companyId = "") {
  const platform = await loadPlatformAppearanceState();
  if (!companyId || companyId === PLATFORM_APPEARANCE_ID) return resolvePublishedAppearance(platform);
  const company = await loadCompanyAppearanceState(companyId, platform);
  return resolvePublishedAppearance(platform, company);
}
