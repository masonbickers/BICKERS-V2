"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarCheck2,
  Camera,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Save,
  Search,
  Wrench,
  X,
} from "lucide-react";
import {
  collection,
  getDocsFromServer,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../../firebaseConfig";

/* UI tokens */
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
  danger: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
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
const cardBase = {
  ...surface,
  padding: 12,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  marginBottom: UI.gap,
};

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12.5, lineHeight: 1.4, marginTop: 4 };

const chip = {
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const chipSoft = { ...chip, background: UI.brandSoft, borderColor: UI.brandBorder, color: UI.brand };

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "pill") {
    return {
      padding: "5px 8px",
      borderRadius: 999,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 4px 10px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12,
      lineHeight: 1.2,
    };
  }
  if (kind === "danger") {
    return {
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: "1px solid #fecaca",
      background: "linear-gradient(180deg, #fff7f7 0%, #fef2f2 100%)",
      color: "#991b1b",
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 4px 10px rgba(153,27,27,0.08)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "success") {
    return {
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: "1px solid #bbf7d0",
      background: "linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%)",
      color: "#065f46",
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 4px 10px rgba(6,95,70,0.08)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  return {
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const inputBase = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: 13,
  background: "#fff",
};

const divider = { height: 1, background: "#dde5ee", margin: "12px 0 0" };

/* table */
const tableWrap = { ...surface, overflowX: "auto", overflowY: "hidden" };
const thtd = { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid #eef2f7", verticalAlign: "middle" };
const theadTh = {
  ...thtd,
  fontWeight: 900,
  color: UI.muted,
  background: "#f6f8fb",
  fontSize: 11.5,
  letterSpacing: 0,
  textTransform: "uppercase",
};

/* modal */
const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.42)",
  zIndex: 999,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "90px 18px 18px",
};
const modalCard = {
  width: "min(92vw, 560px)",
  background: "#fff",
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowHover,
  padding: 12,
};

/* status badges */
const pill = (bg, fg, borderColor = "#e5e7eb") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: bg,
  color: fg,
  border: `1px solid ${borderColor}`,
});

const maintenanceBadge = (m) => {
  if (!m) return pill("#eef2ff", "#3730a3", "#c7d2fe"); // pending
  if (m === "scheduled") return pill("#ecfdf5", "#065f46", "#bbf7d0");
  if (m === "resolved") return pill("#f0f9ff", "#075985", "#bae6fd");
  return pill("#f8fafc", "#111827", "#e5e7eb");
};

const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;
const IMMEDIATE_DEFECTS_PATH = "/defects/immediate";

/* Utilities */
const fmtDate = (s) => {
  if (!s) return "-";
  if (typeof s?.seconds === "number") {
    const tsDate = new Date(s.seconds * 1000);
    if (Number.isNaN(+tsDate)) return "-";
    return tsDate.toLocaleDateString("en-GB");
  }
  if (typeof s === "string") {
    const raw = s.trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = s?.toDate ? s.toDate() : new Date(s);
  if (Number.isNaN(+d)) return "-";
  return d.toLocaleDateString("en-GB");
};

function extractApprovedGeneral(checkDocs) {
  const rows = [];
  for (const c of checkDocs) {
    if (!Array.isArray(c.items)) continue;

    c.items.forEach((it, idx) => {
      const r = it?.review || {};
      const rawCat = r.category ?? r.route ?? r.bucket ?? it.category ?? "";
      const cat = String(rawCat).trim().toLowerCase();

      if (r.status === "approved" && cat === "general") {
        rows.push({
          sourceType: "vehicleCheck",
          checkId: c.id,
          defectIndex: idx,
          dateISO: c.dateISO || c.date || c.createdAt || null,
          jobId: c.jobId || "",
          jobLabel: c.jobNumber ? `#${c.jobNumber}` : c.jobId || "",
          vehicle: c.vehicle || "",
          driverName: c.driverName || "",
          itemLabel: it.label || `Item ${idx + 1}`,
          note: it.note || "",
          photos: Array.isArray(c.photos) ? c.photos : [],
          review: r,
          maintenance: it.maintenance || null,
        });
      }
    });
  }

  rows.sort((a, b) => {
    const ad = new Date(a.dateISO || 0).getTime();
    const bd = new Date(b.dateISO || 0).getTime();
    return bd - ad;
  });

  return rows;
}

function extractApprovedGeneralIssues(issueDocs) {
  const rows = [];
  for (const issue of issueDocs) {
    const review = issue?.review || {};
    const rawCat = review.category ?? review.route ?? review.bucket ?? issue.category ?? "";
    const cat = String(rawCat).trim().toLowerCase();

    if (review.status === "approved" && cat === "general") {
      rows.push({
        sourceType: "vehicleIssue",
        issueId: issue.id,
        defectIndex: 0,
        dateISO: issue.createdAt || issue.updatedAt || null,
        jobId: "",
        jobLabel: issue.category || "App issue",
        vehicle: issue.vehicleName || issue.vehicle || "",
        driverName: issue.reporterName || issue.reporterCode || "",
        itemLabel: "App issue report",
        note: issue.description || "",
        photos: [],
        review,
        maintenance: issue.maintenance || null,
      });
    }
  }

  rows.sort((a, b) => {
    const ad = new Date(a.dateISO || 0).getTime();
    const bd = new Date(b.dateISO || 0).getTime();
    return bd - ad;
  });

  return rows;
}

function extractGeneralDefectReports(defectDocs) {
  const rows = [];
  for (const defect of defectDocs) {
    const severity = String(defect.severity || "").trim().toLowerCase();
    const priority = String(defect.priority || "").trim().toLowerCase();
    if (defect.status === "resolved") continue;
    if (severity === "immediate" || priority === "high" || defect.offRoad === true) continue;

    rows.push({
      sourceType: "defectReport",
      defectReportId: defect.id,
      defectIndex: 0,
      dateISO: defect.createdAt || defect.updatedAt || null,
      jobId: defect.sourceRecordId || "",
      jobLabel: defect.sourceRecordId ? `Service ${defect.sourceRecordId}` : "Defect report",
      vehicle: defect.vehicleName || defect.registration || "",
      driverName: defect.reportedBy || "",
      itemLabel: defect.location || defect.sourceDefectKey || "Defect report",
      note: [defect.description, defect.notes].filter(Boolean).join("\n"),
      photos: [
        ...(Array.isArray(defect.photoURLs) ? defect.photoURLs : []),
        ...(Array.isArray(defect.photoURIs) ? defect.photoURIs : []),
      ],
      review: { status: "approved", category: "general" },
      maintenance: null,
    });
  }

  rows.sort((a, b) => {
    const ad = new Date(a.dateISO || 0).getTime();
    const bd = new Date(b.dateISO || 0).getTime();
    return bd - ad;
  });

  return rows;
}

function mergeRows(...groups) {
  return groups
    .flat()
    .sort((a, b) => new Date(b.dateISO || 0).getTime() - new Date(a.dateISO || 0).getTime());
}

function rowKey(row) {
  if (row.sourceType === "vehicleIssue") return `issue:${row.issueId}`;
  if (row.sourceType === "defectReport") return `defect:${row.defectReportId}`;
  return `${row.checkId}:${row.defectIndex}`;
}

function sameRow(a, b) {
  if (b.sourceType === "vehicleIssue") return a.issueId === b.issueId;
  if (b.sourceType === "defectReport") return a.defectReportId === b.defectReportId;
  return a.checkId === b.checkId && a.defectIndex === b.defectIndex;
}

/* Page */
export default function GeneralDefectsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | scheduled | resolved
  const [savingId, setSavingId] = useState(null);
  const [notesModal, setNotesModal] = useState(null); // {row, newStatus, note}

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [checksSnap, issuesSnap, defectsSnap] = await Promise.all([
          getDocsFromServer(collection(db, "vehicleChecks")),
          getDocsFromServer(collection(db, "vehicleIssues")),
          getDocsFromServer(collection(db, "defectReports")),
        ]);
        const checkDocs = checksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const issueDocs = issuesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const defectDocs = defectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(mergeRows(extractApprovedGeneral(checkDocs), extractApprovedGeneralIssues(issueDocs), extractGeneralDefectReports(defectDocs)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let data = rows;

    if (q.trim()) {
      const s = q.trim().toLowerCase();
      data = data.filter((r) =>
        [r.vehicle, r.itemLabel, r.note, r.driverName, r.jobLabel]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s))
      );
    }

    if (statusFilter !== "all") {
      if (statusFilter === "pending") data = data.filter((r) => !r.maintenance?.status);
      else data = data.filter((r) => r.maintenance?.status === statusFilter);
    }

    return data;
  }, [rows, q, statusFilter]);

  const openStatusModal = (row, newStatus) => setNotesModal({ row, newStatus, note: "" });

  const saveMaintenanceStatus = async () => {
    if (!notesModal?.row || !notesModal?.newStatus) return;
    const { row, newStatus, note } = notesModal;

    const key = rowKey(row);
    setSavingId(key);

    try {
      const who = auth?.currentUser?.displayName || auth?.currentUser?.email || "Supervisor";
      const maintenancePayload = {
        status: newStatus, // scheduled | resolved
        note: (note || "").trim(),
        updatedAt: serverTimestamp(),
        updatedBy: who,
      };

      if (row.sourceType === "vehicleIssue") {
        await updateDoc(doc(db, "vehicleIssues", row.issueId), {
          maintenance: maintenancePayload,
          updatedAt: serverTimestamp(),
        });
      } else if (row.sourceType === "defectReport") {
        await updateDoc(doc(db, "defectReports", row.defectReportId), {
          status: newStatus === "resolved" ? "resolved" : "open",
          notes: (note || row.note || "").trim(),
          updatedAt: serverTimestamp(),
          ...(newStatus === "resolved" ? { completedAt: serverTimestamp() } : {}),
        });
      } else {
        const path = `items.${row.defectIndex}.maintenance`;
        await updateDoc(doc(db, "vehicleChecks", row.checkId), {
          [path]: maintenancePayload,
          updatedAt: serverTimestamp(),
        });
      }

      setRows((prev) =>
        prev.map((r) =>
          sameRow(r, row)
            ? {
                ...r,
                maintenance: {
                  status: newStatus,
                  note: (note || "").trim(),
                  updatedAt: new Date().toISOString(),
                  updatedBy: who,
                },
              }
            : r
        )
      );

      setNotesModal(null);
    } catch (e) {
      console.error(e);
      alert("Could not save status. Please try again.");
    } finally {
      setSavingId(null);
    }
  };

  const rerouteToImmediate = async (row) => {
    const ok = confirm("Move this defect to Immediate Defects? This will change its category to 'immediate'.");
    if (!ok) return;

    const key = rowKey(row);
    setSavingId(key);

    try {
      if (row.sourceType === "vehicleIssue") {
        await updateDoc(doc(db, "vehicleIssues", row.issueId), {
          "review.category": "immediate",
          updatedAt: serverTimestamp(),
        });
      } else if (row.sourceType === "defectReport") {
        await updateDoc(doc(db, "defectReports", row.defectReportId), {
          severity: "Immediate",
          priority: "high",
          offRoad: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        const path = `items.${row.defectIndex}.review.category`;
        await updateDoc(doc(db, "vehicleChecks", row.checkId), {
          [path]: "immediate",
          updatedAt: serverTimestamp(),
        });
      }

      setRows((prev) =>
        prev.filter((r) =>
          !sameRow(r, row)
        )
      );

      router.push(IMMEDIATE_DEFECTS_PATH);
      router.refresh?.();
    } catch (e) {
      console.error(e);
      alert("Could not re-route. Please try again.");
      setSavingId(null);
    }
  };

  const pendingCount = useMemo(() => rows.filter((r) => !r.maintenance?.status).length, [rows]);
  const scheduledCount = useMemo(() => rows.filter((r) => r.maintenance?.status === "scheduled").length, [rows]);
  const resolvedCount = useMemo(() => rows.filter((r) => r.maintenance?.status === "resolved").length, [rows]);

  return (
    <HeaderSidebarLayout>
      {/* subtle focus ring */}
      <style>{`
        input:focus, button:focus, select:focus, textarea:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: #9fb7cf !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .defects-general-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        .defects-general-filter-grid {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 220px;
          gap: 10px;
        }
        @media (max-width: 1180px) {
          .defects-general-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 720px) {
          .defects-general-kpi-grid, .defects-general-filter-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>General Maintenance</h1>
            <div style={sub}>
              Approved defects routed to <b>General</b> for planning & scheduling.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="defects-general-action" style={btn("ghost")} onClick={() => router.push(IMMEDIATE_DEFECTS_PATH)}>
              <AlertTriangle size={15} />
              Immediate Defects
            </button>
          </div>
        </div>

        <div className="defects-general-kpi-grid" style={kpiGrid}>
          <SummaryCard label="Total General" value={rows.length} sub="Approved for planning" icon={Wrench} tone="brand" />
          <SummaryCard label="Pending" value={pendingCount} sub="Needs scheduling decision" icon={Clock3} tone="amber" />
          <SummaryCard label="Scheduled" value={scheduledCount} sub="Workshop or parts planned" icon={CalendarCheck2} tone="soft" />
          <SummaryCard label="Resolved" value={resolvedCount} sub="Completed maintenance" icon={CheckCircle2} tone="ok" />
        </div>

        {/* Filters */}
        <section style={cardBase}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Queue</h2>
              <div style={hint}>Search defects and update maintenance status with a note.</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chipSoft}>Showing <b style={{ marginLeft: 6 }}>{filtered.length}</b> / {rows.length}</span>
              <button
                type="button"
                style={btn("ghost")}
                onClick={() => {
                  setQ("");
                  setStatusFilter("all");
                }}
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
          </div>

          <div style={{ ...surface, boxShadow: "none", borderRadius: UI.radius, border: UI.border, padding: 12, background: "#fff" }}>
            <div className="defects-general-filter-grid">
              <label style={{ position: "relative", display: "block" }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: UI.muted }}
                />
                <input
                  type="search"
                  placeholder="Search vehicle, defect, note, driver, job..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  style={{ ...inputBase, paddingLeft: 34 }}
                />
              </label>

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputBase}>
                <option value="all">All statuses</option>
                <option value="pending">Pending status</option>
                <option value="scheduled">Scheduled</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div style={divider} />

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                fontSize: 12,
                color: UI.muted,
                marginTop: 12,
              }}
            >
              <span style={maintenanceBadge(null)}>Pending</span>
              <span style={maintenanceBadge("scheduled")}>Scheduled</span>
              <span style={maintenanceBadge("resolved")}>Resolved</span>
              <span style={{ marginLeft: 6 }}>Use Move to Immediate for safety-critical issues.</span>
            </div>
          </div>

          {/* Table */}
          <div style={{ ...tableWrap, marginTop: 12 }}>
            <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...theadTh, textAlign: "left" }}>Date</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Vehicle</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Defect</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Note</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Driver</th>
                  <th style={{ ...theadTh, textAlign: "center" }}>Photos</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Status</th>
                  <th style={{ ...theadTh, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                      Loading...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                      No general maintenance items found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, idx) => {
                    const key = rowKey(r);
                    const m = r.maintenance?.status;

                    return (
                      <tr key={key} style={{ background: idx % 2 ? "#ffffff" : "#fcfdff" }}>
                        <td style={thtd}>{fmtDate(r.dateISO)}</td>
                        <td style={thtd}>
                          <div style={{ fontWeight: 900, color: UI.text }}>{r.vehicle || "-"}</div>
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>{r.jobLabel}</div>
                        </td>

                        <td style={thtd} title={r.itemLabel}>
                          <strong>#{r.defectIndex + 1}</strong> - {r.itemLabel}
                        </td>

                        <td style={{ ...thtd, maxWidth: 420 }}>
                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {r.note || "-"}
                          </div>
                        </td>

                        <td style={thtd}>{r.driverName || "-"}</td>

                        <td style={{ ...thtd, textAlign: "center" }}>
                          <span style={{ ...chip, gap: 6, display: "inline-flex", alignItems: "center" }}>
                            <Camera size={13} />
                            {r.photos?.length ? r.photos.length : 0}
                          </span>
                        </td>

                        <td style={thtd}>
                          <span style={maintenanceBadge(m)}>{m ? m.toUpperCase() : "PENDING"}</span>
                          {r.maintenance?.note ? (
                            <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                              {r.maintenance.note}
                            </div>
                          ) : null}
                        </td>

                        <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>
                          {r.sourceType === "vehicleCheck" ? (
                            <a href={CHECK_DETAIL_PATH(r.checkId)} className="defects-general-action" style={{ ...btn("pill"), marginRight: 6 }}>
                              <ArrowUpRight size={13} />
                              View
                            </a>
                          ) : null}

                          <button
                            type="button"
                            style={{ ...btn("pill"), marginRight: 6 }}
                            onClick={() => openStatusModal(r, "scheduled")}
                            disabled={savingId === key}
                            title="Mark as Scheduled"
                          >
                            <CalendarCheck2 size={13} />
                            Schedule
                          </button>

                          <button
                            type="button"
                            style={{ ...btn("success"), marginRight: 6, padding: "5px 8px", borderRadius: 999 }}
                            onClick={() => openStatusModal(r, "resolved")}
                            disabled={savingId === key}
                            title="Mark as Resolved"
                          >
                            <CheckCircle2 size={13} />
                            Resolve
                          </button>

                          <button
                            type="button"
                            style={{ ...btn("danger"), padding: "5px 8px", borderRadius: 999 }}
                            onClick={() => rerouteToImmediate(r)}
                            disabled={savingId === key}
                            title="Move to Immediate Defects"
                          >
                            <AlertTriangle size={13} />
                            Move to Immediate
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Notes Modal */}
        {notesModal && (
          <div style={modalOverlay} onMouseDown={() => setNotesModal(null)}>
            <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: UI.text }}>
                    Mark as {notesModal.newStatus === "scheduled" ? "Scheduled" : "Resolved"}
                  </div>
                  <div style={{ fontSize: 12.5, color: UI.muted, marginTop: 4 }}>
                    {notesModal.row.vehicle || "-"} - {notesModal.row.jobLabel} - #{notesModal.row.defectIndex + 1}
                  </div>
                </div>
                <button type="button" style={btn("ghost")} onClick={() => setNotesModal(null)}>
                  <X size={14} />
                  Close
                </button>
              </div>

              <div style={{ ...surface, boxShadow: "none", borderRadius: UI.radius, border: UI.border, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
                  Note (optional)
                </div>
                <textarea
                  value={notesModal.note}
                  onChange={(e) => setNotesModal((m) => ({ ...m, note: e.target.value }))}
                  rows={4}
                  placeholder="e.g., Booked for workshop next Tuesday / parts ordered / fixed & checked."
                  style={{ ...inputBase, marginTop: 8, resize: "vertical" }}
                />

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                  <button type="button" style={btn("ghost")} onClick={() => setNotesModal(null)} disabled={!!savingId}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={notesModal.newStatus === "resolved" ? btn("success") : btn("primary")}
                    onClick={saveMaintenanceStatus}
                    disabled={!!savingId}
                  >
                    <Save size={14} />
                    {savingId ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        table thead th { border-bottom: 1px solid #e5e7eb !important; }
        .defects-general-action:hover { background: #f8fbfe !important; border-color: #b8c8d8 !important; }
      `}</style>
    </HeaderSidebarLayout>
  );
}

function SummaryCard({ label, value, sub, tone = "default", icon: Icon = Wrench }) {
  const toneStyles =
    tone === "danger"
      ? { fg: "#991b1b", bg: "#fef2f2", border: "#fecaca" }
      : tone === "amber"
      ? { fg: "#9a3412", bg: "#fff7ed", border: "#fed7aa" }
      : tone === "ok"
      ? { fg: "#065f46", bg: "#ecfdf5", border: "#bbf7d0" }
      : tone === "brand" || tone === "soft"
      ? { fg: UI.brand, bg: UI.brandSoft, border: UI.brandBorder }
      : { fg: UI.text, bg: "#f6f8fb", border: "#d7dee8" };

  return (
    <div
      style={{
        ...cardBase,
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...(tone === "soft" ? { background: UI.brandSoft, borderColor: UI.brandBorder } : null),
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 900, color: toneStyles.fg, marginTop: 6 }}>{value}</div>
        </div>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: UI.radiusSm,
            border: `1px solid ${toneStyles.border}`,
            background: toneStyles.bg,
            color: toneStyles.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
          }}
        >
          <Icon size={17} />
        </span>
      </div>
      {sub ? <div style={{ fontSize: 12, color: UI.muted, lineHeight: 1.3, marginTop: 8 }}>{sub}</div> : null}
    </div>
  );
}
