export const EMPLOYEE_PERSONNEL_COLLECTION = "employeePersonnel";

export const PRIVATE_EMPLOYEE_FIELDS = [
  "dob",
  "dateOfBirth",
  "address",
  "postcode",
  "nationalInsuranceNumber",
  "niNumber",
  "payrollNumber",
  "payrollRates",
  "personnelFile",
  "rightToWorkChecked",
  "rightToWorkExpiry",
  "passport",
  "passportNumber",
  "passportCountry",
  "passportExpiry",
  "passportDocumentUrl",
  "passportNotes",
  "drivingLicence",
  "licenceNumber",
  "licenseNumber",
  "drivingLicenceExpiry",
  "drivingLicenceCountry",
  "drivingLicenceIssueDate",
  "drivingLicenceCategories",
  "drivingLicenceCheckCode",
  "drivingLicenceDocumentUrl",
  "drivingLicencePoints",
  "drivingLicenceNotes",
  "medical",
  "allergies",
  "medicalConditions",
  "medication",
  "medicalNotes",
  "emergencyContacts",
  "personnelDocuments",
  "onboardingChecklist",
  "offboardingChecklist",
  "employmentHistory",
  "employmentStatusReason",
  "expectedReturnDate",
  "endDate",
  "employmentEndDate",
  "accessBeforeEmploymentChange",
  "payrollRateHistory",
];

export const ONBOARDING_CHECKLIST = [
  { id: "profile", label: "Personal and payroll details completed" },
  { id: "contract", label: "Employment contract uploaded" },
  { id: "right_to_work", label: "Right-to-work evidence verified" },
  { id: "emergency", label: "Emergency contact added" },
  { id: "schedule", label: "Working schedule reviewed" },
  { id: "access", label: "Software access reviewed" },
  { id: "policy", label: "Policies and handbook acknowledged" },
];

export const OFFBOARDING_CHECKLIST = [
  { id: "access_revoked", label: "Software access revoked" },
  { id: "last_day", label: "Last working day recorded" },
  { id: "timesheet", label: "Final timesheet reviewed" },
  { id: "holiday", label: "Holiday balance reviewed" },
  { id: "property", label: "Company property returned" },
  { id: "payroll", label: "Payroll notified" },
  { id: "retention", label: "Personnel record retention reviewed" },
];

const text = (value) => String(value ?? "").trim();

export function withoutPrivateEmployeeFields(source = {}) {
  const result = { ...(source || {}) };
  PRIVATE_EMPLOYEE_FIELDS.forEach((field) => delete result[field]);
  return result;
}

export function pickPrivateEmployeeFields(source = {}) {
  return PRIVATE_EMPLOYEE_FIELDS.reduce((result, field) => {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) result[field] = source[field];
    return result;
  }, {});
}

export function mergeEmployeePersonnel(employee = {}, personnel = {}) {
  return { ...(employee || {}), ...(personnel || {}) };
}

export function mergeChecklist(definitions = [], existing = [], autoCompleted = {}) {
  const rowsById = new Map(
    (Array.isArray(existing) ? existing : []).map((row) => [text(row?.id), row || {}])
  );
  return definitions.map((definition) => {
    const saved = rowsById.get(definition.id) || {};
    const automaticallyComplete = autoCompleted[definition.id] === true;
    return {
      id: definition.id,
      label: definition.label,
      completed: saved.completed === true || automaticallyComplete,
      completedAt: saved.completedAt || (automaticallyComplete ? "derived" : ""),
      completedBy: saved.completedBy || (automaticallyComplete ? "System" : ""),
    };
  });
}

export function checklistProgress(rows = []) {
  const total = Array.isArray(rows) ? rows.length : 0;
  const complete = (Array.isArray(rows) ? rows : []).filter((row) => row?.completed === true).length;
  return { complete, total, percentage: total ? Math.round((complete / total) * 100) : 0 };
}

export function deriveOnboardingChecklist(record = {}) {
  const documents = Array.isArray(record.personnelDocuments) ? record.personnelDocuments : [];
  const emergencyContacts = Array.isArray(record.emergencyContacts) ? record.emergencyContacts : [];
  const workSchedule = record.workSchedule && typeof record.workSchedule === "object" ? record.workSchedule : {};
  return mergeChecklist(ONBOARDING_CHECKLIST, record.onboardingChecklist, {
    profile: Boolean(text(record.address) && text(record.nationalInsuranceNumber) && text(record.payrollNumber)),
    contract: documents.some((row) => /contract/i.test(`${row?.type || ""} ${row?.title || ""}`) && text(row?.documentUrl)),
    right_to_work: record.rightToWorkChecked === true,
    emergency: emergencyContacts.some((row) => text(row?.name) && (text(row?.phone) || text(row?.email))),
    schedule: Object.keys(workSchedule).length > 0,
    access: Boolean(record.appAccess && (record.appAccess.user === true || record.appAccess.service === true)),
  });
}

export function deriveOffboardingChecklist(record = {}) {
  return mergeChecklist(OFFBOARDING_CHECKLIST, record.offboardingChecklist, {
    access_revoked: record.active === false && record.appDisabled === true,
    last_day: Boolean(text(record.endDate || record.employmentEndDate)),
  });
}

function dateOnly(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function localDate(value) {
  const ymd = dateOnly(value);
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function complianceState(expiryDate, asOfDate = new Date()) {
  const expiry = localDate(expiryDate);
  if (!expiry) return { state: "missing", tone: "neutral", daysRemaining: null };
  const today = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());
  const daysRemaining = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (daysRemaining < 0) return { state: "overdue", tone: "danger", daysRemaining };
  if (daysRemaining <= 30) return { state: "urgent", tone: "danger", daysRemaining };
  if (daysRemaining <= 60) return { state: "warning", tone: "warning", daysRemaining };
  if (daysRemaining <= 90) return { state: "notice", tone: "info", daysRemaining };
  return { state: "current", tone: "success", daysRemaining };
}

export function getPersonnelCompliance(record = {}, asOfDate = new Date()) {
  const documents = Array.isArray(record.personnelDocuments) ? record.personnelDocuments : [];
  const items = [
    { key: "passport", label: "Passport", expiryDate: record.passport?.expiryDate || record.passportExpiry, href: "#passport" },
    { key: "licence", label: "Driving licence", expiryDate: record.drivingLicence?.expiryDate || record.drivingLicenceExpiry, href: "#licence" },
    { key: "right-to-work", label: "Right to work", expiryDate: record.rightToWorkExpiry, href: "#passport" },
    ...documents
      .filter((row) => dateOnly(row?.expiryDate))
      .map((row, index) => ({
        key: `document-${index}`,
        label: text(row?.title || row?.type) || `HR document ${index + 1}`,
        expiryDate: row.expiryDate,
        href: "#documents",
      })),
  ].map((item) => ({ ...item, expiryDate: dateOnly(item.expiryDate), ...complianceState(item.expiryDate, asOfDate) }));

  const dueItems = items.filter((item) => ["overdue", "urgent", "warning", "notice"].includes(item.state));
  const priority = { overdue: 0, urgent: 1, warning: 2, notice: 3, current: 4, missing: 5 };
  items.sort((a, b) => priority[a.state] - priority[b.state] || text(a.expiryDate).localeCompare(text(b.expiryDate)));
  return {
    items,
    dueItems,
    overdue: items.filter((item) => item.state === "overdue").length,
    dueWithin90Days: dueItems.length,
    tone: items.some((item) => ["overdue", "urgent"].includes(item.state))
      ? "danger"
      : dueItems.some((item) => item.state === "warning")
        ? "warning"
        : dueItems.length
          ? "info"
          : "success",
  };
}

function normalEmployeeKey(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function recordMatchesEmployee(record = {}, employee = {}) {
  const ids = [record.employeeId, record.employeeCode]
    .map(text)
    .filter(Boolean);
  const employeeIds = [employee.id, employee.employeeId, employee.employeeCode, employee.userCode, employee.code]
    .map(text)
    .filter(Boolean);
  if (ids.some((id) => employeeIds.includes(id))) return true;
  const recordName = normalEmployeeKey(record.employee || record.employeeName);
  return Boolean(recordName && recordName === normalEmployeeKey(employee.name || employee.fullName));
}

function eachWeekday(startValue, endValue, bankHolidayDates = new Set()) {
  const start = localDate(startValue);
  const end = localDate(endValue) || start;
  if (!start || !end) return [];
  const dates = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = cursor.getDay();
    const key = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !bankHolidayDates.has(key)) dates.push(new Date(cursor));
  }
  return dates;
}

function leaveDays(record, bankHolidayDates) {
  const dates = eachWeekday(record.startDate, record.endDate, bankHolidayDates);
  if (!dates.length) return 0;
  if (dates.length === 1 && (record.startHalfDay || record.endHalfDay || record.halfDay)) return 0.5;
  let total = dates.length;
  if (record.startHalfDay) total -= 0.5;
  if (record.endHalfDay) total -= 0.5;
  return Math.max(0, total);
}

export function getEmployeeAbsenceSummary({ employee = {}, holidays = [], sickLeave = [], year = new Date().getFullYear(), bankHolidayDates = new Set() } = {}) {
  const employeeHolidays = (Array.isArray(holidays) ? holidays : []).filter((row) => recordMatchesEmployee(row, employee));
  const employeeSickLeave = (Array.isArray(sickLeave) ? sickLeave : []).filter((row) => recordMatchesEmployee(row, employee));
  let approvedPaidDays = 0;
  let pendingRequests = 0;
  const futureLeave = [];
  const today = new Date().toISOString().slice(0, 10);

  employeeHolidays.forEach((row) => {
    const start = dateOnly(row.startDate);
    if (!start || Number(start.slice(0, 4)) !== Number(year)) return;
    const status = text(row.status || row.approvalStatus || row.state).toLowerCase();
    if (status.includes("declined")) return;
    if (!status || status.includes("request")) pendingRequests += 1;
    const unpaid = text(row.paidStatus).toLowerCase() === "unpaid" || row.unpaid === true || row.paid === false;
    if ((status.includes("approved") || row.approved === true) && !unpaid) approvedPaidDays += leaveDays(row, bankHolidayDates);
    if ((status.includes("approved") || row.approved === true) && start >= today) futureLeave.push(start);
  });

  const sickDays = employeeSickLeave.reduce((total, row) => {
    const start = dateOnly(row.startDate);
    if (!start || Number(start.slice(0, 4)) !== Number(year) || text(row.status).toLowerCase() === "cancelled") return total;
    return total + leaveDays(row, new Set());
  }, 0);
  const allowance = Number(employee.holidayAllowances?.[String(year)] ?? employee.holidayAllowance ?? 0);
  return {
    allowance,
    approvedPaidDays: Number(approvedPaidDays.toFixed(2)),
    remainingPaidDays: Number(Math.max(0, allowance - approvedPaidDays).toFixed(2)),
    pendingRequests,
    sickDays: Number(sickDays.toFixed(2)),
    nextLeaveDate: futureLeave.sort()[0] || "",
  };
}

export function createRateHistoryEntry({ previous = {}, next = {}, effectiveDate, reason, changedBy, changedAt = new Date().toISOString() } = {}) {
  const changes = Object.keys({ ...(previous || {}), ...(next || {}) })
    .filter((field) => String(previous?.[field] ?? "") !== String(next?.[field] ?? ""))
    .map((field) => ({ field, from: previous?.[field] ?? "", to: next?.[field] ?? "" }));
  if (!changes.length) return null;
  return {
    id: `${Date.now()}-rate-change`,
    effectiveDate: dateOnly(effectiveDate),
    reason: text(reason),
    changes,
    changedAt,
    changedBy: text(changedBy),
  };
}
