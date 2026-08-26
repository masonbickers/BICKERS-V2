"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { OperationsHeaderActions, OperationsPage, OperationsPageHeader } from "@/app/components/OperationsPage";
import { Button, MetricCard as SharedMetricCard, NavigationCard } from "@/app/components/ui";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";
import { getCompletedQuoteRows } from "@/app/utils/completedQuotes";
import { useSessionScroll, useSessionState } from "@/app/utils/useSessionState";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  FolderKanban,
  Plus,
  Receipt,
  Search,
} from "lucide-react";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { getFixedJobStatusStyle } from "@/app/utils/jobStatusColors";

/* Mini design system */
const UI = UI_TOKENS;

const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const card = {
  ...surface,
  padding: 12,
  textDecoration: "none",
  color: UI.text,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const grid = (cols = 4) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: UI.gap });

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontWeight: 800, fontSize: 17, margin: 0, color: UI.text, letterSpacing: 0 };
const cardHint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.4 };

const chip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 9px",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: UI.brandBorder,
    background: UI.brandSoft,
    color: UI.text,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  if (kind === "green") return { ...base, borderColor: UI.greenBorder, background: UI.greenSoft, color: UI.green };
  if (kind === "amber") return { ...base, borderColor: UI.amberBorder, background: UI.amberSoft, color: UI.amber };
  if (kind === "red") return { ...base, borderColor: UI.redBorder, background: UI.redSoft, color: "var(--color-danger)" };
  if (kind === "purple") return { ...base, borderColor: UI.purpleBorder, background: UI.purpleSoft, color: "var(--color-accent)" };
  return base;
};

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const inputStyle = {
  width: "100%",
  minHeight: 36,
  padding: "7px 40px 7px 34px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: 13,
  outline: "none",
  background: "var(--color-surface-raised)",
  color: UI.text,
};

const rowShell = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, .85fr) minmax(108px, .55fr) 110px",
  columnGap: 8,
  rowGap: 0,
  alignItems: "center",
  minHeight: 34,
  padding: "0 0 0 9px",
  borderTop: "1px solid var(--color-border)",
  textDecoration: "none",
  color: UI.text,
};

const jobNumberRowShell = {
  ...rowShell,
  gridTemplateColumns: "minmax(0, 1fr) minmax(130px, .7fr) 136px 110px",
};

const listShell = { width: "100%", minWidth: 0, border: UI.border, borderRadius: UI.radius, overflow: "hidden", background: "var(--color-surface)", boxSizing: "border-box" };

const focusCss = `
  input:focus, button:focus, a:focus {
    outline: none;
    box-shadow: var(--focus-ring);
    border-color: var(--color-info-border) !important;
  }
  .job-home-row:hover {
    background: var(--color-surface-hover);
  }
  @media (max-width: 1180px) {
    .job-home-main-grid,
    .job-home-top-grid,
    .job-home-stat-grid,
    .job-home-shortcut-grid,
    .job-home-groups-grid { grid-template-columns: 1fr !important; }
    .job-home-row { grid-template-columns: 1fr !important; }
    .job-home-row-status { justify-self: start !important; }
  }
  @media (max-width: 620px) {
    .job-home-workflow-grid { grid-template-columns: 1fr !important; }
  }
`;

/* Helpers */
const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const normaliseDates = (job) => {
  const arr = [];
  if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
    for (const d of job.bookingDates) {
      const pd = parseDate(d);
      if (pd) arr.push(pd);
    }
  } else if (job.date) {
    const pd = parseDate(job.date);
    if (pd) arr.push(pd);
  }
  return arr;
};

const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "-");
const getJobNumberGroup = (job) => {
  const digits = String(job.jobNumber ?? "").replace(/\D/g, "");
  return digits.length >= 2 ? digits.slice(0, 2) : "Other";
};
const getJobNumberSubgroup = (job) => {
  const digits = String(job.jobNumber ?? "").replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(0, 3) : getJobNumberGroup(job);
};
const getBaseJobNumber = (job) => {
  const match = String(job?.jobNumber ?? "").trim().match(/^\d{4}/);
  return match ? match[0] : String(job?.jobNumber ?? job?.id ?? "No Job #");
};
const isFourDigitJob = (job) => /^\d{4}(?:\.\d+)?$/.test(String(job.jobNumber ?? "").trim());

const prettifyStatus = (raw) => {
  const s = (raw || "").toLowerCase().trim();
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "bickers") return "Bickers";
  if (s === "stunt") return "Stunt";
  if (s === "maintenance") return "Maintenance";
  if (s === "dnh") return "DNH";
  if (s === "postponed") return "Postponed";
  if (s === "deleted") return "Deleted";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  return s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC";
};

const statusColors = (label) => {
  return getFixedJobStatusStyle(label);
};

const StatusBadge = ({ value, rowIndex = 0, rowCount = 1 }) => {
  const c = statusColors(value);
  const isFirst = rowIndex === 0;
  const isLast = rowIndex === rowCount - 1;
  return (
    <span
      style={{
        width: "100%",
        height: "100%",
        minHeight: 34,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 8px",
        fontSize: 11.5,
        borderRadius: `0 ${isFirst ? UI.radius : "0"} ${isLast ? UI.radius : "0"} 0`,
        border: `1px solid ${c.border}`,
        borderTopWidth: isFirst ? 1 : 0,
        marginTop: 0,
        background: c.bg,
        color: c.text,
        fontWeight: 900,
        whiteSpace: "nowrap",
        lineHeight: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {value}
    </span>
  );
};

const groupButtonStyle = (active = false) => ({
  minHeight: 30,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  padding: "4px 7px",
  borderRadius: UI.radiusSm,
  border: active ? "1px solid var(--color-border-strong)" : UI.border,
  background: active ? "var(--color-selection-surface)" : "var(--color-surface-raised)",
  color: UI.text,
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 14,
  boxShadow: active ? "none" : UI.shadowSm,
});

const norm = (s = "") => String(s).toLowerCase().trim();
const jobMatchesSearch = (job, term) => {
  const s = norm(term);
  if (!s) return true;
  return (
    String(job.jobNumber || "").toLowerCase().includes(s) ||
    String(job.client || "").toLowerCase().includes(s) ||
    String(job.location || "").toLowerCase().includes(s) ||
    String(job.notes || "").toLowerCase().includes(s)
  );
};

const readyToInvoiceFlag = (j) => /ready\s*to\s*invoice/.test(norm(j.status)) || !!j.readyToInvoice;
const isInvoicedFlag = (j) => {
  const s = norm(j.status);
  const inv = norm(j.invoiceStatus);
  return s === "invoiced" || inv.includes("invoiced") || !!j?.finance?.invoicedAt;
};
const isPaidFlag = (j) => {
  const s = norm(j.status);
  const inv = norm(j.invoiceStatus);
  return s === "paid" || s === "settled" || inv.includes("paid") || !!j?.finance?.paidAt;
};
const hasWorkBeforeToday = (j, todayMidnight) => {
  const ds = normaliseDates(j).sort((a, b) => a - b);
  if (!ds.length) return false;
  const last = new Date(ds[ds.length - 1]);
  last.setHours(0, 0, 0, 0);
  return last.getTime() < todayMidnight.getTime();
};

const CONFIRMED_LIKE = new Set([
  "confirmed",
  "pending",
  "complete",
  "completed",
  "action required",
  "action_required",
  "invoiced",
  "ready to invoice",
  "ready_to_invoice",
  "ready-to-invoice",
  "readyinvoice",
  "paid",
  "settled",
]);

const classify = (job, todayMidnight) => {
  const status = norm(job.status);
  if (/ready\s*to\s*invoice/.test(status)) return "Ready to Invoice";
  if (status === "paid" || status === "settled") return "Paid";
  if (status.includes("action")) return "Needs Action";
  if (status.includes("enquiry") || status.includes("inquiry")) return "Enquiries";

  const ds = normaliseDates(job);
  if (!ds.length) return "Upcoming";

  const anyFutureOrToday = ds.some((d) => {
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    return dd.getTime() >= todayMidnight.getTime();
  });
  if (anyFutureOrToday) return "Upcoming";

  const confirmedFlag = job.confirmed === true || job.isConfirmed === true;
  if (confirmedFlag || CONFIRMED_LIKE.has(status)) return "Complete Jobs";
  return "Passed - Not Confirmed";
};

/* Page */
export default function JobHomePage() {
  const router = useRouter();
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useSessionState("job-home:search", "");
  const [selectedJobGroup, setSelectedJobGroup] = useSessionState("job-home:selectedJobGroup", "All");
  const [expandedJobGroups, setExpandedJobGroups] = useSessionState("job-home:expandedJobGroups", {});
  const searchRef = useRef(null);
  useSessionScroll("job-home", !loading);

  useEffect(() => {
    if (!authState?.user) return undefined;
    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", authState), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, authState]);

  const jobs = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  const grouped = useMemo(() => {
    const g = {
      Upcoming: 0,
      "Complete Jobs": 0,
      "Passed - Not Confirmed": 0,
      "Ready to Invoice": 0,
      Paid: 0,
      "Needs Action": 0,
      Enquiries: 0,
    };
    for (const j of jobs) {
      const key = classify(j, todayMidnight);
      g[key] = (g[key] || 0) + 1;
    }
    return g;
  }, [jobs, todayMidnight]);

  const total = jobs.length;

  const reviewQueueCount = useMemo(() => {
    return jobs.filter((j) => {
      const s = norm(j.status);
      const past = hasWorkBeforeToday(j, todayMidnight);
      return s === "confirmed" && past && !readyToInvoiceFlag(j) && !isPaidFlag(j);
    }).length;
  }, [jobs, todayMidnight]);

  const financeReadyCount = useMemo(() => {
    return jobs.filter((j) => readyToInvoiceFlag(j) && !isPaidFlag(j)).length;
  }, [jobs]);

  const invoicedCount = useMemo(() => {
    return jobs.filter((j) => isInvoicedFlag(j) && !isPaidFlag(j)).length;
  }, [jobs]);

  const paidCount = useMemo(() => jobs.filter(isPaidFlag).length, [jobs]);

  const completedQuoteRows = useMemo(() => getCompletedQuoteRows(jobs), [jobs]);

  const jobNumberGroups = useMemo(() => {
    const map = new Map();
    for (const job of jobs) {
      const group = getJobNumberGroup(job);
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(job);
    }
    return Array.from(map.entries())
      .map(([group, items]) => {
        const sortedItems = items.sort((a, b) => Number(a.jobNumber || 0) - Number(b.jobNumber || 0));
        const subMap = new Map();
        for (const job of sortedItems) {
          const subgroup = getJobNumberSubgroup(job);
          if (!subMap.has(subgroup)) subMap.set(subgroup, []);
          subMap.get(subgroup).push(job);
        }
        const subgroups = Array.from(subMap.entries())
          .map(([subgroup, subgroupItems]) => ({ subgroup, items: subgroupItems }))
          .sort((a, b) => {
            if (a.subgroup === "Other") return 1;
            if (b.subgroup === "Other") return -1;
            return Number(a.subgroup) - Number(b.subgroup);
          });
        return { group, items: sortedItems, subgroups };
      })
      .sort((a, b) => {
        if (a.group === "Other") return 1;
        if (b.group === "Other") return -1;
        return Number(b.group) - Number(a.group);
      });
  }, [jobs]);

  const searchTerm = search.trim();

  const searchResultJobs = useMemo(() => {
    if (!searchTerm) return [];
    return jobs
      .filter((job) => jobMatchesSearch(job, searchTerm))
      .sort((a, b) => Number(a.jobNumber || 0) - Number(b.jobNumber || 0));
  }, [jobs, searchTerm]);

  const searchGroupMatches = useMemo(() => {
    const groupSet = new Set();
    const subgroupSet = new Set();
    searchResultJobs.forEach((job) => {
      groupSet.add(getJobNumberGroup(job));
      subgroupSet.add(getJobNumberSubgroup(job));
    });
    return { groupSet, subgroupSet };
  }, [searchResultJobs]);

  useEffect(() => {
    if (!searchTerm || !searchResultJobs.length) return;
    setExpandedJobGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      searchResultJobs.forEach((job) => {
        const group = getJobNumberGroup(job);
        if (!next[group]) {
          next[group] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [searchResultJobs, searchTerm, setExpandedJobGroups]);

  useEffect(() => {
    if (loading) return;
    if (selectedJobGroup === "All") return;
    const hasGroup = jobNumberGroups.some(
      (item) => item.group === selectedJobGroup || item.subgroups.some((sub) => sub.subgroup === selectedJobGroup)
    );
    if (!hasGroup) setSelectedJobGroup("All");
  }, [jobNumberGroups, loading, selectedJobGroup, setSelectedJobGroup]);

  const selectedGroupJobs = useMemo(() => {
    if (searchTerm) return searchResultJobs;
    if (selectedJobGroup === "All") {
      return jobs
        .slice()
        .sort((a, b) => Number(b.jobNumber || 0) - Number(a.jobNumber || 0))
        .slice(0, 10);
    }
    const parentGroup = jobNumberGroups.find((item) => item.group === selectedJobGroup);
    if (parentGroup) return parentGroup.items;
    return jobNumberGroups.flatMap((item) => item.subgroups).find((item) => item.subgroup === selectedJobGroup)?.items || [];
  }, [jobNumberGroups, jobs, searchResultJobs, searchTerm, selectedJobGroup]);

  const selectedJobNumberRows = useMemo(() => {
    const map = new Map();
    selectedGroupJobs.forEach((job) => {
      const jobNumber = getBaseJobNumber(job);
      if (!map.has(jobNumber)) map.set(jobNumber, []);
      map.get(jobNumber).push(job);
    });

    const rows = Array.from(map.entries())
      .map(([jobNumber, groupedJobs]) => {
        const sortedJobs = groupedJobs.slice().sort((a, b) => {
          const aDate = normaliseDates(a).sort((x, y) => +y - +x)[0]?.getTime() || 0;
          const bDate = normaliseDates(b).sort((x, y) => +y - +x)[0]?.getTime() || 0;
          return bDate - aDate;
        });
        const primary = sortedJobs[0] || groupedJobs[0];
        const allDates = groupedJobs.flatMap((job) => normaliseDates(job)).sort((a, b) => +a - +b);
        const statuses = Array.from(new Set(groupedJobs.map((job) => prettifyStatus(job.status || "")).filter(Boolean)));
        const bookingCounts = groupedJobs.reduce(
          (acc, job) => {
            const status = prettifyStatus(job.status || "");
            if (status === "First Pencil") acc.firstPencil += 1;
            if (status === "Second Pencil") acc.secondPencil += 1;
            if (status === "Confirmed") acc.confirmed += 1;
            if (status === "Complete") acc.complete += 1;
            if (status === "DNH" || status === "Cancelled" || status === "Postponed") acc.notHappening += 1;
            return acc;
          },
          { firstPencil: 0, secondPencil: 0, confirmed: 0, complete: 0, notHappening: 0 }
        );
        const completeOrInactiveOnly =
          bookingCounts.complete > 0 &&
          bookingCounts.firstPencil === 0 &&
          bookingCounts.secondPencil === 0 &&
          bookingCounts.confirmed === 0 &&
          bookingCounts.complete + bookingCounts.notHappening === groupedJobs.length;
        return {
          id: jobNumber,
          jobNumber,
          href: `/job-numbers/${encodeURIComponent(jobNumber)}`,
          client: primary?.client || "-",
          location: primary?.location || "-",
          dates: allDates,
          status: completeOrInactiveOnly ? "Complete" : statuses.length === 1 ? statuses[0] : `${groupedJobs.length} bookings`,
          count: groupedJobs.length,
          bookingCounts,
        };
      })
      .sort((a, b) => Number(a.jobNumber || 0) - Number(b.jobNumber || 0));

    if (searchTerm || !/^\d{3}$/.test(String(selectedJobGroup))) return rows;

    const rowsByJobNumber = new Map(rows.map((row) => [String(row.jobNumber), row]));
    return Array.from({ length: 10 }, (_, index) => {
      const jobNumber = `${selectedJobGroup}${index}`;
      return (
        rowsByJobNumber.get(jobNumber) || {
          id: `missing-${jobNumber}`,
          jobNumber,
          client: "",
          location: "",
          dates: [],
          status: "Missing",
          count: 0,
          bookingCounts: { firstPencil: 0, secondPencil: 0, confirmed: 0, complete: 0, notHappening: 0 },
          isMissingJobNumber: true,
        }
      );
    });
  }, [searchTerm, selectedGroupJobs, selectedJobGroup]);

  const jobNumberRow = (j, rowIndex = 0, rowCount = 1) => {
    if (j.isMissingJobNumber) {
      return (
        <div
          key={j.id}
          className="job-home-row"
          style={{
            ...jobNumberRowShell,
            color: UI.text,
          }}
        >
          <div className={layoutStyles.extracted2}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                minWidth: 52,
                fontWeight: 900,
                color: UI.text,
                whiteSpace: "nowrap",
              }}
            >
              #{j.jobNumber}
            </span>
            <span aria-hidden="true" />
          </div>
          <div className={layoutStyles.extracted3}>
            <Link
              href={`/create-enquiry?jobNumber=${encodeURIComponent(j.jobNumber)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                height: 24,
                padding: "0 8px",
                borderRadius: 6,
                border: UI.border,
                background: "var(--color-surface)",
                color: UI.brand,
                fontSize: 12,
                fontWeight: 900,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
              title={`Add enquiry for job #${j.jobNumber}`}
            >
              <Plus size={13} />
              Add enquiry
            </Link>
          </div>
          <div aria-hidden="true" />
          <div
            className={`job-home-row-status ${layoutStyles.extracted4}`}

          >
            <StatusBadge value="Missing" rowIndex={rowIndex} rowCount={rowCount} />
          </div>
        </div>
      );
    }

    const ds = Array.isArray(j.dates) ? j.dates : normaliseDates(j).sort((a, b) => a.getTime() - b.getTime());
    const first = ds[0] ?? null;
    const last = ds[ds.length - 1] ?? null;
    const label = first && last ? `${fmtShort(first)} to ${fmtShort(last)}` : first ? fmtShort(first) : "TBC";
    const pretty = prettifyStatus(j.status || "");
    return (
      <Link key={j.id} href={j.href || `/job-numbers/${j.id}`} className="job-home-row" style={jobNumberRowShell}>
        <div className={layoutStyles.extracted5}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minWidth: 52,
              fontWeight: 900,
              color: UI.text,
              whiteSpace: "nowrap",
            }}
          >
            #{j.jobNumber || j.id}
          </span>
          <span className={layoutStyles.extracted6}>
            {j.client || "-"}
            {j.count > 1 ? <span style={{ color: UI.muted, fontWeight: 900 }}> ({j.count})</span> : null}
          </span>
        </div>
        <div
          style={{
            color: UI.text,
            fontSize: 12,
            fontWeight: 800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title="First Pencil / Confirmed / Complete / DNH-Cancelled-Postponed"
        >
          FP {j.bookingCounts?.firstPencil || 0} · Confirmed {j.bookingCounts?.confirmed || 0} · Complete{" "}
          {j.bookingCounts?.complete || 0} · D/C/P {j.bookingCounts?.notHappening || 0}
        </div>
        <div className={layoutStyles.extracted7}>{label}</div>
        <div
          className={`job-home-row-status ${layoutStyles.extracted8}`}

        >
          <StatusBadge value={pretty} rowIndex={rowIndex} rowCount={rowCount} />
        </div>
      </Link>
    );
  };

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <OperationsPage>
        <OperationsPageHeader
          title="Jobs Sheets"
          subtitle="Track live work from enquiry through completion and finance handoff."
          actions={<OperationsHeaderActions>
            <Button as={Link} href="/create-booking">
              <Plus size={14} />
              New Booking
            </Button>
            <Button as={Link} href="/create-enquiry" variant="secondary">
              <FileText size={14} />
              New Enquiry
            </Button>
            <div style={chip()}>
              <BriefcaseBusiness size={13} /> {loading ? "Loading..." : `${total} jobs`}
            </div>
          </OperationsHeaderActions>}
        />

        <div className={`job-home-top-grid ${layoutStyles.overviewGrid}`}>
          <div className={layoutStyles.overviewMain}>
            <div className="job-home-stat-grid" style={grid(4)}>
              <SharedMetricCard
                label="Upcoming"
                value={grouped.Upcoming ?? 0}
                icon={<CalendarDays size={19} />}
                tone="info"
                hint="Scheduled work"
                onClick={() => router.push("/job-sheet?section=Upcoming")}
              />
              <SharedMetricCard
                label="Review Queue"
                value={reviewQueueCount}
                icon={<ClipboardList size={19} />}
                tone="info"
                hint="Awaiting checks"
                onClick={() => router.push("/review-queue")}
              />
              <SharedMetricCard
                label="Ready to Invoice"
                value={financeReadyCount}
                icon={<Receipt size={19} />}
                tone="success"
                hint="Prepared for finance"
                onClick={() => router.push("/finance-queue")}
              />
              <SharedMetricCard
                label="Needs Action"
                value={grouped["Needs Action"] ?? 0}
                icon={<AlertTriangle size={19} />}
                tone={(grouped["Needs Action"] ?? 0) > 0 ? "danger" : "success"}
                hint="Requires attention"
                onClick={() => router.push("/job-sheet?section=Needs%20Action")}
              />
            </div>

            <section className={layoutStyles.workspacePanel}>
              <div className={layoutStyles.workspaceHeading}>
                <div>
                  <h3 style={{ ...titleMd, fontSize: 15 }}>Job workspaces</h3>
                  <div style={cardHint}>Open the queue or finance stage you need to work in.</div>
                </div>
              </div>
              <div className={layoutStyles.workspaceGrid}>
                <NavigationCard icon={<Clock3 size={20} strokeWidth={2.2} />} title="Open Enquiries" description="View enquiry jobs." badges={[{ label: String(grouped.Enquiries ?? 0), tone: "warning" }]} onClick={() => router.push("/enquiry")} />
                <NavigationCard icon={<ClipboardList size={20} strokeWidth={2.2} />} title="Review Queue" description="Complete checks and handoff." badges={[{ label: String(reviewQueueCount), tone: "info" }]} onClick={() => router.push("/review-queue")} />
                <NavigationCard icon={<Receipt size={20} strokeWidth={2.2} />} title="Ready to Invoice" description="Price and prepare invoices." badges={[{ label: String(financeReadyCount), tone: "success" }]} onClick={() => router.push("/finance-queue")} />
                <NavigationCard icon={<FileText size={20} strokeWidth={2.2} />} title="Completed Quotes" description="Review saved booking quotes." badges={[{ label: String(completedQuoteRows.length), tone: "success" }]} onClick={() => router.push("/completed-quotes")} />
                <NavigationCard icon={<Receipt size={20} strokeWidth={2.2} />} title="Invoiced" description="View issued invoices." badges={[{ label: String(invoicedCount), tone: "neutral" }]} onClick={() => router.push("/invoiced")} />
                <NavigationCard icon={<Receipt size={20} strokeWidth={2.2} />} title="Paid" description="View settled work." badges={[{ label: String(paidCount), tone: "success" }]} onClick={() => router.push("/paid")} />
              </div>
            </section>
          </div>

        </div>

        <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: UI.gap }}>
          <section className={layoutStyles.searchPanel} style={{ marginBottom: 0, borderBottom: UI.border }}>
            <div className={layoutStyles.searchHeading}>
              <span style={{ ...iconBox(UI.brand, UI.brandSoft, UI.brandBorder), width: 30, height: 30 }}>
                <Search size={15} />
              </span>
              <div>
                <h2 style={{ ...titleMd, fontSize: 15 }}>Find a job</h2>
                <div style={cardHint}>Search job number, production, customer or location.</div>
              </div>
            </div>
            <div className={layoutStyles.searchControl}>
              <Search size={15} className={layoutStyles.searchIcon} aria-hidden />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search jobs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...inputStyle, minHeight: 36 }}
                aria-label="Search jobs"
              />
            </div>
          </section>

          <div
            className={`job-home-groups-grid ${layoutStyles.extracted33}`}
          >
            <section className={layoutStyles.jobGroupsSidebar}>
              <div className={layoutStyles.extracted24}>
                <div className={layoutStyles.extracted25}>
                  <span style={{ ...iconBox(UI.brand, UI.brandSoft, UI.brandBorder), width: 28, height: 28 }}>
                    <FolderKanban size={15} />
                  </span>
                  <div>
                  <h2 style={{ ...titleMd, fontSize: 16 }}>Job Number Groups</h2>
                </div>
              </div>
              <span style={chip()}>{jobNumberGroups.length}</span>
            </div>
            <div className={layoutStyles.extracted26}>
              <button
                type="button"
                onClick={() => setSelectedJobGroup("All")}
                style={groupButtonStyle(selectedJobGroup === "All")}
              >
                <span className={layoutStyles.extracted27}>
                  <span>All</span>
                </span>
                <span style={chip(selectedJobGroup === "All" ? "green" : "neutral")}>{jobs.length}</span>
              </button>
              {jobNumberGroups.map(({ group, items, subgroups }) => {
                const hasSearchMatch = searchGroupMatches.groupSet.has(group);
                const isExpanded = !!expandedJobGroups[group] || (searchTerm && hasSearchMatch);
                const hasSubgroups = subgroups.length > 0;
                return (
                  <div key={group} className={layoutStyles.extracted28}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJobGroup(group);
                        if (hasSubgroups) setExpandedJobGroups((prev) => ({ ...prev, [group]: !prev[group] }));
                      }}
                      style={groupButtonStyle(selectedJobGroup === group || (searchTerm && hasSearchMatch))}
                    >
                      <span className={layoutStyles.extracted29}>
                        {hasSubgroups ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                        <span>{group === "Other" ? group : `${group}00`}</span>
                      </span>
                      <span style={chip(selectedJobGroup === group ? "green" : "neutral")}>{items.length}</span>
                    </button>

                    {isExpanded && (
                      <div className={layoutStyles.extracted30}>
                        {subgroups.map(({ subgroup, items: subgroupItems }) => (
                          <button
                            key={subgroup}
                            type="button"
                            onClick={() => setSelectedJobGroup(subgroup)}
                            style={{
                              ...groupButtonStyle(selectedJobGroup === subgroup || (searchTerm && searchGroupMatches.subgroupSet.has(subgroup))),
                              minHeight: 28,
                              fontSize: 13.5,
                              padding: "3px 7px",
                              boxShadow: "none",
                              justifyContent: "center",
                            }}
                          >
                            <span className={layoutStyles.extracted31}>
                              <span>{subgroup === "Other" ? subgroup : `${subgroup}0`}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </section>

            <PipelinePanel
              title={searchTerm ? "Job Number Search" : selectedJobGroup === "All" ? "Latest Job Numbers" : `Job Numbers ${selectedJobGroup}`}
              hintText=""
              href="/job-sheet"
              linkText="Job sheet"
              loading={loading}
              emptyText={searchTerm ? "No jobs match your search." : "No jobs in this group."}
              rows={selectedJobNumberRows}
              renderRow={jobNumberRow}
              icon={FolderKanban}
              compact
              embedded
            />
          </div>
        </div>

      </OperationsPage>
    </HeaderSidebarLayout>
  );
}

function PipelinePanel({
  title,
  hintText,
  href,
  linkText,
  loading,
  emptyText,
  rows,
  renderRow,
  icon: Icon,
  color = UI.brand,
  bg = UI.brandSoft,
  border = UI.brandBorder,
  compact = false,
  embedded = false,
}) {
  return (
    <section
      style={{
        ...(embedded ? {} : card),
        minWidth: 0,
        minHeight: compact ? 0 : 200,
        padding: compact ? 9 : card.padding,
      }}
    >
      <div style={{ ...sectionHeader, marginBottom: compact ? 6 : sectionHeader.marginBottom }}>
        <div style={{ display: "flex", gap: compact ? 8 : 10, minWidth: 0, alignItems: "center" }}>
          <span style={{ ...iconBox(color, bg, border), width: compact ? 28 : 34, height: compact ? 28 : 34 }}>
            <Icon size={17} />
          </span>
          <div>
            <h2 style={titleMd}>{title}</h2>
            {hintText ? <div style={{ ...cardHint, marginTop: compact ? 2 : 5 }}>{hintText}</div> : null}
          </div>
        </div>
        <Link
          href={href}
          style={{
            ...chip(),
            ...(compact ? { width: 92, height: 28, justifyContent: "center", borderRadius: 6, padding: "0 8px" } : {}),
            color: UI.brand,
            textDecoration: "none",
          }}
        >
          {linkText} <ChevronRight size={13} />
        </Link>
      </div>
      <div style={listShell}>
        {loading ? (
          <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Loading...</div>
        ) : rows.length ? (
          rows.map((row, index) => renderRow(row, index, rows.length))
        ) : (
          <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>{emptyText}</div>
        )}
      </div>
    </section>
  );
}
