"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Receipt,
  Search,
} from "lucide-react";

/* Mini design system */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  green: "#15803d",
  greenSoft: "#ecfdf3",
  greenBorder: "#bbf7d0",
  amber: "#b45309",
  amberSoft: "#fffbeb",
  amberBorder: "#fde68a",
  red: "#b91c1c",
  redSoft: "#fff1f2",
  redBorder: "#fecdd3",
  purple: "#7c3aed",
  purpleSoft: "#f5f3ff",
  purpleBorder: "#ddd6fe",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const card = {
  ...surface,
  padding: 12,
  textDecoration: "none",
  color: UI.text,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: UI.brandBorder };
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
const cardTitle = { fontWeight: 800, fontSize: 15, margin: 0, color: UI.text, letterSpacing: 0 };
const cardHint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.4 };

const chip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 9px",
    borderRadius: 999,
    border: `1px solid ${UI.brandBorder}`,
    background: UI.brandSoft,
    color: UI.text,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  if (kind === "green") return { ...base, borderColor: UI.greenBorder, background: UI.greenSoft, color: UI.green };
  if (kind === "amber") return { ...base, borderColor: UI.amberBorder, background: UI.amberSoft, color: UI.amber };
  if (kind === "red") return { ...base, borderColor: UI.redBorder, background: UI.redSoft, color: UI.red };
  if (kind === "purple") return { ...base, borderColor: UI.purpleBorder, background: UI.purpleSoft, color: UI.purple };
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

const statCard = {
  ...card,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minHeight: 82,
};

const statLabel = {
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
};

const statValue = {
  color: UI.text,
  fontSize: 25,
  lineHeight: 1.1,
  fontWeight: 850,
  marginTop: 8,
};

const inputStyle = {
  width: "100%",
  minHeight: 36,
  padding: "7px 40px 7px 34px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: 13,
  outline: "none",
  background: "#fff",
  color: UI.text,
};

const rowShell = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 1fr) 140px 140px auto",
  gap: 8,
  padding: "9px 10px",
  borderTop: "1px solid #edf2f7",
  textDecoration: "none",
  color: UI.text,
};

const listShell = { border: UI.border, borderRadius: UI.radius, overflow: "hidden", background: "#fff" };

const focusCss = `
  input:focus, button:focus, a:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
  @media (max-width: 1180px) {
    .job-home-main-grid,
    .job-home-stat-grid,
    .job-home-shortcut-grid,
    .job-home-pipeline-grid { grid-template-columns: 1fr !important; }
    .job-home-row { grid-template-columns: 1fr !important; }
    .job-home-row-status { justify-self: start !important; }
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
const getJobPrefix = (job) => (job.jobNumber ? String(job.jobNumber).split("-")[0] : "No Job #");
const isFourDigitJob = (job) => /^\d{4}$/.test(String(job.jobNumber ?? "").trim());

const prettifyStatus = (raw) => {
  const s = (raw || "").toLowerCase().trim();
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  return s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC";
};

const statusColors = (label) => {
  switch (label) {
    case "Ready to Invoice":
      return { bg: "#fef3c7", border: "#fde68a", text: "#92400e" };
    case "Invoiced":
      return { bg: "#e0e7ff", border: "#c7d2fe", text: "#3730a3" };
    case "Paid":
      return { bg: "#d1fae5", border: "#86efac", text: "#065f46" };
    case "Action Required":
      return { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" };
    case "Complete":
      return { bg: "#dbeafe", border: "#bfdbfe", text: "#1e3a8a" };
    case "Confirmed":
      return { bg: "#fffd98", border: "#c7d134", text: "#504c1a" };
    case "First Pencil":
      return { bg: "#e0f2fe", border: "#bae6fd", text: "#075985" };
    case "Second Pencil":
      return { bg: "#fee2e2", border: "#fecaca", text: "#7f1d1d" };
    case "TBC":
      return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };
    default:
      return { bg: "#e5e7eb", border: "#d1d5db", text: "#111827" };
  }
};

const StatusBadge = ({ value }) => {
  const c = statusColors(value);
  return (
    <span
      style={{
        padding: "5px 9px",
        fontSize: 11.5,
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
};

function MetricCard({ label, value, icon: Icon, color, bg, border }) {
  return (
    <section style={statCard}>
      <div>
        <div style={statLabel}>{label}</div>
        <div style={statValue}>{value}</div>
      </div>
      <span style={iconBox(color, bg, border)}>
        <Icon size={17} />
      </span>
    </section>
  );
}

const norm = (s = "") => String(s).toLowerCase().trim();

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
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const jobs = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  const weekWindow = useMemo(() => {
    const now = new Date(todayMidnight);
    const day = now.getDay();
    const monday = new Date(now);
    const diff = (day === 0 ? -6 : 1) - day;
    monday.setDate(now.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  }, [todayMidnight]);

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
      const completeish = s === "confirmed" || s === "complete" || s === "completed";
      const past = hasWorkBeforeToday(j, todayMidnight);
      return !isPaidFlag(j) && (readyToInvoiceFlag(j) || (completeish && past));
    }).length;
  }, [jobs, todayMidnight]);

  const financeReadyCount = useMemo(() => {
    return jobs.filter((j) => readyToInvoiceFlag(j) && !isPaidFlag(j)).length;
  }, [jobs]);

  const invoicedCount = useMemo(() => {
    return jobs.filter((j) => isInvoicedFlag(j) && !isPaidFlag(j)).length;
  }, [jobs]);

  const paidCount = useMemo(() => jobs.filter(isPaidFlag).length, [jobs]);

  const cancelledCount = useMemo(
    () => jobs.filter((j) => /cancel(l)?ed/i.test(String(j.status || ""))).length,
    [jobs]
  );

  const overdueCount = useMemo(() => {
    const thresholdDays = 30;
    const now = Date.now();
    const getMillis = (v) => {
      if (!v) return null;
      if (typeof v?.toDate === "function") return v.toDate().getTime();
      if (typeof v === "object" && "seconds" in v) return v.seconds * 1000;
      const t = new Date(v).getTime();
      return isNaN(t) ? null : t;
    };
    return jobs.filter((j) => {
      if (!(isInvoicedFlag(j) && !isPaidFlag(j))) return false;
      const ts =
        getMillis(j?.finance?.invoicedAt) ??
        getMillis(j?.invoicedAt) ??
        getMillis(j?.updatedAt) ??
        null;
      if (!ts) return false;
      const ageDays = (now - ts) / 86400000;
      return ageDays > thresholdDays;
    }).length;
  }, [jobs]);

  const upcomingThisWeek = useMemo(() => {
    const inWeek = (d) => d >= weekWindow.monday && d <= weekWindow.sunday;
    return jobs
      .filter((j) => normaliseDates(j).some(inWeek))
      .sort((a, b) => {
        const fa = normaliseDates(a).sort((x, y) => +x - +y)[0]?.getTime() ?? Infinity;
        const fb = normaliseDates(b).sort((x, y) => +x - +y)[0]?.getTime() ?? Infinity;
        return fa - fb;
      })
      .slice(0, 8);
  }, [jobs, weekWindow]);

  const reviewQueuePreview = useMemo(() => {
    return jobs
      .filter((j) => {
        const s = norm(j.status);
        const completeish = s === "confirmed" || s === "complete" || s === "completed";
        const past = hasWorkBeforeToday(j, todayMidnight);
        return !isPaidFlag(j) && (readyToInvoiceFlag(j) || (completeish && past));
      })
      .slice(0, 8);
  }, [jobs, todayMidnight]);

  const financeQueuePreview = useMemo(
    () => jobs.filter((j) => readyToInvoiceFlag(j) && !isPaidFlag(j)).slice(0, 8),
    [jobs]
  );

  const recent = useMemo(() => {
    const withLast = jobs
      .map((j) => {
        const ds = normaliseDates(j).sort((a, b) => +a - +b);
        return { j, last: ds[ds.length - 1] || null };
      })
      .sort((a, b) => (b.last?.getTime() || 0) - (a.last?.getTime() || 0))
      .slice(0, 8)
      .map((x) => x.j);
    return withLast;
  }, [jobs]);

  const navCard = (href, title, subtitle, pill, Icon = BriefcaseBusiness, color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => (
    <Link
      href={href}
      style={card}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, card)}
    >
      <div style={sectionHeader}>
        <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
          <span style={iconBox(color, bg, border)}>
            <Icon size={17} />
          </span>
          <div>
            <div style={cardTitle}>{title}</div>
            <div style={cardHint}>{subtitle}</div>
          </div>
        </div>
        <span style={chip()}>{pill}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", color: UI.brand, marginTop: 8 }}>
        <ChevronRight size={17} />
      </div>
    </Link>
  );

  const jobRow = (j) => {
    const ds = normaliseDates(j).sort((a, b) => a.getTime() - b.getTime());
    const first = ds[0] ?? null;
    const last = ds[ds.length - 1] ?? null;
    const prefix = getJobPrefix(j);
    const label = first && last ? `${fmtShort(first)} to ${fmtShort(last)}` : first ? fmtShort(first) : "TBC";
    const pretty = prettifyStatus(j.status || "");
    return (
      <Link key={j.id} href={`/job-numbers/${j.id}`} className="job-home-row" style={rowShell}>
        <div style={{ display: "flex", gap: 8, minWidth: 0, alignItems: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 28,
              height: 21,
              padding: "0 6px",
              borderRadius: 8,
              background: UI.brandSoft,
              border: `1px solid ${UI.brandBorder}`,
              fontWeight: 900,
              fontSize: 11,
              color: UI.brand,
            }}
          >
            {prefix}
          </span>
          <span style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            #{j.jobNumber || j.id} - {j.client || "-"}
          </span>
        </div>
        <div style={{ color: UI.muted, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {j.location || "-"}
        </div>
        <div style={{ fontSize: 13 }}>{label}</div>
        <div className="job-home-row-status" style={{ justifySelf: "end" }}>
          <StatusBadge value={pretty} />
        </div>
      </Link>
    );
  };

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Jobs Home</h1>
            <div style={sub}>Job progress, review queues and invoice readiness.</div>
          </div>
          <div style={chip()}>
            <BriefcaseBusiness size={13} /> {loading ? "Loading..." : `${total} jobs`}
          </div>
        </div>

        <div className="job-home-stat-grid" style={{ ...grid(4), marginBottom: UI.gap }}>
          <MetricCard
            label="Upcoming"
            value={grouped.Upcoming ?? 0}
            icon={CalendarDays}
            color={UI.brand}
            bg={UI.brandSoft}
            border={UI.brandBorder}
          />
          <MetricCard
            label="Review Queue"
            value={reviewQueueCount}
            icon={ClipboardList}
            color={UI.purple}
            bg={UI.purpleSoft}
            border={UI.purpleBorder}
          />
          <MetricCard
            label="Ready to Invoice"
            value={financeReadyCount}
            icon={Receipt}
            color={UI.green}
            bg={UI.greenSoft}
            border={UI.greenBorder}
          />
          <MetricCard
            label="Needs Action"
            value={grouped["Needs Action"] ?? 0}
            icon={AlertTriangle}
            color={UI.red}
            bg={UI.redSoft}
            border={UI.redBorder}
          />
        </div>

        <div className="job-home-main-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 1fr)", gap: UI.gap, marginBottom: UI.gap }}>
          <section style={card}>
            <div style={sectionHeader}>
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <span style={iconBox(UI.brand, UI.brandSoft, UI.brandBorder)}>
                  <Search size={17} />
                </span>
                <div>
                  <h2 style={titleMd}>Quick Search</h2>
                  <div style={cardHint}>Search by job number, client, location or notes.</div>
                </div>
              </div>
              <span style={chip()}>Search</span>
            </div>

            <div style={{ position: "relative" }}>
              <Search size={17} style={{ position: "absolute", left: 10, top: 9, color: UI.muted }} aria-hidden />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search by job #, client, location or notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={inputStyle}
                aria-label="Search jobs"
              />
            </div>

            {!!search && (
              <div style={{ ...listShell, marginTop: 8 }}>
                {jobs
                  .filter((job) => {
                    const s = search.toLowerCase().trim();
                    return (
                      String(job.jobNumber || "").toLowerCase().includes(s) ||
                      String(job.client || "").toLowerCase().includes(s) ||
                      String(job.location || "").toLowerCase().includes(s) ||
                      String(job.notes || "").toLowerCase().includes(s)
                    );
                  })
                  .slice(0, 6)
                  .map(jobRow)}
              </div>
            )}
          </section>

          <section style={card}>
            <div style={sectionHeader}>
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}>
                  <CheckCircle2 size={17} />
                </span>
                <div>
                  <h2 style={titleMd}>At a Glance</h2>
                  <div style={cardHint}>Current work and finance state.</div>
                </div>
              </div>
              <span style={chip("green")}>Summary</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <MiniStat label="Upcoming" value={grouped.Upcoming ?? 0} />
              <MiniStat label="Review Queue" value={reviewQueueCount} />
              <MiniStat label="Ready to Invoice" value={financeReadyCount} />
              <MiniStat label="Needs Action" value={grouped["Needs Action"] ?? 0} />
            </div>
          </section>
        </div>

        <section style={{ marginBottom: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Shortcuts</h2>
              <div style={cardHint}>Jump straight into the stage you need.</div>
            </div>
            <span style={chip("purple")}>Workflow</span>
          </div>

          <div className="job-home-shortcut-grid" style={grid(4)}>
            {navCard("/review-queue", "Review Queue", "Fill notes / PO / invoice details", `${reviewQueueCount}`, ClipboardList, UI.purple, UI.purpleSoft, UI.purpleBorder)}
            {navCard("/finance-queue", "Ready to Invoice", "Price it and send quote/invoice", `${financeReadyCount}`, Receipt, UI.green, UI.greenSoft, UI.greenBorder)}
            {navCard("/invoiced", "Invoiced", "Invoiced, awaiting payment", `${invoicedCount}`, FileText, UI.brand, UI.brandSoft, UI.brandBorder)}
            {navCard("/paid", "Paid", "Jobs marked as paid", `${paidCount}`, CheckCircle2, UI.green, UI.greenSoft, UI.greenBorder)}
          </div>

          <div className="job-home-shortcut-grid" style={{ ...grid(4), marginTop: UI.gap }}>
            {navCard("/job-sheet?section=Upcoming", "Upcoming", "Pending / future dates", `${grouped.Upcoming ?? 0}`, CalendarDays)}
            {navCard("/job-sheet?section=Cancelled", "Cancelled", "Cancelled bookings", `${cancelledCount}`, AlertTriangle, UI.red, UI.redSoft, UI.redBorder)}
            {navCard("/job-sheet?section=Needs%20Action", "Needs Action", "Jobs requiring attention", `${grouped["Needs Action"] ?? 0}`, AlertTriangle, UI.red, UI.redSoft, UI.redBorder)}
            {navCard("/job-sheet?section=Overdue", "Overdue Payments", ">30 days since invoice, not paid", `${overdueCount}`, Clock3, UI.amber, UI.amberSoft, UI.amberBorder)}
          </div>
        </section>

        <div className="job-home-pipeline-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap }}>
          <PipelinePanel
            title="Upcoming This Week"
            hintText="Jobs scheduled within the current week window."
            href="/job-sheet?section=Upcoming"
            linkText="View all"
            loading={loading}
            emptyText="Nothing scheduled this week."
            rows={upcomingThisWeek}
            renderRow={jobRow}
            icon={CalendarDays}
          />
          <PipelinePanel
            title="Review Queue"
            hintText="Jobs ready for review actions and completion checks."
            href="/review-queue"
            linkText="Open queue"
            loading={loading}
            emptyText="No jobs to review."
            rows={reviewQueuePreview}
            renderRow={jobRow}
            icon={ClipboardList}
            color={UI.purple}
            bg={UI.purpleSoft}
            border={UI.purpleBorder}
          />
          <PipelinePanel
            title="Ready to Invoice"
            hintText="Jobs prepared for pricing and invoice issue."
            href="/finance-queue"
            linkText="Open queue"
            loading={loading}
            emptyText="Nothing awaiting pricing."
            rows={financeQueuePreview}
            renderRow={jobRow}
            icon={Receipt}
            color={UI.green}
            bg={UI.greenSoft}
            border={UI.greenBorder}
          />
          <PipelinePanel
            title="Recent Jobs"
            hintText="Latest booked and completed work in the system."
            href="/job-sheet"
            linkText="Job sheet"
            loading={loading}
            emptyText="No recent jobs."
            rows={recent}
            renderRow={jobRow}
            icon={BriefcaseBusiness}
          />
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ ...surface, padding: 10, boxShadow: "none" }}>
      <div style={statLabel}>{label}</div>
      <div style={{ ...statValue, fontSize: 22 }}>{value}</div>
    </div>
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
}) {
  return (
    <section style={{ ...card, minHeight: 200 }}>
      <div style={sectionHeader}>
        <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
          <span style={iconBox(color, bg, border)}>
            <Icon size={17} />
          </span>
          <div>
            <h2 style={titleMd}>{title}</h2>
            <div style={cardHint}>{hintText}</div>
          </div>
        </div>
        <Link href={href} style={{ ...chip(), color: UI.brand, textDecoration: "none" }}>
          {linkText} <ChevronRight size={13} />
        </Link>
      </div>
      <div style={listShell}>
        {loading ? (
          <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Loading...</div>
        ) : rows.length ? (
          rows.map(renderRow)
        ) : (
          <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>{emptyText}</div>
        )}
      </div>
    </section>
  );
}
