export const DEFAULT_STATISTICS_FILTERS = Object.freeze({
  rangeMode: "12m",
  search: "",
  status: "All",
  client: "all",
  vehicle: "all",
  employee: "all",
});

export function getPreviousMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getStatisticsDateRange(rangeMode, selectedMonth, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (rangeMode === "all") return { start: null, end: null };
  if (rangeMode === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(String(selectedMonth || ""));
    if (!match) return { start: null, end: null };
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  const start = new Date(today);
  if (rangeMode === "30d") start.setDate(start.getDate() - 30);
  else if (rangeMode === "90d") start.setDate(start.getDate() - 90);
  else start.setFullYear(start.getFullYear() - 1);
  return { start, end: null };
}

const dateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function matchesStatisticsFilters(row, filters, range) {
  if (filters.status !== "All" && row.status !== filters.status) return false;
  if (filters.client !== "all" && row.client !== filters.client) return false;
  if (filters.vehicle !== "all" && !row.vehicles.includes(filters.vehicle)) return false;
  if (filters.employee !== "all" && !row.employees.includes(filters.employee)) return false;

  if (range?.start) {
    const startMs = range.start.getTime();
    const endMs = range.end?.getTime() ?? Infinity;
    const inRange = [...row.dates, row.createdAt]
      .map(dateValue)
      .filter(Boolean)
      .some((date) => date.getTime() >= startMs && date.getTime() <= endMs);
    if (!inRange) return false;
  }

  const query = String(filters.search || "").trim().toLowerCase();
  return !query || String(row.searchText || "").toLowerCase().includes(query);
}

