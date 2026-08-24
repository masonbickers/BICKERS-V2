export const SEMANTIC_STATUS_STYLES = Object.freeze({
  red: { bg: "var(--status-red)", text: "var(--status-red-text)", border: "var(--status-red-border)" },
  orange: { bg: "var(--status-orange)", text: "var(--status-orange-text)", border: "var(--status-orange-border)" },
  green: { bg: "var(--status-green)", text: "var(--status-green-text)", border: "var(--status-green-border)" },
  blue: { bg: "var(--status-blue)", text: "var(--status-blue-text)", border: "var(--status-blue-border)" },
  grey: { bg: "var(--status-grey)", text: "var(--status-grey-text)", border: "var(--status-grey-border)" },
});

export const SEMANTIC_STATUS_SURFACE_STYLES = Object.freeze({
  red: { bg: "var(--color-danger-surface)", text: "var(--color-text)", border: "var(--color-danger)" },
  orange: { bg: "var(--color-warning-surface)", text: "var(--color-text)", border: "var(--color-warning)" },
  green: { bg: "var(--color-success-surface)", text: "var(--color-text)", border: "var(--color-success)" },
  blue: { bg: "var(--color-info-surface)", text: "var(--color-text)", border: "var(--color-info)" },
  grey: { bg: "var(--color-surface-hover)", text: "var(--color-text)", border: "var(--color-border-strong)" },
});

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

export const FIXED_JOB_STATUS_SURFACE_STYLES = Object.freeze(
  Object.fromEntries(
    Object.entries(FIXED_JOB_STATUS_STYLES).map(([status, style]) => [
      status,
      Object.freeze({
        bg: style.bg.replace(")", "-surface)"),
        text: `var(--job-status-large-text, ${style.text})`,
        border: style.bg,
      }),
    ])
  )
);

const STATUS_ALIASES = Object.freeze({ completed: "Complete", canceled: "Cancelled" });

export function normalizeJobStatus(value = "") {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  const alias = STATUS_ALIASES[lower];
  if (alias) return alias;
  return Object.keys(FIXED_JOB_STATUS_STYLES).find((key) => key.toLowerCase() === lower) || raw;
}

export function getFixedJobStatusStyle(value = "") {
  return FIXED_JOB_STATUS_STYLES[normalizeJobStatus(value)] || getSemanticStatusStyle(value);
}

export function getFixedJobStatusSurfaceStyle(value = "") {
  return FIXED_JOB_STATUS_SURFACE_STYLES[normalizeJobStatus(value)] || getSemanticStatusSurfaceStyle(value);
}

const EXACT_STATUS_TONES = Object.freeze({
  "ready to invoice": "orange",
  invoiced: "blue",
  paid: "green",
  settled: "green",
  approved: "green",
  active: "green",
  available: "green",
  safe: "green",
  passed: "green",
  resolved: "green",
  ready: "green",
  submitted: "green",
  ok: "green",
  certified: "green",
  closed: "green",
  logged: "green",
  scheduled: "blue",
  "in progress": "blue",
  pending: "orange",
  open: "orange",
  maintenance: "orange",
  compliance: "orange",
  warning: "orange",
  "action required": "orange",
  "needs action": "orange",
  attention: "orange",
  overdue: "orange",
  due: "orange",
  missing: "orange",
  conflict: "red",
  defect: "red",
  error: "red",
  failed: "red",
  rejected: "red",
  invalid: "red",
  unsafe: "red",
  inactive: "grey",
  archived: "grey",
  draft: "grey",
  recorded: "grey",
  postponed: "grey",
  deleted: "grey",
  cancelled: "grey",
  canceled: "grey",
  lost: "grey",
  declined: "grey",
  tbc: "grey",
  history: "blue",
});

const STATUS_TONE_PATTERNS = Object.freeze([
  ["red", /\b(second pencil|conflict|defect|error|failed|rejected|invalid|unsafe)\b/],
  ["orange", /\b(maintenance|compliance|warning|attention|action required|needs action|overdue|due|pending|missing|vor)\b/],
  ["green", /\b(complete|completed|confirmed|success|successful|safe|passed|approved|resolved|paid|settled|ready|active|available|booked|submitted|ok)\b/],
  ["blue", /\b(first pencil|information|info|invoiced|requested|enquiry|inquiry|scheduled|in progress|bickers|stunt|note)\b/],
  ["grey", /\b(inactive|archived|draft|postponed|deleted|cancelled|canceled|lost|declined|dnh|holiday|tbc)\b/],
]);

export function getSemanticStatusTone(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!normalized) return "grey";
  if (FIXED_JOB_STATUS_STYLES[normalizeJobStatus(normalized)]) {
    const fixed = normalizeJobStatus(normalized);
    if (["Second Pencil"].includes(fixed)) return "red";
    if (["Action Required", "Maintenance"].includes(fixed)) return "orange";
    if (["Confirmed", "Complete", "Booked"].includes(fixed)) return "green";
    if (["First Pencil", "Bickers", "Stunt", "Note", "Requested", "Enquiry"].includes(fixed)) return "blue";
    return "grey";
  }
  if (EXACT_STATUS_TONES[normalized]) return EXACT_STATUS_TONES[normalized];
  return STATUS_TONE_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] || "grey";
}

export function getSemanticStatusStyle(value = "") {
  return SEMANTIC_STATUS_STYLES[getSemanticStatusTone(value)];
}

export function getSemanticStatusSurfaceStyle(value = "") {
  return SEMANTIC_STATUS_SURFACE_STYLES[getSemanticStatusTone(value)];
}
