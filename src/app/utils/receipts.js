export const RECEIPT_GROUP_STATUSES = ["draft", "submitted", "action_required", "closed"];
export const RECEIPT_STATUSES = ["pending", "checked", "queried", "vat_claimed", "no_vat"];
export const TERMINAL_RECEIPT_STATUSES = new Set(["vat_claimed", "no_vat"]);

const cleanIdentityValue = (value) => String(value || "").trim();
const cleanIdentityEmail = (value) => cleanIdentityValue(value).toLowerCase();

function participantUid(row = {}) {
  return cleanIdentityValue(row.uid || row.authUid || row.id);
}

function participantAliases(row = {}) {
  const companyId = cleanIdentityValue(row.companyId).toLowerCase() || "unknown-company";
  const aliases = [];
  const employeeId = cleanIdentityValue(row.employeeId);
  const email = cleanIdentityEmail(row.email);
  const authIds = [row.id, row.uid, row.authUid, row.firebaseUid]
    .map(cleanIdentityValue)
    .filter(Boolean);
  if (employeeId) aliases.push(`${companyId}:employee:${employeeId}`);
  if (email) aliases.push(`${companyId}:email:${email}`);
  authIds.forEach((uid) => aliases.push(`${companyId}:auth:${uid}`));
  return [...new Set(aliases)];
}

function participantRoleRank(role) {
  const normalized = cleanIdentityValue(role).toLowerCase().replace(/[^a-z]/g, "");
  if (["platformadmin", "superadmin"].includes(normalized)) return 5;
  if (["companyadmin", "admin"].includes(normalized)) return 4;
  if (["finance", "financemanager"].includes(normalized)) return 3;
  return 1;
}

function participantPreference(row = {}, preferredUidByEmployeeId = new Map()) {
  const uid = participantUid(row);
  const employeeId = cleanIdentityValue(row.employeeId);
  const preferredUid = cleanIdentityValue(preferredUidByEmployeeId.get(employeeId));
  let score = participantRoleRank(row.role) * 100;
  if (preferredUid && uid === preferredUid) score += 1000;
  if (!cleanIdentityValue(row.id).startsWith("employee_")) score += 50;
  if (cleanIdentityValue(row.clerkUserId || row.clerkId)) score += 30;
  if (Number(row.identityLinkVersion || 0) >= 2) score += 30;
  if (cleanIdentityValue(row.name)) score += 10;
  return score;
}

export function dedupeReceiptParticipants(rows = [], { preferredUidByEmployeeId = new Map() } = {}) {
  const candidates = rows.filter((row) => participantUid(row));
  const parents = candidates.map((_, index) => index);
  const aliasOwners = new Map();
  const find = (index) => {
    let current = index;
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]];
      current = parents[current];
    }
    return current;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  candidates.forEach((row, index) => {
    participantAliases(row).forEach((alias) => {
      if (aliasOwners.has(alias)) union(index, aliasOwners.get(alias));
      else aliasOwners.set(alias, index);
    });
  });

  const groups = new Map();
  candidates.forEach((row, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(row);
  });

  return [...groups.values()].map((group) => {
    const ranked = group.slice().sort((left, right) => {
      const score = participantPreference(right, preferredUidByEmployeeId) - participantPreference(left, preferredUidByEmployeeId);
      return score || participantUid(left).localeCompare(participantUid(right));
    });
    const canonical = ranked[0];
    const uid = participantUid(canonical);
    const uids = [uid, ...group.map(participantUid).filter((candidate) => candidate !== uid)];
    const named = ranked.find((row) => cleanIdentityValue(row.name || row.displayName || row.email)) || canonical;
    return {
      uid,
      uids: [...new Set(uids)],
      name: named.name || named.displayName || named.email || "User",
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

export function moneyToPence(value) {
  const amount = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export function penceToMoney(value) {
  return (Number(value || 0) / 100).toFixed(2);
}

export function suggestedVatPence(grossPence) {
  return Math.max(0, Math.round(Number(grossPence || 0) / 6));
}

export function currentMonthKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).format(date).slice(0, 7);
}

export function previousStatementMonthKey(date = new Date()) {
  const [year, month] = currentMonthKey(date).split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year, month - 2, 1));
  return `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isValidMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

export function isSelectableReceiptMonth(value, now = new Date()) {
  return isValidMonthKey(value) && value <= currentMonthKey(now);
}

export function receiptMonthLabel(value) {
  if (!isValidMonthKey(value)) return "Unknown month";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 15))
  );
}

export function receiptGroupId(companyId, submitterUid, monthKey) {
  return [companyId, submitterUid, monthKey]
    .map((part) => encodeURIComponent(String(part || "").trim()))
    .join("__");
}

export function safeReceiptFileName(name = "receipt") {
  const cleaned = String(name)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
  return cleaned || "receipt";
}

export function receiptStatusLabel(status) {
  return {
    pending: "Awaiting review",
    checked: "Checked",
    queried: "Action required",
    vat_claimed: "VAT claimed",
    no_vat: "No VAT",
    approved: "Checked",
    claimed: "VAT claimed",
  }[status] || "Awaiting review";
}

export function receiptGroupStatusLabel(status) {
  return {
    not_started: "Not started",
    draft: "Draft",
    submitted: "Submitted",
    action_required: "Action required",
    closed: "Closed",
  }[status] || "Not started";
}

export function normalizeReceiptStatus(status) {
  return { approved: "checked", claimed: "vat_claimed" }[status] ||
    (RECEIPT_STATUSES.includes(status) ? status : "pending");
}

export function canCloseReceiptGroup(group, receipts = []) {
  if (!group || group.status !== "submitted") return false;
  if (group.declaredNoReceipts === true) return receipts.length === 0;
  return receipts.length > 0 && receipts.every((row) => TERMINAL_RECEIPT_STATUSES.has(normalizeReceiptStatus(row.status)));
}

export function summarizeReceipts(receipts = []) {
  return receipts.reduce(
    (summary, row) => {
      summary.count += 1;
      summary.grossPence += Number(row.valuePence || 0);
      summary.suggestedVatPence += Number(row.suggestedVatPence ?? suggestedVatPence(row.valuePence));
      summary.actualVatPence += Number(row.vatPence || 0);
      if (normalizeReceiptStatus(row.status) === "queried") summary.queried += 1;
      if (TERMINAL_RECEIPT_STATUSES.has(normalizeReceiptStatus(row.status))) summary.resolved += 1;
      return summary;
    },
    { count: 0, grossPence: 0, suggestedVatPence: 0, actualVatPence: 0, queried: 0, resolved: 0 }
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildReceiptCsv(rows = []) {
  const headers = ["Month", "User", "Purpose", "Gross GBP", "Suggested VAT GBP", "Actual VAT GBP", "Outcome", "Uploaded", "File"];
  const values = rows.map((row) => [
    row.monthKey,
    row.submitterName,
    row.purpose,
    penceToMoney(row.valuePence),
    penceToMoney(row.suggestedVatPence ?? suggestedVatPence(row.valuePence)),
    penceToMoney(row.vatPence),
    receiptStatusLabel(normalizeReceiptStatus(row.status)),
    row.createdAt?.toDate?.()?.toISOString?.() || row.createdAt || "",
    row.fileName,
  ]);
  return [headers, ...values].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
