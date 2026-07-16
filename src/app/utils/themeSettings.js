export const THEME_SETTING_FIELDS = [
  { key: "canvasColor", label: "Page background", group: "Application colours", type: "color", cssVariable: "--color-canvas", defaultValue: "#f3f6f9" },
  { key: "surfaceColor", label: "Cards and panels", group: "Application colours", type: "color", cssVariable: "--color-surface", defaultValue: "#ffffff" },
  { key: "surfaceSubtleColor", label: "Subtle surfaces", group: "Application colours", type: "color", cssVariable: "--color-surface-subtle", defaultValue: "#f8fafc" },
  { key: "textColor", label: "Primary text", group: "Application colours", type: "color", cssVariable: "--color-text", defaultValue: "#0f172a" },
  { key: "mutedTextColor", label: "Muted text", group: "Application colours", type: "color", cssVariable: "--color-text-muted", defaultValue: "#5f6f82" },
  { key: "borderColor", label: "Borders", group: "Application colours", type: "color", cssVariable: "--color-border", defaultValue: "#d7dee8" },
  { key: "borderStrongColor", label: "Strong borders", group: "Application colours", type: "color", cssVariable: "--color-border-strong", defaultValue: "#c8d6e3" },
  { key: "brandColor", label: "Brand", group: "Brand colours", type: "color", cssVariable: "--color-brand", defaultValue: "#1f4b7a" },
  { key: "brandHoverColor", label: "Brand hover", group: "Brand colours", type: "color", cssVariable: "--color-brand-hover", defaultValue: "#173b62" },
  { key: "brandSoftColor", label: "Brand soft background", group: "Brand colours", type: "color", cssVariable: "--color-brand-soft", defaultValue: "#edf3f8" },
  { key: "brandBorderColor", label: "Brand border", group: "Brand colours", type: "color", cssVariable: "--color-brand-border", defaultValue: "#c8d6e3" },
  { key: "successColor", label: "Success", group: "Status colours", type: "color", cssVariable: "--color-success", defaultValue: "#166534" },
  { key: "warningColor", label: "Warning", group: "Status colours", type: "color", cssVariable: "--color-warning", defaultValue: "#9a3412" },
  { key: "dangerColor", label: "Danger", group: "Status colours", type: "color", cssVariable: "--color-danger", defaultValue: "#991b1b" },
  { key: "sidebarColor", label: "Sidebar", group: "Navigation colours", type: "color", cssVariable: "--shell-sidebar-bg", defaultValue: "#000000" },
  { key: "topbarColor", label: "Top and footer bars", group: "Navigation colours", type: "color", cssVariable: "--shell-topbar-bg", defaultValue: "#000000" },
  { key: "baseFontSize", label: "Base font size", group: "Sizing", type: "number", cssVariable: "--font-size-md", defaultValue: 14, min: 12, max: 18, unit: "px" },
  { key: "cornerRadius", label: "Default corner radius", group: "Sizing", type: "number", cssVariable: "--radius-md", defaultValue: 8, min: 0, max: 24, unit: "px" },
  { key: "controlHeight", label: "Input and button height", group: "Sizing", type: "number", cssVariable: "--control-height-md", defaultValue: 36, min: 32, max: 52, unit: "px" },
  { key: "pageMaxWidth", label: "Standard page width", group: "Sizing", type: "number", cssVariable: "--page-max-width", defaultValue: 1120, min: 900, max: 1600, unit: "px" },
];

export const DEFAULT_THEME_SETTINGS = Object.freeze(
  THEME_SETTING_FIELDS.reduce((settings, field) => {
    settings[field.key] = field.defaultValue;
    return settings;
  }, {})
);

function normalizeColor(value, fallback) {
  const candidate = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : fallback;
}

function normalizeNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return field.defaultValue;
  return Math.min(field.max, Math.max(field.min, Math.round(parsed)));
}

export function normalizeThemeSettings(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return THEME_SETTING_FIELDS.reduce((settings, field) => {
    settings[field.key] = field.type === "color"
      ? normalizeColor(source[field.key], field.defaultValue)
      : normalizeNumber(source[field.key], field);
    return settings;
  }, {});
}

export function themeSettingsToCssVariables(raw = {}) {
  const settings = normalizeThemeSettings(raw);
  return THEME_SETTING_FIELDS.reduce((variables, field) => {
    const value = settings[field.key];
    variables[field.cssVariable] = field.type === "number" ? `${value}${field.unit}` : value;
    return variables;
  }, {});
}
