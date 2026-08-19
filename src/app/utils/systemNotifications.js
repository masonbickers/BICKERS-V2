export const SYSTEM_NOTIFICATION_EVENT = "bickers:system-notification";
export const SYSTEM_DIALOG_EVENT = "bickers:system-dialog";

const FLASH_KEY = "bickers:system-notification:flash";
const VALID_TYPES = new Set(["success", "info", "warning", "danger"]);

const normalizeNotification = (notification = {}) => {
  const value = notification && typeof notification === "object"
    ? notification
    : { message: String(notification ?? "") };
  return ({
    id: value.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: VALID_TYPES.has(value.type) ? value.type : "info",
    title: String(value.title || "Notification"),
    message: String(value.message || ""),
    duration: Number(value.duration) > 0 ? Number(value.duration) : 3500,
    queued: value.queued === true,
  });
};

export function showSystemNotification(notification) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SYSTEM_NOTIFICATION_EVENT, { detail: normalizeNotification(notification) })
  );
}

export function queueSystemNotification(notification) {
  if (typeof window === "undefined") return;
  const normalized = { ...normalizeNotification(notification), queued: true };
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify(normalized));
    window.dispatchEvent(
      new CustomEvent(SYSTEM_NOTIFICATION_EVENT, { detail: normalized })
    );
  } catch {
    showSystemNotification(normalized);
  }
}

export function consumeQueuedSystemNotification() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FLASH_KEY);
    return normalizeNotification(JSON.parse(raw));
  } catch {
    sessionStorage.removeItem(FLASH_KEY);
    return null;
  }
}

const requestSystemDialog = (detail) => {
  if (typeof window === "undefined") return Promise.resolve(detail.kind === "confirm" ? false : null);
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(SYSTEM_DIALOG_EVENT, { detail: { ...detail, resolve } }));
  });
};

export function confirmSystem(message, options = {}) {
  return requestSystemDialog({
    kind: "confirm",
    title: options.title || "Please confirm",
    message: String(message || "Are you sure?"),
    confirmLabel: options.confirmLabel || "Confirm",
    cancelLabel: options.cancelLabel || "Cancel",
    danger: options.danger !== false,
  });
}

export function promptSystem(message, defaultValue = "", options = {}) {
  return requestSystemDialog({
    kind: "prompt",
    title: options.title || "Information required",
    message: String(message || "Enter a value"),
    defaultValue: String(defaultValue || ""),
    confirmLabel: options.confirmLabel || "Continue",
    cancelLabel: options.cancelLabel || "Cancel",
    danger: false,
  });
}
