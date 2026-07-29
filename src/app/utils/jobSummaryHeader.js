const text = (value) => String(value ?? "").trim();
const key = (value) => text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const title = (value) =>
  key(value)
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const READY_KEYS = new Set(["ready", "ready to invoice", "ready for invoice", "ready for finance", "finance review"]);
const NEEDS_ACTION_KEYS = new Set(["needs action", "action required"]);
const COMPLETE_KEYS = new Set(["complete", "completed"]);
const POST_OPERATIONAL_KEYS = new Set(["draft", "approved", "issued", "invoiced", "part paid", "paid", "settled"]);

export function resolveOperationalStatus(job = {}) {
  const explicit = [
    job.operationalStatus,
    job.operationsStatus,
    job.reviewStatus,
    job.completionStatus,
    job.jobStatus,
  ].find((value) => text(value));

  if (explicit) {
    const normalized = key(explicit);
    if (COMPLETE_KEYS.has(normalized)) return "Complete";
    return title(explicit) || "Unknown";
  }

  const generic = key(job.status);
  if (COMPLETE_KEYS.has(generic) || READY_KEYS.has(generic) || POST_OPERATIONAL_KEYS.has(generic)) {
    return "Complete";
  }
  if (!generic || NEEDS_ACTION_KEYS.has(generic)) return "Unknown";
  return title(job.status) || "Unknown";
}

export function resolveFinanceStage(job = {}, invoice = null) {
  const jobStatus = key(job.status);
  if (NEEDS_ACTION_KEYS.has(jobStatus)) return "Needs Action";

  const invoiceStage = key(invoice?.status);
  if (invoiceStage === "draft") return "Draft";
  if (invoiceStage === "approved") return "Approved";
  if (invoiceStage === "issued" || invoiceStage === "invoiced") return "Issued";
  if (invoiceStage === "part paid") return "Part Paid";
  if (invoiceStage === "paid" || invoiceStage === "settled") return "Paid";
  if (invoiceStage === "void") return "Void";

  const explicit = [
    job.finance?.status,
    job.financeStage,
    job.financeStatus,
    job.invoiceStatus,
  ].find((value) => text(value));
  const explicitKey = key(explicit);
  if (NEEDS_ACTION_KEYS.has(explicitKey)) return "Needs Action";
  if (READY_KEYS.has(explicitKey)) return "Ready for Finance";
  if (explicitKey === "draft") return "Draft";
  if (explicitKey === "approved") return "Approved";
  if (explicitKey === "issued" || explicitKey === "invoiced") return "Issued";
  if (explicitKey === "part paid") return "Part Paid";
  if (explicitKey === "paid" || explicitKey === "settled") return "Paid";
  if (explicitKey === "void") return "Void";

  if (job.readyToInvoice === true || READY_KEYS.has(jobStatus)) return "Ready for Finance";
  if (jobStatus === "draft") return "Draft";
  if (jobStatus === "approved") return "Approved";
  if (jobStatus === "issued" || jobStatus === "invoiced") return "Issued";
  if (jobStatus === "part paid") return "Part Paid";
  if (jobStatus === "paid" || jobStatus === "settled") return "Paid";
  return "Not set";
}

export function resolveFinanceOwnership(financeStage) {
  switch (financeStage) {
    case "Ready for Finance":
      return { owner: "Finance", nextAction: "Review and create invoice" };
    case "Needs Action":
      return { owner: "Operations", nextAction: "Resolve requested corrections" };
    case "Draft":
      return { owner: "Finance", nextAction: "Complete invoice draft" };
    case "Approved":
      return { owner: "Finance", nextAction: "Issue invoice" };
    case "Issued":
      return { owner: "Finance", nextAction: "Await or record payment" };
    default:
      return { owner: null, nextAction: null };
  }
}
