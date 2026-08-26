const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const TIMESHEET_VALID_STATES = new Set([
  "submitted",
  "approved",
  "authorised",
  "authorized",
  "complete",
  "completed",
]);

const booleanValue = (values) => {
  for (const value of values) {
    if (value === true || value === false) return value;
    const normalized = lower(value);
    if (["required", "yes", "true"].includes(normalized)) return true;
    if (["not required", "no", "false", "waived"].includes(normalized)) return false;
  }
  return null;
};

const latestAcknowledgement = (job, warningCode) =>
  [...(Array.isArray(job?.history) ? job.history : [])]
    .reverse()
    .find(
      (entry) =>
        lower(entry?.action) === "finance warning acknowledged" &&
        text(entry?.warningCode) === warningCode
    ) || null;

const confirmationSuffix = (entry) => {
  if (!entry) return "";
  const by = text(entry.user || entry.by || entry.updatedBy);
  const rawDate = entry.timestamp || entry.at || entry.updatedAt;
  const date = rawDate ? new Date(rawDate) : null;
  const when = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";
  return [by ? `by ${by}` : "", when ? `on ${when}` : ""].filter(Boolean).join(" ");
};

export function resolveTimesheetRequirement(job = {}) {
  return booleanValue([
    job.timesheetsRequired,
    job.timesheetRequired,
    job.requiresTimesheets,
    job.finance?.timesheetsRequired,
    job.timesheetRequirement,
  ]);
}

export function resolvePurchaseOrderRequirement(job = {}) {
  return booleanValue([
    job.poRequired,
    job.purchaseOrderRequired,
    job.requiresPurchaseOrder,
    job.finance?.poRequired,
  ]);
}

export function isLinkedTimesheetValid(timesheet = {}) {
  if (timesheet.submitted === true || timesheet.approved === true) return true;
  return TIMESHEET_VALID_STATES.has(
    lower(timesheet.status || timesheet.approvalStatus || timesheet.workflowStatus)
  );
}

export function buildFinanceReadiness({
  job = {},
  timesheets = [],
  acceptedQuoteNumber = "",
  readyForInvoicing = false,
  hasPurchaseOrder = false,
} = {}) {
  const checks = [];
  const quoteNotRequired = Boolean(
    job?.quoteNotRequired === true || job?.quoteRequirement?.notRequired === true
  );
  checks.push(
    readyForInvoicing
      ? { code: "operational_review", type: "passed", label: "Operational review complete" }
      : { code: "operational_review", type: "blocker", label: "Operational review incomplete" }
  );
  checks.push(
    text(acceptedQuoteNumber)
      ? { code: "accepted_quote", type: "passed", label: `Approved job quote ${text(acceptedQuoteNumber)}` }
      : quoteNotRequired
        ? { code: "accepted_quote", type: "passed", label: "No quote required — confirmed" }
        : { code: "accepted_quote", type: "blocker", label: "Approved job quote missing" }
  );

  const poRequired = resolvePurchaseOrderRequirement(job);
  const poAcknowledgement = latestAcknowledgement(job, "po_requirement_uncertain");
  if (hasPurchaseOrder) {
    checks.push({ code: "purchase_order", type: "passed", label: "PO/reference present" });
  } else if (poRequired === true) {
    checks.push({ code: "purchase_order", type: "blocker", label: "PO required but missing" });
  } else if (poRequired === false) {
    checks.push({ code: "purchase_order", type: "passed", label: "PO/reference not required" });
  } else if (poAcknowledgement) {
    const suffix = confirmationSuffix(poAcknowledgement);
    checks.push({
      code: "purchase_order",
      type: "passed",
      label: `PO/reference absence confirmed${suffix ? ` ${suffix}` : ""}`,
    });
  } else {
    checks.push({
      code: "po_requirement_uncertain",
      type: "warning",
      label: "No PO/reference — confirmation required",
    });
  }

  const requirement = resolveTimesheetRequirement(job);
  const linkedTimesheets = Array.isArray(timesheets) ? timesheets : [];
  const explicitlyNoBookedCrew = Array.isArray(job?.employees) && job.employees.length === 0;
  const timesheetAcknowledgement = latestAcknowledgement(job, "timesheet_requirement_uncertain");
  if (linkedTimesheets.length && linkedTimesheets.every(isLinkedTimesheetValid)) {
    checks.push({ code: "timesheets", type: "passed", label: "Timesheets linked" });
  } else if (linkedTimesheets.length) {
    checks.push({ code: "timesheets", type: "blocker", label: "Linked timesheets are incomplete" });
  } else if (requirement === true) {
    checks.push({ code: "timesheets", type: "blocker", label: "Required timesheets are missing" });
  } else if (requirement === false) {
    checks.push({ code: "timesheets", type: "passed", label: "Timesheets not required" });
  } else if (explicitlyNoBookedCrew) {
    checks.push({ code: "timesheets", type: "passed", label: "No crew booked — timesheets not required" });
  } else if (timesheetAcknowledgement) {
    const suffix = confirmationSuffix(timesheetAcknowledgement);
    checks.push({
      code: "timesheets",
      type: "passed",
      label: `Timesheets not required${suffix ? ` — confirmed ${suffix}` : ""}`,
    });
  } else {
    checks.push({
      code: "timesheet_requirement_uncertain",
      type: "warning",
      label: "No linked timesheets — confirmation required",
    });
  }

  const counts = checks.reduce(
    (result, check) => ({ ...result, [check.type]: result[check.type] + 1 }),
    { passed: 0, warning: 0, blocker: 0 }
  );
  return {
    checks,
    counts,
    warnings: checks.filter((check) => check.type === "warning"),
    blockers: checks.filter((check) => check.type === "blocker"),
  };
}

export function financeReadinessSummary(counts = {}) {
  const passed = Number(counts.passed || 0);
  const warning = Number(counts.warning || 0);
  const blocker = Number(counts.blocker || 0);
  if (passed > 0 && warning === 0 && blocker === 0) return "All checks passed";
  return [
    `${passed} passed`,
    warning ? `${warning} warning${warning === 1 ? "" : "s"}` : "",
    blocker ? `${blocker} blocker${blocker === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
}
