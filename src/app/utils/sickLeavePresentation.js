const dateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function sickLeaveDateMs(value) {
  return dateValue(value)?.getTime() || 0;
}

export function formatSickLeaveDate(value) {
  const date = dateValue(value);
  if (!date) return "Date not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function sickLeavePaymentStatus(notes) {
  const value = String(notes || "");
  if (/\bunpaid\b/i.test(value)) return "Unpaid";
  if (/\bpaid\b/i.test(value)) return "Paid";
  return "";
}

export function sickLeaveNoteText(notes) {
  const value = String(notes || "").trim();
  return /^(paid|unpaid)$/i.test(value) ? "" : value;
}

export function employeeInitials(name) {
  const parts = String(name || "Unknown")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "?")
    .toUpperCase();
}

export function buildSickLeaveDisplayRows(records = [], employees = [], options = {}) {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const term = String(options.search || "").trim().toLowerCase();
  const direction = options.sort === "oldest" ? 1 : -1;

  return records
    .map((record) => ({
      record,
      employee: employeesById.get(record.employeeId) || null,
    }))
    .filter(({ record, employee }) => {
      if (!term) return true;
      return [
        employee?.name,
        employee?.email,
        record.reason,
        record.notes,
        formatSickLeaveDate(record.startDate),
        formatSickLeaveDate(record.endDate),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    })
    .sort((a, b) => {
      const byStart = sickLeaveDateMs(a.record.startDate) - sickLeaveDateMs(b.record.startDate);
      if (byStart) return byStart * direction;
      const byEnd = sickLeaveDateMs(a.record.endDate) - sickLeaveDateMs(b.record.endDate);
      if (byEnd) return byEnd * direction;
      return String(a.record.id || "").localeCompare(String(b.record.id || ""));
    });
}

export function summarizeSickLeaveRows(rows = []) {
  const employeeIds = new Set();
  let totalDays = 0;
  rows.forEach(({ record, employee }) => {
    employeeIds.add(record.employeeId || employee?.id || "unknown");
    totalDays += Math.max(0, Number(record.days) || 0);
  });
  return { people: employeeIds.size, totalDays };
}
