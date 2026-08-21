"use client";

import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocs, onSnapshot } from "firebase/firestore";
import {
  Activity,
  AlertTriangle,
  Car,
  ChevronRight,
  ClipboardCheck,
  History,
  RotateCcw,
  Search,
  Wrench,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { normalizeAssetRecord } from "../utils/maintenanceSchema";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { getServiceRecordPresentation } from "@/app/utils/servicePresentation";

const GENERAL_DEFECTS_PATH = "/defects/general";
const IMMEDIATE_DEFECTS_PATH = "/defects/immediate";
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;
const VEHICLE_EDIT_PATH = (id) => `/vehicle-edit/${encodeURIComponent(id)}`;
const VEHICLE_SERVICE_HISTORY_PATH = (vehicleId, serviceId) =>
  `/vehicle-edit/${encodeURIComponent(vehicleId)}/service-history/${encodeURIComponent(serviceId)}`;

const UI = UI_TOKENS;

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
  if (!dated) return "-";
  return dated.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatActivityDay = (value) => {
  const dated = parseActivityDateCandidate(value);
  if (!dated) return "Undated activity";
  return dated.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatActivityTime = (value) => {
  const dated = parseActivityDateCandidate(value);
  if (!dated) return "-";
  return dated.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getActivityDayKey = (value) => {
  const dated = parseActivityDateCandidate(value);
  if (!dated) return "undated";
  return `${dated.getFullYear()}-${dated.getMonth()}-${dated.getDate()}`;
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
  service: { label: "Service", bg: "var(--color-success-soft)", fg: "var(--color-success)" },
  minor_service: { label: "Minor service", bg: "var(--color-info-soft)", fg: "var(--color-brand)" },
  repair: { label: "Repair", bg: "var(--color-warning-soft)", fg: "var(--color-warning)" },
  defect: { label: "Defect", bg: "var(--color-danger-soft)", fg: "var(--color-danger)" },
  mot_precheck: { label: "MOT pre-check", bg: "var(--color-info-soft)", fg: "var(--color-info)" },
  vehicle_prep: { label: "Vehicle prep", bg: "var(--color-info-soft)", fg: "var(--color-brand)" },
  vehicle_check: { label: "Vehicle check", bg: "var(--color-brand-soft)", fg: UI.brand },
  vehicle_issue: { label: "Vehicle issue", bg: "var(--color-accent-soft)", fg: UI.accent },
  legacy_service: { label: "Legacy service", bg: "var(--color-surface-subtle)", fg: UI.text },
  legacy_repair: { label: "Legacy repair", bg: "var(--color-surface-subtle)", fg: UI.text },
  legacy_prep: { label: "Legacy prep", bg: "var(--color-surface-subtle)", fg: UI.text },
  legacy_defect: { label: "Legacy defect", bg: "var(--color-surface-subtle)", fg: UI.text },
};

const getActivityIcon = (type) => {
  if (isDefectLike({ type })) return AlertTriangle;
  if (isServiceLike({ type }) || isRepairLike({ type })) return Wrench;
  if (isCheckLike({ type })) return ClipboardCheck;
  return Car;
};

const getStatusTone = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (["open", "failed", "declined", "overdue"].includes(normalized)) {
    return { bg: "var(--color-danger-soft)", border: "var(--color-danger-border)", fg: "var(--color-danger)" };
  }
  if (["pending", "in progress", "in_progress", "scheduled"].includes(normalized)) {
    return { bg: "var(--color-warning-soft)", border: "var(--color-warning-border)", fg: "var(--color-warning)" };
  }
  return { bg: "var(--color-success-soft)", border: "var(--color-success-border)", fg: "var(--color-success)" };
};

const filterTypeOptions = [
  ["all", "All activity"],
  ["service", "Services"],
  ["repair", "Repairs"],
  ["defect", "Defects"],
  ["checks", "Checks & prep"],
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
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
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
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "read vehicle activity vehicles" });
      setVehiclesRaw([]);
      return;
    }

    const fetchVehicles = async () => {
      const snap = await getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState));
      setVehiclesRaw(snap.docs.map((d) => normalizeAssetRecord({ id: d.id, ...(d.data() || {}) })));
    };
    fetchVehicles().catch((err) => {
      if (!handleFirestoreAccessError(err, { collectionName: "vehicles", operation: "read vehicle activity vehicles" })) {
        console.error("[vehicle-activity] vehicle fetch error:", err);
      }
      setVehiclesRaw([]);
    });
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "serviceRecords", operation: "listen vehicle activity data" });
      setServiceRecords([]);
      setDefectReports([]);
      setMotPreChecks([]);
      setVehiclePrepRecords([]);
      setCheckDocs([]);
      setVehicleIssueDocs([]);
      return undefined;
    }

    const unsubscribers = [
      onSnapshot(tenantCollectionQuery(db, "serviceRecords", dataAccessState), (snap) => setServiceRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))), (error) => handleFirestoreAccessError(error, { collectionName: "serviceRecords", operation: "listen vehicle activity service records" })),
      onSnapshot(tenantCollectionQuery(db, "defectReports", dataAccessState), (snap) => setDefectReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))), (error) => handleFirestoreAccessError(error, { collectionName: "defectReports", operation: "listen vehicle activity defect reports" })),
      onSnapshot(tenantCollectionQuery(db, "motPreChecks", dataAccessState), (snap) => setMotPreChecks(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))), (error) => handleFirestoreAccessError(error, { collectionName: "motPreChecks", operation: "listen vehicle activity MOT pre-checks" })),
      onSnapshot(tenantCollectionQuery(db, "vehiclePrepRecords", dataAccessState), (snap) => setVehiclePrepRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))), (error) => handleFirestoreAccessError(error, { collectionName: "vehiclePrepRecords", operation: "listen vehicle activity prep records" })),
      onSnapshot(tenantCollectionQuery(db, "vehicleChecks", dataAccessState), (snap) => setCheckDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))), (error) => handleFirestoreAccessError(error, { collectionName: "vehicleChecks", operation: "listen vehicle activity checks" })),
      onSnapshot(tenantCollectionQuery(db, "vehicleIssues", dataAccessState), (snap) => setVehicleIssueDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))), (error) => handleFirestoreAccessError(error, { collectionName: "vehicleIssues", operation: "listen vehicle activity issues" })),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [accessKey, dataAccessState]);

  const activity = useMemo(() => {
    const collectionActivities = [
      ...serviceRecords.map((record) => {
        const type = classifyServiceRecord(record);
        const presentation = getServiceRecordPresentation(record);
        const item = {
          activityId: `serviceRecords:${record.id}`,
          sourceCollection: "serviceRecords",
          sourceId: record.id,
          type,
          title: type === "repair" ? record.repairSummary || record.workSummary || "General repair" : presentation.title,
          summary: toActivitySummary(record.workSummary, record.repairSummary, record.repairReason, record.partsUsed, record.extraNotes),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: presentation.provider,
          status: type === "repair" ? "completed" : "logged",
          activityDate: resolveActivityDate(presentation.dateValue),
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
        if (typeFilter === "checks" && !isCheckLike(item)) return false;
        if (!["service", "repair", "defect", "checks"].includes(typeFilter) && item.type !== typeFilter) return false;
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

  const statItems = [
    {
      label: "All records",
      value: stats.total,
      note: "Everything logged across the fleet",
      icon: History,
      tone: "brand",
      filter: "all",
    },
    {
      label: "Services",
      value: stats.services,
      note: "Full, minor and legacy services",
      icon: Wrench,
      tone: "ok",
      filter: "service",
    },
    {
      label: "Repairs",
      value: stats.repairs,
      note: "Workshop repair records",
      icon: Activity,
      tone: "amber",
      filter: "repair",
    },
    {
      label: "Defects",
      value: stats.defects,
      note: `${stats.openDefects} currently open`,
      icon: AlertTriangle,
      tone: stats.openDefects ? "danger" : "ok",
      filter: "defect",
    },
    {
      label: "Checks & prep",
      value: stats.checks,
      note: "Driver checks, prep and MOT",
      icon: ClipboardCheck,
      tone: "brand",
      filter: "checks",
    },
  ];

  return (
    <HeaderSidebarLayout>
      <main className={layoutStyles.pageWrap}>
        <div className={layoutStyles.appShell}>
        <section className={layoutStyles.heroSection}>
          <div className={layoutStyles.heroHeader}>
            <div className={layoutStyles.heroCopy}>
              <h1 className={layoutStyles.pageTitle}>Vehicle activity history</h1>
              <p className={layoutStyles.pageDescription}>
                Service work, repairs, defect reports, MOT pre-checks, prep, driver checks and reported issues in one searchable log.
              </p>
            </div>

            <div className={layoutStyles.heroActions}>
              <span className={layoutStyles.liveChip}><span aria-hidden="true" />Live data</span>
              <span className={layoutStyles.recordChip}>{activity.length} total records</span>
              <button type="button" className={layoutStyles.secondaryButton} onClick={() => router.push("/vehicle-home")}>
                <Car size={15} />
                Vehicle home
              </button>
            </div>
          </div>

          <div className={layoutStyles.statGrid}>
            {statItems.map((item) => (
              <ActivityStatCard
                key={item.label}
                {...item}
                active={typeFilter === item.filter}
                onSelect={() => setTypeFilter(item.filter)}
              />
            ))}
          </div>
        </section>

        <section className={layoutStyles.logSection}>
          <div className={layoutStyles.logHeader}>
            <div>
              <h2 className={layoutStyles.logTitle}>Activity log</h2>
              <p className={layoutStyles.logHint}>Search and filter every recorded fleet event.</p>
            </div>
            <button
              type="button"
              className={layoutStyles.resetButton}
              onClick={resetFilters}
              disabled={!queryText && typeFilter === "all" && statusFilter === "all"}
            >
              <RotateCcw size={14} />
              Reset filters
            </button>
          </div>

          <div className={layoutStyles.filterBar}>
            <label className={layoutStyles.searchField}>
              <span className={layoutStyles.srOnly}>Search vehicle activity</span>
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Search vehicle, registration, note or person"
              />
            </label>
            <label className={layoutStyles.selectField}>
              <span>Activity type</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                {filterTypeOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className={layoutStyles.selectField}>
              <span>Status</span>
              <select
                value={statusFilter === "all" ? "All statuses" : statusFilter}
                onChange={(event) => setStatusFilter(event.target.value === "All statuses" ? "all" : event.target.value)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <div className={layoutStyles.resultsCount} aria-live="polite">
              <strong>{filteredActivity.length}</strong>
              <span>of {activity.length}</span>
            </div>
          </div>

          {activity.length === 0 ? (
            <div className={layoutStyles.emptyState}>No vehicle activity found yet.</div>
          ) : filteredActivity.length === 0 ? (
            <div className={layoutStyles.emptyState}>
              <Search size={22} />
              <strong>No matching activity</strong>
              <span>Try a different search or reset the filters.</span>
            </div>
          ) : (
            <div className={layoutStyles.activityList}>
              {filteredActivity.map((item, index) => {
                const typeStyle = activityTypeConfig[item.type] || activityTypeConfig.service;
                const ActivityIcon = getActivityIcon(item.type);
                const statusTone = getStatusTone(item.status);
                const toneVars = { "--activity-tone": typeStyle.fg, "--activity-soft": typeStyle.bg };
                const statusVars = {
                  "--status-tone": statusTone.fg,
                  "--status-soft": statusTone.bg,
                  "--status-border": statusTone.border,
                };
                const showDayHeading = index === 0
                  || getActivityDayKey(filteredActivity[index - 1]?.activityDate) !== getActivityDayKey(item.activityDate);
                const inner = (
                  <>
                    <div className={layoutStyles.timelineMark} aria-hidden="true">
                      <span><ActivityIcon size={15} strokeWidth={2.2} /></span>
                    </div>

                    <div className={layoutStyles.activityContent}>
                      <div className={layoutStyles.activityPrimary}>
                        <span className={layoutStyles.typeBadge}>{typeStyle.label}</span>
                        <h3>{item.title}</h3>
                        <span className={layoutStyles.statusChip} style={statusVars}>{formatActivityStatus(item.status)}</span>
                        {item.person ? <span className={layoutStyles.personMeta}>By {item.person}</span> : null}
                        <span className={layoutStyles.mobileDate}>{formatActivityTime(item.activityDate)}</span>
                      </div>

                      <div className={layoutStyles.activitySecondary}>
                        <span>{item.vehicleName}</span>
                        {item.registration ? <strong>{String(item.registration).toUpperCase()}</strong> : null}
                        <span className={layoutStyles.secondaryDivider} aria-hidden="true">·</span>
                        <span className={layoutStyles.activitySummary}>{item.summary}</span>
                      </div>
                    </div>

                    <div className={layoutStyles.activityMeta}>
                      <time dateTime={parseActivityDateCandidate(item.activityDate)?.toISOString()}>{formatActivityTime(item.activityDate)}</time>
                      {item.route ? <ChevronRight className={layoutStyles.rowChevron} size={17} aria-hidden="true" /> : null}
                    </div>
                  </>
                );

                if (item.route) {
                  return (
                    <React.Fragment key={item.activityId}>
                      {showDayHeading ? <div className={layoutStyles.dayHeading}>{formatActivityDay(item.activityDate)}</div> : null}
                      <button className={layoutStyles.activityCard} type="button" onClick={() => router.push(item.route)} style={toneVars} aria-label={`Open ${item.title} for ${item.vehicleName}`}>
                        {inner}
                      </button>
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={item.activityId}>
                    {showDayHeading ? <div className={layoutStyles.dayHeading}>{formatActivityDay(item.activityDate)}</div> : null}
                    <div className={layoutStyles.activityCard} style={toneVars}>
                      {inner}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </section>
        </div>
      </main>
    </HeaderSidebarLayout>
  );
}

function ActivityStatCard({ label, value, note, icon: Icon, tone = "brand", active, onSelect }) {
  const colors =
    tone === "danger"
      ? { bg: "var(--color-danger-soft)", border: "var(--color-danger-border)", fg: "var(--color-danger)" }
      : tone === "amber"
      ? { bg: "var(--color-warning-soft)", border: "var(--color-warning-border)", fg: "var(--color-warning)" }
      : tone === "ok"
      ? { bg: "var(--color-success-soft)", border: "var(--color-success-border)", fg: "var(--color-success)" }
      : { bg: UI.brandSoft, border: UI.brandBorder, fg: UI.brand };

  return (
    <button
      type="button"
      className={`${layoutStyles.statCard} ${active ? layoutStyles.statCardActive : ""}`}
      onClick={onSelect}
      aria-pressed={active}
      style={{ "--stat-soft": colors.bg, "--stat-border": colors.border, "--stat-tone": colors.fg }}
    >
      <div className={layoutStyles.statTopline}>
        <div>
          <div className={layoutStyles.statLabel}>{label}</div>
          <div className={layoutStyles.statValue}>{value}</div>
        </div>
        <span className={layoutStyles.statIcon}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
      </div>
      <div className={layoutStyles.statNote}>{note}</div>
    </button>
  );
}
