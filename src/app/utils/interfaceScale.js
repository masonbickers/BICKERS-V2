export const INTERFACE_SCALE_STORAGE_KEY = "bickers-interface-scale:v1";

export const INTERFACE_SCALE_OPTIONS = Object.freeze([
  { value: "compact", label: "Compact", percent: 80, description: "Fits more on screen" },
  { value: "standard", label: "Standard", percent: 100, description: "Default size" },
  { value: "large", label: "Large", percent: 115, description: "Easier to read" },
]);

const INTERFACE_SCALE_VALUES = new Set(INTERFACE_SCALE_OPTIONS.map((option) => option.value));

export function normalizeInterfaceScale(value) {
  return INTERFACE_SCALE_VALUES.has(value) ? value : "standard";
}

export function readInterfaceScalePreference() {
  if (typeof window === "undefined") return "standard";
  try {
    return normalizeInterfaceScale(window.localStorage.getItem(INTERFACE_SCALE_STORAGE_KEY));
  } catch {
    return "standard";
  }
}

export function applyInterfaceScale(value) {
  const next = normalizeInterfaceScale(value);
  if (typeof document !== "undefined") document.documentElement.dataset.interfaceScale = next;
  return next;
}

export function writeInterfaceScalePreference(value) {
  const next = applyInterfaceScale(value);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(INTERFACE_SCALE_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable in private browsing; the in-memory preference still works.
    }
  }
  return next;
}
