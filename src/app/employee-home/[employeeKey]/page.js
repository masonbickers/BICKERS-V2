"use client";

import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getDocs } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  MetricCard,
  Page,
  PageHeader,
  Section,
  Skeleton,
  Table,
  TableContainer,
  Tabs,
} from "@/app/components/ui";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { ArrowLeft, BriefcaseBusiness, CalendarDays, Coins, LayoutList } from "lucide-react";

const BREAKDOWN_COLUMNS = [
  { key: "onSet", label: "On Set" },
  { key: "travel", label: "Travel" },
  { key: "halfTravel", label: "1/2 Travel" },
  { key: "yard", label: "Yard / Rig" },
  { key: "standby", label: "Standby" },
  { key: "turnaround", label: "Turnaround" },
  { key: "rest", label: "Rest" },
  { key: "nightShoot", label: "Night Shoot" },
  { key: "rehearsal", label: "Rehearsal" },
  { key: "recce", label: "Recce" },
  { key: "splitDay", label: "Split Day" },
  { key: "holidayPaid", label: "Holiday Paid" },
  { key: "holidayUnpaid", label: "Holiday Unpaid" },
  { key: "other", label: "Other" },
];

function parseYyyyMmDd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [Y, M, D] = String(s).split("-").map((n) => +n);
  return new Date(Date.UTC(Y, M - 1, D));
}

function formatYyyyMmDd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function dayNameUTC(yyyyMmDd) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const index = dayOfWeekUTC(yyyyMmDd);
  return index == null ? "" : names[index] || "";
}

function formatDisplayDate(yyyyMmDd, options = {}) {
  const date = parseYyyyMmDd(yyyyMmDd);
  if (!date) return yyyyMmDd || "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: options.year === false ? undefined : "numeric",
  }).format(date);
}

function isDateInRange(yyyyMmDd, from, to) {
  const safe = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+safe)) return false;
  const d = new Date(Date.UTC(safe.getUTCFullYear(), safe.getUTCMonth(), safe.getUTCDate()));
  const F = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const T = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  return d >= F && d <= T;
}

function startOfTodayUTC() {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

function dayOfWeekUTC(yyyyMmDd) {
  const d = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+d)) return null;
  return d.getUTCDay();
}

function isSunday(yyyyMmDd) {
  return dayOfWeekUTC(yyyyMmDd) === 0;
}

function isSaturday(yyyyMmDd) {
  return dayOfWeekUTC(yyyyMmDd) === 6;
}

function normaliseName(n) {
  return String(n || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function employeesKey(employee) {
  return `${employee?.role || ""}::${employee?.name || ""}`;
}

function isCreditBookingStatus(status) {
  return ["confirmed", "complete", "completed", "stunt"].includes(String(status || "").trim().toLowerCase());
}

function dedupeEmployees(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((employee) => {
    if (!employee?.name && !employee?.id) return;
    const key = employee.id || employeesKey(employee);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(employee);
  });
  return out;
}

function employeeListForBookingDate(booking, dayKey, fallbackEmployees) {
  const dated = booking?.employeesByDate?.[dayKey];
  if (Array.isArray(dated) && dated.length) return dedupeEmployees(dated);
  return fallbackEmployees;
}

function titleCase(n) {
  return String(n || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getNoteForDate(booking, dayKey) {
  let v =
    (booking && booking.notesByDate && booking.notesByDate[dayKey]) ??
    (booking && booking.dayNotes && booking.dayNotes[dayKey]) ??
    (booking && booking.dailyNotes && booking.dailyNotes[dayKey]) ??
    (booking && booking.notesForEachDay && booking.notesForEachDay[dayKey]);

  if (v && typeof v === "object") {
    v = v.note ?? v.text ?? v.value ?? v.label ?? v.name ?? "";
  }
  if (v) return v;

  if (
    Array.isArray(booking && booking.bookingDates) &&
    Array.isArray(booking && booking.bookingNotes) &&
    booking.bookingNotes.length === booking.bookingDates.length
  ) {
    const idx = booking.bookingDates.findIndex((d) => d === dayKey);
    if (idx >= 0) return booking.bookingNotes[idx];
  }
  return null;
}

function creditForNote(rawNote) {
  if (!rawNote) return 1;

  const norm = String(rawNote).trim().toLowerCase().replace(/\s+/g, " ");

  if (norm.includes("night shoot")) return 1;
  if (norm.includes("split day") || norm.includes("spilt day")) return 1;
  if (norm.includes("turnaround")) return 1;
  if (norm === "1/2 day travel" || norm === "1/2 day travel day") return 0.5;
  if (norm === "travel time") return 0.25;
  if (norm === "rest day") return 0;
  if (norm === "other") return 0;

  return 1;
}

function creditForBookingDay(note, dayKey) {
  let credit = creditForNote(note);
  const normNote = String(note || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (normNote === "on set" && (isSaturday(dayKey) || isSunday(dayKey))) {
    credit = isSunday(dayKey) ? credit * 2 : credit + 0.5;
  }
  return Number(credit.toFixed(2));
}

function creditRuleForBookingDay(note, dayKey) {
  const normNote = String(note || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (normNote === "on set" && isSunday(dayKey)) return "Sunday On Set x2";
  if (normNote === "on set" && isSaturday(dayKey)) return "Saturday On Set +0.5";
  if (normNote.includes("night shoot")) return "Night Shoot + turnaround";
  if (normNote === "travel time") return "Travel Time";
  if (normNote === "1/2 day travel" || normNote === "1/2 day travel day") return "Half Travel";
  if (normNote === "rest day" || normNote === "other") return "No credit";
  return "Standard";
}

function employeeMatches(emp, employeeKey, employeeName) {
  const routeKey = String(employeeKey || "");
  const routeName = normaliseName(employeeName);
  return String(emp.id || "") === routeKey || normaliseName(emp.name) === normaliseName(routeKey) || normaliseName(emp.name) === routeName;
}

function classifyNote(rawNote) {
  const norm = String(rawNote || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return { key: "onSet", label: "On Set", priority: 50 };
  if (norm === "on set" || norm === "shoot day") return { key: "onSet", label: "On Set", priority: 50 };
  if (norm === "travel day" || norm === "travel time") return { key: "travel", label: "Travel", priority: 40 };
  if (norm === "1/2 day travel" || norm === "1/2 day travel day" || norm === "half day travel") {
    return { key: "halfTravel", label: "1/2 Travel", priority: 35 };
  }
  if (norm === "rig day") return { key: "yard", label: "Yard / Rig", priority: 34 };
  if (norm === "standby day") return { key: "standby", label: "Standby", priority: 33 };
  if (norm.includes("turnaround")) return { key: "turnaround", label: "Turnaround", priority: 32 };
  if (norm === "rest day") return { key: "rest", label: "Rest", priority: 10 };
  if (norm.includes("night shoot")) return { key: "nightShoot", label: "Night Shoot", priority: 45 };
  if (norm.includes("split day") || norm.includes("spilt day")) return { key: "splitDay", label: "Split Day", priority: 30 };
  if (norm === "rehearsal day") return { key: "rehearsal", label: "Rehearsal", priority: 28 };
  if (norm === "recce day") return { key: "recce", label: "Recce", priority: 27 };
  return { key: "other", label: titleCase(norm), priority: 20 };
}

function eachDateYMD(startRaw, endRaw) {
  const start = parseYyyyMmDd(String(startRaw || "").slice(0, 10)) || parseYyyyMmDd(startRaw);
  const end = parseYyyyMmDd(String(endRaw || "").slice(0, 10)) || parseYyyyMmDd(endRaw || startRaw);
  if (!start || !end) return [];
  const out = [];
  let cur = new Date(start);
  const endDt = new Date(end);
  while (cur <= endDt) {
    out.push(formatYyyyMmDd(cur));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

export default function EmployeeWorkBreakdownPage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const employeeKey = decodeURIComponent(String(params?.employeeKey || ""));
  const employeeName = searchParams.get("name") || employeeKey;

  const [mode, setMode] = useState(searchParams.get("mode") || "lastNDays");
  const [rangeDays, setRangeDays] = useState(Number(searchParams.get("rangeDays") || 30));
  const [fromDate, setFromDate] = useState(searchParams.get("fromDate") || "");
  const [toDate, setToDate] = useState(searchParams.get("toDate") || "");
  const [loading, setLoading] = useState(true);
  const [dayRows, setDayRows] = useState([]);
  const [jobCreditRows, setJobCreditRows] = useState([]);

  const effectiveRange = useMemo(() => {
    const today0 = startOfTodayUTC();
    const end = new Date(today0);
    end.setUTCDate(end.getUTCDate() - 1);

    if (mode === "lastNDays") {
      const start = new Date(end);
      start.setUTCDate(end.getUTCDate() - (Math.max(1, rangeDays) - 1));
      return { since: start, until: end };
    }

    const f = parseYyyyMmDd(fromDate) ?? end;
    const t = parseYyyyMmDd(toDate) ?? end;
    const until = new Date(Math.min(+t, +end));
    const since = new Date(Math.min(+f, +until));
    return { since, until };
  }, [mode, rangeDays, fromDate, toDate]);

  const todayISO = (() => {
    const t = startOfTodayUTC();
    t.setUTCDate(t.getUTCDate() - 1);
    return formatYyyyMmDd(t);
  })();

  useEffect(() => {
    let live = true;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load employee work breakdown" });
      setDayRows([]);
      setJobCreditRows([]);
      setLoading(false);
      return undefined;
    }

    (async () => {
      setLoading(true);
      try {
        const [bookingsSnap, holidaysSnap] = await Promise.all([
          getDocs(tenantCollectionQuery(db, "bookings", dataAccessState)),
          getDocs(tenantCollectionQuery(db, "holidays", dataAccessState)),
        ]);

        const byDate = new Map();
        const jobCredits = new Map();
        const putRow = (dateKey, next) => {
          const prev = byDate.get(dateKey);
          if (!prev || (next.priority || 0) > (prev.priority || 0)) {
            byDate.set(dateKey, next);
          }
        };

        bookingsSnap.forEach((docSnap) => {
          const booking = docSnap.data() || {};
          const status = String(booking.status || "").trim();
          if (!isCreditBookingStatus(status)) return;

          const employeeListRaw = booking.employees || [];
          const employees = employeeListRaw
            .map((e) => {
              if (typeof e === "string") return { id: null, name: e, role: "Precision Driver" };
              return {
                id: e && e.id ? e.id : null,
                name: (e && (e.name || e.fullName)) || "",
                role: (e && e.role) || "",
              };
            })
            .filter((e) => (e.id || e.name)?.trim())
            .filter((e) => {
              const role = String(e.role || "").trim().toLowerCase();
              return role !== "freelancer" && role !== "freelance";
            });

          const noteKeys = Object.keys(booking.notesByDate || {});
          const dateSet = new Set(noteKeys.filter((d) => isDateInRange(d, effectiveRange.since, effectiveRange.until)));
          if (Array.isArray(booking.bookingDates)) {
            booking.bookingDates.forEach((d) => {
              if (isDateInRange(d, effectiveRange.since, effectiveRange.until)) dateSet.add(d);
            });
          }

          for (const dayKey of dateSet) {
            const dayEmployees = employeeListForBookingDate(booking, dayKey, employees)
              .filter((e) => {
                const role = String(e.role || "").trim().toLowerCase();
                return role !== "freelancer" && role !== "freelance";
              });
            const matchesEmployee = dayEmployees.some((emp) => employeeMatches(emp, employeeKey, employeeName));
            if (!matchesEmployee) continue;

            const note = getNoteForDate(booking, dayKey);
            const category = classifyNote(note);
            const dayCredit = creditForBookingDay(note, dayKey);
            const bookingKey = docSnap.id;
            const bookingLabel = booking.jobNumber
              ? `#${booking.jobNumber}${booking.client ? ` - ${booking.client}` : ""}`
              : booking.client || "Booking";

            if (!jobCredits.has(bookingKey)) {
              jobCredits.set(bookingKey, {
                key: bookingKey,
                bookingLabel,
                status,
                dayCredits: [],
                turnaroundCredit: 0,
              });
            }
            const jobRow = jobCredits.get(bookingKey);
            jobRow.dayCredits.push({
              date: dayKey,
              dayName: dayNameUTC(dayKey),
              note: note || "On Set",
              credit: dayCredit,
              rule: creditRuleForBookingDay(note, dayKey),
            });
            if (String(note || "").trim().toLowerCase().replace(/\s+/g, " ").includes("night shoot")) {
              jobRow.turnaroundCredit = 1;
            }

            putRow(dayKey, {
              date: dayKey,
              typeKey: category.key,
              typeLabel: category.label,
              source: "booking",
              bookingLabel,
              note: note || "On Set",
              credit: dayCredit,
              creditRule: creditRuleForBookingDay(note, dayKey),
              priority: category.priority,
            });
          }
        });

        holidaysSnap.forEach((docSnap) => {
          const holiday = docSnap.data() || {};
          const employeeMatch = normaliseName(holiday.employee) === normaliseName(employeeName);
          if (!employeeMatch) return;
          const status = String(holiday.status || "").toLowerCase();
          if (holiday.deleted === true || holiday.isDeleted === true || status === "deleted") return;

          const paidLabel = String(holiday.paidStatus || holiday.leaveType || "").trim();
          const isUnpaid = paidLabel.toLowerCase() === "unpaid";
          const holidayTypeKey = isUnpaid ? "holidayUnpaid" : "holidayPaid";
          const holidayTypeLabel = isUnpaid ? "Holiday - Unpaid" : "Holiday - Paid";

          eachDateYMD(holiday.startDate, holiday.endDate).forEach((dayKey) => {
            if (!isDateInRange(dayKey, effectiveRange.since, effectiveRange.until)) return;
            putRow(dayKey, {
              date: dayKey,
              typeKey: holidayTypeKey,
              typeLabel: holidayTypeLabel,
              source: "holiday",
              bookingLabel: "Holiday",
              note: paidLabel || holidayTypeLabel,
              priority: 100,
            });
          });
        });

        const finalRows = [];
        let cursor = new Date(effectiveRange.since);
        const end = new Date(effectiveRange.until);
        while (cursor <= end) {
          const dayKey = formatYyyyMmDd(cursor);
          const existing = byDate.get(dayKey);
          if (existing) {
            finalRows.push(existing);
          } else {
            const dayOfWeek = cursor.getUTCDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              finalRows.push({
                date: dayKey,
                typeKey: "yard",
                typeLabel: "Yard / Base",
                source: "default",
                bookingLabel: "Base Day",
                note: "Default weekday yard/base day",
                priority: 5,
              });
            } else {
              finalRows.push({
                date: dayKey,
                typeKey: "other",
                typeLabel: "Weekend / Off",
                source: "default",
                bookingLabel: "Off",
                note: "No booking or holiday",
                priority: 0,
              });
            }
          }
          cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        }

        const creditClaims = [];
        Array.from(jobCredits.values()).forEach((row) => {
          row.dayCredits.forEach((item) => {
            creditClaims.push({
              jobKey: row.key,
              bookingLabel: row.bookingLabel,
              date: item.date,
              credit: Number(item.credit || 0),
            });
          });
        });

        const appliedClaimKeys = new Set();
        const claimsByDate = new Map();
        creditClaims.forEach((claim) => {
          if (!claimsByDate.has(claim.date)) claimsByDate.set(claim.date, []);
          claimsByDate.get(claim.date).push(claim);
        });
        claimsByDate.forEach((claims, date) => {
          const [winner] = claims.sort(
            (a, b) => b.credit - a.credit || a.bookingLabel.localeCompare(b.bookingLabel)
          );
          if (winner && winner.credit > 0) appliedClaimKeys.add(`${winner.jobKey}|${date}`);
        });

        const finalJobCredits = Array.from(jobCredits.values())
          .map((row) => {
            const sortedDays = [...row.dayCredits]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((item) => ({
                ...item,
                appliedCredit: appliedClaimKeys.has(`${row.key}|${item.date}`) ? Number(item.credit || 0) : 0,
              }));
            const dayTotal = sortedDays.reduce((sum, item) => sum + Number(item.appliedCredit || 0), 0);
            const total = dayTotal + Number(row.turnaroundCredit || 0);
            return {
              ...row,
              dayCredits: sortedDays,
              dayTotal: Number(dayTotal.toFixed(2)),
              total: Number(total.toFixed(2)),
            };
          })
          .sort((a, b) => {
            const ad = a.dayCredits[0]?.date || "";
            const bd = b.dayCredits[0]?.date || "";
            return ad.localeCompare(bd) || a.bookingLabel.localeCompare(b.bookingLabel);
          });

        if (live) {
          setDayRows(finalRows);
          setJobCreditRows(finalJobCredits);
        }
      } catch (err) {
        console.error("Error loading employee work breakdown:", err);
        if (live) {
          setDayRows([]);
          setJobCreditRows([]);
        }
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [accessKey, dataAccessState, employeeKey, employeeName, effectiveRange]);

  const summary = useMemo(() => {
    const totals = Object.fromEntries(BREAKDOWN_COLUMNS.map((col) => [col.key, 0]));
    dayRows.forEach((row) => {
      if (Object.prototype.hasOwnProperty.call(totals, row.typeKey)) totals[row.typeKey] += 1;
    });
    return totals;
  }, [dayRows]);

  const totalJobCredits = useMemo(
    () => Number(jobCreditRows.reduce((sum, row) => sum + Number(row.total || 0), 0).toFixed(2)),
    [jobCreditRows]
  );

  const bookedDays = useMemo(
    () => dayRows.filter((row) => row.source === "booking").length,
    [dayRows]
  );

  const rangeLabel = `${formatDisplayDate(formatYyyyMmDd(effectiveRange.since))} – ${formatDisplayDate(formatYyyyMmDd(effectiveRange.until))}`;

  return (
    <HeaderSidebarLayout showBackButton={false}>
      <Page width="fluid" className={layoutStyles.page}>
        <PageHeader
          title={titleCase(employeeName)}
          subtitle={`Work activity, job credits and daily detail for ${rangeLabel}.`}
          actions={(
            <Button variant="secondary" onClick={() => router.push("/employee-home")}>
              <ArrowLeft size={16} aria-hidden="true" />
              Employee home
            </Button>
          )}
        />

        <div className={layoutStyles.overviewGrid}>
          <MetricCard label="Reporting days" value={loading ? "—" : dayRows.length} hint={rangeLabel} icon={<CalendarDays size={20} />} tone="info" />
          <MetricCard label="Booked days" value={loading ? "—" : bookedDays} hint="Days linked to bookings" icon={<LayoutList size={20} />} tone="success" />
          <MetricCard label="Jobs" value={loading ? "—" : jobCreditRows.length} hint="Jobs with credit activity" icon={<BriefcaseBusiness size={20} />} />
          <MetricCard label="Total credits" value={loading ? "—" : totalJobCredits} hint="Applied credits in this range" icon={<Coins size={20} />} tone="info" />
        </div>

        <Section
          title="Reporting window"
          description="Choose a preset period or enter exact dates. Results update automatically."
          actions={<Badge variant="info">{rangeLabel}</Badge>}
          className={layoutStyles.controlSection}
        >
          <div className={layoutStyles.controlPanel}>
            <Tabs
              label="Reporting window type"
              value={mode}
              onChange={setMode}
              items={[
                { value: "lastNDays", label: "Recent days" },
                { value: "customRange", label: "Custom dates" },
              ]}
            />

            {mode === "lastNDays" ? (
              <div className={layoutStyles.rangeControls}>
                <label className={layoutStyles.field}>
                  <span>Number of days</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={rangeDays}
                    onChange={(event) => setRangeDays(Math.max(1, Math.min(365, Number(event.target.value) || 30)))}
                  />
                </label>
                <div className={layoutStyles.presets} aria-label="Quick date ranges">
                  {[30, 60, 90].map((days) => (
                    <Button
                      key={days}
                      variant={rangeDays === days ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setRangeDays(days)}
                    >
                      {days} days
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={layoutStyles.dateControls}>
                <label className={layoutStyles.field}>
                  <span>From</span>
                  <Input type="date" max={todayISO} value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
                </label>
                <label className={layoutStyles.field}>
                  <span>To</span>
                  <Input type="date" max={todayISO} value={toDate} onChange={(event) => setToDate(event.target.value)} />
                </label>
              </div>
            )}
          </div>
        </Section>

        <Section title="Activity summary" description="Days by work type. Zero-value categories are de-emphasised for faster scanning.">
          <div className={layoutStyles.summaryGrid}>
            {BREAKDOWN_COLUMNS.map((column) => {
              const value = summary[column.key] || 0;
              return (
                <div key={column.key} className={layoutStyles.summaryCard} data-has-value={value > 0}>
                  <span>{column.label}</span>
                  <strong>{loading ? "—" : value}</strong>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="Credits by job"
          description="Claimed and applied credits are grouped by work day to avoid duplicate date columns."
          actions={<Badge variant="info">{totalJobCredits} total credits</Badge>}
        >
          {loading ? (
            <div className={layoutStyles.loadingPanel} aria-label="Loading job credits">
              <Skeleton height={48} />
              <Skeleton height={72} />
              <Skeleton height={72} />
            </div>
          ) : jobCreditRows.length === 0 ? (
            <EmptyState title="No job credits" description="There are no job credits for this employee in the selected reporting window." />
          ) : (
            <TableContainer>
              <Table className={layoutStyles.creditsTable}>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Work days and credit rules</th>
                    <th>Night turnaround</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {jobCreditRows.map((row) => (
                    <tr key={row.key}>
                      <td className={layoutStyles.jobName}>{row.bookingLabel}</td>
                      <td>
                        <Badge variant={String(row.status).toLowerCase().startsWith("complete") ? "success" : "info"}>
                          {row.status || "Unknown"}
                        </Badge>
                      </td>
                      <td>
                        <div className={layoutStyles.workDays}>
                          {row.dayCredits.map((item) => (
                            <div className={layoutStyles.workDay} key={`${row.key}-${item.date}`}>
                              <div className={layoutStyles.workDate}>
                                <strong>{formatDisplayDate(item.date)}</strong>
                                <span>{item.dayName}</span>
                              </div>
                              <div className={layoutStyles.workDetail}>
                                <strong>{item.note}</strong>
                                <span>{item.rule}</span>
                              </div>
                              <div className={layoutStyles.creditValues}>
                                <span>Claimed {item.credit}</span>
                                <strong>Applied {item.appliedCredit}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className={layoutStyles.numberCell}>{row.turnaroundCredit || 0}</td>
                      <td className={layoutStyles.totalCell}>{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </Section>

        <Section
          title="Day-by-day detail"
          description="Weekdays without a booking or holiday are recorded as yard/base days."
          actions={<Badge>{dayRows.length} days</Badge>}
        >
          {loading ? (
            <div className={layoutStyles.loadingPanel} aria-label="Loading daily breakdown">
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={48} />
            </div>
          ) : dayRows.length === 0 ? (
            <EmptyState title="No daily activity" description="No activity was found in the selected reporting window." />
          ) : (
            <TableContainer>
              <Table className={layoutStyles.dailyTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Job / context</th>
                    <th>Note and credit rule</th>
                    <th>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((row) => (
                    <tr key={row.date}>
                      <td className={layoutStyles.dateCell}>
                        <strong>{formatDisplayDate(row.date)}</strong>
                        <span>{dayNameUTC(row.date) || "-"}</span>
                      </td>
                      <td className={layoutStyles.typeCell}>{row.typeLabel}</td>
                      <td>
                        <Badge variant={row.source === "holiday" ? "warning" : row.source === "booking" ? "info" : "neutral"}>
                          {titleCase(row.source)}
                        </Badge>
                      </td>
                      <td className={layoutStyles.contextCell}>{row.bookingLabel}</td>
                      <td className={layoutStyles.noteCell}>
                        <strong>{row.note}</strong>
                        <span>{row.creditRule || "No credit rule"}</span>
                      </td>
                      <td className={layoutStyles.totalCell}>{typeof row.credit === "number" ? row.credit : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </Section>
      </Page>
    </HeaderSidebarLayout>
  );
}
