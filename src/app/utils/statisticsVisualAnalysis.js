const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const numberLabel = (value) => {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
};

export function parseStatisticsMonthLabel(label) {
  const match = /^([A-Za-z]{3})\s(\d{2}|\d{4})$/.exec(String(label || "").trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]);
  if (month < 0) return null;
  const year = Number(match[2].length === 2 ? `20${match[2]}` : match[2]);
  return new Date(year, month, 1);
}

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const shiftMonth = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const fullMonthLabel = (date) => date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const percentageMovement = (current, baseline) => {
  if (!Number.isFinite(baseline) || baseline === 0) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
};

const movementText = (current, baseline, baselineLabel, { exactEqual = false } = {}) => {
  if (!Number.isFinite(baseline) || baseline === 0) return `${baselineLabel} has no reliable percentage baseline`;
  const change = percentageMovement(current, baseline);
  if (exactEqual && change === 0) return `unchanged from ${baselineLabel}`;
  if (Math.abs(change) < 5) return `broadly level with ${baselineLabel}`;
  return `${Math.abs(change)}% ${change > 0 ? "above" : "below"} ${baselineLabel}`;
};

export function getStatisticsMonthPhase(label, now = new Date()) {
  const month = parseStatisticsMonthLabel(label);
  if (!month) return "unknown";
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return month < currentMonth ? "completed" : "pipeline";
}

export function buildMonthlyVisualSummary(data = [], unit = "items", valueKey = "total", now = new Date()) {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = data
    .map((row) => ({ ...row, parsedMonth: parseStatisticsMonthLabel(row.label), amount: Number(row[valueKey] || 0) }))
    .filter((row) => row.parsedMonth)
    .sort((a, b) => a.parsedMonth - b.parsedMonth);
  const completed = rows.filter((row) => row.parsedMonth < currentMonth);
  if (!completed.length) return `There are no completed-month ${unit.toLowerCase()} values in this selection yet.`;

  const valuesByMonth = new Map(rows.map((row) => [monthKey(row.parsedMonth), row.amount]));
  const target = completed[completed.length - 1];
  const previousMonth = shiftMonth(target.parsedMonth, -1);
  const previousValue = valuesByMonth.get(monthKey(previousMonth)) || 0;
  const baselineMonths = Array.from({ length: 6 }, (_, index) => shiftMonth(target.parsedMonth, index - 6));
  const baselineAverage = baselineMonths.reduce((sum, month) => sum + (valuesByMonth.get(monthKey(month)) || 0), 0) / 6;
  const priorText = movementText(target.amount, previousValue, fullMonthLabel(previousMonth), { exactEqual: true });
  const baselineText = movementText(target.amount, baselineAverage, `the preceding six-month average of ${numberLabel(baselineAverage)}`);
  const pipelineText = rows.some((row) => row.parsedMonth >= currentMonth)
    ? ` ${fullMonthLabel(currentMonth)} onward is forward pipeline and incomplete, not a forecast.`
    : "";

  return `${fullMonthLabel(target.parsedMonth)} recorded ${numberLabel(target.amount)} ${unit.toLowerCase()}, ${priorText} and ${baselineText}.${pipelineText}`;
}
