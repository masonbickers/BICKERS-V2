export const FIXED_JOB_STATUS_STYLES = Object.freeze({
  Confirmed: { bg: "var(--job-status-confirmed)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  "First Pencil": { bg: "var(--job-status-first-pencil)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  "Second Pencil": { bg: "var(--job-status-second-pencil)", text: "var(--job-status-text-light)", border: "var(--job-status-border)" },
  "Action Required": { bg: "var(--job-status-action-required)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Complete: { bg: "var(--job-status-complete)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  DNH: { bg: "var(--job-status-dnh)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Holiday: { bg: "var(--job-status-holiday)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Maintenance: { bg: "var(--job-status-maintenance)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Postponed: { bg: "var(--job-status-postponed)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Cancelled: { bg: "var(--job-status-cancelled)", text: "var(--job-status-text-light)", border: "var(--job-status-border)" },
  Lost: { bg: "var(--job-status-lost)", text: "var(--job-status-text-light)", border: "var(--job-status-border)" },
  Deleted: { bg: "var(--job-status-deleted)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Bickers: { bg: "var(--job-status-bickers)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Stunt: { bg: "var(--job-status-stunt)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  "Bank Holiday": { bg: "var(--job-status-bank-holiday)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Note: { bg: "var(--job-status-note)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Requested: { bg: "var(--job-status-requested)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Booked: { bg: "var(--job-status-booked)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
  Enquiry: { bg: "var(--job-status-enquiry)", text: "var(--job-status-text-dark)", border: "var(--job-status-border)" },
});

const STATUS_ALIASES = Object.freeze({ completed: "Complete", canceled: "Cancelled" });

export function normalizeJobStatus(value = "") {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  const alias = STATUS_ALIASES[lower];
  if (alias) return alias;
  return Object.keys(FIXED_JOB_STATUS_STYLES).find((key) => key.toLowerCase() === lower) || raw;
}

export function getFixedJobStatusStyle(value = "") {
  return FIXED_JOB_STATUS_STYLES[normalizeJobStatus(value)] || {
    bg: "var(--job-status-note)",
    text: "var(--job-status-text-dark)",
    border: "var(--job-status-border)",
  };
}
