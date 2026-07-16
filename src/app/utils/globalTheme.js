export const APPEARANCE_SCHEMA_VERSION = 2;
export const DARK_DERIVATION_VERSION = 1;
export const GLOBAL_THEME_CACHE_KEY = "bickers-global-theme:v2";
export const COLOR_MODE_STORAGE_KEY = "bickers-color-mode:v1";

export const FONT_OPTIONS = [
  { value: "inter", label: "Inter", stack: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { value: "system", label: "System UI", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { value: "arial", label: "Arial", stack: 'Arial, Helvetica, sans-serif' },
  { value: "verdana", label: "Verdana", stack: 'Verdana, Geneva, sans-serif' },
  { value: "trebuchet", label: "Trebuchet MS", stack: '"Trebuchet MS", Arial, sans-serif' },
  { value: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
];

export const DENSITY_OPTIONS = ["compact", "standard", "spacious"];
export const SHADOW_OPTIONS = ["none", "subtle", "elevated"];
export const COLOR_MODE_OPTIONS = ["light", "dark", "system"];

export const DEFAULT_GLOBAL_THEME = Object.freeze({
  schemaVersion: APPEARANCE_SCHEMA_VERSION,
  appName: "Booking System",
  companyLogo: "",
  platformLogo: "/bas-software-logo.png",
  fontFamily: "inter",
  baseFontSize: 14,
  headingFontSize: 22,
  lineHeight: 1.5,
  buttonFontWeight: 800,
  brandColor: "#1f4b7a",
  accentColor: "#8b5e3c",
  textColor: "#0f172a",
  mutedTextColor: "#5f6f82",
  canvasColor: "#f3f6f9",
  surfaceColor: "#ffffff",
  borderColor: "#d7dee8",
  shellColor: "#000000",
  shellTextColor: "#f8fbff",
  primaryTextColor: "#ffffff",
  successColor: "#166534",
  warningColor: "#9a3412",
  dangerColor: "#991b1b",
  infoColor: "#1d4ed8",
  density: "standard",
  buttonHeight: 36,
  inputHeight: 38,
  borderWidth: 1,
  focusRingWidth: 3,
  radius: 8,
  shadowPreset: "subtle",
  pageWidth: 1120,
  pagePadding: 16,
  sidebarWidth: 220,
  collapsedSidebarWidth: 60,
  topbarHeight: 62,
  tableRowHeight: 42,
  tableHeaderColor: "#f8fafc",
  tableAlternateColor: "#f8fafc",
  tableZebra: false,
  darkModeEnabled: true,
  darkDerivationVersion: DARK_DERIVATION_VERSION,
});

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const FONT_VALUES = new Set(FONT_OPTIONS.map((option) => option.value));
const COLOR_KEYS = [
  "brandColor", "accentColor", "textColor", "mutedTextColor", "canvasColor",
  "surfaceColor", "borderColor", "shellColor", "shellTextColor", "primaryTextColor",
  "successColor", "warningColor", "dangerColor", "infoColor", "tableHeaderColor",
  "tableAlternateColor",
];

// Exact supporting colours used by the live UI before global styling is
// applied. The editable theme stores the core palette; these preserve the
// established live appearance when that palette is selected as the default.
const LIVE_DEFAULT_COLOR_VARIABLES = Object.freeze({
  "--color-brand-hover": "#173b62",
  "--color-brand-soft": "#edf3f8",
  "--color-brand-border": "#c8d6e3",
  "--color-accent-soft": "#f5ede6",
  "--color-text-subtle": "#64748b",
  "--color-surface-subtle": "#f8fafc",
  "--color-surface-hover": "#f1f5f9",
  "--color-border-strong": "#c8d6e3",
  "--color-success-hover": "#14532d",
  "--color-success-accent": "#6bb37f",
  "--color-success-soft": "#ecfdf5",
  "--color-success-border": "#bbf7d0",
  "--color-warning-soft": "#fff7ed",
  "--color-warning-border": "#fed7aa",
  "--color-danger-hover": "#7f1d1d",
  "--color-danger-soft": "#fef2f2",
  "--color-danger-border": "#fecaca",
  "--color-info-soft": "#eff6ff",
  "--color-info-border": "#bfdbfe",
  "--shell-muted": "#b4c0cf",
  "--shell-active-bg": "rgba(255,255,255,.08)",
  "--shell-active-border": "rgba(133,211,155,.44)",
  "--shell-gradient": "radial-gradient(circle at top left,#cfd8e3 0%,#bcc7d4 34%,#aebac7 100%)",
});

function usesLiveDefaultPalette(theme) {
  return COLOR_KEYS.every((key) => theme[key] === DEFAULT_GLOBAL_THEME[key]);
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const safeColor = (value, fallback) => {
  const color = String(value || "").trim();
  return HEX_PATTERN.test(color) ? color.toLowerCase() : fallback;
};

const safeUrl = (value, fallback = "") => {
  const url = String(value || "").trim().slice(0, 1000);
  if (!url) return fallback;
  if (url.startsWith("/") || /^https:\/\//i.test(url)) return url;
  return fallback;
};

export function normalizeGlobalTheme(value = {}) {
  const source = value?.theme && typeof value.theme === "object" ? value.theme : value;
  const normalized = {
    ...DEFAULT_GLOBAL_THEME,
    schemaVersion: APPEARANCE_SCHEMA_VERSION,
    appName: String(source?.appName || DEFAULT_GLOBAL_THEME.appName).trim().slice(0, 80) || DEFAULT_GLOBAL_THEME.appName,
    companyLogo: safeUrl(source?.companyLogo, DEFAULT_GLOBAL_THEME.companyLogo),
    platformLogo: safeUrl(source?.platformLogo, DEFAULT_GLOBAL_THEME.platformLogo),
    fontFamily: FONT_VALUES.has(source?.fontFamily) ? source.fontFamily : DEFAULT_GLOBAL_THEME.fontFamily,
    baseFontSize: clamp(source?.baseFontSize, 12, 18, DEFAULT_GLOBAL_THEME.baseFontSize),
    headingFontSize: clamp(source?.headingFontSize, 18, 34, DEFAULT_GLOBAL_THEME.headingFontSize),
    lineHeight: clamp(source?.lineHeight, 1.3, 1.8, DEFAULT_GLOBAL_THEME.lineHeight),
    buttonFontWeight: clamp(source?.buttonFontWeight, 500, 900, DEFAULT_GLOBAL_THEME.buttonFontWeight),
    density: DENSITY_OPTIONS.includes(source?.density) ? source.density : DEFAULT_GLOBAL_THEME.density,
    buttonHeight: clamp(source?.buttonHeight, 30, 48, DEFAULT_GLOBAL_THEME.buttonHeight),
    inputHeight: clamp(source?.inputHeight, 32, 52, DEFAULT_GLOBAL_THEME.inputHeight),
    borderWidth: clamp(source?.borderWidth, 0, 3, DEFAULT_GLOBAL_THEME.borderWidth),
    focusRingWidth: clamp(source?.focusRingWidth, 0, 6, DEFAULT_GLOBAL_THEME.focusRingWidth),
    radius: clamp(source?.radius, 0, 20, DEFAULT_GLOBAL_THEME.radius),
    shadowPreset: SHADOW_OPTIONS.includes(source?.shadowPreset) ? source.shadowPreset : DEFAULT_GLOBAL_THEME.shadowPreset,
    pageWidth: clamp(source?.pageWidth, 920, 1600, DEFAULT_GLOBAL_THEME.pageWidth),
    pagePadding: clamp(source?.pagePadding, 8, 32, DEFAULT_GLOBAL_THEME.pagePadding),
    sidebarWidth: clamp(source?.sidebarWidth, 180, 320, DEFAULT_GLOBAL_THEME.sidebarWidth),
    collapsedSidebarWidth: clamp(source?.collapsedSidebarWidth, 48, 90, DEFAULT_GLOBAL_THEME.collapsedSidebarWidth),
    topbarHeight: clamp(source?.topbarHeight, 50, 84, DEFAULT_GLOBAL_THEME.topbarHeight),
    tableRowHeight: clamp(source?.tableRowHeight, 34, 64, DEFAULT_GLOBAL_THEME.tableRowHeight),
    tableZebra: source?.tableZebra === true,
    darkModeEnabled: source?.darkModeEnabled !== false,
    darkDerivationVersion: DARK_DERIVATION_VERSION,
  };
  COLOR_KEYS.forEach((key) => {
    normalized[key] = safeColor(source?.[key], DEFAULT_GLOBAL_THEME[key]);
  });
  return normalized;
}

function colorParts(hex) {
  const value = safeColor(hex, "#000000").slice(1);
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

export function mixColors(first, second, amount) {
  const a = colorParts(first);
  const b = colorParts(second);
  const ratio = Math.min(1, Math.max(0, amount));
  return `#${a.map((channel, index) => Math.round(channel + (b[index] - channel) * ratio).toString(16).padStart(2, "0")).join("")}`;
}

function rgba(hex, alpha) {
  return `rgba(${colorParts(hex).join(", ")}, ${alpha})`;
}

function relativeLuminance(hex) {
  const channels = colorParts(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function readableTextColor(background, preferred = "#ffffff") {
  if (contrastRatio(background, preferred) >= 4.5) return safeColor(preferred, "#ffffff");
  const white = contrastRatio(background, "#ffffff");
  const black = contrastRatio(background, "#000000");
  return white >= black ? "#ffffff" : "#000000";
}

export function deriveDarkTheme(value = {}) {
  const theme = normalizeGlobalTheme(value);
  const dark = {
    ...theme,
    canvasColor: mixColors(theme.canvasColor, "#020617", 0.93),
    surfaceColor: mixColors(theme.surfaceColor, "#0f172a", 0.9),
    textColor: "#f8fafc",
    mutedTextColor: "#cbd5e1",
    borderColor: "#334155",
    shellColor: mixColors(theme.shellColor, "#020617", 0.42),
    shellTextColor: "#f8fafc",
    brandColor: mixColors(theme.brandColor, "#ffffff", 0.18),
    accentColor: mixColors(theme.accentColor, "#ffffff", 0.2),
    successColor: mixColors(theme.successColor, "#ffffff", 0.22),
    warningColor: mixColors(theme.warningColor, "#ffffff", 0.28),
    dangerColor: mixColors(theme.dangerColor, "#ffffff", 0.25),
    infoColor: mixColors(theme.infoColor, "#ffffff", 0.22),
    tableHeaderColor: "#172033",
    tableAlternateColor: "#111b2d",
  };
  dark.primaryTextColor = readableTextColor(dark.brandColor, theme.primaryTextColor);
  return dark;
}

export function validateThemeContrast(value = {}) {
  const theme = normalizeGlobalTheme(value);
  const checks = [
    ["text-surface", "Main text on surfaces", theme.textColor, theme.surfaceColor, 4.5, true],
    ["text-canvas", "Main text on page background", theme.textColor, theme.canvasColor, 4.5, true],
    ["primary-button", "Primary button text", theme.primaryTextColor, theme.brandColor, 4.5, true],
    ["shell", "Navigation text", theme.shellTextColor, theme.shellColor, 4.5, true],
    ["muted-surface", "Muted text on surfaces", theme.mutedTextColor, theme.surfaceColor, 4.5, false],
    ["border-surface", "Borders against surfaces", theme.borderColor, theme.surfaceColor, 3, false],
  ].map(([id, label, foreground, background, minimum, critical]) => {
    const ratio = contrastRatio(foreground, background);
    return { id, label, foreground, background, minimum, ratio: Number(ratio.toFixed(2)), critical, pass: ratio >= minimum };
  });
  return { checks, blocking: checks.filter((check) => check.critical && !check.pass), warnings: checks.filter((check) => !check.critical && !check.pass), valid: checks.every((check) => !check.critical || check.pass) };
}

const shadowValues = {
  none: ["none", "none", "none"],
  subtle: ["0 1px 2px rgba(15,23,42,.05)", "0 8px 18px rgba(15,23,42,.08)", "0 24px 60px rgba(15,23,42,.22)"],
  elevated: ["0 2px 5px rgba(15,23,42,.1)", "0 12px 28px rgba(15,23,42,.16)", "0 30px 80px rgba(15,23,42,.3)"],
};

export function themeToCssVariables(value = {}, options = {}) {
  const normalized = normalizeGlobalTheme(value);
  const useDark = options.mode === "dark" && normalized.darkModeEnabled;
  const theme = useDark ? deriveDarkTheme(normalized) : normalized;
  const font = FONT_OPTIONS.find((option) => option.value === theme.fontFamily) || FONT_OPTIONS[0];
  const brandHover = mixColors(theme.brandColor, useDark ? "#ffffff" : "#000000", useDark ? 0.12 : 0.22);
  const brandSoft = mixColors(theme.brandColor, theme.surfaceColor, 0.88);
  const brandBorder = mixColors(theme.brandColor, theme.surfaceColor, 0.64);
  const surfaceSubtle = mixColors(theme.surfaceColor, theme.canvasColor, 0.52);
  const surfaceHover = mixColors(theme.surfaceColor, theme.canvasColor, 0.8);
  const densityFactor = theme.density === "compact" ? 0.82 : theme.density === "spacious" ? 1.22 : 1;
  const shadows = shadowValues[theme.shadowPreset] || shadowValues.subtle;
  const semantic = (color) => ({ soft: mixColors(color, theme.surfaceColor, 0.88), border: mixColors(color, theme.surfaceColor, 0.66), hover: mixColors(color, useDark ? "#ffffff" : "#000000", useDark ? 0.12 : 0.18) });
  const success = semantic(theme.successColor);
  const warning = semantic(theme.warningColor);
  const danger = semantic(theme.dangerColor);
  const info = semantic(theme.infoColor);
  const spacing = (step) => `${Math.round(step * 4 * densityFactor * 100) / 100}px`;

  const variables = {
    "--font-sans": font.stack,
    "--font-size-xs": `${Math.max(11, theme.baseFontSize - 2)}px`,
    "--font-size-sm": `${Math.max(12, theme.baseFontSize - 1)}px`,
    "--font-size-md": `${theme.baseFontSize}px`,
    "--font-size-lg": `${theme.baseFontSize + 2}px`,
    "--font-size-xl": `${theme.headingFontSize}px`,
    "--line-height-normal": String(theme.lineHeight),
    "--font-weight-button": String(theme.buttonFontWeight),
    "--space-1": spacing(1), "--space-2": spacing(2), "--space-3": spacing(3),
    "--space-4": spacing(4), "--space-5": spacing(5), "--space-6": spacing(6),
    "--space-8": spacing(8), "--space-10": spacing(10), "--space-12": spacing(12),
    "--color-brand": theme.brandColor, "--color-brand-hover": brandHover,
    "--color-brand-soft": brandSoft, "--color-brand-border": brandBorder,
    "--color-accent": theme.accentColor, "--color-accent-soft": mixColors(theme.accentColor, theme.surfaceColor, 0.86),
    "--color-text": theme.textColor, "--color-text-muted": theme.mutedTextColor,
    "--color-text-subtle": theme.mutedTextColor, "--color-text-inverse": theme.primaryTextColor,
    "--color-canvas": theme.canvasColor, "--color-surface": theme.surfaceColor,
    "--color-surface-raised": theme.surfaceColor, "--color-surface-subtle": surfaceSubtle,
    "--color-surface-hover": surfaceHover, "--color-border": theme.borderColor,
    "--color-border-strong": mixColors(theme.borderColor, theme.textColor, 0.16),
    "--color-success": theme.successColor, "--color-success-hover": success.hover,
    "--color-success-soft": success.soft, "--color-success-border": success.border,
    "--color-success-accent": mixColors(theme.successColor, "#ffffff", 0.3),
    "--color-warning": theme.warningColor, "--color-warning-soft": warning.soft, "--color-warning-border": warning.border,
    "--color-danger": theme.dangerColor, "--color-danger-hover": danger.hover,
    "--color-danger-soft": danger.soft, "--color-danger-border": danger.border,
    "--color-info": theme.infoColor, "--color-info-soft": info.soft, "--color-info-border": info.border,
    "--color-overlay": rgba(useDark ? "#020617" : theme.textColor, useDark ? 0.72 : 0.52),
    "--shell-sidebar-bg": theme.shellColor, "--shell-topbar-bg": theme.shellColor,
    "--shell-text": theme.shellTextColor, "--shell-muted": mixColors(theme.shellTextColor, theme.shellColor, 0.34),
    "--shell-border": rgba(theme.shellTextColor, 0.14),
    "--shell-active-bg": rgba(theme.shellTextColor, 0.08),
    "--shell-active-border": rgba(theme.accentColor, 0.58),
    "--shell-gradient": `radial-gradient(circle at top left, ${mixColors(theme.canvasColor, theme.surfaceColor, 0.22)} 0%, ${mixColors(theme.canvasColor, theme.surfaceColor, 0.1)} 40%, ${theme.canvasColor} 100%)`,
    "--shell-sidebar-width": `${theme.sidebarWidth}px`,
    "--shell-sidebar-collapsed-width": `${theme.collapsedSidebarWidth}px`,
    "--shell-topbar-height": `${theme.topbarHeight}px`,
    "--radius-sm": `${Math.max(0, theme.radius - 2)}px`, "--radius-md": `${theme.radius}px`,
    "--radius-lg": `${theme.radius + 4}px`, "--radius-xl": `${theme.radius + 10}px`,
    "--shadow-sm": shadows[0], "--shadow-md": shadows[1], "--shadow-lg": shadows[2],
    "--border-width": `${theme.borderWidth}px`, "--border-default": `${theme.borderWidth}px solid ${theme.borderColor}`,
    "--focus-ring": `0 0 0 ${theme.focusRingWidth}px ${rgba(theme.brandColor, 0.24)}`,
    "--control-height-sm": `${Math.max(28, theme.buttonHeight - 4)}px`,
    "--control-height-md": `${theme.buttonHeight}px`, "--control-height-lg": `${theme.buttonHeight + 8}px`,
    "--input-height": `${theme.inputHeight}px`, "--page-max-width": `${theme.pageWidth}px`,
    "--page-padding-x": `${theme.pagePadding}px`, "--page-padding-y": `${theme.pagePadding}px`,
    "--table-row-height": `${theme.tableRowHeight}px`, "--table-header-bg": theme.tableHeaderColor,
    "--table-alternate-bg": theme.tableZebra ? theme.tableAlternateColor : theme.surfaceColor,
  };
  return !useDark && usesLiveDefaultPalette(theme) ? { ...variables, ...LIVE_DEFAULT_COLOR_VARIABLES } : variables;
}

export function resolveColorMode(preference = "system", mediaMatches = false, darkEnabled = true) {
  if (!darkEnabled) return "light";
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return mediaMatches ? "dark" : "light";
}

export function applyGlobalTheme(value = {}, options = {}) {
  const theme = normalizeGlobalTheme(value);
  if (typeof document === "undefined") return theme;
  const mode = resolveColorMode(options.preference || options.mode || "light", options.systemDark === true, theme.darkModeEnabled);
  const root = document.documentElement;
  const variables = themeToCssVariables(theme, { mode });
  Object.entries(variables).forEach(([name, cssValue]) => {
    if (mode === "light" && usesLiveDefaultPalette(theme)) root.style.removeProperty(name);
    else root.style.setProperty(name, cssValue);
  });
  root.dataset.globalTheme = "custom";
  root.dataset.colorMode = mode;
  root.style.colorScheme = mode;
  return theme;
}

export function globalThemeCacheKey(companyId = "__platform__") {
  return `${GLOBAL_THEME_CACHE_KEY}:${String(companyId || "__platform__")}`;
}

export function cacheGlobalTheme(value = {}, companyId = "__platform__", version = 0) {
  const theme = normalizeGlobalTheme(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(globalThemeCacheKey(companyId), JSON.stringify({ theme, version, companyId }));
  }
  return theme;
}

export function readCachedGlobalTheme(companyId = "__platform__") {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(globalThemeCacheKey(companyId));
    if (stored) return normalizeGlobalTheme(JSON.parse(stored)?.theme || JSON.parse(stored));
    const legacy = window.localStorage.getItem("bickers-global-theme:v1");
    return legacy ? normalizeGlobalTheme(JSON.parse(legacy)) : null;
  } catch {
    return null;
  }
}

export function readColorModePreference() {
  if (typeof window === "undefined") return "system";
  const value = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
  return COLOR_MODE_OPTIONS.includes(value) ? value : "system";
}

export function writeColorModePreference(value) {
  const preference = COLOR_MODE_OPTIONS.includes(value) ? value : "system";
  if (typeof window !== "undefined") window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, preference);
  return preference;
}
