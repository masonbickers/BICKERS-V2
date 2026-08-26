export const CURRENT_WORKING_TERMS_VERSION = "1.1";

const clean = (value) => String(value || "").trim();
const identity = (value) => clean(value).toLowerCase();

export function workingTermsEmployeeIdentities(employee = {}) {
  return new Set(
    [
      employee.id,
      employee.employeeId,
      employee.authUid,
      employee.uid,
      employee.userId,
      employee.email,
      employee.workEmail,
      employee.personalEmail,
    ]
      .map(identity)
      .filter(Boolean)
  );
}

export function acceptanceMatchesEmployee(record = {}, employee = {}) {
  const employeeIdentities = workingTermsEmployeeIdentities(employee);
  return [record.employeeId, record.userId, record.uid, record.email]
    .map(identity)
    .filter(Boolean)
    .some((value) => employeeIdentities.has(value));
}

function acceptedAtMs(record = {}) {
  const value = record.acceptedAt;
  const date = value?.toDate instanceof Function ? value.toDate() : new Date(value || 0);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

export function workingTermsStatusForEmployee(employee = {}, records = []) {
  const matches = (Array.isArray(records) ? records : [])
    .filter((record) => acceptanceMatchesEmployee(record, employee) && record.accepted === true)
    .sort((a, b) => acceptedAtMs(b) - acceptedAtMs(a));
  const current = matches.find(
    (record) => clean(record.documentVersion) === CURRENT_WORKING_TERMS_VERSION
  );

  if (current) return { key: "signed", label: "Signed", tone: "success", record: current, records: matches };
  if (matches.length) return { key: "outdated", label: "Outdated", tone: "warning", record: matches[0], records: matches };
  return { key: "unsigned", label: "Not signed", tone: "danger", record: null, records: [] };
}

export function formatWorkingTermsDate(value, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = value?.toDate instanceof Function ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
