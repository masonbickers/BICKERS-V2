// src/app/vehicle-edit/[id]/page.js
//  UPDATED: MOT/SERVICE bookings now support CREATE + EDIT from this page
//  Sync: When booking status is "Completed", it updates core due dates (last + next) automatically
//  Keeps: your auto-calcs + frequencies logic unchanged
//  Ensures: maintenanceBookings docs always store usable Date objects for calendar

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  ClipboardList,
  Download,
  ExternalLink,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  getDocs,
  doc as fsDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db, storage } from "../../../../firebaseConfig";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import SharedMaintenanceBookingForm from "@/app/components/MaintenanceBookingForm";
import EditMaintenanceBookingForm from "@/app/components/EditMaintenanceBookingForm";
import { useAuth } from "@/app/context/authContext";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import {
  DEFAULT_VEHICLE_COMPLIANCE_SETTINGS,
  loadVehicleFleetSettings,
  uniqueVehicleCategoryNames,
} from "@/app/utils/vehicleCategorySettings";
import { companyStoragePath } from "@/app/utils/storageAccess";
import { deleteMaintenanceBooking as deleteMaintenanceBookingRecord } from "@/app/utils/maintenanceBookingService";
import { getIsoWeekLabel, isMotNotApplicable, isServiceNotApplicable } from "@/app/utils/maintenanceSchema";
import { formatDateForDisplay, normalizeServiceRecord } from "@/app/utils/serviceRecordCompat";
import { normalizeVehicleRecord } from "@/app/utils/vehicleCompat";
import { useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";

/* UI tokens */
const UI = {
  radius: "var(--radius-md)",
  radiusSm: "var(--radius-md)",
  gap: "var(--space-3)",
  shadowSm: "var(--shadow-sm)",
  shadowHover: "var(--shadow-md)",
  border: "var(--border-default)",
  bg: "var(--color-canvas)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-soft)",
  brandBorder: "var(--color-brand-border)",
  red: "var(--legacy-color-dc2626)",
  amber: "var(--legacy-color-d97706)",
  green: "var(--legacy-color-16a34a)",
  line: "var(--color-border)",
  softBlue: "var(--color-brand-soft)",
  softSlate: "var(--legacy-color-f1f5f9)",
};

const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
};
const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--space-3)",
  flexWrap: "wrap",
  marginBottom: 10,
};
const title = { margin: 0, fontSize: "var(--font-size-xl)", fontWeight: 750, letterSpacing: 0, color: UI.text, lineHeight: 1.08 };
const subtitle = { marginTop: 6, fontSize: 13.5, color: UI.muted, maxWidth: 760, lineHeight: 1.45 };

const card = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...card, padding: "var(--space-3)" };
const heroCard = {
  ...card,
  padding: "var(--space-3)",
  background: "var(--color-white)",
  border: UI.border,
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, var(--color-white) 0%, var(--legacy-color-f8fbfe) 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "danger") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.red}`,
      background: UI.red,
      color: "var(--color-white)",
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "success") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: "1px solid var(--color-success-border)",
      background: "var(--color-success-soft)",
      color: "var(--legacy-color-065f46)",
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--color-brand) 100%)",
    color: "var(--color-white)",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const labelStyle = {
  display: "block",
  marginBottom: 5,
  fontSize: 11.5,
  fontWeight: 800,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const inputField = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "var(--font-size-sm)",
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: "var(--color-white)",
  color: UI.text,
  outline: "none",
};

const textarea = {
  ...inputField,
  minHeight: 76,
  resize: "vertical",
  lineHeight: 1.35,
};

const sectionTitle = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: UI.text,
  letterSpacing: 0,
};

const sectionMeta = { marginTop: 3, marginBottom: 0, fontSize: 11.5, color: UI.muted, lineHeight: 1.3 };

const grid = (cols = 2) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${cols >= 4 ? 170 : 240}px, 1fr))`,
  gap: "var(--space-2)",
});
const coreDueGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "var(--space-2)",
  marginTop: 10,
};
const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "var(--space-2)",
  marginTop: 10,
};
const metricCard = {
  ...card,
  borderRadius: UI.radius,
  padding: "var(--space-3)",
  minHeight: 88,
};
const sectionStack = { display: "flex", flexDirection: "column", gap: UI.gap };
const sidebarStack = { position: "sticky", top: 18, alignSelf: "start", display: "flex", flexDirection: "column", gap: UI.gap };

/* helpers */
const clampISODate = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};
const todayISO = () => clampISODate(new Date());

const dateOnly = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw;
};

const formatDisplayDate = (value) => {
  const raw = dateOnly(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return raw || "-";
};

const formatDisplayDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseISOorBlank = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const calcNextFromWeeks = (lastISO, freqWeeks) => {
  const last = parseISOorBlank(lastISO);
  const w = Number(freqWeeks || 0);
  if (!last || !w) return "";
  const d = new Date(last);
  d.setDate(d.getDate() + w * 7);
  return clampISODate(d);
};

const calcNextEightWeekFromCycle = (baseISO, currentNextISO) => {
  const base = parseISOorBlank(baseISO);
  if (!base) return "";

  const currentNext = parseISOorBlank(currentNextISO);
  if (currentNext && currentNext.getTime() > base.getTime()) {
    const diffDays = Math.round((currentNext.getTime() - base.getTime()) / 86400000);
    if (diffDays > 0 && diffDays % 56 === 0) return clampISODate(currentNext);
  }

  return calcNextFromWeeks(baseISO, 8);
};

const resolveFreqWeeks = (explicitFreq, lastISO, nextISO) => {
  const explicit = Number(explicitFreq || 0);
  if (explicit > 0) return explicit;

  const last = parseISOorBlank(lastISO);
  const next = parseISOorBlank(nextISO);
  if (!last || !next) return 0;

  const diffMs = next.getTime() - last.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays <= 0) return 0;

  return Math.max(1, Math.round(diffDays / 7));
};

const safeArr = (v) => (Array.isArray(v) ? v : []);

const ADDITIONAL_MAINTENANCE_SECTIONS = [
  {
    key: "tachoInspection",
    label: "Tacho Inspection",
    fields: [
      { type: "date", label: "Last Tacho Inspection", name: "lastTacho" },
      { type: "text", label: "Tacho Freq (weeks)", name: "tachoFreq" },
      { type: "date", label: "Next Tacho Inspection", name: "nextTacho" },
      { type: "text", label: "Tacho ISO Week", name: "tachoISOWeek" },
    ],
  },
  {
    key: "brakeTest",
    label: "Brake Test",
    fields: [
      { type: "date", label: "Last Brake Test", name: "lastBrakeTest" },
      { type: "text", label: "Brake Test Freq (weeks)", name: "brakeTestFreq" },
      { type: "date", label: "Next Brake Test", name: "nextBrakeTest" },
      { type: "text", label: "Brake Test ISO Week", name: "brakeISOWeek" },
    ],
  },
  {
    key: "pmiInspection",
    label: "PMI Inspection",
    fields: [
      { type: "date", label: "Last PMI Inspection", name: "lastPMI" },
      { type: "text", label: "PMI Freq (weeks)", name: "pmiFreq" },
      { type: "date", label: "Next PMI Inspection", name: "nextPMI" },
      { type: "text", label: "PMI ISO Week", name: "pmiISOWeek" },
    ],
  },
  {
    key: "tachoDownload",
    label: "Tacho Download",
    fields: [
      { type: "date", label: "Last Tacho Download", name: "lastTachoDownload" },
      { type: "text", label: "Tacho Download Freq (weeks)", name: "tachoDownloadFreq" },
      { type: "date", label: "Next Tacho Download", name: "nextTachoDownload" },
      { type: "text", label: "Tacho DL ISO Week", name: "tachoDownloadISOWeek" },
    ],
  },
  {
    key: "tailLift",
    label: "Tail-lift Inspection",
    fields: [
      { type: "date", label: "Last Tail-lift Insp.", name: "lastTailLift" },
      { type: "text", label: "Tail-lift Freq (weeks)", name: "tailLiftFreq" },
      { type: "date", label: "Next Tail-lift Insp.", name: "nextTailLift" },
      { type: "text", label: "Tail-lift ISO Week", name: "tailLiftISOWeek" },
    ],
  },
  {
    key: "loler",
    label: "LOLER",
    fields: [
      { type: "date", label: "Last LOLER", name: "lastLoler" },
      { type: "text", label: "LOLER Freq (weeks)", name: "lolerFreq" },
      { type: "date", label: "Next LOLER", name: "nextLoler" },
      { type: "text", label: "LOLER ISO Week", name: "lolerISOWeek" },
    ],
  },
];

const sectionHasDateValue = (vehicle, section) =>
  section.fields
    .filter((field) => field.type === "date")
    .some((field) => String(vehicle?.[field.name] || "").trim());

const formatDefectText = (defect) =>
  String(defect?.text || defect?.description || defect?.defectText || defect?.itemDescription || "").trim();

const getMotDefects = (test, predicate = () => true) =>
  safeArr(test?.defects).filter((defect) => formatDefectText(defect) && predicate(defect));

const normaliseMotTestForStorage = (test) => ({
  completedDate: test?.completedDate || "",
  expiryDate: test?.expiryDate || "",
  testResult: test?.testResult || "",
  motTestNumber: test?.motTestNumber || "",
  odometerValue: test?.odometerValue || "",
  odometerUnit: test?.odometerUnit || "",
  odometerResultType: test?.odometerResultType || "",
  dataSource: test?.dataSource || "",
  defects: getMotDefects(test).map((defect) => ({
    text: formatDefectText(defect),
    type: defect?.type || "",
    dangerous: Boolean(defect?.dangerous),
  })),
});

const getLatestMotTest = (tests) => safeArr(tests)[0] || null;

const getLatestPassedMotTest = (tests) =>
  safeArr(tests).find((test) => String(test?.testResult || "").toUpperCase() === "PASSED") || null;

const getMileageAnomaly = (tests) => {
  const sorted = safeArr(tests);
  const latest = Number(String(sorted[0]?.odometerValue || "").replace(/[^\d.]/g, ""));
  const previous = Number(String(sorted[1]?.odometerValue || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(latest) || !Number.isFinite(previous) || latest <= 0 || previous <= 0) return "";
  return latest < previous
    ? `Mileage lower than previous MOT (${latest.toLocaleString("en-GB")} vs ${previous.toLocaleString("en-GB")}).`
    : "";
};

const formatOdometer = (test) => {
  if (!test?.odometerValue) return "-";
  const value = Number(String(test.odometerValue).replace(/[^\d.]/g, ""));
  const displayValue = Number.isFinite(value) && value > 0 ? value.toLocaleString("en-GB") : test.odometerValue;
  return `${displayValue}${test.odometerUnit ? ` ${String(test.odometerUnit).toLowerCase()}` : ""}`;
};

const getMotBookingStatus = ({ motBookedStatus, motAppointmentDate, nextMOT }) => {
  const appt = parseISOorBlank(motAppointmentDate);
  const expiry = parseISOorBlank(nextMOT);

  if (!appt && !motBookedStatus) return "";
  if (appt) {
    if (expiry && appt.getTime() > expiry.getTime()) return "Booked (After Expiry)";
    return "Booked";
  }
  return motBookedStatus || "";
};

const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
};

const toISODate = (v) => {
  const d = toDate(v);
  return d ? clampISODate(d) : "";
};

const getBookingAnchorDate = (booking) =>
  toDate(booking?.endDate) ||
  toDate(booking?.appointmentDate) ||
  toDate(booking?.startDate) ||
  null;

const isPastBooking = (booking) => {
  const anchor = getBookingAnchorDate(booking);
  if (!anchor) return false;
  return endOfDay(anchor).getTime() < startOfDay(new Date()).getTime();
};

const isArchivedMotBooking = (booking) => {
  const type = String(booking?.type || "").toUpperCase();
  const status = String(booking?.status || "").toLowerCase();
  if (type !== "MOT") return false;
  return status === "completed" || isPastBooking(booking);
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const isTransportLorryVehicle = (vehicle = {}) => {
  const haystack = [
    vehicle.category,
    vehicle.type,
    vehicle.name,
    vehicle.manufacturer,
    vehicle.model,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join(" ");

  return haystack.includes("lorry") || haystack.includes("transport");
};

const RETENTION_PLATE_CATEGORY = "Number Plates On Retention";
const normText = (value) => String(value || "").trim().toLowerCase();
const isRetentionPlateRecord = (vehicle = {}) =>
  normText(vehicle.category) === normText(RETENTION_PLATE_CATEGORY) ||
  vehicle.recordType === "numberPlateRetention";
const isTradePlateRecord = (vehicle = {}) => normText(vehicle.plateType) === "trade";

const getInsuredUntil = (vehicle = {}) =>
  dateOnly(
    vehicle.insuredUntil ||
      vehicle.insuranceExpiry ||
      vehicle.insuranceExpiryDate ||
      vehicle.insuranceUntil ||
      ""
  );

const getTaxedUntil = (vehicle = {}) => dateOnly(vehicle.nextRFL || "");

const isPastISODate = (value) => {
  const parsed = parseISOorBlank(value);
  if (!parsed) return false;
  return startOfDay(parsed).getTime() < startOfDay(new Date()).getTime();
};

const syncStatusDateFields = (vehicle = {}) => {
  const next = { ...vehicle };
  const taxStatus = String(next.taxStatus || "").trim();
  const taxedUntil = getTaxedUntil(next);
  const insuranceStatus = String(next.insuranceStatus || "").trim();
  let insuredUntil = getInsuredUntil(next);

  if (taxStatus && taxStatus !== "Taxed") {
    next.nextRFL = "";
  } else if (taxedUntil && isPastISODate(taxedUntil)) {
    next.taxStatus = "Sorn";
    next.nextRFL = "";
  } else if (!taxStatus) {
    next.taxStatus = "Taxed";
  }

  if (insuredUntil && isPastISODate(insuredUntil)) {
    next.insuranceStatus = "Not Insured";
    insuredUntil = "";
  } else if (insuranceStatus && insuranceStatus !== "Insured") {
    insuredUntil = "";
  } else if (!insuranceStatus) {
    next.insuranceStatus = "Insured";
  }
  next.insuredUntil = insuredUntil;
  next.insuranceExpiry = insuredUntil;
  next.insuranceExpiryDate = insuredUntil;
  next.insuranceUntil = insuredUntil;

  return next;
};

const computeNextDueFromCompletion = (completedISO, freqWeeks) => {
  return calcNextFromWeeks(completedISO, freqWeeks);
};

/* page */
export default function EditVehiclePage() {
  const router = useRouter();
  const { id } = useParams();
  const authAccess = useAuth() || {};
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.user, authAccess.userDoc]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [vehicle, setVehicle] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState([]);
  const [vehicleComplianceSettings, setVehicleComplianceSettings] = useState(DEFAULT_VEHICLE_COMPLIANCE_SETTINGS);
  const [uploadingField, setUploadingField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fetchingMotHistory, setFetchingMotHistory] = useState(false);
  const [taxDatePrompt, setTaxDatePrompt] = useState(null);
  const [insuranceDatePrompt, setInsuranceDatePrompt] = useState(null);

  // booking modals (create)
  const [showMotBooking, setShowMotBooking] = useState(false);
  const [showServiceBooking, setShowServiceBooking] = useState(false);
  const [showInspectionBooking, setShowInspectionBooking] = useState(false);
  const [showWorkBooking, setShowWorkBooking] = useState(false);

  // booking modals (edit)
  const [editBookingId, setEditBookingId] = useState(null);
  const [latestMotBooking, setLatestMotBooking] = useState(null);
  const [latestServiceBooking, setLatestServiceBooking] = useState(null);
  const [latestInspectionBooking, setLatestInspectionBooking] = useState(null);
  const [vehicleBookings, setVehicleBookings] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [shownAdditionalMaintenance, setShownAdditionalMaintenance] = useState([]);
  const tradePlateExpiryWeeks = String(
    vehicleComplianceSettings.tradePlateExpiryWeeks || DEFAULT_VEHICLE_COMPLIANCE_SETTINGS.tradePlateExpiryWeeks
  );

  // categories list
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "read vehicle categories" });
      return;
    }

    const fetchCategories = async () => {
      const [snap, fleetSettings] = await Promise.all([
        getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState)),
        loadVehicleFleetSettings(db).catch((error) => {
          console.warn("Vehicle category settings unavailable:", error);
          return { categories: [], compliance: DEFAULT_VEHICLE_COMPLIANCE_SETTINGS };
        }),
      ]);
      const allCats = snap.docs.map((d) => d.data()?.category).filter(Boolean);
      setVehicleComplianceSettings(fleetSettings.compliance || DEFAULT_VEHICLE_COMPLIANCE_SETTINGS);
      setCategories(uniqueVehicleCategoryNames([...(fleetSettings.categories || []), ...allCats, RETENTION_PLATE_CATEGORY]));
    };
    fetchCategories().catch((error) => {
      if (!handleFirestoreAccessError(error, { collectionName: "vehicles", operation: "read vehicle categories" })) {
        console.error(error);
      }
    });
  }, [accessKey, dataAccessState]);

  const reloadVehicle = async () => {
    if (!id) return;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "load vehicle" });
      setLoadError(gate.reason);
      setVehicle(null);
      return;
    }
    setLoadError("");
    const refDoc = fsDoc(db, "vehicles", id);

    let snap;
    try {
      snap = await getDoc(refDoc);
    } catch (error) {
      const denied = handleFirestoreAccessError(error, { collectionName: "vehicles", operation: "load vehicle" });
      if (!denied) console.error("Failed to load vehicle:", error);
      setLoadError(
        denied
          ? "You do not have permission to load this vehicle."
          : "Vehicle could not be loaded."
      );
      setVehicle(null);
      return;
    }

    if (!snap.exists()) {
      setLoadError("Vehicle not found.");
      setVehicle(null);
      return;
    }

    const [bookingResult, serviceRecordResult] = await Promise.allSettled([
      getDocs(tenantCollectionQuery(db, "maintenanceBookings", dataAccessState, [where("vehicleId", "==", id)])),
      getDocs(tenantCollectionQuery(db, "serviceRecords", dataAccessState, [where("vehicleId", "==", id)])),
    ]);

    if (bookingResult.status === "rejected") {
      if (!handleFirestoreAccessError(bookingResult.reason, { collectionName: "maintenanceBookings", operation: "load vehicle maintenance bookings" })) {
        console.warn("Failed to load vehicle maintenance bookings:", bookingResult.reason);
      }
    }
    if (serviceRecordResult.status === "rejected") {
      if (!handleFirestoreAccessError(serviceRecordResult.reason, { collectionName: "serviceRecords", operation: "load vehicle service records" })) {
        console.warn("Failed to load vehicle service records:", serviceRecordResult.reason);
      }
    }

    const rows =
      bookingResult.status === "fulfilled"
        ? bookingResult.value.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))
        : [];
    const serviceRows =
      serviceRecordResult.status === "fulfilled"
        ? serviceRecordResult.value.docs.map((d) =>
            normalizeServiceRecord({ id: d.id, ...(d.data() || {}) })
          )
        : [];
    const sortedRows = [...rows].sort((a, b) => {
      const ad = toDate(a.appointmentDate || a.startDate || a.createdAt) || new Date(0);
      const bd = toDate(b.appointmentDate || b.startDate || b.createdAt) || new Date(0);
      return bd.getTime() - ad.getTime();
    });
    const sortedServiceRows = [...serviceRows].sort((a, b) => {
      const ad = toDate(a.serviceDateOnly || a.serviceDate || a.createdAt) || new Date(0);
      const bd = toDate(b.serviceDateOnly || b.serviceDate || b.createdAt) || new Date(0);
      return bd.getTime() - ad.getTime();
    });
    setVehicleBookings(sortedRows);
    setServiceRecords(sortedServiceRows);

    const active = rows.filter((b) => {
      const s = String(b.status || "").toLowerCase();
      return !s.includes("cancel") && !s.includes("declin") && !isArchivedMotBooking(b);
    });

    const byNewest = [...active].sort((a, b) => {
      const ad = toDate(a.appointmentDate || a.startDate || a.createdAt) || new Date(0);
      const bd = toDate(b.appointmentDate || b.startDate || b.createdAt) || new Date(0);
      return bd.getTime() - ad.getTime();
    });

    const motLatest =
      byNewest.find((b) => String(b.type || "").toUpperCase() === "MOT") || null;
    const serviceLatest =
      byNewest.find((b) => String(b.type || "").toUpperCase() === "SERVICE") || null;
    const inspectionLatest =
      byNewest.find((b) => String(b.type || "").toUpperCase() === "INSPECTION") || null;
    const latestCompletedServiceRecord = sortedServiceRows[0] || null;

    setLatestMotBooking(motLatest);
    setLatestServiceBooking(serviceLatest);
    setLatestInspectionBooking(inspectionLatest);

    {
      const base = normalizeVehicleRecord({ id: snap.id, ...snap.data() });
      const hydrated = { ...base };

      // If vehicle summary fields are empty but bookings exist, hydrate from latest booking.
      if (motLatest) {
        hydrated.motBookingId = hydrated.motBookingId || motLatest.id || "";
        hydrated.motBookedStatus = hydrated.motBookedStatus || motLatest.status || "";
        hydrated.motBookedOn = hydrated.motBookedOn || toISODate(motLatest.createdAt) || "";
        hydrated.motAppointmentDate =
          hydrated.motAppointmentDate ||
          motLatest.appointmentDateISO ||
          motLatest.startDateISO ||
          toISODate(motLatest.appointmentDate) ||
          toISODate(motLatest.startDate) ||
          "";
      }

      if (serviceLatest) {
        hydrated.serviceBookingId = hydrated.serviceBookingId || serviceLatest.id || "";
        hydrated.serviceBookedStatus = hydrated.serviceBookedStatus || serviceLatest.status || "";
        hydrated.serviceBookedOn =
          hydrated.serviceBookedOn || toISODate(serviceLatest.createdAt) || "";
        hydrated.serviceAppointmentDate =
          hydrated.serviceAppointmentDate ||
          serviceLatest.appointmentDateISO ||
          serviceLatest.startDateISO ||
          toISODate(serviceLatest.appointmentDate) ||
          toISODate(serviceLatest.startDate) ||
          "";
      }

      // If a completed service form exists, keep the vehicle core due-date
      // fields aligned with the newest service record even when it did not
      // come through the maintenance booking flow.
      if (latestCompletedServiceRecord?.serviceDateOnly) {
        const latestServiceIso = latestCompletedServiceRecord.serviceDateOnly;
        const currentLastService = dateOnly(hydrated.lastService);
        const latestServiceDate = toDate(latestServiceIso) || new Date(0);
        const currentLastServiceDate = toDate(currentLastService) || new Date(0);

        if (!currentLastService || latestServiceDate.getTime() > currentLastServiceDate.getTime()) {
          hydrated.lastService = latestServiceIso;
          const serviceFreqWeeks = resolveFreqWeeks(
            hydrated.serviceFreq,
            latestServiceIso,
            hydrated.nextService
          );
          if (serviceFreqWeeks) {
            hydrated.nextService = computeNextDueFromCompletion(latestServiceIso, serviceFreqWeeks);
          }
        }

        const latestServiceOdometer = String(latestCompletedServiceRecord.odometer || "").trim();
        if (latestServiceOdometer) {
          const currentVehicleOdometer = String(hydrated.odometer || "").trim();
          const latestOdometerNum = Number(latestServiceOdometer.replace(/[^\d.]/g, ""));
          const currentOdometerNum = Number(currentVehicleOdometer.replace(/[^\d.]/g, ""));

          if (
            !currentVehicleOdometer ||
            (Number.isFinite(latestOdometerNum) &&
              Number.isFinite(currentOdometerNum) &&
              latestOdometerNum >= currentOdometerNum)
          ) {
            hydrated.odometer = latestServiceOdometer;
            hydrated.mileage = latestOdometerNum;
            hydrated.serviceOdometer = latestOdometerNum;
          }
        }
      }

      if (inspectionLatest) {
        hydrated.inspectionBookingId = hydrated.inspectionBookingId || inspectionLatest.id || "";
        hydrated.inspectionBookedStatus =
          hydrated.inspectionBookedStatus || inspectionLatest.status || "";
        hydrated.inspectionBookedOn =
          hydrated.inspectionBookedOn || toISODate(inspectionLatest.createdAt) || "";
        hydrated.inspectionAppointmentDate =
          hydrated.inspectionAppointmentDate ||
          inspectionLatest.appointmentDateISO ||
          inspectionLatest.startDateISO ||
          toISODate(inspectionLatest.appointmentDate) ||
          toISODate(inspectionLatest.startDate) ||
          "";
      }

      setVehicle(syncStatusDateFields(hydrated));
    }
  };

  // load vehicle
  useEffect(() => {
    if (!id) return;
    setInitialSnapshot("");
    setShownAdditionalMaintenance([]);
    reloadVehicle().catch((error) => {
      console.error("Failed to load vehicle:", error);
      setLoadError("Vehicle could not be loaded.");
      setVehicle(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, id]);

  useEffect(() => {
    if (!vehicle || initialSnapshot) return;
    const frame = requestAnimationFrame(() => {
      setInitialSnapshot(JSON.stringify(vehicle));
    });
    return () => cancelAnimationFrame(frame);
  }, [vehicle, initialSnapshot]);

  // Single, consistent auto-calc engine
  useEffect(() => {
    if (!vehicle) return;

    const updates = {};

    // MOT expiry due. DVSA-fetched expiry dates are the source of truth;
    // frequency is only a fallback for records without fetched MOT data.
    if (isMotNotApplicable(vehicle)) {
      if (vehicle.lastMOT || vehicle.lastMot || vehicle.nextMOT || vehicle.nextMot || vehicle.nextMotDate || vehicle.motDueDate) {
        updates.lastMOT = "";
        updates.lastMot = "";
        updates.nextMOT = "";
        updates.nextMot = "";
        updates.nextMotDate = "";
        updates.motDueDate = "";
        updates.motISOWeek = "";
      }
    } else {
      const hasFetchedMotData =
        Boolean(vehicle.dvsaMotHistoryFetchedAt || vehicle.dvsaLatestMot) ||
        safeArr(vehicle.dvsaMotTests).length > 0;
      if (!hasFetchedMotData || !vehicle.nextMOT) {
        const nextMOT = calcNextFromWeeks(
          vehicle.lastMOT,
          resolveFreqWeeks(vehicle.motFreq, vehicle.lastMOT, vehicle.nextMOT)
        );
        if (nextMOT && vehicle.nextMOT !== nextMOT) {
          updates.nextMOT = nextMOT;
          updates.nextMot = nextMOT;
          updates.nextMotDate = nextMOT;
          updates.motDueDate = nextMOT;
        }
      }
    }

    // Service
    if (isServiceNotApplicable(vehicle)) {
      if (
        vehicle.lastService ||
        vehicle.lastServiceDate ||
        vehicle.nextService ||
        vehicle.nextServiceDate ||
        vehicle.serviceDueDate ||
        vehicle.serviceISOWeek
      ) {
        updates.lastService = "";
        updates.lastServiceDate = "";
        updates.nextService = "";
        updates.nextServiceDate = "";
        updates.serviceDueDate = "";
        updates.serviceISOWeek = "";
      }
    } else {
      const nextService = calcNextFromWeeks(
        dateOnly(vehicle.lastService),
        resolveFreqWeeks(vehicle.serviceFreq, dateOnly(vehicle.lastService), vehicle.nextService)
      );
      if (nextService && vehicle.nextService !== nextService) updates.nextService = nextService;
    }

    const nextEightWeekInspection = calcNextEightWeekFromCycle(
      vehicle.eightWeekInspectionStart,
      vehicle.nextEightWeekInspection
    );
    if (
      nextEightWeekInspection &&
      vehicle.nextEightWeekInspection !== nextEightWeekInspection
    ) {
      updates.nextEightWeekInspection = nextEightWeekInspection;
    }
    const inspectionIso = getIsoWeekLabel(
      nextEightWeekInspection || vehicle.nextEightWeekInspection
    );
    if (inspectionIso && vehicle.eightWeekInspectionISOWeek !== inspectionIso) {
      updates.eightWeekInspectionISOWeek = inspectionIso;
    }

    // Tacho Inspection
    const nextTacho = calcNextFromWeeks(vehicle.lastTacho, vehicle.tachoFreq);
    if (nextTacho && vehicle.nextTacho !== nextTacho) updates.nextTacho = nextTacho;

    // Brake Test
    const nextBrakeTest = calcNextFromWeeks(vehicle.lastBrakeTest, vehicle.brakeTestFreq);
    if (nextBrakeTest && vehicle.nextBrakeTest !== nextBrakeTest) updates.nextBrakeTest = nextBrakeTest;

    // PMI
    const nextPMI = calcNextFromWeeks(vehicle.lastPMI, vehicle.pmiFreq);
    if (nextPMI && vehicle.nextPMI !== nextPMI) updates.nextPMI = nextPMI;

    // RFL
    const nextRFL = calcNextFromWeeks(vehicle.lastRFL, vehicle.rflFreq);
    if (nextRFL && vehicle.nextRFL !== nextRFL) updates.nextRFL = nextRFL;

    // Tacho Download
    const nextTachoDownload = calcNextFromWeeks(vehicle.lastTachoDownload, vehicle.tachoDownloadFreq);
    if (nextTachoDownload && vehicle.nextTachoDownload !== nextTachoDownload)
      updates.nextTachoDownload = nextTachoDownload;

    // Tail-lift
    const nextTailLift = calcNextFromWeeks(vehicle.lastTailLift, vehicle.tailLiftFreq);
    if (nextTailLift && vehicle.nextTailLift !== nextTailLift) updates.nextTailLift = nextTailLift;

    // LOLER
    const nextLoler = calcNextFromWeeks(vehicle.lastLoler, vehicle.lolerFreq);
    if (nextLoler && vehicle.nextLoler !== nextLoler) updates.nextLoler = nextLoler;

    // Tacho Calibration
    const nextTachoCalibration = calcNextFromWeeks(vehicle.lastTachoCalibration, vehicle.tachoCalibrationFreq);
    if (nextTachoCalibration && vehicle.nextTachoCalibration !== nextTachoCalibration)
      updates.nextTachoCalibration = nextTachoCalibration;

    // Lorry Inspection
    const nextLorryInspection = calcNextFromWeeks(vehicle.lastLorryInspection, vehicle.lorryInspectionFreq);
    if (nextLorryInspection && vehicle.nextLorryInspection !== nextLorryInspection)
      updates.nextLorryInspection = nextLorryInspection;

    // Derived MOT booking status (only derives when not explicitly completed/cancelled)
    const derivedMotStatus = getMotBookingStatus({
      motBookedStatus: vehicle.motBookedStatus,
      motAppointmentDate: vehicle.motAppointmentDate,
      nextMOT: updates.nextMOT ?? vehicle.nextMOT,
    });
    if (
      derivedMotStatus &&
      vehicle.motBookedStatus !== "Completed" &&
      vehicle.motBookedStatus !== "Cancelled" &&
      vehicle.motBookedStatus !== derivedMotStatus
    ) {
      updates.motBookedStatus = derivedMotStatus;
    }

    if (vehicle.motAppointmentDate && !vehicle.motBookedOn) {
      updates.motBookedOn = todayISO();
    }

    if (Object.keys(updates).length) setVehicle((p) => ({ ...p, ...updates }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vehicle?.lastMOT,
    vehicle?.motFreq,
    vehicle?.lastService,
    vehicle?.serviceFreq,
    vehicle?.serviceNotApplicable,
    vehicle?.serviceApplicable,
    vehicle?.serviceStatus,
    vehicle?.eightWeekInspectionStart,
    vehicle?.nextEightWeekInspection,
    vehicle?.lastTacho,
    vehicle?.tachoFreq,
    vehicle?.lastBrakeTest,
    vehicle?.brakeTestFreq,
    vehicle?.lastPMI,
    vehicle?.pmiFreq,
    vehicle?.lastRFL,
    vehicle?.rflFreq,
    vehicle?.lastTachoDownload,
    vehicle?.tachoDownloadFreq,
    vehicle?.lastTailLift,
    vehicle?.tailLiftFreq,
    vehicle?.lastLoler,
    vehicle?.lolerFreq,
    vehicle?.tachoCalibrationFreq,
    vehicle?.lastTachoCalibration,
    vehicle?.lastLorryInspection,
    vehicle?.lorryInspectionFreq,
    vehicle?.motAppointmentDate,
    vehicle?.motBookedOn,
    vehicle?.motBookedStatus,
  ]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setVehicle((prev) => {
      const fieldValue = type === "checkbox" ? checked : value;
      const next = { ...prev, [name]: fieldValue };
      if (name === "motNotApplicable") {
        next.motApplicable = !checked;
        next.motStatus = checked ? "N/A" : "";
        if (checked) {
          next.lastMOT = "";
          next.lastMot = "";
          next.nextMOT = "";
          next.nextMot = "";
          next.nextMotDate = "";
          next.motDueDate = "";
          next.motISOWeek = "";
        }
      }
      if (name === "serviceNotApplicable") {
        next.serviceApplicable = !checked;
        next.serviceStatus = checked ? "N/A" : "";
        if (checked) {
          next.lastService = "";
          next.lastServiceDate = "";
          next.nextService = "";
          next.nextServiceDate = "";
          next.serviceDueDate = "";
          next.serviceISOWeek = "";
        }
      }
      if (name === "registration" || name === "reg" || name === "registrationNumber") {
        next.registration = value;
        next.reg = value;
        next.registrationNumber = value;
      }
      if (name === "manufacturer" || name === "make") {
        next.manufacturer = value;
        next.make = value;
      }
      if (name === "lastMOT" || name === "lastMot") {
        next.lastMOT = value;
        next.lastMot = value;
      }
      if (name === "nextMOT" || name === "nextMot" || name === "nextMotDate" || name === "motDueDate") {
        next.nextMOT = value;
        next.nextMot = value;
        next.nextMotDate = value;
        next.motDueDate = value;
      }
      if (name === "nextService" || name === "nextServiceDate" || name === "serviceDueDate") {
        next.nextService = value;
        next.nextServiceDate = value;
        next.serviceDueDate = value;
      }
      if (name === "insuredUntil" || name === "insuranceExpiry" || name === "insuranceExpiryDate") {
        next.insuredUntil = value;
        next.insuranceExpiry = value;
        next.insuranceExpiryDate = value;
      }
      if (name === "plateType" && value === "trade") {
        next.plateExpiryFreq = tradePlateExpiryWeeks;
      }
      return syncStatusDateFields(next);
    });
  };

  const handleTaxStatusChange = (e) => {
    const value = e.target.value;
    if (value === "Taxed") {
      setTaxDatePrompt({ date: getTaxedUntil(vehicle) });
      return;
    }
    setVehicle((prev) => syncStatusDateFields({ ...prev, taxStatus: value }));
  };

  const saveTaxDatePrompt = () => {
    const taxedUntil = String(taxDatePrompt?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(taxedUntil) || !parseISOorBlank(taxedUntil)) {
      alert("Select a road tax date before marking this vehicle as taxed.");
      return;
    }
    setVehicle((prev) => syncStatusDateFields({ ...prev, taxStatus: "Taxed", nextRFL: taxedUntil }));
    setTaxDatePrompt(null);
  };

  const handleInsuranceStatusChange = (e) => {
    const value = e.target.value;
    if (value === "Insured") {
      setInsuranceDatePrompt({ date: getInsuredUntil(vehicle) });
      return;
    }
    setVehicle((prev) =>
      syncStatusDateFields({
        ...prev,
        insuranceStatus: value,
        insuredUntil: "",
        insuranceExpiry: "",
        insuranceExpiryDate: "",
        insuranceUntil: "",
      })
    );
  };

  const saveInsuranceDatePrompt = () => {
    const insuredUntil = String(insuranceDatePrompt?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(insuredUntil) || !parseISOorBlank(insuredUntil)) {
      alert("Select an insured until date before marking this vehicle as insured.");
      return;
    }
    setVehicle((prev) =>
      syncStatusDateFields({
        ...prev,
        insuranceStatus: "Insured",
        insuredUntil,
        insuranceExpiry: insuredUntil,
        insuranceExpiryDate: insuredUntil,
      })
    );
    setInsuranceDatePrompt(null);
  };

  const handleAdditionalMaintenanceToggle = (key) => {
    const section = ADDITIONAL_MAINTENANCE_SECTIONS.find((item) => item.key === key);
    const hiddenNow = new Set(safeArr(vehicle?.hiddenAdditionalMaintenance));
    const isVisible =
      section &&
      !hiddenNow.has(key) &&
      (sectionHasDateValue(vehicle, section) || shownAdditionalMaintenance.includes(key));

    setShownAdditionalMaintenance((current) => {
      if (isVisible) return current.filter((item) => item !== key);
      return current.includes(key) ? current : [...current, key];
    });

    setVehicle((prev) => {
      if (!prev) return prev;
      const hidden = new Set(safeArr(prev.hiddenAdditionalMaintenance));
      if (isVisible) {
        hidden.add(key);
      } else {
        hidden.delete(key);
      }
      return {
        ...prev,
        hiddenAdditionalMaintenance: Array.from(hidden),
      };
    });
  };

  const handleMotChange = (e) => {
    const { name, value } = e.target;

    setVehicle((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "motAppointmentDate") {
        if (value && !next.motBookedOn) next.motBookedOn = todayISO();
      }

      const derived = getMotBookingStatus({
        motBookedStatus: next.motBookedStatus,
        motAppointmentDate: next.motAppointmentDate,
        nextMOT: next.nextMOT,
      });

      if (next.motAppointmentDate && next.motBookedStatus !== "Completed" && next.motBookedStatus !== "Cancelled") {
        next.motBookedStatus = derived || "Booked";
      }

      return next;
    });
  };

  const handleFetchMotHistory = async () => {
    const vrm = String(vehicle?.registration || vehicle?.reg || vehicle?.registrationNumber || "").trim();
    if (!vrm) {
      alert("Add a registration before fetching MOT history.");
      return;
    }

    setFetchingMotHistory(true);
    try {
      const res = await fetch(`/api/dvla/mot-history?vrm=${encodeURIComponent(vrm)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.details || data?.error || "Could not fetch MOT history.");
      }

      const motTests = safeArr(data?.motTests).map(normaliseMotTestForStorage);
      const latestAny = getLatestMotTest(motTests);
      const latestPassed = data?.latestMot || getLatestPassedMotTest(motTests) || null;
      const lastMot = dateOnly(latestPassed?.completedDate || "");
      const nextMot = dateOnly(data?.nextMOT || latestPassed?.expiryDate || "");
      const odometerValue = latestPassed?.odometerValue ? String(latestPassed.odometerValue) : "";
      const odometerNumeric = Number(odometerValue.replace(/[^\d.]/g, ""));
      const latestDefects = getMotDefects(latestAny);
      const mileageWarning = getMileageAnomaly(motTests);

      setVehicle((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          lastMOT: lastMot || prev.lastMOT || "",
          lastMot: lastMot || prev.lastMot || "",
          nextMOT: nextMot || prev.nextMOT || "",
          nextMot: nextMot || prev.nextMot || "",
          nextMotDate: nextMot || prev.nextMotDate || "",
          motDueDate: nextMot || prev.motDueDate || "",
          motHistorySyncedAt: new Date().toISOString(),
          motHistoryLatestTestNumber: latestPassed?.motTestNumber || "",
          dvsaMotHistoryFetchedAt: new Date().toISOString(),
          dvsaMotTests: motTests,
          dvsaLatestMot: latestAny || latestPassed || null,
          dvsaLatestMotResult: latestAny?.testResult || latestPassed?.testResult || "",
          dvsaLatestMotTestNumber: latestAny?.motTestNumber || latestPassed?.motTestNumber || "",
          dvsaLatestMotOdometer: formatOdometer(latestAny || latestPassed),
          dvsaLatestMotDefectCount: latestDefects.length,
          dvsaLatestMotAdvisoryCount: latestDefects.filter((defect) =>
            String(defect?.type || "").toUpperCase().includes("ADVISORY")
          ).length,
          dvsaLatestMotDangerousCount: latestDefects.filter((defect) => defect?.dangerous).length,
          dvsaLatestMotMajorCount: latestDefects.filter((defect) =>
            String(defect?.type || "").toUpperCase().includes("MAJOR")
          ).length,
          dvsaMotMileageWarning: mileageWarning,
          dvsaMotVehicleDetails: {
            registration: data?.registration || vrm,
            make: data?.make || "",
            model: data?.model || "",
            fuelType: data?.fuelType || "",
            primaryColour: data?.primaryColour || "",
            registrationDate: data?.registrationDate || "",
            manufactureDate: data?.manufactureDate || "",
            engineSize: data?.engineSize || "",
            hasOutstandingRecall: data?.hasOutstandingRecall || "",
          },
        };

        if (Number.isFinite(odometerNumeric) && odometerNumeric > 0) {
          next.odometer = odometerNumeric;
          next.mileage = odometerNumeric;
          next.serviceOdometer = odometerNumeric;
        }

        return next;
      });

      alert("MOT history loaded. Review the updated MOT dates and odometer, then press Save.");
    } catch (err) {
      console.error("Failed to fetch MOT history:", err);
      alert(err.message || "Could not fetch MOT history.");
    } finally {
      setFetchingMotHistory(false);
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!vehicle || !initialSnapshot) return false;
    return JSON.stringify(vehicle) !== initialSnapshot;
  }, [vehicle, initialSnapshot]);

  const handleSave = async (options = {}) => {
    if (!vehicle?.id) return false;
    const { navigateOnSuccess = true } = options;
    setSaving(true);
    try {
      const refDoc = fsDoc(db, "vehicles", vehicle.id);
      const payload = { ...vehicle };
      const odometerRaw = String(payload.odometer ?? "").trim();
      const odometerNumeric = Number(odometerRaw.replace(/[^\d.]/g, ""));
      if (odometerRaw && Number.isFinite(odometerNumeric)) {
        payload.odometer = odometerNumeric;
        payload.mileage = odometerNumeric;
        payload.serviceOdometer = odometerNumeric;
      } else if (!odometerRaw) {
        payload.odometer = "";
      }
      const registration = String(payload.registration || payload.reg || payload.registrationNumber || "").trim();
      const manufacturer = String(payload.manufacturer || payload.make || "").trim();
      const motDisabled = isMotNotApplicable(payload);
      const serviceDisabled = isServiceNotApplicable(payload);
      const nextMot = motDisabled ? "" : dateOnly(payload.nextMOT ?? payload.nextMot ?? payload.nextMotDate ?? "");
      const lastMot = motDisabled ? "" : dateOnly(payload.lastMOT ?? payload.lastMot ?? "");
      const insuredUntil = getInsuredUntil(payload);
      const nextService = serviceDisabled
        ? ""
        : dateOnly(payload.nextService ?? payload.nextServiceDate ?? payload.serviceDueDate ?? "");
      const lastService = serviceDisabled ? "" : dateOnly(payload.lastService ?? payload.lastServiceDate ?? "");
      if (registration) {
        payload.registration = registration;
        payload.reg = registration;
        payload.registrationNumber = registration;
      }
      if (manufacturer) {
        payload.manufacturer = manufacturer;
        payload.make = manufacturer;
      }
      payload.lastMOT = lastMot;
      payload.lastMot = lastMot;
      payload.nextMOT = nextMot;
      payload.nextMot = nextMot;
      payload.nextMotDate = nextMot;
      payload.motDueDate = nextMot;
      payload.motNotApplicable = motDisabled;
      payload.motApplicable = !motDisabled;
      payload.motStatus = motDisabled ? "N/A" : String(payload.motStatus || "").trim();
      if (motDisabled) payload.motISOWeek = "";
      payload.lastService = lastService;
      payload.lastServiceDate = lastService;
      payload.nextService = nextService;
      payload.nextServiceDate = nextService;
      payload.serviceDueDate = nextService;
      payload.serviceNotApplicable = serviceDisabled;
      payload.serviceApplicable = !serviceDisabled;
      payload.serviceStatus = serviceDisabled ? "N/A" : String(payload.serviceStatus || "").trim();
      if (serviceDisabled) payload.serviceISOWeek = "";
      payload.insuredUntil = insuredUntil;
      payload.insuranceExpiry = insuredUntil;
      payload.insuranceExpiryDate = insuredUntil;
      Object.assign(payload, syncStatusDateFields(payload));
      if (isRetentionPlateRecord(payload)) {
        payload.category = RETENTION_PLATE_CATEGORY;
        payload.recordType = "numberPlateRetention";
        payload.name = payload.name || payload.registration || payload.reg || "";
        payload.taxStatus = "N/A";
        payload.insuranceStatus = "N/A";
        if (payload.plateType === "trade") {
          payload.plateExpiryFreq = tradePlateExpiryWeeks;
        }
      }
      Object.assign(payload, {
        motProvider: "",
        motBookingRef: "",
        motLocation: "",
        motCost: "",
        motBookingNotes: "",
        serviceProvider: "",
        serviceBookingRef: "",
        serviceLocation: "",
        serviceCost: "",
        serviceBookingNotes: "",
        inspectionProvider: "",
        inspectionBookingRef: "",
        inspectionLocation: "",
        inspectionCost: "",
        inspectionBookingNotes: "",
      });
      delete payload.id;
      await updateDoc(refDoc, tenantPayload(dataAccessState, { ...payload, updatedAt: serverTimestamp() }));
      setVehicle((prev) => ({ ...prev, ...payload, id: vehicle.id }));
      setInitialSnapshot(JSON.stringify({ ...payload, id: vehicle.id }));
      alert("Vehicle updated.");
      if (navigateOnSuccess) {
        router.push("/vehicles");
      }
      return true;
    } catch (e) {
      console.error(e);
      alert("Could not save vehicle.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm("Are you sure you want to delete this vehicle?");
    if (!ok) return;
    try {
      await deleteDoc(fsDoc(db, "vehicles", id));
      alert("Vehicle deleted.");
      router.push("/vehicles");
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      alert("Failed to delete vehicle.");
    }
  };

  const handleFileUpload = async (e, field) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !id) return;

    setUploadingField(field);
    try {
      const existing = safeArr(vehicle?.[field]);
      const uploaded = [];

      for (const file of files) {
        const sRef = storageRef(
          storage,
          companyStoragePath(dataAccessState, `vehicles/${id}/${field}/${Date.now()}-${file.name}`)
        );
        const snap = await uploadBytes(sRef, file);
        const url = await getDownloadURL(snap.ref);
        uploaded.push({ name: file.name, url });
      }

      const updatedList = [...existing, ...uploaded];
      await updateDoc(fsDoc(db, "vehicles", id), tenantPayload(dataAccessState, {
        [field]: updatedList,
        updatedAt: serverTimestamp(),
      }));

      setVehicle((prev) => ({ ...prev, [field]: updatedList }));
      e.target.value = "";
    } catch (err) {
      console.error("File upload error:", err);
      alert("Error uploading files.");
    } finally {
      setUploadingField(null);
    }
  };

  const headerLabel = useMemo(() => {
    if (!vehicle) return "";
    return vehicle.name || vehicle.registration || vehicle.reg || vehicle.id;
  }, [vehicle]);

  const summaryMotBooking = vehicleBookings.find((b) => b.id === vehicle?.motBookingId);
  const activeMotBookingId =
    summaryMotBooking && !isArchivedMotBooking(summaryMotBooking)
      ? summaryMotBooking.id
      : latestMotBooking?.id || "";
  const activeServiceBookingId = vehicle?.serviceBookingId || latestServiceBooking?.id || "";
  const activeInspectionBookingId =
    vehicle?.inspectionBookingId || latestInspectionBooking?.id || "";
  const hasMotBooking = Boolean(activeMotBookingId);
  const hasServiceBooking = Boolean(activeServiceBookingId);
  const hasInspectionBooking = Boolean(activeInspectionBookingId);
  const showEightWeekInspection = isTransportLorryVehicle(vehicle || {});
  const dvsaMotMeta = vehicle?.motHistorySyncedAt
    ? `Auto-filled from DVSA${
        vehicle.motHistoryLatestTestNumber ? ` - test ${vehicle.motHistoryLatestTestNumber}` : ""
      }`
    : "";
  const dvsaMotSyncLabel = vehicle?.motHistorySyncedAt
    ? `DVSA MOT data loaded ${formatDisplayDateTime(vehicle.motHistorySyncedAt)}`
    : "";
  const dvsaMotTests = useMemo(() => safeArr(vehicle?.dvsaMotTests), [vehicle?.dvsaMotTests]);
  const dvsaLatestMot = vehicle?.dvsaLatestMot || getLatestMotTest(dvsaMotTests);
  const dvsaLatestDefects = getMotDefects(dvsaLatestMot);
  const dvsaLatestAdvisories = dvsaLatestDefects.filter((defect) =>
    String(defect?.type || "").toUpperCase().includes("ADVISORY")
  );
  const dvsaLatestSeriousDefects = dvsaLatestDefects.filter((defect) => {
    const type = String(defect?.type || "").toUpperCase();
    return defect?.dangerous || type.includes("MAJOR") || type.includes("DANGEROUS");
  });
  const dvsaVehicleDetails = vehicle?.dvsaMotVehicleDetails || {};
  const dvsaMotMileageWarning = vehicle?.dvsaMotMileageWarning || getMileageAnomaly(dvsaMotTests);
  const hiddenAdditionalMaintenance = safeArr(vehicle?.hiddenAdditionalMaintenance);
  const visibleAdditionalMaintenanceSections = ADDITIONAL_MAINTENANCE_SECTIONS.filter(
    (section) =>
      !hiddenAdditionalMaintenance.includes(section.key) &&
      (sectionHasDateValue(vehicle, section) || shownAdditionalMaintenance.includes(section.key))
  );

  useUnsavedChangesGuard({
    enabled: Boolean(vehicle),
    isDirty: hasUnsavedChanges && !saving,
    onSave: () => handleSave({ navigateOnSuccess: false }),
  });

  const activeVehicleBookings = useMemo(
    () => vehicleBookings.filter((b) => !isArchivedMotBooking(b)),
    [vehicleBookings]
  );

  const completedMotHistory = useMemo(
    () =>
      vehicleBookings.filter((b) => {
        return isArchivedMotBooking(b);
      }),
    [vehicleBookings]
  );

  const completedInspectionHistory = useMemo(
    () =>
      vehicleBookings.filter((b) => {
        const type = String(b?.type || "").toUpperCase();
        const status = String(b?.status || "").toLowerCase();
        return type === "INSPECTION" && status === "completed";
      }),
    [vehicleBookings]
  );

  const motHistoryItems = useMemo(() => {
    const stored = Array.isArray(vehicle?.motHistory) ? vehicle.motHistory : [];
    const derived = completedMotHistory.map((b) => ({
      completedDate: bookingCompletedLabel(b),
      bookingId: b.id,
      provider: b.provider || "",
      bookingRef: b.bookingRef || "",
      notes: b.notes || "",
    }));

    const seen = new Set();
    return [...stored, ...derived].filter((item, index) => {
      const key = item?.bookingId || `${item?.completedDate || ""}-${item?.bookingRef || ""}-${index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [vehicle?.motHistory, completedMotHistory]);

  const serviceHistoryItems = useMemo(() => {
    const stored = Array.isArray(vehicle?.serviceHistory) ? vehicle.serviceHistory : [];
    const derived = serviceRecords.map((record) => ({
      completedDate:
        record.serviceDateDisplay ||
        formatDateForDisplay(record.serviceDateOnly || record.serviceDate) ||
        "",
      sortDate: record.serviceDateOnly || record.serviceDate || "",
      bookingId: record.id,
      provider: record.signedBy || "",
      bookingRef: record.serviceType || "",
      notes: record.workSummary || record.extraNotes || "",
      location: record.registration || "",
      odometer: record.odometer || "",
      partsUsed: record.partsUsed || "",
      cost: "",
    }));

    if (derived.length > 0) {
      return derived.sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")));
    }

    return stored
      .map((item) => ({
        ...item,
        completedDate: formatDateForDisplay(item?.completedDate) || item?.completedDate || "",
        sortDate: item?.sortDate || item?.completedDate || "",
      }))
      .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")));
  }, [vehicle?.serviceHistory, serviceRecords]);

  const motAppointmentDisplay =
    vehicle?.motAppointmentDate ||
    toISODate(latestMotBooking?.appointmentDate) ||
    latestMotBooking?.appointmentDateISO ||
    latestMotBooking?.startDateISO ||
    toISODate(latestMotBooking?.startDate) ||
    "";
  const motBookedOnDisplay =
    vehicle?.motBookedOn || toISODate(latestMotBooking?.createdAt) || "";

  if (!vehicle) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={{ ...panel, textAlign: "center", color: loadError ? "var(--legacy-color-dc2626)" : UI.muted }}>
            {loadError || "Loading vehicle..."}
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  if (isRetentionPlateRecord(vehicle)) {
    const isTradePlate = isTradePlateRecord(vehicle);

    return (
      <HeaderSidebarLayout>
        <style jsx global>{`
          input:focus,
          textarea:focus {
            outline: none;
            box-shadow: 0 0 0 4px rgba(29, 78, 216, 0.14);
            border-color: var(--color-info-border) !important;
          }
        `}</style>

        <div style={pageWrap}>
          <div style={heroCard}>
            <div style={topBar}>
              <div>
                <h1 style={title}>{vehicle.registration || vehicle.reg || vehicle.name || "Number Plate"}</h1>
                <div style={subtitle}>
                  {isTradePlate
                    ? "Trade plate. Edit the plate, yearly expiry date, and notes."
                    : "Number plate on retention. Edit the plate, expiry date, and notes."}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={() => router.push("/vehicles")} style={btn("ghost")}>
                  <ArrowLeft size={15} />
                  Back
                </button>
                <button onClick={handleDelete} style={btn("danger")}>
                  <Trash2 size={15} />
                  Delete
                </button>
                <button onClick={handleSave} style={btn()} disabled={saving}>
                  <Save size={15} />
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <div style={metricGrid}>
              <MetricCard label="Category" value={RETENTION_PLATE_CATEGORY} />
              <MetricCard label="Plate Type" value={isTradePlate ? "Trade plate" : "Retention plate"} />
            <MetricCard label={isTradePlate ? "Trade Plate Expiry" : "Retention Expiry"} value={formatDisplayDate(vehicle.retentionExpiry)} />
              {isTradePlate ? <MetricCard label="Frequency" value={`${tradePlateExpiryWeeks} weeks`} /> : null}
            </div>
          </div>

          <div style={{ ...panel, maxWidth: 860, marginTop: "var(--space-3)" }}>
            <h2 style={sectionTitle}>Number Plate Details</h2>
            <div style={{ ...grid(2), marginTop: 10 }}>
              <Field label="Number Plate" name="registration" value={vehicle.registration || vehicle.reg} onChange={handleChange} />
              <DateField label={isTradePlate ? "Trade Plate Expiry" : "Retention Expiry"} name="retentionExpiry" value={vehicle.retentionExpiry} onChange={handleChange} />

              <div>
                <label style={labelStyle}>Plate Type</label>
                <select name="plateType" value={vehicle.plateType || "retention"} onChange={handleChange} style={inputField}>
                  <option value="retention">Retention plate</option>
                  <option value="trade">Trade plate</option>
                </select>
              </div>

              <Field
                label="Expiry Freq (weeks)"
                name="plateExpiryFreq"
                value={isTradePlate ? tradePlateExpiryWeeks : vehicle.plateExpiryFreq || ""}
                onChange={handleChange}
              />

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Category</label>
                <input value={RETENTION_PLATE_CATEGORY} readOnly style={{ ...inputField, background: "var(--color-surface-subtle)" }} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  name="notes"
                  value={vehicle.notes || ""}
                  onChange={handleChange}
                  placeholder="Retention certificate details, owner notes, or reminders..."
                  style={{ ...textarea, minHeight: 150 }}
                />
              </div>
            </div>
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  const motStatusPill = (() => {
    const status = vehicle.motBookedStatus || "";
    if (!status) return null;

    const styles = {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-2)",
      padding: "8px 10px",
      borderRadius: "var(--radius-pill)",
      fontSize: "var(--font-size-xs)",
      fontWeight: 950,
      border: "1px solid var(--legacy-color-e5e7eb)",
      background: "var(--color-white)",
      color: UI.text,
      whiteSpace: "nowrap",
    };

    let dot = UI.brand;
    if (status.includes("After Expiry")) dot = UI.red;
    else if (status === "Booked") dot = UI.green;
    else if (status === "Requested") dot = UI.amber;
    else if (status === "Completed") dot = UI.green;

    return (
      <div style={styles} title="MOT booking status">
        <span style={{ width: 10, height: 10, borderRadius: "var(--radius-pill)", background: dot, display: "inline-block" }} />
        {status}
      </div>
    );
  })();

  const bookingTypeLabel = (b) => {
    const t = String(b?.type || "").toUpperCase();
    if (t === "MOT") return "MOT";
    if (t === "SERVICE") return "Service";
    if (t === "WORK") return "Maintenance";
    return t || "Maintenance";
  };

  const bookingDateLabel = (b) => {
    const start = toDate(b?.appointmentDate || b?.startDate);
    const end = toDate(b?.endDate) || start;
    if (!start && !end) return "No date";
    const s = start ? start.toLocaleDateString("en-GB") : "-";
    const e = end ? end.toLocaleDateString("en-GB") : s;
    return s === e ? s : `${s} -> ${e}`;
  };

  function bookingCompletedLabel(b) {
    const completed =
      b?.completedAtISO ||
      b?.endDateISO ||
      b?.appointmentDateISO ||
      toISODate(b?.endDate) ||
      toISODate(b?.appointmentDate) ||
      toISODate(b?.startDate) ||
      "";
    return completed || "-";
  }

  const deleteMaintenanceBooking = async (bookingId) => {
    if (!bookingId) return;
    const ok = window.confirm("Delete this maintenance/work booking?");
    if (!ok) return;
    try {
      await deleteMaintenanceBookingRecord({
        bookingId,
        booking: vehicleBookings.find((booking) => booking.id === bookingId) || null,
        vehicleId: id,
        vehicle,
      });
      await reloadVehicle();
      if (editBookingId === bookingId) setEditBookingId(null);
      alert("Booking deleted.");
    } catch (error) {
      console.error("Failed deleting maintenance booking:", error);
      alert("Could not delete booking.");
    }
  };

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        input:focus,
        select:focus,
        button:focus,
        textarea:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29, 78, 216, 0.14);
          border-color: var(--color-info-border) !important;
        }
        select option {
          background: var(--color-white);
          color: var(--color-text);
        }
        @media (max-width: 1180px) {
          .vehicle-edit-layout { grid-template-columns: 1fr !important; }
          .vehicle-edit-sidebar { position: static !important; }
          .vehicle-edit-core-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .vehicle-edit-maintenance-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 760px) {
          .vehicle-edit-field-grid { grid-template-columns: 1fr !important; }
          .vehicle-edit-core-grid { grid-template-columns: 1fr !important; }
          .vehicle-edit-maintenance-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={pageWrap}>
        <div style={heroCard}>
          <div style={topBar}>
          <div>
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={title}>{headerLabel}</h1>
              {motStatusPill}
            </div>
            <div style={subtitle}>Edit details, due dates, paperwork, attachments, notes and create/edit MOT / Service bookings.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowMotBooking(true)}
              style={btn(isMotNotApplicable(vehicle) ? "ghost" : "success")}
              disabled={isMotNotApplicable(vehicle)}
              title={isMotNotApplicable(vehicle) ? "MOT is not applicable for this vehicle." : "Book MOT"}
            >
              <CalendarPlus size={15} />
              {isMotNotApplicable(vehicle) ? "MOT N/A" : "Book MOT"}
            </button>
            {hasMotBooking ? (
              <button
                onClick={() => setEditBookingId(activeMotBookingId)}
                style={btn("ghost")}
              title="Edit the MOT booking record"
              >
                <ClipboardList size={15} />
                Edit MOT Booking
              </button>
            ) : null}

            <button onClick={() => setShowServiceBooking(true)} style={btn("success")}>
              <CalendarPlus size={15} />
              Book Service
            </button>
            {hasServiceBooking ? (
              <button
                onClick={() => setEditBookingId(activeServiceBookingId)}
                style={btn("ghost")}
              title="Edit the Service booking record"
              >
                <ClipboardList size={15} />
                Edit Service Booking
              </button>
            ) : null}

            {showEightWeekInspection ? (
              <button onClick={() => setShowInspectionBooking(true)} style={btn("success")}>
                <CalendarPlus size={15} />
                Book 8 Week Inspection
              </button>
            ) : null}
            {showEightWeekInspection && hasInspectionBooking ? (
              <button
                onClick={() => setEditBookingId(activeInspectionBookingId)}
                style={btn("ghost")}
              title="Edit the inspection booking record"
              >
                <ClipboardList size={15} />
                Edit Inspection Booking
              </button>
            ) : null}

            <button onClick={() => setShowWorkBooking(true)} style={btn("success")}>
              <Wrench size={15} />
              Book Work
            </button>
            <button onClick={handleSave} style={btn()} disabled={saving}>
              <Save size={15} />
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={handleDelete} style={btn("danger")}>
              <Trash2 size={15} />
              Delete
            </button>
          </div>
          </div>
          <div style={metricGrid}>
            <MetricCard label="Registration" value={vehicle.registration || vehicle.reg || "-"} />
            <MetricCard label="Category" value={vehicle.category || "-"} />
            <MetricCard label="Next MOT" value={isMotNotApplicable(vehicle) ? "N/A" : formatDisplayDate(vehicle.nextMOT)} />
            <MetricCard label="Next Service" value={formatDisplayDate(vehicle.nextService)} />
            <MetricCard label="Open Bookings" value={String(activeVehicleBookings.length)} />
          </div>
        </div>

        {/*  CREATE Booking modals */}
        {showMotBooking ? (
          <SharedMaintenanceBookingForm
            vehicleId={id}
            type="MOT"
            defaultDate={vehicle?.nextMOT || ""}
            vehicleSnapshot={vehicle}
            onClose={() => setShowMotBooking(false)}
            onSaved={async () => {
              setShowMotBooking(false);
              await reloadVehicle();
            }}
          />
        ) : null}

        {showServiceBooking ? (
          <SharedMaintenanceBookingForm
            vehicleId={id}
            type="SERVICE"
            defaultDate={vehicle?.nextService || ""}
            vehicleSnapshot={vehicle}
            onClose={() => setShowServiceBooking(false)}
            onSaved={async () => {
              setShowServiceBooking(false);
              await reloadVehicle();
            }}
          />
        ) : null}

        {showInspectionBooking ? (
          <SharedMaintenanceBookingForm
            vehicleId={id}
            type="INSPECTION"
            defaultDate={vehicle?.nextEightWeekInspection || todayISO()}
            sourceDueDate={vehicle?.nextEightWeekInspection || ""}
            sourceDueIsoWeek={
              vehicle?.eightWeekInspectionISOWeek ||
              getIsoWeekLabel(vehicle?.nextEightWeekInspection || "")
            }
            sourceDueKey={
              vehicle?.nextEightWeekInspection
                ? `inspection_due__${id}__${vehicle.nextEightWeekInspection}`
                : ""
            }
            vehicleSnapshot={vehicle}
            onClose={() => setShowInspectionBooking(false)}
            onSaved={async () => {
              setShowInspectionBooking(false);
              await reloadVehicle();
            }}
          />
        ) : null}

        {showWorkBooking ? (
          <SharedMaintenanceBookingForm
            vehicleId={id}
            type="WORK"
            defaultDate={todayISO()}
            vehicleSnapshot={vehicle}
            onClose={() => setShowWorkBooking(false)}
            onSaved={async () => {
              setShowWorkBooking(false);
              await reloadVehicle();
            }}
          />
        ) : null}

        {/*  EDIT Booking modal */}
        {editBookingId ? (
          <EditMaintenanceBookingForm
            bookingId={editBookingId}
            onClose={() => setEditBookingId(null)}
            onSaved={async () => {
              setEditBookingId(null);
              await reloadVehicle();
            }}
          />
        ) : null}

        <div
          className="vehicle-edit-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.75fr) minmax(300px, 0.95fr)",
            gap: UI.gap,
            alignItems: "start",
            marginTop: UI.gap,
          }}
        >
          {/* LEFT: Main form */}
          <div style={sectionStack}>
            {/* Main Information */}
            <div style={panel}>
              <h2 style={sectionTitle}>Main Information</h2>
              <div style={grid(2)}>
                <Field label="Name" name="name" value={vehicle.name} onChange={handleChange} />
                <Field label="Registration" name="registration" value={vehicle.registration || vehicle.reg} onChange={handleChange} />
                <Field label="Manufacturer" name="manufacturer" value={vehicle.manufacturer} onChange={handleChange} />
                <Field label="Model" name="model" value={vehicle.model} onChange={handleChange} />

                <div>
                  <label style={labelStyle}>Category</label>
                  <select name="category" value={vehicle.category || ""} onChange={handleChange} style={inputField}>
                    <option value="">Select category...</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <SelectField
                  label="Operating Status"
                  name="operationalStatus"
                  value={vehicle.operationalStatus || "Active"}
                  onChange={handleChange}
                  options={["Active", "Out of use"]}
                />

                <Field label="Chassis No." name="chassis" value={vehicle.chassis} onChange={handleChange} />
                <Field label="Odometer" name="odometer" value={vehicle.odometer} onChange={handleChange} meta={dvsaMotMeta} />

                <div style={{ gridColumn: "1 / -1", ...coreDueGrid, marginTop: 0 }}>
                  <div>
                    <label style={labelStyle}>Tax Status</label>
                    <select name="taxStatus" value={vehicle.taxStatus || "Taxed"} onChange={handleTaxStatusChange} style={inputField}>
                      <option value="Taxed">Taxed</option>
                      <option value="Sorn">Sorn</option>
                      <option value="N/A">N/A</option>
                    </select>
                  </div>

                  <DateField label="Taxed Until" name="nextRFL" value={vehicle.nextRFL} onChange={handleChange} />

                  <div>
                    <label style={labelStyle}>Insurance Status</label>
                    <select
                      name="insuranceStatus"
                      value={vehicle.insuranceStatus || "Insured"}
                      onChange={handleInsuranceStatusChange}
                      style={inputField}
                    >
                      <option value="Insured">Insured</option>
                      <option value="Not Insured">Not Insured</option>
                      <option value="N/A">N/A</option>
                    </select>
                  </div>

                  <DateField label="Insured Until" name="insuredUntil" value={getInsuredUntil(vehicle)} onChange={handleChange} />
                </div>
              </div>
            </div>

            {/* Due Dates & Intervals */}
            <div style={panel}>
              <h2 style={sectionTitle}>Core Due Dates</h2>
              <div style={sectionMeta}>Edit the last date and frequency; next will auto-calculate.</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-2)", marginBottom: 10 }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: UI.muted, fontWeight: 800 }}>
                  {dvsaMotSyncLabel || "MOT dates can be pulled from DVSA; frequency remains as a manual fallback."}
                </div>
                <button
                  type="button"
                  onClick={handleFetchMotHistory}
                  style={btn("ghost")}
                  disabled={fetchingMotHistory}
                  title="Fetch latest MOT history from DVSA using the registration"
                >
                  <Download size={15} />
                  {fetchingMotHistory ? "Fetching MOT..." : "Fetch DVSA MOT"}
                </button>
              </div>

              <div className="vehicle-edit-core-grid" style={coreDueGrid}>
                <label
                  style={{
                    gridColumn: "1 / -1",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    color: UI.text,
                    fontSize: "var(--font-size-sm)",
                    fontWeight: 850,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    name="motNotApplicable"
                    checked={isMotNotApplicable(vehicle)}
                    onChange={handleChange}
                  />
                  MOT not applicable for this vehicle
                </label>
                <DateField label="Last MOT" name="lastMOT" value={vehicle.lastMOT} onChange={handleChange} meta={dvsaMotMeta} disabled={isMotNotApplicable(vehicle)} />
                <Field label="MOT Freq (fallback weeks)" name="motFreq" value={vehicle.motFreq} onChange={handleChange} meta="Manual fallback only; DVSA expiry is used when fetched." disabled={isMotNotApplicable(vehicle)} />
                <DateField label="Next MOT (Expiry)" name="nextMOT" value={vehicle.nextMOT} onChange={handleChange} meta={dvsaMotMeta} disabled={isMotNotApplicable(vehicle)} />
                <Field label="MOT ISO Week" name="motISOWeek" value={vehicle.motISOWeek} onChange={handleChange} disabled={isMotNotApplicable(vehicle)} />

                <label
                  style={{
                    gridColumn: "1 / -1",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    color: UI.text,
                    fontSize: "var(--font-size-sm)",
                    fontWeight: 850,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    name="serviceNotApplicable"
                    checked={isServiceNotApplicable(vehicle)}
                    onChange={handleChange}
                  />
                  Service not required for this vehicle
                </label>
                <DateField label="Last Service" name="lastService" value={dateOnly(vehicle.lastService)} onChange={handleChange} disabled={isServiceNotApplicable(vehicle)} />
                <Field label="Service Freq (weeks)" name="serviceFreq" value={vehicle.serviceFreq} onChange={handleChange} disabled={isServiceNotApplicable(vehicle)} />
                <DateField label="Next Service" name="nextService" value={vehicle.nextService} onChange={handleChange} disabled={isServiceNotApplicable(vehicle)} />
                <Field label="Service ISO Week" name="serviceISOWeek" value={vehicle.serviceISOWeek} onChange={handleChange} disabled={isServiceNotApplicable(vehicle)} />

                {showEightWeekInspection ? (
                  <>
                    <DateField
                      label="8 Week Inspection Base Date"
                      name="eightWeekInspectionStart"
                      value={vehicle.eightWeekInspectionStart}
                      onChange={handleChange}
                    />
                    <div>
                      <label style={labelStyle}>Inspection Freq (weeks)</label>
                      <input type="text" value="8" readOnly style={inputField} />
                    </div>
                    <DateField
                      label="Next 8 Week Inspection"
                      name="nextEightWeekInspection"
                      value={vehicle.nextEightWeekInspection}
                      onChange={handleChange}
                    />
                    <Field
                      label="Inspection ISO Week"
                      name="eightWeekInspectionISOWeek"
                      value={vehicle.eightWeekInspectionISOWeek}
                      onChange={handleChange}
                    />
                  </>
                ) : null}
              </div>
            </div>

            <div style={panel}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <h2 style={sectionTitle}>DVSA MOT Summary</h2>
                  <div style={sectionMeta}>
                    Latest fetched MOT result, advisories, defects and DVSA vehicle identity.
                  </div>
                </div>
                <button
                  type="button"
                  style={btn("ghost")}
                  onClick={() => router.push(`/vehicle-edit/${vehicle.id}/mot-history`)}
                >
                  <ExternalLink size={15} />
                  Full MOT History
                </button>
              </div>

              {!dvsaLatestMot ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", marginTop: 10 }}>
                  No DVSA MOT data saved yet. Press Fetch DVSA MOT above, then Save.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  <div className="vehicle-edit-core-grid" style={coreDueGrid}>
                    <MiniLine label="Latest Result" value={vehicle.dvsaLatestMotResult || dvsaLatestMot.testResult || "-"} />
                    <MiniLine label="Test Date" value={formatDisplayDate(dvsaLatestMot.completedDate)} />
                    <MiniLine label="Expiry Date" value={formatDisplayDate(dvsaLatestMot.expiryDate || vehicle.nextMOT)} />
                    <MiniLine label="Odometer" value={vehicle.dvsaLatestMotOdometer || formatOdometer(dvsaLatestMot)} />
                    <MiniLine label="Test Number" value={vehicle.dvsaLatestMotTestNumber || dvsaLatestMot.motTestNumber || "-"} />
                    <MiniLine label="Fuel / Colour" value={[dvsaVehicleDetails.fuelType, dvsaVehicleDetails.primaryColour].filter(Boolean).join(" / ") || "-"} />
                    <MiniLine label="Engine Size" value={dvsaVehicleDetails.engineSize || "-"} />
                    <MiniLine label="Outstanding Recall" value={String(dvsaVehicleDetails.hasOutstandingRecall || "-")} />
                  </div>

                  {dvsaMotMileageWarning ? (
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        alignItems: "flex-start",
                        border: "1px solid var(--legacy-color-f59e0b)",
                        background: "var(--legacy-color-fffbeb)",
                        color: "var(--legacy-color-92400e)",
                        borderRadius: UI.radius,
                        padding: 10,
                        fontSize: 12.5,
                        fontWeight: 850,
                      }}
                    >
                      <AlertTriangle size={16} />
                      <span>{dvsaMotMileageWarning}</span>
                    </div>
                  ) : null}

                  {dvsaLatestSeriousDefects.length ? (
                    <div
                      style={{
                        border: "1px solid var(--color-danger-border)",
                        background: "var(--color-danger-soft)",
                        color: "var(--color-danger)",
                        borderRadius: UI.radius,
                        padding: 10,
                        fontSize: 12.5,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>
                        Serious defects on latest MOT
                      </div>
                      {dvsaLatestSeriousDefects.slice(0, 3).map((defect, index) => (
                        <div key={`${defect.text}-${index}`} style={{ marginTop: index ? 4 : 0 }}>
                          {defect.type ? `${defect.type}: ` : ""}
                          {defect.text}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {dvsaLatestAdvisories.length ? (
                    <div
                      style={{
                        border: UI.border,
                        background: "var(--color-white)",
                        borderRadius: UI.radius,
                        padding: 10,
                        fontSize: 12.5,
                        color: UI.text,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>
                        Latest advisories
                      </div>
                      {dvsaLatestAdvisories.slice(0, 4).map((defect, index) => (
                        <div key={`${defect.text}-${index}`} style={{ marginTop: index ? 4 : 0 }}>
                          {defect.text}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            {showEightWeekInspection ? (
                <div style={panel}>
                  <h2 style={sectionTitle}>8 Week Inspection History</h2>
                  <div style={sectionMeta}>Completed 8 week inspections stored on this vehicle.</div>

                  {(vehicle.eightWeekInspectionHistory || []).length === 0 &&
                  completedInspectionHistory.length === 0 ? (
                    <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>No completed inspection history yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {(
                        (Array.isArray(vehicle.eightWeekInspectionHistory)
                          ? vehicle.eightWeekInspectionHistory
                          : []
                        ).length
                          ? vehicle.eightWeekInspectionHistory
                          : completedInspectionHistory.map((b) => ({
                              completedDate: bookingCompletedLabel(b),
                              bookingId: b.id,
                              provider: b.provider || "",
                              bookingRef: b.bookingRef || "",
                              notes: b.notes || "",
                            }))
                      ).map((item, index) => (
                        <div
                          key={item.bookingId || `${item.completedDate}-${index}`}
                          style={{
                            border: "1px solid var(--legacy-color-e5e7eb)",
                            borderRadius: "var(--radius-lg)",
                            padding: 10,
                            background: "var(--color-white)",
                          }}
                        >
                          <div style={{ fontWeight: 900, color: UI.text }}>
                            {item.completedDate || "-"}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12.5, color: UI.muted }}>
                            {item.provider ? `Provider: ${item.provider}` : "Provider: -"}
                          </div>
                          <div style={{ marginTop: "var(--space-1)", fontSize: 12.5, color: UI.muted }}>
                            {item.bookingRef ? `Ref: ${item.bookingRef}` : "Ref: -"}
                          </div>
                          {item.notes ? (
                            <div style={{ marginTop: 6, fontSize: 12.5, color: UI.text }}>{item.notes}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            ) : null}

            <div style={panel}>
              <h2 style={sectionTitle}>Additional Maintenance</h2>
              <div style={{ ...grid(2), marginTop: 10, marginBottom: "var(--space-3)" }}>
                <SelectField label="Warranty" name="warranty" value={vehicle.warranty} onChange={handleChange} options={["Yes", "No"]} />
                <DateField label="Warranty Expiry" name="warrantyExpiry" value={vehicle.warrantyExpiry} onChange={handleChange} />
              </div>
              <div style={sectionMeta}>
                Tick only the maintenance lines needed for this vehicle.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  flexWrap: "wrap",
                  marginTop: 10,
                  marginBottom: "var(--space-3)",
                }}
              >
                {ADDITIONAL_MAINTENANCE_SECTIONS.map((section) => {
                  const checked =
                    !hiddenAdditionalMaintenance.includes(section.key) &&
                    (sectionHasDateValue(vehicle, section) ||
                      shownAdditionalMaintenance.includes(section.key));
                  return (
                    <label
                      key={section.key}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        border: checked ? `1px solid ${UI.brandBorder}` : UI.border,
                        background: checked ? UI.brandSoft : "var(--color-white)",
                        color: UI.text,
                        borderRadius: UI.radius,
                        padding: "7px 9px",
                        fontSize: "var(--font-size-xs)",
                        fontWeight: 850,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleAdditionalMaintenanceToggle(section.key)}
                        style={{ margin: 0 }}
                      />
                      {section.label}
                    </label>
                  );
                })}
              </div>

              {visibleAdditionalMaintenanceSections.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>
                  All additional maintenance lines are hidden for this vehicle.
                </div>
              ) : null}

              <div className="vehicle-edit-maintenance-grid" style={coreDueGrid}>
                {visibleAdditionalMaintenanceSections.flatMap((section) =>
                  section.fields.map((field) =>
                    field.type === "date" ? (
                      <DateField
                        key={`${section.key}-${field.name}`}
                        label={field.label}
                        name={field.name}
                        value={vehicle[field.name]}
                        onChange={handleChange}
                      />
                    ) : (
                      <Field
                        key={`${section.key}-${field.name}`}
                        label={field.label}
                        name={field.name}
                        value={vehicle[field.name]}
                        onChange={handleChange}
                      />
                    )
                  )
                )}
              </div>
            </div>

            {/* (rest of your page continues as before...) */}
          </div>

          {/* RIGHT: Notes + quick info */}
          <div className="vehicle-edit-sidebar" style={sidebarStack}>
            <div style={panel}>
              <h2 style={sectionTitle}>Notes</h2>
              <textarea
                name="notes"
                value={vehicle.notes || ""}
                onChange={handleChange}
                rows={5}
                style={{ ...textarea, minHeight: 118 }}
                placeholder="General notes for this vehicle..."
              />
            </div>

            <div style={panel}>
              <h2 style={sectionTitle}>Booked Work / Maintenance</h2>
              <div style={sectionMeta}>
                All bookings linked to this vehicle.
              </div>

              {activeVehicleBookings.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", marginTop: 10 }}>
                  No maintenance bookings found for this vehicle.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  {activeVehicleBookings.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        border: UI.border,
                        borderRadius: UI.radius,
                        padding: 10,
                        background: "var(--color-white)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "var(--space-2)",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontWeight: 800, color: UI.text, fontSize: 13.5 }}>
                          {bookingTypeLabel(b)}
                        </div>
                        <div
                          style={{
                            fontSize: "var(--font-size-xs)",
                            fontWeight: 800,
                            color: UI.text,
                            border: UI.border,
                            borderRadius: "var(--radius-pill)",
                            padding: "4px 8px",
                            background: "var(--color-surface-subtle)",
                          }}
                        >
                          {b.status || "Booked"}
                        </div>
                      </div>

                      <div style={{ marginTop: 6, fontSize: 12.5, color: UI.text, fontWeight: 800 }}>
                        {bookingDateLabel(b)}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 12.5, color: UI.muted, lineHeight: 1.4 }}>
                        {b.provider ? `Provider: ${b.provider}` : "Provider: -"}
                        <br />
                        {b.bookingRef ? `Ref: ${b.bookingRef}` : "Ref: -"}
                        <br />
                        {b.location ? `Location: ${b.location}` : "Location: -"}
                      </div>

                      <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={btn("ghost")}
                          onClick={() => setEditBookingId(b.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          style={btn("danger")}
                          onClick={() => deleteMaintenanceBooking(b.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={panel}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h2 style={sectionTitle}>MOT Bookings</h2>
                  <div style={sectionMeta}>Completed or past MOT bookings.</div>
                </div>
                <button
                  type="button"
                  style={btn("ghost")}
                  onClick={() => router.push(`/vehicle-edit/${vehicle.id}/mot-history`)}
                >
                  DVSA History
                </button>
              </div>

              {motHistoryItems.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", marginTop: 10 }}>No MOT history yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  {motHistoryItems.map((item, index) => (
                    <div
                      key={item.bookingId || `${item.completedDate}-${index}`}
                      onClick={() => item.bookingId && setEditBookingId(item.bookingId)}
                      style={{
                        border: UI.border,
                        borderRadius: UI.radius,
                        padding: 10,
                        background: "var(--color-white)",
                        cursor: item.bookingId ? "pointer" : "default",
                      }}
                      title={item.bookingId ? "Open booking" : "No linked booking record"}
                    >
                      <div style={{ fontWeight: 800, color: UI.text, fontSize: 13.5 }}>
                        {formatDisplayDate(item.completedDate)}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 12.5, color: UI.muted, lineHeight: 1.4 }}>
                        {item.provider ? `Provider: ${item.provider}` : "Provider: -"}
                        <br />
                        {item.bookingRef ? `Ref: ${item.bookingRef}` : "Ref: -"}
                      </div>
                      {item.notes ? (
                        <div style={{ marginTop: 6, fontSize: 12.5, color: UI.text, lineHeight: 1.35 }}>
                          {item.notes}
                        </div>
                      ) : null}
                      {item.bookingId ? (
                        <div style={{ marginTop: "var(--space-2)", fontSize: 11.5, fontWeight: 800, color: UI.brand }}>
                          Open booking
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={panel}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h2 style={sectionTitle}>Service History</h2>
                  <div style={sectionMeta}>Completed service bookings.</div>
                </div>
                <button
                  type="button"
                  style={btn("ghost")}
                  onClick={() => router.push(`/vehicle-edit/${vehicle.id}/service-history`)}
                >
                  Full History
                </button>
              </div>

              {serviceHistoryItems.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", marginTop: 10 }}>No completed service history yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  {serviceHistoryItems.slice(0, 4).map((item, index) => (
                    <div
                      key={item.bookingId || `${item.completedDate}-${index}`}
                      onClick={() =>
                        item.bookingId
                          ? router.push(`/vehicle-edit/${vehicle.id}/service-history/${item.bookingId}`)
                          : router.push(`/vehicle-edit/${vehicle.id}/service-history`)
                      }
                      style={{
                        border: UI.border,
                        borderRadius: UI.radius,
                        padding: 10,
                        background: "var(--color-white)",
                        cursor: "pointer",
                      }}
                      title={item.bookingId ? "Open full service details" : "Open service history"}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800, color: UI.text, fontSize: 13.5 }}>
                            {formatDisplayDate(item.completedDate)}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 12.5, color: UI.muted }}>
                            {item.bookingRef || "Service record"}
                          </div>
                        </div>
                        <span style={{ color: UI.brand, fontSize: "var(--font-size-xs)", fontWeight: 800, whiteSpace: "nowrap" }}>
                          Open
                        </span>
                      </div>

                      <div style={{ marginTop: 6, fontSize: 12.5, color: UI.muted, lineHeight: 1.4 }}>
                        {item.provider ? `Provider: ${item.provider}` : "Provider: -"}
                        <br />
                        {item.odometer ? `Odometer: ${item.odometer}` : "Odometer: -"}
                      </div>

                      {item.notes ? (
                        <div
                          style={{
                            marginTop: 7,
                            fontSize: 12.5,
                            color: UI.text,
                            lineHeight: 1.35,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {item.notes}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={panel}>
              <h2 style={sectionTitle}>Quick Links</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button style={btn("ghost")} onClick={() => router.push("/vehicles")}>
                  Vehicles List
                </button>
                <button style={btn("ghost")} onClick={() => router.push("/vehicle-checks")}>
                  Vehicle Checks
                </button>
                {showEightWeekInspection ? (
                  <button style={btn("ghost")} onClick={() => setShowInspectionBooking(true)}>
                    Book Inspection
                  </button>
                ) : null}
                <button style={btn("ghost")} onClick={() => setShowWorkBooking(true)}>
                  Book Work
                </button>
              </div>
            </div>

            <div style={panel}>
              <h2 style={sectionTitle}>Next Dates</h2>
              <div style={{ display: "grid", gap: "var(--space-2)", fontSize: "var(--font-size-sm)" }}>
                <MiniLine label="Next MOT (Expiry)" value={formatDisplayDate(vehicle.nextMOT)} />
                <MiniLine label="MOT Appointment" value={formatDisplayDate(motAppointmentDisplay)} />
                <MiniLine label="MOT Booked On" value={formatDisplayDate(motBookedOnDisplay)} />
                <MiniLine label="Next Service" value={formatDisplayDate(vehicle.nextService)} />
                {showEightWeekInspection ? (
                  <MiniLine label="Next 8 Week Inspection" value={formatDisplayDate(vehicle.nextEightWeekInspection)} />
                ) : null}
                <MiniLine label="Next RFL" value={formatDisplayDate(vehicle.nextRFL)} />
                <MiniLine label="Next Tacho" value={formatDisplayDate(vehicle.nextTacho)} />
                <MiniLine label="Next Brake Test" value={formatDisplayDate(vehicle.nextBrakeTest)} />
                <MiniLine label="Next PMI" value={formatDisplayDate(vehicle.nextPMI)} />
              </div>
            </div>
          </div>
        </div>

        {taxDatePrompt ? (
          <div style={overlay} onClick={() => setTaxDatePrompt(null)}>
            <div style={modal} onClick={(e) => e.stopPropagation()}>
              <div style={headerRow}>
                <div>
                  <h2 style={modalTitle}>Set road tax date</h2>
                  <div style={sectionMeta}>{vehicle.name || vehicle.registration || "Vehicle"}</div>
                </div>
                <button type="button" style={closeBtn} onClick={() => setTaxDatePrompt(null)}>
                  x
                </button>
              </div>
              <label style={modalLabel}>Taxed Until</label>
              <input
                type="date"
                value={taxDatePrompt.date || ""}
                onChange={(e) => setTaxDatePrompt((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                style={modalInput}
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: 14 }}>
                <button type="button" style={btn("ghost")} onClick={() => setTaxDatePrompt(null)}>
                  Cancel
                </button>
                <button type="button" style={btn()} onClick={saveTaxDatePrompt}>
                  Save taxed
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {insuranceDatePrompt ? (
          <div style={overlay} onClick={() => setInsuranceDatePrompt(null)}>
            <div style={modal} onClick={(e) => e.stopPropagation()}>
              <div style={headerRow}>
                <div>
                  <h2 style={modalTitle}>Set insured until date</h2>
                  <div style={sectionMeta}>{vehicle.name || vehicle.registration || "Vehicle"}</div>
                </div>
                <button type="button" style={closeBtn} onClick={() => setInsuranceDatePrompt(null)}>
                  x
                </button>
              </div>
              <label style={modalLabel}>Insured Until</label>
              <input
                type="date"
                value={insuranceDatePrompt.date || ""}
                onChange={(e) =>
                  setInsuranceDatePrompt((prev) => (prev ? { ...prev, date: e.target.value } : prev))
                }
                style={modalInput}
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: 14 }}>
                <button type="button" style={btn("ghost")} onClick={() => setInsuranceDatePrompt(null)}>
                  Cancel
                </button>
                <button type="button" style={btn()} onClick={saveInsuranceDatePrompt}>
                  Save insured
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Bottom actions */}
        <div style={{ marginTop: "var(--space-4)", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => setShowWorkBooking(true)} style={btn("success")}>
            Book Work
          </button>
          <button onClick={handleSave} style={btn()} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* small components */
function Field({ label, name, value, onChange, meta, disabled = false }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="text" name={name} value={value || ""} onChange={onChange} style={inputField} disabled={disabled} />
      {meta ? <FieldMeta>{meta}</FieldMeta> : null}
    </div>
  );
}

function DateField({ label, name, value, onChange, meta, disabled = false }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="date" name={name} value={value || ""} onChange={onChange} style={inputField} disabled={disabled} />
      {meta ? <FieldMeta>{meta}</FieldMeta> : null}
    </div>
  );
}

function FieldMeta({ children }) {
  return (
    <div
      style={{
        marginTop: "var(--space-1)",
        fontSize: 11.5,
        color: UI.brand,
        fontWeight: 850,
        lineHeight: 1.25,
      }}
    >
      {children}
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select name={name} value={value || ""} onChange={onChange} style={inputField}>
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({ label, name, value, onChange, placeholder }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
        name={name}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        rows={6}
        style={{ ...textarea, minHeight: 140 }}
      />
    </div>
  );
}

function FileUploadField({ label, field, files, onUpload, uploadingField }) {
  const isUploading = uploadingField === field;
  const list = Array.isArray(files) ? files : [];

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" multiple onChange={(e) => onUpload(e, field)} />
        {isUploading ? <span style={{ fontSize: "var(--font-size-xs)", color: UI.muted }}>Uploading...</span> : null}
      </div>

      {list.length ? (
        <div style={{ marginTop: "var(--space-2)", display: "grid", gap: 6 }}>
          {list.map((f, idx) => (
            <a
              key={`${field}-${idx}`}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "var(--font-size-sm)",
                color: UI.brand,
                fontWeight: 800,
                textDecoration: "none",
                padding: "8px 10px",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--legacy-color-e5e7eb)",
                background: "var(--color-white)",
              }}
              title={f.url}
            >
              {f.name || `File ${idx + 1}`} - Open
            </a>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: "var(--font-size-xs)", color: UI.muted }}>No files uploaded.</div>
      )}
    </div>
  );
}

function MiniLine({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: UI.muted, fontWeight: 900 }}>{label}</span>
      <span style={{ color: UI.text, fontWeight: 950 }}>{value || "-"}</span>
    </div>
  );
}

/* modal styles */
function MetricCard({ label, value }) {
  return (
    <div style={metricCard}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: UI.muted,
          textTransform: "uppercase",
          letterSpacing: ".06em",
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950, color: UI.text, lineHeight: 1.15 }}>
        {value || "-"}
      </div>
    </div>
  );
}

function MetaPill({ label, value }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: "var(--radius-pill)",
        border: "1px solid var(--legacy-color-e5e7eb)",
        background: "var(--color-white)",
        fontSize: "var(--font-size-xs)",
      }}
    >
      <span style={{ color: UI.muted, fontWeight: 900 }}>{label}</span>
      <span style={{ color: UI.text, fontWeight: 900 }}>{value || "-"}</span>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 90,
  padding: "var(--space-4)",
};

const modal = {
  width: "min(520px, 95vw)",
  borderRadius: UI.radius,
  padding: "var(--space-4)",
  color: UI.text,
  background: UI.card,
  border: UI.border,
  boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
};

const headerRow = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  marginBottom: 10,
};

const modalTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  color: UI.text,
};

const closeBtn = {
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: "var(--color-white)",
  color: UI.muted,
  fontSize: 20,
  cursor: "pointer",
  padding: 6,
  lineHeight: 1,
};

const modalLabel = {
  display: "block",
  fontSize: "var(--font-size-xs)",
  fontWeight: 800,
  color: UI.muted,
  marginBottom: 6,
};

const modalInput = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  backgroundColor: "var(--color-white)",
  color: UI.text,
  outline: "none",
  fontSize: "var(--font-size-md)",
  appearance: "none",
};

const primaryBtn = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brand}`,
  background: "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--color-brand) 100%)",
  color: "var(--color-white)",
  fontWeight: 800,
  fontSize: "var(--font-size-md)",
};

const dangerBtn = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.red}`,
  background: UI.red,
  color: "var(--color-white)",
  fontWeight: 800,
  fontSize: "var(--font-size-md)",
  cursor: "pointer",
};
