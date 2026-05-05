"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { normalizeAssetRecord } from "../utils/maintenanceSchema";

const GENERAL_DEFECTS_PATH = "/defects/general";
const IMMEDIATE_DEFECTS_PATH = "/defects/immediate";
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;
const VEHICLE_EDIT_PATH = (id) => `/vehicle-edit/${encodeURIComponent(id)}`;
const VEHICLE_SERVICE_HISTORY_PATH = (vehicleId, serviceId) =>
  `/vehicle-edit/${encodeURIComponent(vehicleId)}/service-history/${encodeURIComponent(serviceId)}`;

const UI = {
  radius: 18,
  radiusSm: 12,
  shadowSm: "0 12px 32px rgba(15,23,42,0.07)",
  shadowHover: "0 18px 38px rgba(15,23,42,0.12)",
  border: "1px solid #dbe2ea",
  bg: "#edf3f8",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  accent: "#8b5e3c",
};

const pageWrap = { padding: "22px 18px 34px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const appShell = { maxWidth: 1380, margin: "0 auto", display: "grid", gap: 14 };
const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: "-0.01em" };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };
const sectionTag = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
const chip = {
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const chipSoft = { ...chip, color: UI.brand };
const divider = { height: 1, background: "#dde5ee", margin: "10px 0" };
const inputBase = {
  width: "100%",
  minHeight: 40,
  padding: "9px 11px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brandBorder}`,
  background: "#fff",
  color: UI.text,
  fontSize: 13,
  outline: "none",
};

const badge = (bg, fg) => ({
  padding: "4px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: bg,
  color: fg,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
  lineHeight: "18px",
});

const btn = () => ({
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: UI.text,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 4px 10px rgba(15,23,42,0.05)",
  fontSize: 12.5,
  lineHeight: 1.2,
});

const buildVehicleLabelFromObject = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  const base = v.name ?? v.vehicleName ?? v.label ?? v.title ?? v.displayName ?? v.vehicle ?? v.model ?? v.type ?? "";
  const reg = v.registration ?? v.reg ?? v.regNumber ?? v.regNo ?? v.plate ?? v.numberPlate ?? "";
  const baseClean = String(base || "").trim();
  const regClean = String(reg || "").trim().toUpperCase();
  if (baseClean && regClean) return `${baseClean} (${regClean})`;
  return baseClean || regClean || "";
};

const getTimestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const parseActivityDateCandidate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const dated = value.toDate();
    return Number.isNaN(dated?.getTime?.()) ? null : dated;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const dated = new Date(value);
    return Number.isNaN(dated.getTime()) ? null : dated;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (match) {
    const [, day, month, year, hour = "0", minute = "0"] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour = "0", minute = "0"] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  const dated = new Date(trimmed);
  return Number.isNaN(dated.getTime()) ? null : dated;
};

const resolveActivityDate = (...values) => {
  for (const value of values) {
    const dated = parseActivityDateCandidate(value);
    if (dated) return dated;
  }
  return null;
};

const formatActivityDate = (value) => {
  const dated = parseActivityDateCandidate(value);
  if (!dated) return "—";
  return dated.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatActivityStatus = (value) => {
  const clean = String(value || "").trim();
  if (!clean) return "Logged";
  return clean.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const classifyServiceRecord = (record) => {
  const type = String(record?.serviceType || "").toLowerCase();
  if (record?.recordType === "repair" || type.includes("repair")) return "repair";
  if (type.includes("minor") || type.includes("interim")) return "minor_service";
  return "service";
};

const toActivitySummary = (...values) => {
  const text = values.map((value) => String(value || "").trim()).find(Boolean);
  return text || "No summary provided.";
};

const activityTypeConfig = {
  service: { label: "Service", bg: "#ecfdf5", fg: "#065f46" },
  minor_service: { label: "Minor service", bg: "#eff6ff", fg: "#1d4ed8" },
  repair: { label: "Repair", bg: "#fff7ed", fg: "#9a3412" },
  defect: { label: "Defect", bg: "#fef2f2", fg: "#991b1b" },
  mot_precheck: { label: "MOT pre-check", bg: "#f5f3ff", fg: "#6d28d9" },
  vehicle_prep: { label: "Vehicle prep", bg: "#eef2ff", fg: "#3730a3" },
  vehicle_check: { label: "Vehicle check", bg: "#edf3f8", fg: UI.brand },
  vehicle_issue: { label: "Vehicle issue", bg: "#f5ede6", fg: UI.accent },
  legacy_service: { label: "Legacy service", bg: "#f8fafc", fg: UI.text },
  legacy_repair: { label: "Legacy repair", bg: "#f8fafc", fg: UI.text },
  legacy_prep: { label: "Legacy prep", bg: "#f8fafc", fg: UI.text },
  legacy_defect: { label: "Legacy defect", bg: "#f8fafc", fg: UI.text },
};

const filterTypeOptions = [
  ["all", "All activity"],
  ["service", "Services"],
  ["repair", "Repairs"],
  ["defect", "Defects"],
  ["mot_precheck", "MOT"],
  ["vehicle_prep", "Prep"],
  ["vehicle_check", "Checks"],
  ["vehicle_issue", "Issues"],
];

const activityTypeLabel = (type) => activityTypeConfig[type]?.label || formatActivityStatus(type || "Activity");

const isDefectLike = (item) => item.type === "defect" || item.type === "vehicle_issue" || item.type === "legacy_defect";
const isServiceLike = (item) => ["service", "minor_service", "legacy_service"].includes(item.type);
const isRepairLike = (item) => ["repair", "legacy_repair"].includes(item.type);
const isCheckLike = (item) => ["vehicle_check", "vehicle_prep", "mot_precheck", "legacy_prep"].includes(item.type);

const statCard = {
  ...surface,
  padding: 14,
  display: "grid",
  gap: 4,
  minHeight: 88,
  boxShadow: "0 8px 22px rgba(15,23,42,0.055)",
};

const getActivityRoute = (activity) => {
  if (activity?.type === "service" || activity?.type === "minor_service" || activity?.type === "repair") {
    if (activity.vehicleId && activity.sourceId) return VEHICLE_SERVICE_HISTORY_PATH(activity.vehicleId, activity.sourceId);
    return activity.vehicleId ? VEHICLE_EDIT_PATH(activity.vehicleId) : null;
  }
  if (activity?.type === "vehicle_check" && activity.sourceId) return CHECK_DETAIL_PATH(activity.sourceId);
  if (activity?.type === "vehicle_prep") return "/preplist-dashboard";
  if (activity?.type === "mot_precheck") return "/mot-overview";
  if (activity?.type === "defect") {
    return String(activity.status || "").toLowerCase() === "open" ? IMMEDIATE_DEFECTS_PATH : GENERAL_DEFECTS_PATH;
  }
  if (activity?.type === "vehicle_issue") {
    return activity.vehicleId ? VEHICLE_EDIT_PATH(activity.vehicleId) : GENERAL_DEFECTS_PATH;
  }
  return activity?.vehicleId ? VEHICLE_EDIT_PATH(activity.vehicleId) : null;
};

const buildActivityFromLegacyHistory = (vehicle) => {
  const vehicleId = vehicle?.id || null;
  const vehicleName = vehicle?.assetLabel || vehicle?.name || vehicle?.vehicleName || "Vehicle";
  const registration = vehicle?.registration || vehicle?.reg || "";
  const asArray = (value) => (Array.isArray(value) ? value : []);

  const mapBase = (entry, index, sourceCollection, sourceId, type, title, summary, person, status, activityDate) => ({
    activityId: `${sourceCollection}:${vehicleId || "vehicle"}:${sourceId || index}`,
    sourceCollection,
    sourceId: String(sourceId || index),
    type,
    title,
    summary,
    vehicleId,
    vehicleName,
    registration,
    person,
    status,
    activityDate,
    createdAt: null,
    updatedAt: null,
    route: vehicleId ? VEHICLE_EDIT_PATH(vehicleId) : null,
  });

  return [
    ...asArray(vehicle?.serviceHistory).map((entry, index) =>
      mapBase(
        entry,
        index,
        "vehicles.serviceHistory",
        entry?.serviceRecordId,
        "legacy_service",
        entry?.bookingRef || entry?.serviceType || "Service history entry",
        toActivitySummary(entry?.notes, entry?.partsUsed),
        entry?.completedBy || entry?.signedBy || "",
        "history",
        resolveActivityDate(entry?.completedDate, entry?.date, entry?.createdAt)
      )
    ),
    ...asArray(vehicle?.repairHistory).map((entry, index) =>
      mapBase(
        entry,
        index,
        "vehicles.repairHistory",
        entry?.repairRecordId,
        "legacy_repair",
        entry?.summary || "Repair history entry",
        toActivitySummary(entry?.reason, entry?.partsUsed),
        entry?.completedBy || "",
        "history",
        resolveActivityDate(entry?.completedDate, entry?.date, entry?.createdAt)
      )
    ),
    ...asArray(vehicle?.prepHistory).map((entry, index) =>
      mapBase(
        entry,
        index,
        "vehicles.prepHistory",
        index,
        "legacy_prep",
        "Vehicle prep",
        toActivitySummary(entry?.notes),
        entry?.completedBy || "",
        entry?.completed ? "completed" : "logged",
        resolveActivityDate(entry?.recordedAt, entry?.prepDate, entry?.createdAt)
      )
    ),
    ...asArray(vehicle?.defectHistory).map((entry, index) =>
      mapBase(
        entry,
        index,
        "vehicles.defectHistory",
        index,
        "legacy_defect",
        entry?.description || "Defect history entry",
        toActivitySummary(entry?.notes, entry?.location),
        entry?.reportedBy || "",
        entry?.status || "open",
        resolveActivityDate(entry?.updatedAt, entry?.createdAt)
      )
    ),
  ];
};

export default function VehicleActivityPage() {
  const router = useRouter();
  const [vehiclesRaw, setVehiclesRaw] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [defectReports, setDefectReports] = useState([]);
  const [motPreChecks, setMotPreChecks] = useState([]);
  const [vehiclePrepRecords, setVehiclePrepRecords] = useState([]);
  const [checkDocs, setCheckDocs] = useState([]);
  const [vehicleIssueDocs, setVehicleIssueDocs] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const fetchVehicles = async () => {
      const snap = await getDocs(collection(db, "vehicles"));
      setVehiclesRaw(snap.docs.map((d) => normalizeAssetRecord({ id: d.id, ...(d.data() || {}) })));
    };
    fetchVehicles().catch((err) => {
      console.error("[vehicle-activity] vehicle fetch error:", err);
      setVehiclesRaw([]);
    });
  }, []);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(collection(db, "serviceRecords"), (snap) => setServiceRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
      onSnapshot(collection(db, "defectReports"), (snap) => setDefectReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
      onSnapshot(collection(db, "motPreChecks"), (snap) => setMotPreChecks(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
      onSnapshot(collection(db, "vehiclePrepRecords"), (snap) => setVehiclePrepRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
      onSnapshot(collection(db, "vehicleChecks"), (snap) => setCheckDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
      onSnapshot(collection(db, "vehicleIssues"), (snap) => setVehicleIssueDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const activity = useMemo(() => {
    const collectionActivities = [
      ...serviceRecords.map((record) => {
        const type = classifyServiceRecord(record);
        const item = {
          activityId: `serviceRecords:${record.id}`,
          sourceCollection: "serviceRecords",
          sourceId: record.id,
          type,
          title: type === "repair" ? record.repairSummary || record.workSummary || "General repair" : record.serviceType || "Service record",
          summary: toActivitySummary(record.workSummary, record.repairSummary, record.repairReason, record.partsUsed, record.extraNotes),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.signedBy || record.completedBy || "",
          status: type === "repair" ? "completed" : "logged",
          activityDate: resolveActivityDate(record.completedAt, record.updatedAt, record.createdAt, record.serviceDateOnly, record.serviceDate, record.completedDate),
        };
        return { ...item, route: getActivityRoute(item) };
      }),
      ...defectReports.map((record) => {
        const item = {
          activityId: `defectReports:${record.id}`,
          sourceCollection: "defectReports",
          sourceId: record.id,
          type: "defect",
          title: record.description || "Workshop defect report",
          summary: toActivitySummary(record.notes, record.location, record.severity),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.reportedBy || "",
          status: record.status || "open",
          activityDate: resolveActivityDate(record.updatedAt, record.createdAt),
        };
        return { ...item, route: getActivityRoute(item) };
      }),
      ...motPreChecks.map((record) => {
        const item = {
          activityId: `motPreChecks:${record.id}`,
          sourceCollection: "motPreChecks",
          sourceId: record.id,
          type: "mot_precheck",
          title: record.status || "MOT pre-check",
          summary: toActivitySummary(record.summary, record.faultsFound, record.workRecommended),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.signedBy || "",
          status: record.status || "completed",
          activityDate: resolveActivityDate(record.completedAt, record.updatedAt, record.createdAt, record.precheckDateOnly, record.precheckDateTime),
        };
        return { ...item, route: getActivityRoute(item) };
      }),
      ...vehiclePrepRecords.map((record) => {
        const item = {
          activityId: `vehiclePrepRecords:${record.id}`,
          sourceCollection: "vehiclePrepRecords",
          sourceId: record.id,
          type: "vehicle_prep",
          title: record.completed ? "Vehicle prep completed" : "Vehicle prep logged",
          summary: toActivitySummary(record.notes),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.completedBy || "",
          status: record.completed ? "completed" : "draft",
          activityDate: resolveActivityDate(record.completedAt, record.updatedAt, record.createdAt, record.prepDate),
        };
        return { ...item, route: getActivityRoute(item) };
      }),
      ...checkDocs.map((record) => {
        const defectCount = Array.isArray(record.items) ? record.items.filter((item) => item?.status === "defect").length : 0;
        const item = {
          activityId: `vehicleChecks:${record.id}`,
          sourceCollection: "vehicleChecks",
          sourceId: record.id,
          type: "vehicle_check",
          title: defectCount > 0 ? `${defectCount} defects found` : "Vehicle check submitted",
          summary: toActivitySummary(record.notes, defectCount > 0 ? `${defectCount} defect items logged.` : ""),
          vehicleId: record.vehicleId || null,
          vehicleName: buildVehicleLabelFromObject(record.vehicle) || record.vehicleName || "Unknown vehicle",
          registration: typeof record.vehicle === "object" ? record.vehicle?.registration || record.vehicle?.reg || "" : record.registration || "",
          person: record.driverName || record.driverCode || "",
          status: record.status || "submitted",
          activityDate: resolveActivityDate(record.updatedAt, record.createdAt, record.dateISO),
        };
        return { ...item, route: getActivityRoute(item) };
      }),
      ...vehicleIssueDocs.map((record) => {
        const item = {
          activityId: `vehicleIssues:${record.id}`,
          sourceCollection: "vehicleIssues",
          sourceId: record.id,
          type: "vehicle_issue",
          title: record.category || "Vehicle issue",
          summary: toActivitySummary(record.description),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.reporterName || record.reporterCode || "",
          status: record.status || "open",
          activityDate: resolveActivityDate(record.updatedAt, record.createdAt),
        };
        return { ...item, route: getActivityRoute(item) };
      }),
    ];

    if (collectionActivities.length > 0) {
      return collectionActivities
        .sort((a, b) => getTimestampMillis(b.activityDate) - getTimestampMillis(a.activityDate));
    }

    return vehiclesRaw
      .flatMap((vehicle) => buildActivityFromLegacyHistory(vehicle))
      .sort((a, b) => getTimestampMillis(b.activityDate) - getTimestampMillis(a.activityDate));
  }, [serviceRecords, defectReports, motPreChecks, vehiclePrepRecords, checkDocs, vehicleIssueDocs, vehiclesRaw]);

  const stats = useMemo(() => {
    const openDefects = activity.filter((item) => isDefectLike(item) && String(item.status || "").toLowerCase() === "open").length;
    return {
      total: activity.length,
      services: activity.filter(isServiceLike).length,
      repairs: activity.filter(isRepairLike).length,
      defects: activity.filter(isDefectLike).length,
      openDefects,
      checks: activity.filter(isCheckLike).length,
    };
  }, [activity]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(activity.map((item) => formatActivityStatus(item.status)).filter(Boolean))).sort();
    return ["All statuses", ...statuses];
  }, [activity]);

  const filteredActivity = useMemo(() => {
    const search = queryText.trim().toLowerCase();
    return activity.filter((item) => {
      if (typeFilter !== "all") {
        if (typeFilter === "service" && !isServiceLike(item)) return false;
        if (typeFilter === "repair" && !isRepairLike(item)) return false;
        if (typeFilter === "defect" && !isDefectLike(item)) return false;
        if (!["service", "repair", "defect"].includes(typeFilter) && item.type !== typeFilter) return false;
      }

      if (statusFilter !== "all" && formatActivityStatus(item.status) !== statusFilter) return false;
      if (!search) return true;

      return [item.title, item.summary, item.vehicleName, item.registration, item.person, item.status, activityTypeLabel(item.type)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [activity, queryText, statusFilter, typeFilter]);

  const resetFilters = () => {
    setQueryText("");
    setTypeFilter("all");
    setStatusFilter("all");
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <style>{`
          .vehicle-activity-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
          .vehicle-activity-filters { display: grid; grid-template-columns: minmax(260px, 1fr) 190px 190px auto; gap: 10px; align-items: center; }
          .vehicle-activity-list { display: grid; gap: 10px; }
          .vehicle-activity-card:hover { transform: translateY(-1px); box-shadow: ${UI.shadowHover}; border-color: #bfd0df; }
          @media (max-width: 1180px) {
            .vehicle-activity-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .vehicle-activity-filters { grid-template-columns: 1fr 1fr; }
          }
          @media (max-width: 760px) {
            .vehicle-activity-grid,
            .vehicle-activity-filters { grid-template-columns: 1fr; }
            .vehicle-activity-row { grid-template-columns: 1fr !important; }
            .vehicle-activity-type { justify-items: start !important; }
            .vehicle-activity-meta { justify-items: start !important; padding: 0 14px 14px !important; }
          }
        `}</style>
        <div style={appShell}>
        <section style={{ ...surface, padding: 18, overflow: "hidden" }}>
          <div style={sectionHeader}>
            <div>
              <div style={sectionTag}>Fleet timeline</div>
              <h1 style={{ margin: "9px 0 0", fontSize: 30, fontWeight: 900, color: UI.text, letterSpacing: "-0.02em" }}>Vehicle activity history</h1>
              <div style={{ ...hint, marginTop: 8 }}>
                Service work, repairs, defect reports, MOT pre-checks, prep, driver checks and reported issues in one searchable log.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={chipSoft}>Live data</span>
              <span style={chip}>{filteredActivity.length} / {activity.length} records</span>
              <button type="button" style={btn()} onClick={() => router.push("/vehicle-home")}>
                Back to vehicle home
              </button>
            </div>
          </div>

          <div className="vehicle-activity-grid" style={{ marginTop: 14 }}>
            {[
              ["All records", stats.total, "Everything logged across the fleet"],
              ["Services", stats.services, "Full, minor and legacy services"],
              ["Repairs", stats.repairs, "Workshop repair records"],
              ["Defects", stats.defects, `${stats.openDefects} currently open`],
              ["Checks & prep", stats.checks, "Driver checks, prep and MOT"],
            ].map(([label, value, note]) => (
              <div key={label} style={statCard}>
                <div style={{ color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
                <div style={{ color: UI.text, fontSize: 26, fontWeight: 950, lineHeight: 1 }}>{value}</div>
                <div style={{ color: UI.muted, fontSize: 12, lineHeight: 1.35 }}>{note}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...surface, padding: 14 }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Activity Log</h2>
              <div style={hint}>Filter by vehicle, registration, status, person, type or notes.</div>
            </div>
            <button type="button" style={btn()} onClick={resetFilters}>
              Reset filters
            </button>
          </div>

          <div className="vehicle-activity-filters">
            <input
              type="search"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Search vehicle, reg, note, person..."
              style={inputBase}
            />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} style={inputBase}>
              {filterTypeOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={statusFilter === "all" ? "All statuses" : statusFilter}
              onChange={(event) => setStatusFilter(event.target.value === "All statuses" ? "all" : event.target.value)}
              style={inputBase}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <span style={{ ...chipSoft, justifyContent: "center", minHeight: 40, display: "inline-flex", alignItems: "center" }}>
              Showing {filteredActivity.length}
            </span>
          </div>

          <div style={divider} />

          {activity.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13, padding: 18, textAlign: "center" }}>No vehicle activity found yet.</div>
          ) : filteredActivity.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13, padding: 18, textAlign: "center" }}>No activity matches those filters.</div>
          ) : (
            <div className="vehicle-activity-list">
              {filteredActivity.map((item) => {
                const typeStyle = activityTypeConfig[item.type] || activityTypeConfig.service;
                const cardStyle = {
                  textAlign: "left",
                  width: "100%",
                  padding: 14,
                  borderRadius: UI.radius,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  boxShadow: "0 8px 18px rgba(15,23,42,0.045)",
                  cursor: item.route ? "pointer" : "default",
                  overflow: "hidden",
                  transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
                };
                const inner = (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ ...badge(typeStyle.bg, typeStyle.fg), borderColor: "transparent" }}>{typeStyle.label}</span>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {formatActivityDate(item.activityDate)}
                      </div>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800, color: UI.text, lineHeight: 1.35 }}>
                      {item.title}
                    </div>

                    <div style={{ marginTop: 6, color: UI.muted, fontSize: 12.5, lineHeight: 1.45 }}>
                      {item.vehicleName}
                      {item.registration ? ` • ${String(item.registration).toUpperCase()}` : ""}
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        color: UI.text,
                        fontSize: 13,
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 4,
                        overflow: "hidden",
                      }}
                    >
                      {item.summary}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={chipSoft}>{formatActivityStatus(item.status)}</span>
                      {item.person ? <span style={chip}>By {item.person}</span> : null}
                      {item.route ? <span style={{ color: UI.brand, fontSize: 12, fontWeight: 800 }}>Open</span> : null}
                    </div>
                  </>
                );

                if (item.route) {
                  return (
                    <button key={item.activityId} className="vehicle-activity-card" type="button" onClick={() => router.push(item.route)} style={cardStyle}>
                      {inner}
                    </button>
                  );
                }

                return (
                  <div key={item.activityId} className="vehicle-activity-card" style={cardStyle}>
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
