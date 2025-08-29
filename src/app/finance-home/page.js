"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useRouter } from "next/navigation";

/* ---------- Small helpers ---------- */
const fmtDate = (d) => {
  try {
    const x = typeof d?.toDate === "function" ? d.toDate() : new Date(d);
    if (isNaN(x)) return "TBC";
    return x.toLocaleDateString("en-GB");
  } catch {
    return "TBC";
  }
};

const toISODate = (yyyyMmDd) => {
  if (!yyyyMmDd) return new Date().toISOString();
  const [y, m, d] = yyyyMmDd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  return dt.toISOString();
};

const todayInputValue = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/* ---------- STATUS NORMALISER ---------- */
const extractStatusString = (raw) => {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    if (typeof raw.value === "string") return raw.value;
    if (typeof raw.name === "string") return raw.name;
    try { return JSON.stringify(raw); } catch { return String(raw); }
  }
  return String(raw);
};

const normalizeStatus = (raw) => {
  const s0 = extractStatusString(raw);
  const s = s0.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (s === "paid" || s === "settled") return "paid";
  if (s === "invoiced" || s === "invoice sent" || s === "billed") return "invoiced";
  if (["ready","ready to invoice","ready invoice","ready for invoice"].includes(s)) return "ready";
  if (["pending","queued","queue"].includes(s)) return "pending";
  if (["complete","completed"].includes(s)) return "ready";
  return s || "pending";
};

/* ---------- DEDUPE ---------- */
const statusRank = { pending: 0, ready: 1, invoiced: 2, paid: 3 };
const rank = (s) => statusRank[normalizeStatus(s)] ?? -1;
const ts = (j) =>
  Date.parse(j.updatedAt || j.invoiceDate || j.paidDate || j.createdAt || 0) || 0;

// date span "YYYY-MM-DD..YYYY-MM-DD"
const dateSpanKey = (row) => {
  const arr = Array.isArray(row.dates) ? row.dates : [];
  const toJS = (d) => (typeof d?.toDate === "function" ? d.toDate() : new Date(d));
  const stamps = arr
    .map(toJS)
    .filter((d) => d && !isNaN(d))
    .map((d) => {
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    });
  if (!stamps.length) return "";
  const min = Math.min(...stamps);
  const max = Math.max(...stamps);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  return `${iso(min)}..${iso(max)}`;
};

const dedupeRows = (rows) => {
  const map = new Map();
  for (const j of rows) {
    const span = dateSpanKey(j);
    const key =
      (j.jobNumber ? `JN:${j.jobNumber}|D:${span}` : "") ||
      (j.invoiceNumber ? `INV:${j.invoiceNumber}` : "") ||
      (j.bookingId ? `B:${j.bookingId}` : "") ||
      `ID:${j.id}`;

    const prev = map.get(key);
    if (!prev) {
      map.set(key, j);
      continue;
    }
    const a = rank(j.status);
    const b = rank(prev.status);
    if (a > b || (a === b && ts(j) >= ts(prev))) {
      map.set(key, j);
    }
  }
  return Array.from(map.values());
};

/* ---------- Visual tokens ---------- */
const palette = {
  bg: "#f8fafc",
  text: "#0f172a",
  subtext: "#64748b",
  border: "#e2e8f0",
  cardBg: "#ffffff",
  shadow: "0 6px 18px rgba(2, 6, 23, 0.06)",
};

const statusChip = {
  pending:  { bg: "#fff7ed", border: "#fed7aa", text: "#b45309", label: "Queued" },
  ready:    { bg: "#eff6ff", border: "#bfdbfe", text: "#2563eb", label: "Ready to Invoice" },
  invoiced: { bg: "#eef2ff", border: "#c7d2fe", text: "#4f46e5", label: "Invoiced" },
  paid:     { bg: "#ecfdf5", border: "#bbf7d0", text: "#0f766e", label: "Paid" },
  default:  { bg: "#f1f5f9", border: "#e2e8f0", text: "#334155", label: "TBC" },
};

const StatusBadge = ({ status }) => {
  const key = normalizeStatus(status);
  const c = statusChip[key] || statusChip.default;
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        padding: "4px 10px",
        fontSize: 12,
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontWeight: 700,
        lineHeight: 1,
      }}
      title={key || "tbc"}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.text }} />
      {c.label}
    </span>
  );
};

/* ---------- Tiny toast ---------- */
const Toast = ({ msg, onClose }) => {
  if (!msg) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 18,
        right: 18,
        background: "#111827",
        color: "#fff",
        borderRadius: 12,
        padding: "10px 14px",
        boxShadow: palette.shadow,
        cursor: "pointer",
        zIndex: 50,
        fontSize: 13,
        fontWeight: 600,
        opacity: 0.98,
      }}
      title="Click to dismiss"
    >
      {msg}
    </div>
  );
};

export default function FinanceDashboard() {
  const router = useRouter();

  const [invoiceJobs, setInvoiceJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔙 dropdown filter is back
  const [filter, setFilter] = useState("all"); // all | pending | ready | invoiced | paid
  const [search, setSearch] = useState("");

  const [savingIds, setSavingIds] = useState(new Set());
  const [toast, setToast] = useState("");

  const load = async () => {
    setLoading(true);
    const snapshot = await getDocs(collection(db, "invoiceQueue"));
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const withSafe = data.map((j) => ({
      ...j,
      dates: Array.isArray(j.dates) ? j.dates : (j.bookingDates || []),
      status: normalizeStatus(j.status),
    }));
    const deduped = dedupeRows(withSafe);
    setInvoiceJobs(deduped);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const t = { pending: 0, ready: 0, invoiced: 0, paid: 0 };
    for (const j of invoiceJobs) if (t[j.status] !== undefined) t[j.status] += 1;
    return t;
  }, [invoiceJobs]);

  /* ---------- Lists (respect dropdown + search) ---------- */
  const invoicesList = useMemo(() => {
    let rows = invoiceJobs.filter((j) => j.status !== "paid");
    if (filter !== "all" && filter !== "paid") {
      rows = rows.filter((j) => j.status === filter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((j) =>
        [j.client, j.location, j.jobNumber, j.invoiceNumber]
          .map((x) => (x || "").toString().toLowerCase())
          .some((v) => v.includes(q))
      );
    }
    rows.sort((a, b) => {
      const ad = a.dates?.[0] ? new Date(a.dates[0]).getTime() : 0;
      const bd = b.dates?.[0] ? new Date(b.dates[0]).getTime() : 0;
      return bd - ad;
    });
    return rows;
  }, [invoiceJobs, filter, search]);

  const paidList = useMemo(() => {
    let rows = invoiceJobs.filter((j) => j.status === "paid");
    if (filter !== "all" && filter !== "paid") {
      rows = [];
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((j) =>
        [j.client, j.location, j.jobNumber, j.invoiceNumber]
          .map((x) => (x || "").toString().toLowerCase())
          .some((v) => v.includes(q))
      );
    }
    rows.sort((a, b) => ts(b) - ts(a));
    return rows;
  }, [invoiceJobs, filter, search]);

  /* ---------- Click helpers ---------- */
  const getJobHref = (job) =>
    job?.bookingId ? `/invoice-view` : `/finance/job/${job.id}`;

  const onRowClick = (job) => {
    router.push(getJobHref(job));
  };

  const onRowKeyDown = (e, job) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(getJobHref(job));
    }
  };

  /* ---------- Actions ---------- */
  const markAsInvoiced = async (row, e) => {
    e?.stopPropagation(); // prevent row navigation
    setSavingIds((s) => new Set(s).add(row.id));
    try {
      const invoiceNumber = prompt("Enter invoice number (optional):", row.invoiceNumber || "");
      const dueDays = parseInt(prompt("Due in how many days? (e.g. 30)", "30") || "30", 10);
      const dueDate = isNaN(dueDays)
        ? null
        : new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString();

      await updateDoc(doc(db, "invoiceQueue", row.id), {
        status: "invoiced",
        invoiceNumber: invoiceNumber || row.invoiceNumber || "",
        invoiceDate: new Date().toISOString(),
        dueDate: dueDate || row.dueDate || null,
        updatedAt: new Date().toISOString(),
      });

      setToast("Invoice marked as Invoiced");
      await load();
    } catch (e) {
      alert("Failed to mark as invoiced: " + (e?.message || e));
    } finally {
      setSavingIds((s) => {
        const n = new Set(s); n.delete(row.id); return n;
      });
    }
  };

  const markAsPaid = async (row, e) => {
    e?.stopPropagation(); // prevent row navigation
    const paidISO = toISODate(todayInputValue());
    setSavingIds((s) => new Set(s).add(row.id));
    try {
      await updateDoc(doc(db, "invoiceQueue", row.id), {
        status: "paid",
        paidDate: paidISO,
        updatedAt: new Date().toISOString(),
      });

      if (row.bookingId) {
        try {
          await updateDoc(doc(db, "bookings", row.bookingId), {
            status: "Paid",
            paidDate: paidISO,
            statusUpdatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn("Booking status update failed:", e?.message || e);
          alert("Paid in invoiceQueue, but failed to update booking record.");
        }
      }

      setToast("Invoice marked as Paid");
      await load();
    } catch (e) {
      alert("Failed to mark as paid: " + (e?.message || e));
    } finally {
      setSavingIds((s) => {
        const n = new Set(s); n.delete(row.id); return n;
      });
    }
  };

  /* ---------- Styles ---------- */
  const pageWrap = {
    padding: "32px 24px",
    background: palette.bg,
    minHeight: "100vh",
    color: palette.text,
  };

  const sectionTitle = { fontSize: 20, fontWeight: 800, marginBottom: 12 };

  const panel = {
    background: palette.cardBg,
    border: `1px solid ${palette.border}`,
    borderRadius: 16,
    boxShadow: palette.shadow,
  };

  const statsWrap = { display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 16, marginBottom: 24 };
  const statCard = { ...panel, padding: 18, textAlign: "center" };
  const statLabel = { color: palette.subtext, fontSize: 13, fontWeight: 700, marginBottom: 6, letterSpacing: 0.2 };
  const statNumber = { fontSize: 30, fontWeight: 900, lineHeight: 1.1 };

  const controls = { display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" };
  const selector = { padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}`, background: "#fff" };
  const input = { padding: "10px 12px", borderRadius: 10, border: `1px solid ${palette.border}`, minWidth: 260, background: "#fff" };
  const btn = (bg, fg = "#fff") => ({
    background: bg,
    color: fg,
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
    boxShadow: "0 4px 10px rgba(2,6,23,0.08)",
  });

  const tableWrap = { ...panel, overflow: "hidden" };
  const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0 };
  const th = {
    padding: "14px 12px",
    textAlign: "left",
    fontWeight: 800,
    fontSize: 12,
    color: palette.subtext,
    borderBottom: `1px solid ${palette.border}`,
    background: "#f8fafc",
  };
  const td = { padding: "14px 12px", fontSize: 13, borderBottom: `1px solid ${palette.border}` };
  const row = (i) => ({
    background: i % 2 ? "#ffffff" : "#fcfdff",
    cursor: "pointer",
  });
  const rowHover = {
    transition: "background 120ms ease",
  };
  const right = { textAlign: "right" };
  const link = {
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 700,
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Finance Dashboard</h1>
        <div style={{ color: palette.subtext, marginBottom: 16, fontSize: 12 }}>
          Status summary — pending: {totals.pending} · ready: {totals.ready} · invoiced: {totals.invoiced} · paid: {totals.paid}
          {loading ? " (loading…)" : ""}
        </div>

        {/* Controls */}
        <div style={controls}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={selector}>
            <option value="all">All</option>
            <option value="pending">Queued</option>
            <option value="ready">Ready to Invoice</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, location, job#, invoice#"
            style={input}
          />
          <button onClick={load} style={btn("#111827")}>Refresh</button>
        </div>

        {/* Footer stats (optional) */}
        <div style={{ ...statsWrap, marginTop: 24 }}>
          <div style={statCard}>
            <div style={statLabel}>Queued</div>
            <div style={statNumber}>{totals.pending}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Ready</div>
            <div style={statNumber}>{totals.ready}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Invoiced</div>
            <div style={statNumber}>{totals.invoiced}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Paid</div>
            <div style={statNumber}>{totals.paid}</div>
          </div>
        </div>

        {/* Invoices (non-paid) */}
        {filter !== "paid" && (
          <>
            <div style={{ ...sectionTitle, marginTop: 8 }}>
              {filter === "all" ? "Invoices" :
                filter === "pending" ? "Invoices — Queued" :
                filter === "ready" ? "Invoices — Ready" :
                filter === "invoiced" ? "Invoices — Invoiced" : "Invoices"}
            </div>
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Job #</th>
                    <th style={th}>Client</th>
                    <th style={th}>Location</th>
                    <th style={th}>Dates</th>
                    <th style={th}>Invoice #</th>
                    <th style={th}>Status</th>
                    <th style={{ ...th, ...right }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesList.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...td, padding: 24, textAlign: "center", color: palette.subtext }}>
                        {loading ? "Loading…" : "No invoices to show."}
                      </td>
                    </tr>
                  ) : (
                    invoicesList.map((job, i) => {
                      const saving = savingIds.has(job.id);
                      const href = getJobHref(job);
                      return (
                        <tr
                          key={job.id}
                          style={{ ...row(i), ...rowHover }}
                          onClick={() => onRowClick(job)}
                          onKeyDown={(e) => onRowKeyDown(e, job)}
                          tabIndex={0}
                          role="button"
                          title="Open job"
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f5faff")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = (i % 2 ? "#ffffff" : "#fcfdff"))}
                        >
                          <td style={td}>
                            <a href={href} onClick={(e) => e.stopPropagation()} style={link}>
                              {job.jobNumber || job.bookingId || job.id}
                            </a>
                          </td>
                          <td style={td}>{job.client || "—"}</td>
                          <td style={td}>{job.location || "—"}</td>
                          <td style={td}>
                            {(job.dates || []).length
                              ? (job.dates || []).map((d, idx) => <div key={idx}>{fmtDate(d)}</div>)
                              : "TBC"}
                          </td>
                          <td style={td}>{job.invoiceNumber || "—"}</td>
                          <td style={td}><StatusBadge status={job.status} /></td>
                          <td style={{ ...td, ...right, whiteSpace: "nowrap" }}>
                            {job.status === "ready" && (
                              <button
                                onClick={(e) => markAsInvoiced(job, e)}
                                style={btn("#4f46e5")}
                                disabled={saving}
                                title="Set status to Invoiced"
                              >
                                {saving ? "Saving…" : "Mark Invoiced"}
                              </button>
                            )}{" "}
                            <button
                              onClick={(e) => markAsPaid(job, e)}
                              style={btn("#059669")}
                              disabled={saving}
                              title="Set status to Paid"
                            >
                              {saving ? "Saving…" : "Mark Paid"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Paid */}
        {(filter === "all" || filter === "paid") && (
          <>
            <div style={{ ...sectionTitle, marginTop: 24 }}>Paid</div>
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Job #</th>
                    <th style={th}>Client</th>
                    <th style={th}>Location</th>
                    <th style={th}>Dates</th>
                    <th style={th}>Invoice #</th>
                    <th style={th}>Status</th>
                    <th style={{ ...th, ...right }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {paidList.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...td, padding: 24, textAlign: "center", color: palette.subtext }}>
                        {loading ? "Loading…" : "No paid rows."}
                      </td>
                    </tr>
                  ) : (
                    paidList.map((job, i) => {
                      const href = getJobHref(job);
                      return (
                        <tr
                          key={job.id}
                          style={{ ...row(i), ...rowHover }}
                          onClick={() => onRowClick(job)}
                          onKeyDown={(e) => onRowKeyDown(e, job)}
                          tabIndex={0}
                          role="button"
                          title="Open job"
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f5faff")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = (i % 2 ? "#ffffff" : "#fcfdff"))}
                        >
                          <td style={td}>
                            <a href={href} onClick={(e) => e.stopPropagation()} style={link}>
                              {job.jobNumber || job.bookingId || job.id}
                            </a>
                          </td>
                          <td style={td}>{job.client || "—"}</td>
                          <td style={td}>{job.location || "—"}</td>
                          <td style={td}>
                            {(job.dates || []).length
                              ? (job.dates || []).map((d, idx) => <div key={idx}>{fmtDate(d)}</div>)
                              : "TBC"}
                          </td>
                          <td style={td}>{job.invoiceNumber || "—"}</td>
                          <td style={td}><StatusBadge status={job.status} /></td>
                          <td style={{ ...td, ...right }}>
                            {new Date(ts(job)).toLocaleDateString("en-GB")}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <Toast msg={toast} onClose={() => setToast("")} />
      </div>
    </HeaderSidebarLayout>
  );
}
