"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Calendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";

const VEHICLE_CHECK_PATH = "/vehicle-checks";
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;

// Routes for new tiles
const GENERAL_DEFECTS_PATH = "/defects/general";
const IMMEDIATE_DEFECTS_PATH = "/defects/immediate";
const DECLINED_DEFECTS_PATH = "/defects/declined";

/* ───────────────── Visual tokens ──────────────── */
const UI = {
  page: "#f3f4f6",
  card: "#ffffff",
  text: "#0f172a",
  subtext: "#64748b",
  border: "1px solid #e5e7eb",
  radius: 12,
  radiusSm: 8,
  shadowSm: "0 4px 12px rgba(2, 6, 23, 0.06)",
  shadowMd: "0 8px 24px rgba(2, 6, 23, 0.08)",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
};

const shell = {
  minHeight: "100vh",
  background: UI.page,
  color: UI.text,
  fontFamily:
    "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};
const main = {
  flex: 1,
  padding: "28px 28px 40px",
  maxWidth: 1600,
  margin: "0 auto",
};

const h1 = {
  fontSize: 28,
  lineHeight: "34px",
  fontWeight: 800,
  marginBottom: 16,
  color: UI.text,
  letterSpacing: 0.2,
};

const subbar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 22,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 16,
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 16,
  cursor: "pointer",
  transition: "transform .08s ease, box-shadow .2s ease",
};

const cardTitle = { margin: 0, fontSize: 16, fontWeight: 700, color: UI.text };
const cardDesc = {
  marginTop: 6,
  fontSize: 13,
  color: UI.subtext,
  lineHeight: 1.4,
};

const sectionTitle = {
  fontSize: 22,
  lineHeight: "28px",
  fontWeight: 800,
  marginBottom: 10,
  color: UI.text,
};

const panel = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 16,
};

const calendarWrap = {
  height: "calc(100vh - 260px)",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 12,
};

const modal = {
  position: "fixed",
  top: 100,
  left: "50%",
  transform: "translateX(-50%)",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  padding: 18,
  boxShadow: UI.shadowMd,
  zIndex: 1000,
  width: "min(92vw, 520px)",
};

const table = { width: "100%", borderCollapse: "collapse" };
const thtd = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
};

const actionBtn = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: bg,
  color: fg,
  fontWeight: 800,
  cursor: "pointer",
});

/* ───────────────── Date helpers ───────────────── */
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

const parseLocalDateOnly = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const monthRange = (d) => {
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { monthStart, monthEnd };
};

const daysInRange = (from, to) => {
  if (!from || !to) return [];
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const out = [];
  for (let d = a; d <= b; d.setDate(d.getDate() + 1)) out.push(dateKey(d));
  return out;
};

/* Notes helpers for Usage chart */
const COUNTABLE_NOTES = ["on set", "on-set", "onset", "shoot day", "shoot"];
const isCountableNote = (note) => {
  if (!note) return false;
  const n = String(note).toLowerCase();
  return COUNTABLE_NOTES.some((k) => n.includes(k));
};
const getDayNote = (booking, dayKey) => {
  let v =
    booking?.notesByDate?.[dayKey] ??
    booking?.dayNotes?.[dayKey] ??
    booking?.dailyNotes?.[dayKey] ??
    booking?.notesForEachDay?.[dayKey];
  if (v && typeof v === "object") {
    v = v.note ?? v.text ?? v.value ?? v.label ?? v.name;
  }
  if (v) return v;

  if (
    Array.isArray(booking?.bookingDates) &&
    Array.isArray(booking?.bookingNotes) &&
    booking.bookingNotes.length === booking.bookingDates.length
  ) {
    const idx = booking.bookingDates.findIndex((d) => d === dayKey);
    if (idx >= 0) return booking.bookingNotes[idx];
  }

  const single =
    booking?.noteForTheDay ??
    booking?.note ??
    booking?.dayNote ??
    booking?.dailyNote;

  if (
    single &&
    (Array.isArray(booking.bookingDates)
      ? booking.bookingDates.length === 1
      : true)
  ) {
    return single;
  }

  return null;
};

/* General label builder for a vehicle object */
const buildVehicleLabelFromObject = (v) => {
  if (!v) return "";

  if (typeof v === "string") return v.trim(); // fallback

  const base =
    v.name ??
    v.vehicleName ??
    v.label ??
    v.title ??
    v.displayName ??
    v.vehicle ??
    v.model ??
    v.type ??
    "";

  const reg =
    v.registration ??
    v.reg ??
    v.regNumber ??
    v.regNo ??
    v.plate ??
    v.numberPlate ??
    "";

  const baseClean = String(base || "").trim();
  const regClean = String(reg || "").trim().toUpperCase();

  if (baseClean && regClean) return `${baseClean} (${regClean})`;
  if (baseClean) return baseClean;
  if (regClean) return regClean;
  return "";
};

/* ───────────────── Defect utilities ───────────────── */
const isDefectItem = (it) => it?.status === "defect";
const isPendingDefect = (it) => !it?.review?.status; // pending = no review yet

function extractPendingDefects(checkDocs) {
  const out = [];
  for (const c of checkDocs) {
    if (!Array.isArray(c.items)) continue;
    c.items.forEach((it, idx) => {
      if (isDefectItem(it) && isPendingDefect(it)) {
        out.push({
          checkId: c.id,
          jobId: c.jobId || "",
          jobLabel: c.jobNumber ? `#${c.jobNumber}` : c.jobId || "",
          vehicle: c.vehicle || "",
          dateISO: c.dateISO || c.date || c.createdAt || "",
          driverName: c.driverName || "",
          odometer: c.odometer || "",
          photos: Array.isArray(c.photos) ? c.photos : [],
          defectIndex: idx,
          itemLabel: it.label || `Item ${idx + 1}`,
          defectNote: it.note || "",
          submittedAt: c.createdAt || c.updatedAt || null,
        });
      }
    });
  }
  out.sort((a, b) =>
    a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : 0
  );
  return out;
}

/* ───────────────── Component ───────────────── */
export default function VehiclesHomePage() {
  const router = useRouter();

  // Calendar state
  const [calView, setCalView] = useState("month");
  const [calDate, setCalDate] = useState(new Date());

  const [mounted, setMounted] = useState(false);
  const [workBookings, setWorkBookings] = useState([]);
  const [usageData, setUsageData] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [overdueMOTCount, setOverdueMOTCount] = useState(0);
  const [overdueServiceCount, setOverdueServiceCount] = useState(0);

  // Usage month
  const [usageMonth, setUsageMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Vehicle ID → label map
  const [vehicleNameMap, setVehicleNameMap] = useState({});

  // Defect queue state
  const [checkDocs, setCheckDocs] = useState([]);
  const [pendingDefects, setPendingDefects] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModal, setActionModal] = useState(null); // {defect, decision, comment, category?}

  useEffect(() => setMounted(true), []);

  /* ───────── Load all vehicles for name lookups ───────── */
  useEffect(() => {
    const fetchVehicles = async () => {
      const snap = await getDocs(collection(db, "vehicles"));
      const map = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        const label = buildVehicleLabelFromObject({
          name:
            data.name ||
            data.vehicleName ||
            data.displayName ||
            data.model ||
            "",
          registration:
            data.registration ||
            data.reg ||
            data.regNumber ||
            data.regNo ||
            "",
        });
        map[d.id] = label || d.id; // fallback to id if truly no label
      });
      setVehicleNameMap(map);
    };
    fetchVehicles();
  }, []);

  // Overdue counters
  useEffect(() => {
    const fetchVehicleMaintenance = async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      const vehicles = snapshot.docs.map((d) => d.data());
      const today = new Date();

      let motOverdue = 0;
      let serviceOverdue = 0;

      vehicles.forEach((vehicle) => {
        const motDate = toDate(vehicle.motDate);
        const serviceDate = toDate(vehicle.serviceDate);
        if (motDate && motDate < today) motOverdue++;
        if (serviceDate && serviceDate < today) serviceOverdue++;
      });

      setOverdueMOTCount(motOverdue);
      setOverdueServiceCount(serviceOverdue);
    };

    fetchVehicleMaintenance();
  }, []);

  /* ───────── Usage histogram (now with proper names) ───────── */
  useEffect(() => {
    const fetchUsage = async () => {
      const { monthStart, monthEnd } = monthRange(usageMonth);
      const usedByDay = new Map();

      const snapshot = await getDocs(collection(db, "bookings"));
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // Map booking vehicles → human-friendly names
        const mapVehicleFromBooking = (entry) => {
          if (!entry) return "";
          if (typeof entry === "string") {
            // string could be a vehicle doc ID
            if (vehicleNameMap[entry]) return vehicleNameMap[entry];
            return entry; // fallback
          }
          if (entry.id && vehicleNameMap[entry.id]) {
            return vehicleNameMap[entry.id];
          }
          return buildVehicleLabelFromObject(entry) || "";
        };

        const vehicles = Array.isArray(data.vehicles)
          ? data.vehicles.map(mapVehicleFromBooking).filter(Boolean)
          : [];
        if (vehicles.length === 0) return;

        let dayKeys = [];
        if (Array.isArray(data.bookingDates) && data.bookingDates.length > 0) {
          dayKeys = data.bookingDates
            .map((s) => parseLocalDateOnly(s))
            .filter(Boolean)
            .filter((d) => d >= monthStart && d <= monthEnd)
            .map(dateKey);
        } else {
          const start =
            parseLocalDateOnly(data.date) ||
            parseLocalDateOnly(data.startDate) ||
            toDate(data.date) ||
            toDate(data.startDate);

          const end =
            parseLocalDateOnly(data.endDate) ||
            parseLocalDateOnly(data.date) ||
            toDate(data.endDate) ||
            toDate(data.date) ||
            start;

          if (!start) return;

          const clampedStart = start < monthStart ? monthStart : start;
          const clampedEnd =
            (end || start) > monthEnd ? monthEnd : end || start;

          dayKeys = daysInRange(clampedStart, clampedEnd);
        }

        if (dayKeys.length === 0) return;

        const filteredByNote = dayKeys.filter((k) =>
          isCountableNote(getDayNote(data, k))
        );
        if (filteredByNote.length === 0) return;

        vehicles.forEach((name) => {
          if (!usedByDay.has(name)) usedByDay.set(name, new Set());
          const s = usedByDay.get(name);
          filteredByNote.forEach((k) => s.add(k));
        });
      });

      const usageArray = Array.from(usedByDay.entries())
        .map(([name, set]) => ({ name, usage: set.size }))
        .sort((a, b) => b.usage - a.usage);

      setUsageData(usageArray);
    };

    fetchUsage();
  }, [usageMonth, vehicleNameMap]);

  // Calendar events (MOT & service)
  useEffect(() => {
    const fetchMaintenanceEvents = async () => {
      const snapshot = await getDocs(collection(db, "workBookings"));
      const events = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const start = toDate(data.startDate);
          const end = toDate(data.endDate || data.startDate);
          if (!start || !end) return null;

          return {
            title: `${data.vehicleName} - ${data.maintenanceType}`,
            start,
            end: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
            allDay: true,
          };
        })
        .filter(Boolean);

      setWorkBookings(events);
    };

    fetchMaintenanceEvents();
  }, []);

  // Load submitted checks (for defects queue)
  useEffect(() => {
    const loadChecks = async () => {
      const snap = await getDocs(collection(db, "vehicleChecks"));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const submitted = docs.filter((c) => c.status === "submitted");
      setCheckDocs(submitted);
      setPendingDefects(extractPendingDefects(submitted));
    };
    loadChecks();
  }, []);

  // Defect action handlers
  const openApprove = (defect) =>
    setActionModal({
      defect,
      decision: "approved",
      comment: "",
      category: "general",
    });

  const openDecline = (defect) =>
    setActionModal({ defect, decision: "declined", comment: "" });

  const performDecision = async () => {
    if (!actionModal?.defect || !actionModal?.decision) return;
    setActionLoading(true);
    try {
      const { defect, decision, comment, category } = actionModal;
      const reviewer =
        auth?.currentUser?.displayName ||
        auth?.currentUser?.email ||
        "Supervisor";

      if (decision === "approved" && !category) {
        alert(
          "Choose where to route this defect: General Maintenance or Immediate Defects."
        );
        setActionLoading(false);
        return;
      }

      const path = `items.${defect.defectIndex}.review`;
      const reviewPayload = {
        status: decision,
        reviewedBy: reviewer,
        reviewedAt: serverTimestamp(),
        comment: (comment || "").trim(),
      };

      if (decision === "approved") {
        reviewPayload.category = String(category || "")
          .trim()
          .toLowerCase();
      }

      await updateDoc(doc(db, "vehicleChecks", defect.checkId), {
        [path]: reviewPayload,
        updatedAt: serverTimestamp(),
      });

      setPendingDefects((prev) =>
        prev.filter(
          (d) =>
            !(
              d.checkId === defect.checkId &&
              d.defectIndex === defect.defectIndex
            )
        )
      );

      setActionModal(null);

      if (decision === "approved") {
        if (category === "immediate") {
          router.push(IMMEDIATE_DEFECTS_PATH);
        } else {
          router.push(GENERAL_DEFECTS_PATH);
        }
      } else {
        router.push(DECLINED_DEFECTS_PATH);
      }
    } catch (e) {
      console.error("defect review error:", e);
      alert("Could not update defect. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectEvent = (event) => setSelectedEvent(event);

  // Quick links tiles
  const vehicleSections = useMemo(
    () => [
      {
        title: "General Maintenance",
        description: "Approved, non-urgent defects to plan and schedule.",
        link: GENERAL_DEFECTS_PATH,
      },
      {
        title: "Immediate Defects",
        description: "Approved urgent issues that need action now.",
        link: IMMEDIATE_DEFECTS_PATH,
      },
      {
        title: "Declined Defects",
        description: "Defects that were reviewed and declined.",
        link: DECLINED_DEFECTS_PATH,
      },
      {
        title:
          `MOT Schedule` +
          (overdueMOTCount > 0 ? ` — ${overdueMOTCount} overdue` : ""),
        description: "View and manage MOT due dates for all vehicles.",
        link: "/mot-overview",
      },
      {
        title:
          `Service History` +
          (overdueServiceCount > 0
            ? ` — ${overdueServiceCount} overdue`
            : ""),
        description: "Track past and upcoming vehicle servicing.",
        link: "/service-overview",
      },
      {
        title: "Vehicle Usage Logs",
        description: "Monitor vehicle usage across bookings and trips.",
        link: "/usage-overview",
      },
      {
        title: "Vehicle List",
        description: "View, edit or delete vehicles currently in the system.",
        link: "/vehicles",
      },
      {
        title: "Equipment List",
        description: "View, edit or delete equipment currently in the system.",
        link: "/equipment",
      },
    ],
    [overdueMOTCount, overdueServiceCount]
  );

  return (
    <HeaderSidebarLayout>
      <div style={{ display: "flex", ...shell }}>
        <main style={main}>
          <div style={subbar}>
            <h1 style={h1}>Vehicle Management</h1>
            <div style={{ fontSize: 12, color: UI.subtext }}>
              Overview • Usage • MOT • Service
            </div>
          </div>

          {/* Quick links */}
          <div style={grid}>
            <VehicleCheckTile onClick={() => router.push(VEHICLE_CHECK_PATH)} />
            {vehicleSections.map((section, idx) => (
              <div
                key={idx}
                style={card}
                onClick={() => router.push(section.link)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = UI.shadowMd;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0px)";
                  e.currentTarget.style.boxShadow = UI.shadowSm;
                }}
              >
                <h2 style={cardTitle}>{section.title}</h2>
                <p style={cardDesc}>{section.description}</p>
              </div>
            ))}
          </div>

          {/* ───────────── Defect Review Queue ───────────── */}
          <div style={{ marginTop: 28 }}>
            <h2 style={sectionTitle}>Defect Review</h2>
            <div style={{ ...panel, overflow: "hidden" }}>
              <div
                style={{
                  marginBottom: 10,
                  fontSize: 12,
                  color: UI.subtext,
                }}
              >
                Pending approval for submitted checks. Approve and route to the
                correct bucket; Decline to mark as not actionable.
              </div>

              <table style={table}>
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    <th style={{ ...thtd, textAlign: "left" }}>Date</th>
                    <th style={{ ...thtd, textAlign: "left" }}>Vehicle</th>
                    <th style={{ ...thtd, textAlign: "left" }}>Defect</th>
                    <th style={{ ...thtd, textAlign: "left" }}>Note</th>
                    <th style={{ ...thtd, textAlign: "left" }}>Driver</th>
                    <th style={{ ...thtd, textAlign: "center" }}>Photos</th>
                    <th style={{ ...thtd, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingDefects.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        style={{
                          ...thtd,
                          textAlign: "center",
                          color: UI.subtext,
                        }}
                      >
                        No pending defects. 🎉
                      </td>
                    </tr>
                  ) : (
                    pendingDefects.map((d, i) => (
                      <tr key={`${d.checkId}-${d.defectIndex}-${i}`}>
                        <td style={thtd}>{d.dateISO || "—"}</td>
                        <td style={thtd}>{d.vehicle || "—"}</td>
                        <td style={thtd} title={d.itemLabel}>
                          <strong>#{d.defectIndex + 1}</strong> — {d.itemLabel}
                        </td>
                        <td style={{ ...thtd, maxWidth: 360 }}>
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
                            {d.defectNote || "—"}
                          </div>
                        </td>
                        <td style={thtd}>{d.driverName || "—"}</td>
                        <td style={{ ...thtd, textAlign: "center" }}>
                          {d.photos?.length ? d.photos.length : 0}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>
                          <a
                            href={CHECK_DETAIL_PATH(d.checkId)}
                            style={{
                              ...actionBtn("#fff", "#111827"),
                              marginRight: 6,
                            }}
                          >
                            View check →
                          </a>
                          <button
                            onClick={() => openApprove(d)}
                            style={{
                              ...actionBtn("#ecfdf5", "#065f46"),
                              marginRight: 6,
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => openDecline(d)}
                            style={actionBtn("#fef2f2", "#991b1b")}
                          >
                            Decline
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Usage chart */}
          <div style={{ marginTop: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <h2 style={sectionTitle}>Vehicle Usage (Selected Month)</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <ToolbarBtn
                  onClick={() =>
                    setUsageMonth(
                      (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                    )
                  }
                >
                  ← Prev
                </ToolbarBtn>
                <input
                  type="month"
                  value={`${usageMonth.getFullYear()}-${String(
                    usageMonth.getMonth() + 1
                  ).padStart(2, "0")}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split("-").map(Number);
                    if (y && m) setUsageMonth(new Date(y, m - 1, 1));
                  }}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 13,
                    fontWeight: 700,
                    background: "#fff",
                    color: UI.text,
                    cursor: "pointer",
                  }}
                />
                <ToolbarBtn
                  onClick={() =>
                    setUsageMonth(
                      (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                    )
                  }
                >
                  Next →
                </ToolbarBtn>
              </div>
            </div>

            <div style={{ marginBottom: 8, color: UI.subtext, fontSize: 12 }}>
              Counting days where note is <strong>“On Set”</strong> or{" "}
              <strong>“Shoot day”</strong>.
            </div>

            <div style={panel}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={usageData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: UI.subtext }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: UI.subtext }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={{ stroke: "#e5e7eb" }}
                  />
                  <Tooltip
                    wrapperStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                    }}
                    contentStyle={{
                      borderRadius: 8,
                      boxShadow: UI.shadowSm,
                    }}
                  />
                  <Bar dataKey="usage" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Calendar */}
          <div style={{ marginTop: 28 }}>
            <h2 style={sectionTitle}>MOT & Service Calendar</h2>
            <div style={calendarWrap}>
              {mounted && (
                <Calendar
                  localizer={localizer}
                  events={workBookings}
                  startAccessor="start"
                  endAccessor="end"
                  view={calView}
                  onView={(v) => setCalView(v)}
                  date={calDate}
                  onNavigate={(d) => setCalDate(d)}
                  views={["month", "week", "work_week", "day", "agenda"]}
                  popup
                  showMultiDayTimes
                  style={{ height: "100%" }}
                  dayPropGetter={() => ({
                    style: {
                      minHeight: "110px",
                      borderRight: "1px solid #eef2f7",
                    },
                  })}
                  eventPropGetter={() => ({
                    style: {
                      borderRadius: 8,
                      border: "1.5px solid #1f2937",
                      background: "#e5e7eb",
                      color: "#111827",
                      padding: 0,
                      boxShadow: "0 2px 4px rgba(2,6,23,0.08)",
                    },
                  })}
                  components={{
                    event: ({ event }) => (
                      <div
                        title={event.title}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          fontSize: 13,
                          lineHeight: 1.3,
                          fontWeight: 700,
                          padding: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.02em",
                        }}
                      >
                        <span>{event.title}</span>
                        {event.allDay && (
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              opacity: 0.8,
                            }}
                          >
                            All Day
                          </span>
                        )}
                      </div>
                    ),
                    toolbar: (props) => (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            letterSpacing: 0.2,
                          }}
                        >
                          {props.label}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <ToolbarBtn
                            onClick={() => props.onNavigate("PREV")}
                          >
                            ←
                          </ToolbarBtn>
                          <ToolbarBtn
                            onClick={() => props.onNavigate("TODAY")}
                          >
                            Today
                          </ToolbarBtn>
                          <ToolbarBtn
                            onClick={() => props.onNavigate("NEXT")}
                          >
                            →
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "month"}
                            onClick={() => props.onView("month")}
                          >
                            Month
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "week"}
                            onClick={() => props.onView("week")}
                          >
                            Week
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "work_week"}
                            onClick={() => props.onView("work_week")}
                          >
                            Work Week
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "day"}
                            onClick={() => props.onView("day")}
                          >
                            Day
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "agenda"}
                            onClick={() => props.onView("agenda")}
                          >
                            Agenda
                          </ToolbarBtn>
                        </div>
                      </div>
                    ),
                  }}
                  onSelectEvent={handleSelectEvent}
                />
              )}
            </div>
          </div>

          {selectedEvent && (
            <div style={modal}>
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontWeight: 800,
                }}
              >
                {selectedEvent.title}
              </h3>
              <p style={{ margin: 0, color: UI.subtext }}>
                <strong style={{ color: UI.text }}>Start:</strong>{" "}
                {selectedEvent.start.toLocaleDateString()}
              </p>
              <p
                style={{
                  margin: "6px 0 12px",
                  color: UI.subtext,
                }}
              >
                <strong style={{ color: UI.text }}>End:</strong>{" "}
                {selectedEvent.end.toLocaleDateString()}
              </p>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: UI.radiusSm,
                  cursor: "pointer",
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  color: UI.text,
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
          )}

          {/* Decision modal */}
          {actionModal && (
            <div style={{ ...modal, top: 120 }}>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontWeight: 800,
                }}
              >
                {actionModal.decision === "approved"
                  ? "Approve defect"
                  : "Decline defect"}
              </h3>
              <div
                style={{
                  fontSize: 13,
                  color: UI.subtext,
                  marginBottom: 10,
                }}
              >
                <div>
                  <strong>Date:</strong> {actionModal.defect.dateISO}
                </div>
                <div>
                  <strong>Job:</strong>{" "}
                  {actionModal.defect.jobLabel || actionModal.defect.jobId}
                </div>
                <div>
                  <strong>Vehicle:</strong> {actionModal.defect.vehicle}
                </div>
                <div>
                  <strong>Item:</strong> #
                  {actionModal.defect.defectIndex + 1} —{" "}
                  {actionModal.defect.itemLabel}
                </div>
                {actionModal.defect.defectNote ? (
                  <div style={{ marginTop: 6 }}>
                    <strong>Note:</strong>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        background: "#fafafa",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: 10,
                        marginTop: 4,
                      }}
                    >
                      {actionModal.defect.defectNote}
                    </div>
                  </div>
                ) : null}
              </div>

              {actionModal.decision === "approved" && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: UI.subtext,
                      marginBottom: 6,
                    }}
                  >
                    Route approved defect to:
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setActionModal((m) => ({
                          ...m,
                          category: "general",
                        }))
                      }
                      style={{
                        ...actionBtn("#fff", "#111827"),
                        borderColor:
                          actionModal.category === "general"
                            ? "#111827"
                            : "#e5e7eb",
                        boxShadow:
                          actionModal.category === "general"
                            ? "0 2px 6px rgba(2,6,23,0.12)"
                            : "none",
                      }}
                      disabled={actionLoading}
                    >
                      General Maintenance
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setActionModal((m) => ({
                          ...m,
                          category: "immediate",
                        }))
                      }
                      style={{
                        ...actionBtn("#fff", "#111827"),
                        borderColor:
                          actionModal.category === "immediate"
                            ? "#111827"
                            : "#e5e7eb",
                        boxShadow:
                          actionModal.category === "immediate"
                            ? "0 2px 6px rgba(2,6,23,0.12)"
                            : "none",
                      }}
                      disabled={actionLoading}
                    >
                      Immediate Defects
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: UI.subtext,
                    }}
                  >
                    Pick <strong>Immediate</strong> for safety-critical issues;
                    otherwise use <strong>General</strong>.
                  </div>
                </div>
              )}

              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 800,
                  color: UI.subtext,
                  marginBottom: 6,
                }}
              >
                Resolution comment (optional)
              </label>
              <textarea
                value={actionModal.comment}
                onChange={(e) =>
                  setActionModal((m) => ({
                    ...m,
                    comment: e.target.value,
                  }))
                }
                rows={4}
                placeholder="e.g., Minor scratch; safe to operate. Logged for bodyshop visit."
                style={{
                  width: "100%",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              />

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setActionModal(null)}
                  style={actionBtn("#fff", "#111827")}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={performDecision}
                  style={
                    actionModal.decision === "approved"
                      ? actionBtn("#ecfdf5", "#065f46")
                      : actionBtn("#fef2f2", "#991b1b")
                  }
                  disabled={
                    actionLoading ||
                    (actionModal.decision === "approved" &&
                      !actionModal.category)
                  }
                >
                  {actionLoading
                    ? "Saving…"
                    : actionModal.decision === "approved"
                    ? "Approve"
                    : "Decline"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Tiny global polish for RBC */}
      <style jsx global>{`
        .rbc-today {
          background: rgba(37, 99, 235, 0.08) !important;
        }
        .rbc-off-range-bg {
          background: #fafafa !important;
        }
        .rbc-month-view,
        .rbc-time-view,
        .rbc-agenda-view {
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial,
            sans-serif;
        }
        .rbc-header {
          padding: 8px 6px;
          font-weight: 800;
          color: #0f172a;
          border-bottom: 1px solid #e5e7eb !important;
        }
        .rbc-time-content > * + * > * {
          border-left: 1px solid #eef2f7 !important;
        }
        .rbc-event {
          overflow: visible !important;
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}

/* ───────── toolbar + tile ───────── */
function ToolbarBtn({ children, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none",
        border: "1px solid #e5e7eb",
        background: active ? "#111827" : "#ffffff",
        color: active ? "#ffffff" : "#111827",
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: active ? "0 2px 6px rgba(2,6,23,0.12)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "#ffffff";
      }}
    >
      {children}
    </button>
  );
}

function VehicleCheckTile({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open Vehicle Check"
      style={{
        ...card,
        width: "100%",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = UI.shadowMd;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
        e.currentTarget.style.boxShadow = UI.shadowSm;
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: "2px solid #111827",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 900,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        ✓
      </span>
      <div>
        <h2 style={{ ...cardTitle, marginBottom: 2 }}>Vehicle Check</h2>
        <p style={cardDesc}>Open today’s pre-use vehicle check form.</p>
      </div>
    </button>
  );
}
