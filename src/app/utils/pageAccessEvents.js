"use client";

export const PAGE_PERMISSION_DENIED_EVENT = "bickers:page-permission-denied";
export const PAGE_PERMISSION_CLEAR_EVENT = "bickers:page-permission-clear";

export function isPermissionDeniedError(error) {
  const code = String(error?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  return code === "permission-denied" || message.includes("missing or insufficient permissions");
}

export function reportPagePermissionDenied({ collectionName = "", operation = "Firestore access", error } = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PAGE_PERMISSION_DENIED_EVENT, {
      detail: {
        collectionName,
        operation,
        message: error?.message || "Missing or insufficient permissions.",
        code: error?.code || "permission-denied",
        pathname: window.location?.pathname || "",
        at: Date.now(),
      },
    })
  );
}

export function clearPagePermissionDenied() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PAGE_PERMISSION_CLEAR_EVENT, {
      detail: {
        pathname: window.location?.pathname || "",
        at: Date.now(),
      },
    })
  );
}
