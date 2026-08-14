export const MEANINGFUL_ACTIVITY_EVENT = "bickers:meaningful-activity";

export function trackMeaningfulAction(action = "update") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MEANINGFUL_ACTIVITY_EVENT, {
    detail: { action: String(action || "update").slice(0, 40) },
  }));
}
