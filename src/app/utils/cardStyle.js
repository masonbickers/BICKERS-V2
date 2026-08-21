export const CARD_STYLE_STORAGE_KEY = "bickers-card-style:v1";

export const CARD_STYLE_OPTIONS = Object.freeze([
  {
    value: "current",
    label: "Current cards",
    description: "Keeps the existing card-based layout.",
  },
  {
    value: "reduced",
    label: "Fewer cards",
    description: "Flattens secondary tiles while keeping key panels and alerts.",
  },
]);

const CARD_STYLE_VALUES = new Set(CARD_STYLE_OPTIONS.map((option) => option.value));

export function normalizeCardStyle(value) {
  return CARD_STYLE_VALUES.has(value) ? value : "current";
}

export function readCardStylePreference() {
  if (typeof window === "undefined") return "current";
  try {
    return normalizeCardStyle(window.localStorage.getItem(CARD_STYLE_STORAGE_KEY));
  } catch {
    return "current";
  }
}

export function applyCardStyle(value) {
  const next = normalizeCardStyle(value);
  if (typeof document !== "undefined") document.documentElement.dataset.cardStyle = next;
  return next;
}

export function writeCardStylePreference(value) {
  const next = applyCardStyle(value);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CARD_STYLE_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable; the active document preference still applies.
    }
  }
  return next;
}
