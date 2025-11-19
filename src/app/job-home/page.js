"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f1f5f9", color: UI.text, fontSize: 12, fontWeight: 700 };
const grid = (cols = 4) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: UI.gap });
const card = { ...surface, padding: 16, transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease" };
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: "#dbeafe" };

/* ───────────────────────────────────────────
   Helpers
─────────────────────────────────────────── */
const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate(); // Firestore Timestamp
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

const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");
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
    case "Ready to Invoice": return { bg: "#fef3c7", border: "#fde68a", text: "#92400e" };
    case "Invoiced": return { bg: "#e0e7ff", border: "#c7d2fe", text: "#3730a3" };
    case "Paid": return { bg: "#d1fae5", border: "#86efac", text: "#065f46" };
    case "Action Required": return { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" };
    case "Complete": return { bg: "#dbeafe", border: "#bfdbfe", text: "#1e3a8a" };
    case "Confirmed": return { bg: "#fffd98", border: "#c7d134", text: "#504c1a" };
    case "First Pencil": return { bg: "#e0f2fe", border: "#bae6fd", text: "#075985" };
    case "Second Pencil": return { bg: "#fee2e2", border: "#fecaca", text: "#7f1d1d" };
    case "TBC": return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };
    default: return { bg: "#e5e7eb", border: "#d1d5db", text: "#111827" };
  }
};

const StatusBadge = ({ value }) => {
  const c = statusColors(value);
  return (
    <span
      style={{
        padding: "6px 10px",
        fontSize: 11,
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

/* Canonical predicates so pills == destination pages */
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

/* Classification for "Upcoming" & others on the page */
const CONFIRMED_LIKE = new Set([
  "confirmed", "pending", "complete", "completed", "action required",
  "action_required", "invoiced", "ready to invoice", "ready_to_invoice",
  "ready-to-invoice", "readyinvoice", "paid", "settled",
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
  return "Passed — Not Confirmed";
};

/* ───────────────────────────────────────────
   Page
─────────────────────────────────────────── */
export default function JobHomePage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  // Live bookings
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 4-digit jobs only
  const jobs = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  const weekWindow = useMemo(() => {
    const now = new Date(todayMidnight);
    const day = now.getDay(); // 0 Sun … 6 Sat
    const monday = new Date(now);
    const diff = (day === 0 ? -6 : 1) - day;
    monday.setDate(now.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  }, [todayMidnight]);

  /* ---------- Grouped counts for dashboard ---------- */
  const grouped = useMemo(() => {
    const g = {
      Upcoming: 0,
      "Complete Jobs": 0,
      "Passed — Not Confirmed": 0,
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

  /* ---------- Canonical counts (pills) ---------- */
  // Review Queue: (complete/confirmed & past) OR ready-to-invoice, not paid
  const reviewQueueCount = useMemo(() => {
    return jobs.filter((j) => {
      const s = norm(j.status);
      const completeish = s === "confirmed" || s === "complete" || s === "completed";
      const past = hasWorkBeforeToday(j, todayMidnight);
      return !isPaidFlag(j) && (readyToInvoiceFlag(j) || (completeish && past));
    }).length;
  }, [jobs, todayMidnight]);

  // Ready to Quote (finance-queue): ONLY explicit ready-to-invoice, not paid
  const financeReadyCount = useMemo(() => {
    return jobs.filter((j) => readyToInvoiceFlag(j) && !isPaidFlag(j)).length;
  }, [jobs]);

  // Invoiced (awaiting payment)
  const invoicedCount = useMemo(() => {
    return jobs.filter((j) => isInvoicedFlag(j) && !isPaidFlag(j)).length;
  }, [jobs]);

  // Paid
  const paidCount = useMemo(() => jobs.filter(isPaidFlag).length, [jobs]);

  // Cancelled
  const cancelledCount = useMemo(
    () => jobs.filter((j) => /cancel(l)?ed/i.test(String(j.status || ""))).length,
    [jobs]
  );

  // Overdue (>30 days since invoice, not paid)
  const overdueCount = useMemo(() => {
    const THRESHOLD_DAYS = 30;
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
      return ageDays > THRESHOLD_DAYS;
    }).length;
  }, [jobs]);

  /* ---------- Preview arrays (for panels) ---------- */
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

  /* ---------- UI helpers ---------- */
  const navCard = (href, title, subtitle, pill) => (
    <Link
      href={href}
      style={card}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, card)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        <span style={{ ...chip }}>{pill}</span>
      </div>
      <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{subtitle}</div>
      <div style={{ marginTop: 10, fontWeight: 800, color: UI.brand }}>Open →</div>
    </Link>
  );

  const jobRow = (j) => {
    const ds = normaliseDates(j).sort((a, b) => a.getTime() - b.getTime());
    const first = ds[0] ?? null;
    const last = ds[ds.length - 1] ?? null;
    const prefix = getJobPrefix(j);
    const label = first && last ? `${fmtShort(first)} – ${fmtShort(last)}` : first ? fmtShort(first) : "TBC";
    const pretty = prettifyStatus(j.status || "");
    return (
      <Link
        key={j.id}
        href={`/job-numbers/${j.id}`}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(120px,1fr) 140px 140px auto",
          gap: 8,
          padding: "10px 12px",
          borderTop: "1px solid #f1f5f9",
          textDecoration: "none",
          color: UI.text,
        }}
      >
        <div style={{ display: "flex", gap: 8, minWidth: 0, alignItems: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 28,
              height: 22,
              padding: "0 6px",
              borderRadius: 8,
              background: "#eef2ff",
              border: "1px solid #e5e7eb",
              fontWeight: 900,
              fontSize: 11.5,
              color: "#3730a3",
            }}
          >
            {prefix}
          </span>
          <span style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            #{j.jobNumber || j.id} • {j.client || "—"}
          </span>
        </div>
        <div style={{ color: UI.muted, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {j.location || "—"}
        </div>
        <div style={{ fontSize: 13 }}>{label}</div>
        <div style={{ justifySelf: "end" }}>
          <StatusBadge value={pretty} />
        </div>
      </Link>
    );
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Jobs Home</h1>
            <div style={sub}>
              Confirm → Work → <strong>Friday Review</strong> (fill notes/PO/invoice details) → <strong>Finance</strong> invoices.
            </div>
          </div>
          <div style={{ ...chip }}>{loading ? "Loading…" : `${total} jobs`}</div>
        </div>

        {/* Search + Quick Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          {/* Search */}
          <div style={{ ...surface, padding: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Quick Search</div>
            <div style={{ position: "relative" }}>
              <svg viewBox="0 0 24 24" fill="none" style={{ position: "absolute", left: 10, top: 10, width: 18, height: 18, opacity: 0.6 }} aria-hidden>
                <path d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search by job #, client, location, or notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 42px 10px 36px",
                  borderRadius: UI.radiusSm,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  outline: "none",
                  background: "#fff",
                }}
                aria-label="Search jobs"
              />
            </div>

            {!!search && (
              <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
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
          </div>

          {/* Quick stats */}
          <div style={{ ...surface, padding: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>At a glance</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
              <div style={{ ...card, padding: 12 }}>
                <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Upcoming</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{grouped["Upcoming"] ?? 0}</div>
              </div>
              <div style={{ ...card, padding: 12 }}>
                <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Review Queue</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{reviewQueueCount}</div>
              </div>
              <div style={{ ...card, padding: 12 }}>
                <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Ready to Quote</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{financeReadyCount}</div>
              </div>
              <div style={{ ...card, padding: 12 }}>
                <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Needs Action</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{grouped["Needs Action"] ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Shortcuts (two rows) */}
        <div style={{ marginBottom: UI.gap }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Shortcuts</div>
            <div style={{ color: UI.muted, fontSize: 12 }}>Jump straight into the stage you need</div>
          </div>

          {/* Row 1: Review Queue, Ready to Quote, Invoiced, Paid */}
          <div style={grid(4)}>
            {navCard("/review-queue", "Review Queue", "Fill Notes • PO • Invoice details", `${reviewQueueCount}`)}
            {navCard("/finance-queue", "Ready to Quote", "Price it & send quote/invoice", `${financeReadyCount}`)}
            {navCard("/invoiced", "Invoiced", "Invoiced, awaiting payment", `${invoicedCount}`)}
            {navCard("/paid", "Paid", "Jobs marked as paid", `${paidCount}`)}
          </div>

          {/* Row 2: Upcoming, Cancelled, Needs Action, Overdue */}
          <div style={{ ...grid(4), marginTop: UI.gap }}>
            {navCard("/job-sheet?section=Upcoming", "Upcoming", "Pending / future dates", `${grouped["Upcoming"] ?? 0}`)}
            {navCard("/job-sheet?section=Cancelled", "Cancelled", "Cancelled bookings", `${cancelledCount}`)}
            {navCard("/job-sheet?section=Needs%20Action", "Needs Action", "Jobs requiring attention", `${grouped["Needs Action"] ?? 0}`)}
            {navCard("/job-sheet?section=Overdue", "Overdue Payments", ">30 days since invoice, not paid", `${overdueCount}`)}
          </div>
        </div>

        {/* Pipelines */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap }}>
          {/* Upcoming this week */}
          <div style={{ ...surface, padding: 14, minHeight: 200 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Upcoming this week</div>
              <Link href="/job-sheet?section=Upcoming" style={{ fontSize: 13, fontWeight: 800, color: UI.brand, textDecoration: "none" }}>
                View all →
              </Link>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Loading…</div>
              ) : upcomingThisWeek.length ? (
                upcomingThisWeek.map(jobRow)
              ) : (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Nothing scheduled this week.</div>
              )}
            </div>
          </div>

          {/* Review queue preview */}
          <div style={{ ...surface, padding: 14, minHeight: 200 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Review queue</div>
              <Link href="/review-queue" style={{ fontSize: 13, fontWeight: 800, color: UI.brand, textDecoration: "none" }}>
                Open queue →
              </Link>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Loading…</div>
              ) : reviewQueuePreview.length ? (
                reviewQueuePreview.map(jobRow)
              ) : (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>No jobs to review.</div>
              )}
            </div>
          </div>

          {/* Finance queue preview */}
          <div style={{ ...surface, padding: 14, minHeight: 200 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Ready to Quote</div>
              <Link href="/finance-queue" style={{ fontSize: 13, fontWeight: 800, color: UI.brand, textDecoration: "none" }}>
                Open queue →
              </Link>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Loading…</div>
              ) : financeQueuePreview.length ? (
                financeQueuePreview.map(jobRow)
              ) : (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Nothing awaiting pricing.</div>
              )}
            </div>
          </div>

          {/* Recent */}
          <div style={{ ...surface, padding: 14, minHeight: 200 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Recent jobs</div>
              <Link href="/job-sheet" style={{ fontSize: 13, fontWeight: 800, color: UI.brand, textDecoration: "none" }}>
                Job sheet →
              </Link>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Loading…</div>
              ) : recent.length ? (
                recent.map(jobRow)
              ) : (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>No recent jobs.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
