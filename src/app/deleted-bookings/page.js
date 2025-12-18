"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import ViewBookingModal from "../components/ViewBookingModal";
import { RotateCcw, Trash2, ChevronDown, ChevronUp, Search } from "lucide-react";

/* ───────────────────────────────────────────
   Admin gate (ONLY these emails)
─────────────────────────────────────────── */
const ADMIN_EMAILS = ["mason@bickers.co.uk", "paul@bickers.co.uk"];

/* -------------------------- tiny visual tokens only -------------------------- */
const UI = {
  text: "#111827",
  muted: "#6b7280",
  bg: "#ffffff",
  border: "1px solid #e5e7eb",
  radiusLg: 12,
  radius: 8,
  radiusSm: 6,
  shadow: "0 6px 16px rgba(0,0,0,0.06)",
};

const pageWrap = {
  display: "flex",
  minHeight: "100vh",
  background: "#f3f4f6",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  color: UI.text,
};

const mainWrap = {
  flex: 1,
  maxWidth: 1800,
  margin: "0 auto",
  padding: "14px 14px 30px",
};

const card = {
  background: UI.bg,
  border: UI.border,
  borderRadius: UI.radiusLg,
  boxShadow: UI.shadow,
  padding: 16,
  marginBottom: 16,
};

const title = { margin: 0, fontSize: 18, fontWeight: 700, color: UI.text };

const btnBase = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: UI.radius,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  color: UI.text,
};

const btnDark = {
  ...btnBase,
  background: "#111827",
  color: "#fff",
  border: "1px solid #111827",
};

const btnDanger = {
  ...btnBase,
  background: "#7f1d1d",
  color: "#fee2e2",
  border: "1px solid #b91c1c",
};

const tableWrap = {
  width: "100%",
  overflow: "auto",
  borderRadius: UI.radius,
  border: UI.border,
};

const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13,
};

const th = {
  textAlign: "left",
  fontWeight: 700,
  fontSize: 12,
  color: UI.text,
  background: "#f3f4f6",
  padding: "10px",
  borderBottom: UI.border,
  position: "sticky",
  top: 0,
  zIndex: 1,
  whiteSpace: "nowrap",
};

const td = {
  padding: "10px",
  verticalAlign: "top",
  borderBottom: "1px solid #f1f5f9",
};

const mono = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

const pill = (bg, color = "#111") => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  background: bg,
  color,
  fontWeight: 800,
  fontSize: 12,
  border: "1px solid rgba(0,0,0,0.12)",
});

/* ------------------------------- helpers ------------------------------- */
const toDateSafe = (v) => {
  if (!v) return null;
  if (v?.toDate && typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtGB = (v) => {
  const d = toDateSafe(v);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const fmtDateRange = (b) => {
  if (!b) return "—";
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) {
    return b.bookingDates.map((x) => fmtGB(x)).join(", ");
  }
  if (b.startDate && b.endDate) return `${fmtGB(b.startDate)} → ${fmtGB(b.endDate)}`;
  if (b.date) return fmtGB(b.date);
  if (b.startDate) return fmtGB(b.startDate);
  return "—";
};

const formatCrew = (employees) => {
  if (!Array.isArray(employees) || employees.length === 0) return "—";
  return employees
    .map((emp) => {
      if (typeof emp === "string") return emp;
      if (!emp || typeof emp !== "object") return "";
      const fromName = emp.name?.toString().trim();
      if (fromName) return fromName;
      const firstLast = [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim();
      if (firstLast) return firstLast;
      const display = emp.displayName?.toString().trim();
      if (display) return display;
      const email = emp.email?.toString().trim();
      if (email) return email;
      return "";
    })
    .filter(Boolean)
    .join(", ");
};

const vehiclesPretty = (vehicles, vehiclesIndex) => {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return "—";

  const byId = vehiclesIndex?.byId || {};
  const byReg = vehiclesIndex?.byReg || {};
  const byName = vehiclesIndex?.byName || {};

  return vehicles
    .map((v) => {
      if (!v) return "";

      if (typeof v === "object") {
        const name =
          v?.name || [v?.manufacturer, v?.model].filter(Boolean).join(" ") || "Vehicle";
        const plate = v?.registration ? String(v.registration).toUpperCase() : "";
        return plate ? `${name} – ${plate}` : name;
      }

      const needle = String(v).trim();
      const match =
        byId[needle] || byReg[needle.toUpperCase()] || byName[needle.toLowerCase()] || null;

      if (match) {
        const name =
          match?.name || [match?.manufacturer, match?.model].filter(Boolean).join(" ") || "Vehicle";
        const plate = match?.registration ? String(match.registration).toUpperCase() : "";
        return plate ? `${name} – ${plate}` : name;
      }

      return needle;
    })
    .filter(Boolean)
    .join(", ");
};

const equipmentPretty = (equipment) => {
  if (!equipment) return "—";
  if (Array.isArray(equipment)) return equipment.filter(Boolean).join(", ") || "—";
  if (typeof equipment === "string") return equipment || "—";
  return "—";
};

/* ---------- ATTACHMENTS HELPERS ---------- */
const canonicalKeyFromUrl = (url = "") => {
  try {
    const afterO = url.split("/o/")[1];
    if (afterO) return decodeURIComponent(afterO.split("?")[0]);
    return url.split("?")[0];
  } catch {
    return url || "";
  }
};
const getFilenameFromUrl = (url = "") => {
  try {
    const key = canonicalKeyFromUrl(url) || url;
    return (key.split("/").pop() || "file").trim();
  } catch {
    return "file";
  }
};
const toAttachmentList = (b = {}) => {
  const out = [];

  const add = (val, name) => {
    if (!val) return;

    if (typeof val === "string") {
      const url = val;
      out.push({ url, label: name || getFilenameFromUrl(url) });
      return;
    }

    const url =
      val.url || val.href || val.link || val.downloadURL || val.downloadUrl || null;

    if (url) {
      const label = val.name || name || getFilenameFromUrl(url);
      out.push({ url, label });
      return;
    }

    if (typeof val === "object") {
      Object.values(val).forEach((v) => add(v, name));
    }
  };

  if (Array.isArray(b.attachments)) b.attachments.forEach((x) => add(x));
  if (Array.isArray(b.files)) b.files.forEach((x) => add(x));

  add(b.quoteUrl, "Quote");
  if (b.pdfURL && b.pdfURL !== b.quoteUrl) add(b.pdfURL);

  const seen = new Set();
  return out.filter(({ url }) => {
    const key = canonicalKeyFromUrl(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/* ---- status colours ---- */
const STATUS_COLORS = {
  Confirmed: { bg: "#f3f970", text: "#111", border: "#0b0b0b" },
  "First Pencil": { bg: "#89caf5", text: "#111", border: "#0b0b0b" },
  "Second Pencil": { bg: "#f73939", text: "#fff", border: "#0b0b0b" },
  Holiday: { bg: "#d3d3d3", text: "#111", border: "#0b0b0b" },
  Maintenance: { bg: "#f97316", text: "#111", border: "#0b0b0b" },
  Complete: { bg: "#92d18cff", text: "#111", border: "#0b0b0b" },
  "Action Required": { bg: "#FF973B", text: "#111", border: "#0b0b0b" },
  DNH: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  Lost: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  Postponed: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  Cancelled: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
};
const getStatusStyle = (s = "") =>
  STATUS_COLORS[s] || { bg: "#e5e7eb", text: "#111", border: "#e5e7eb" };

/* ---------------- deleted doc normaliser ---------------- */
const normaliseDeleted = (id, raw) => {
  const payload = raw.data || raw.payload || raw.booking || raw || {};
  const originalCollection = raw.originalCollection || "bookings";
  const originalId = raw.originalId || id;

  return {
    id,
    deletedAt: toDateSafe(raw.deletedAt) || null,
    deletedBy: raw.deletedBy || "",
    originalCollection,
    originalId,
    payload,

    jobNumber: payload.jobNumber || "—",
    client: payload.client || "—",
    location: payload.location || "—",
    status: payload.status || "—",
    dateRange: fmtDateRange(payload),
    employees: payload.employees || [],
    vehicles: payload.vehicles || [],
    equipment: payload.equipment || [],
    attachments: toAttachmentList(payload),
  };
};

export default function DeletedBookingsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState(new Set());

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("deletedDesc");

  // ✅ modal state
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [selectedDeletedId, setSelectedDeletedId] = useState(null);

  // ✅ vehicles lookup for name+reg rendering
  const [vehiclesIndex, setVehiclesIndex] = useState({ byId: {}, byReg: {}, byName: {} });

  /* ───────────────────────────────────────────
     Admin gate (email allowlist)
  ──────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      try {
        if (!u) {
          router.push("/login");
          return;
        }
        const email = (u.email || "").toLowerCase();
        const ok = ADMIN_EMAILS.includes(email);
        setIsAdmin(ok);
        if (!ok) {
          router.push("/home"); // or "/dashboard"
        }
      } finally {
        setCheckingAccess(false);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Only subscribe if admin */
  useEffect(() => {
    if (checkingAccess || !isAdmin) return;

    const unsub = onSnapshot(collection(db, "deletedBookings"), (snap) => {
      const list = snap.docs.map((d) => normaliseDeleted(d.id, d.data()));
      setRows(list);
    });

    return () => unsub();
  }, [checkingAccess, isAdmin]);

  useEffect(() => {
    if (checkingAccess || !isAdmin) return;

    const unsub = onSnapshot(collection(db, "vehicles"), (snap) => {
      const byId = {};
      const byReg = {};
      const byName = {};

      snap.docs.forEach((d) => {
        const v = { id: d.id, ...d.data() };
        byId[d.id] = v;

        const reg = String(v.registration || "").trim();
        if (reg) byReg[reg.toUpperCase()] = v;

        const name = String(v.name || "").trim();
        if (name) byName[name.toLowerCase()] = v;
      });

      setVehiclesIndex({ byId, byReg, byName });
    });

    return () => unsub();
  }, [checkingAccess, isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...rows];

    if (q) {
      list = list.filter((r) => {
        const hay = [
          r.id,
          r.originalId,
          r.jobNumber,
          r.client,
          r.location,
          r.status,
          r.dateRange,
          r.deletedBy,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const jobNumVal = (s) => {
      const m = String(s || "").match(/\d+/);
      return m ? Number(m[0]) : -Infinity;
    };

    list.sort((a, b) => {
      if (sortMode === "deletedDesc")
        return (b.deletedAt?.getTime?.() || 0) - (a.deletedAt?.getTime?.() || 0);
      if (sortMode === "deletedAsc")
        return (a.deletedAt?.getTime?.() || 0) - (b.deletedAt?.getTime?.() || 0);
      if (sortMode === "jobDesc") return jobNumVal(b.jobNumber) - jobNumVal(a.jobNumber);
      if (sortMode === "jobAsc") return jobNumVal(a.jobNumber) - jobNumVal(b.jobNumber);
      return 0;
    });

    return list;
  }, [rows, query, sortMode]);

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const restore = async (row) => {
    if (!row) return;

    try {
      await setDoc(
        doc(db, "bookings", String(row.originalId || row.id)),
        {
          ...(row.payload || {}),
          restoredAt: serverTimestamp(),
          restoredBy: auth?.currentUser?.email || "",
        },
        { merge: true }
      );

      await deleteDoc(doc(db, "deletedBookings", row.id));

      alert("Restored ✅");
    } catch (e) {
      console.error("Restore failed:", e);
      alert("Restore failed. Check console.");
    }
  };

  const purge = async (row) => {
    if (!row) return;
    if (!confirm("Permanently delete this deleted booking? This cannot be undone.")) return;

    try {
      await deleteDoc(doc(db, "deletedBookings", row.id));
    } catch (e) {
      console.error("Purge failed:", e);
      alert("Purge failed. Check console.");
    }
  };

  const openDeletedBooking = (row) => {
    if (!row) return;
    setSelectedDeletedId(row.id);
    setSelectedBookingId(row.originalId || row.id);
  };

  /* ───────────────────────────────────────────
     Render
  ──────────────────────────────────────────── */
  if (checkingAccess) {
    return (
      <HeaderSidebarLayout>
        <div style={{ padding: 22, color: UI.muted }}>Checking admin access…</div>
      </HeaderSidebarLayout>
    );
  }

  // Non-admins get redirected; render nothing to avoid flash
  if (!isAdmin) return null;

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={mainWrap}>
          {/* Header */}
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <h2 style={title}>Deleted Bookings</h2>
                <div style={{ color: UI.muted, fontWeight: 600, marginTop: 4 }}>
                  Admin only. Click a row to view full details. Restore from the modal or table.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button style={btnBase} type="button" onClick={() => router.push("/admin")}>
                  ← Back to Admin
                </button>

                <button style={btnBase} type="button" onClick={() => router.push("/dashboard")}>
                  Dashboard
                </button>
              </div>
            </div>
          </section>

          {/* Controls */}
          <section style={card}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    opacity: 0.65,
                  }}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search job number, production, location, status…"
                  style={{
                    width: "100%",
                    border: UI.border,
                    borderRadius: UI.radius,
                    padding: "10px 12px 10px 34px",
                    fontSize: 14,
                    background: "#fff",
                  }}
                />
              </div>

              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                style={{
                  border: UI.border,
                  borderRadius: UI.radius,
                  padding: "10px 12px",
                  fontSize: 14,
                  background: "#fff",
                  fontWeight: 700,
                  color: UI.text,
                }}
              >
                <option value="deletedDesc">Sort: Deleted (new → old)</option>
                <option value="deletedAsc">Sort: Deleted (old → new)</option>
                <option value="jobDesc">Sort: Job No (high → low)</option>
                <option value="jobAsc">Sort: Job No (low → high)</option>
              </select>

              <div style={pill("#eef2ff")}>Total: {filtered.length}</div>
            </div>
          </section>

          {/* TABLE */}
          <section style={card}>
            <div style={tableWrap}>
              <table style={table}>
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>

                <thead>
                  <tr>
                    <th style={th}>Deleted</th>
                    <th style={th}>Date(s)</th>
                    <th style={th}>Job Number</th>
                    <th style={th}>Status</th>
                    <th style={th}>Production</th>
                    <th style={th}>Location</th>
                    <th style={th}>Crew</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td style={{ ...td, color: UI.muted }} colSpan={8}>
                        No deleted bookings found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => {
                      const isOpen = expanded.has(r.id);
                      const ss = getStatusStyle(r.status);

                      return (
                        <tr
                          key={r.id}
                          onClick={() => openDeletedBooking(r)}
                          style={{
                            background: i % 2 === 0 ? "#fff" : "#fafafa",
                            transition: "background-color .15s ease",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f5f6f8")}
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#fff" : "#fafafa")
                          }
                        >
                          <td style={td}>
                            <div style={{ fontWeight: 800 }}>{fmtGB(r.deletedAt)}</div>
                            {r.deletedBy ? (
                              <div style={{ fontSize: 12, color: UI.muted, fontWeight: 700 }}>
                                by {r.deletedBy}
                              </div>
                            ) : null}
                          </td>

                          <td style={td}>{r.dateRange}</td>

                          <td style={{ ...td, fontWeight: 900 }}>{r.jobNumber || "—"}</td>

                          <td style={td}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: ss.bg,
                                color: ss.text,
                                border: `1px solid ${ss.border}`,
                                fontWeight: 900,
                                fontSize: 12,
                              }}
                            >
                              {r.status || "—"}
                            </span>

                            {r.attachments?.length ? (
                              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800 }}>
                                📎 {r.attachments.length}
                              </div>
                            ) : null}
                          </td>

                          <td style={td}>
                            <div style={{ fontWeight: 800 }}>{r.client || "—"}</div>
                            <div style={{ marginTop: 6, fontSize: 12, color: UI.muted, fontWeight: 700 }}>
                              <div style={{ whiteSpace: "normal" }}>
                                <b>Vehicles:</b> {vehiclesPretty(r.vehicles, vehiclesIndex)}
                              </div>
                              <div style={{ whiteSpace: "normal", marginTop: 4 }}>
                                <b>Equipment:</b> {equipmentPretty(r.equipment)}
                              </div>
                            </div>
                          </td>

                          <td style={td}>{r.location || "—"}</td>

                          <td style={td}>
                            {Array.isArray(r.employees) && r.employees.length ? formatCrew(r.employees) : "—"}
                          </td>

                          <td style={td}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                style={btnDark}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  restore(r);
                                }}
                              >
                                <RotateCcw size={16} /> Restore
                              </button>

                              <button
                                style={btnBase}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(r.id);
                                }}
                              >
                                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                Details
                              </button>

                              <button
                                style={btnDanger}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  purge(r);
                                }}
                              >
                                <Trash2 size={16} /> Purge
                              </button>
                            </div>

                            {isOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  marginTop: 10,
                                  border: UI.border,
                                  borderRadius: UI.radius,
                                  background: "#fff",
                                  padding: 10,
                                }}
                              >
                                {r.attachments?.length ? (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Attachments</div>
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                      {r.attachments.map((f, idx) => (
                                        <a
                                          key={f.url || idx}
                                          href={f.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          style={{ ...btnBase, textDecoration: "none", fontWeight: 800 }}
                                          title={f.label}
                                        >
                                          📎 {f.label}
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                <div style={{ fontWeight: 900, marginBottom: 6 }}>Payload</div>
                                <pre
                                  style={{
                                    ...mono,
                                    fontSize: 12,
                                    margin: 0,
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    background: "#0b1220",
                                    color: "#e5e7eb",
                                    borderRadius: UI.radius,
                                    padding: 10,
                                    overflow: "auto",
                                    maxHeight: 260,
                                  }}
                                >
                                  {JSON.stringify(r.payload || {}, null, 2)}
                                </pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* ✅ modal open on row click */}
      {selectedBookingId && (
        <ViewBookingModal
          id={selectedBookingId}
          fromDeleted
          deletedId={selectedDeletedId}
          onClose={() => {
            setSelectedBookingId(null);
            setSelectedDeletedId(null);
          }}
        />
      )}
    </HeaderSidebarLayout>
  );
}
