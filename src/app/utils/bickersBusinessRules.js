export const BICKERS_LIFECYCLE = [
  "Enquiry",
  "First Pencil",
  "Second Pencil",
  "Confirmed",
  "Complete",
  "Ready to Invoice",
  "Invoiced",
  "Paid",
];

export const DEFAULT_BICKERS_BUSINESS_RULES = Object.freeze({
  companyId: "bickers-action",
  title: "Bickers Action operating model",
  businessProfile:
    "Bickers Action plans and delivers specialist action-vehicle and precision-driving work for productions. A booking combines client and production details, dates, location, crew, vehicles, equipment, safety preparation, quotes, supporting files and finance follow-through.",
  services: [
    "Precision drivers and specialist crew",
    "Action, tracking and support vehicles",
    "U-Crane and specialist equipment workflows",
    "Stunt preparation, workshop and fleet support",
    "Production quoting, job delivery and invoicing",
  ],
  lifecycle: BICKERS_LIFECYCLE,
  glossary: {
    Enquiry: "Uncommitted work being assessed; it does not block a confirmed resource.",
    "First Pencil": "The primary provisional hold. Another First Pencil cannot occupy the same resource and dates.",
    "Second Pencil": "A softer provisional hold that may sit behind a First Pencil and can be reviewed if the First Pencil becomes free.",
    Confirmed: "Committed production work. Confirmed resources block competing holds on overlapping dates.",
    Complete: "Operational delivery has finished; the job still needs commercial close-out.",
    "Ready to Invoice": "The job has passed operational review and finance can prepare the invoice.",
    Invoiced: "An invoice has been issued but payment is not yet recorded.",
    Paid: "The invoice has been settled and the commercial workflow is closed.",
    Credit: "A weighted working-day value derived from the booking day note.",
    "Shoot day": "An On Set, Night Shoot or Rehearsal day.",
    "Travel day": "A Travel Day, Half Travel Day or Travel Time entry.",
  },
  schedulingRules: [
    "Confirmed blocks all other holds for the same resource and dates.",
    "First Pencil blocks another First Pencil; Second Pencil may sit behind a First Pencil.",
    "Crew and equipment must not be double-booked on overlapping dates.",
    "Crew holidays and unavailable notes must be checked before a booking is saved.",
    "Maintenance and off-road restrictions must be respected when selecting vehicles.",
  ],
  completionCriteria: [
    "The booking has valid dates and day notes for delivered work.",
    "Allocated crew, vehicles and equipment reflect the delivered job.",
    "Health and safety and risk-assessment fields are completed where required.",
    "The accepted quote and supporting documents are attached.",
    "Invoice contact, purchase order and invoice details are complete where required.",
    "Operational completion, ready-to-invoice, invoiced and paid are distinct stages.",
  ],
  metricDefinitions: {
    conversionRate: "Won outcomes divided by won plus lost outcomes. Open and tentative bookings are excluded.",
    bookingDays: "Unique scheduled dates across included bookings.",
    clientConcentration: "Share of bookings attributable to the largest client in the comparison window.",
    unpaidValue: "Reliable invoice value for invoiced jobs that are not marked paid or settled.",
    dataQualityRate: "Bookings with all core dates, status and job-number fields divided by included bookings.",
  },
  thresholds: {
    materialChangePercent: 20,
    clientConcentrationPercent: 35,
    minimumComparisonJobs: 5,
    staleInvoiceDays: 30,
    dataQualityWarningPercent: 90,
  },
  recommendationGuidance: [
    "Prioritise decisions supported by a named metric and comparison period.",
    "Explain implications in Bickers terminology and link to an existing workflow.",
    "Treat missing data as a data-quality issue rather than evidence of business performance.",
    "Do not recommend changing a booking, status, invoice or payment automatically.",
  ],
  prohibitedAssumptions: [
    "Do not infer profit or margin from quote or invoice value.",
    "Do not treat tentative bookings as won work.",
    "Do not judge individual employee performance.",
    "Do not assume missing invoice values are zero.",
    "Do not claim causation from a trend or comparison alone.",
  ],
});

const nonEmptyStrings = (value) =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim());

export function validateBickersBusinessRules(rules = {}) {
  const errors = [];
  if (!String(rules.businessProfile || "").trim()) errors.push("Business profile is required.");
  if (!nonEmptyStrings(rules.services)) errors.push("At least one service is required.");
  if (!Array.isArray(rules.lifecycle) || rules.lifecycle.join("|") !== BICKERS_LIFECYCLE.join("|")) {
    errors.push("The canonical booking lifecycle cannot be reordered or omitted.");
  }
  if (!nonEmptyStrings(rules.completionCriteria)) errors.push("Completion criteria are required.");
  if (!nonEmptyStrings(rules.prohibitedAssumptions)) errors.push("At least one prohibited assumption is required.");
  const thresholds = rules.thresholds || {};
  ["materialChangePercent", "clientConcentrationPercent", "minimumComparisonJobs", "staleInvoiceDays", "dataQualityWarningPercent"].forEach((key) => {
    if (!Number.isFinite(Number(thresholds[key])) || Number(thresholds[key]) < 0) errors.push(`Threshold ${key} must be a non-negative number.`);
  });
  return { valid: errors.length === 0, errors };
}

export function mergeBickersBusinessRules(value = {}) {
  return {
    ...DEFAULT_BICKERS_BUSINESS_RULES,
    ...(value || {}),
    glossary: { ...DEFAULT_BICKERS_BUSINESS_RULES.glossary, ...(value?.glossary || {}) },
    metricDefinitions: { ...DEFAULT_BICKERS_BUSINESS_RULES.metricDefinitions, ...(value?.metricDefinitions || {}) },
    thresholds: { ...DEFAULT_BICKERS_BUSINESS_RULES.thresholds, ...(value?.thresholds || {}) },
    lifecycle: [...BICKERS_LIFECYCLE],
  };
}

export function previewBookingInterpretation(booking = {}, rules = DEFAULT_BICKERS_BUSINESS_RULES) {
  const status = String(booking.status || "Enquiry").trim();
  const completed = ["Complete", "Ready to Invoice", "Invoiced", "Paid"].includes(status);
  const gaps = [];
  if (!Array.isArray(booking.bookingDates) || !booking.bookingDates.length) gaps.push("booking dates");
  if (!String(booking.jobNumber || "").trim()) gaps.push("job number");
  if (!booking.hasQuote && !booking.quote && !booking.quoteUrl) gaps.push("accepted quote");
  if (completed && !booking.hasHS) gaps.push("H&S confirmation");
  return {
    status,
    interpretation: rules.glossary?.[status] || "Active booking state requiring human review.",
    readiness: gaps.length ? "Needs attention" : completed ? "Operationally complete" : "In progress",
    gaps,
  };
}
