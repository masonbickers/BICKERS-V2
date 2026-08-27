// src/app/vehicle-edit/[id]/page.js
//  UPDATED: MOT/SERVICE bookings now support CREATE + EDIT from this page
//  Sync: When booking status is "Completed", it updates core due dates (last + next) automatically
//  Keeps: your auto-calcs + frequencies logic unchanged
//  Ensures: maintenanceBookings docs always store usable Date objects for calendar

"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  Save,
  Trash2,
  X,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  getDocs,
  doc as fsDoc,
  getDoc,
  onSnapshot,
  updateDoc,
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
import {
  commitVehicleVorTransition,
  deleteMaintenanceBooking as deleteMaintenanceBookingRecord,
  syncVehicleAnnualMaintenanceForecast,
} from "@/app/utils/maintenanceMutationClient";
import {
  getMaintenanceRecordDisplayDates,
  isConfirmedMaintenanceBooking,
  isOpenMaintenanceBooking,
} from "@/app/utils/maintenanceCalendar";
import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  getIsoWeekLabel,
  isMotNotApplicable,
  isSelectableVehicleOperatingStatus,
  isServiceNotApplicable,
  isVehicleOutOfUse as getIsVehicleOutOfUse,
  normalizeVehicleOperatingStatus,
  syncVehicleOperatingStatus,
} from "@/app/utils/maintenanceSchema";
import { formatDateForDisplay, normalizeServiceRecord } from "@/app/utils/serviceRecordCompat";
import {
  buildServiceHistoryItems,
  ensureServiceHistoryForLastService,
} from "@/app/utils/serviceHistory";
import {
  buildVehicleEditorUpdatePatch,
  getChangedProtectedVehicleFields,
  mergeServerManagedVehicleFields,
  restoreProtectedVehicleFields,
} from "@/app/utils/vehicleEditorSave";
import { normalizeVehicleRecord } from "@/app/utils/vehicleCompat";
import { normalizeVehicleAssetNumber } from "@/app/utils/vehicleAssetNumber";
import { requestGuardedNavigation, useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import {
  mergeVehicleRealtimeState,
  shouldApplyRealtimeSnapshot,
} from "@/app/utils/vehicleRealtime";
import {
  mutateVehicleVor,
  VEHICLE_VOR_OPERATIONS,
} from "@/app/utils/vehicleVorMutationClient";
import { buildVehicleComplianceAttention } from "@/app/utils/vehicleComplianceAttention";
import { deleteVehicleAndBookings } from "@/app/utils/vehicleMutationClient";
import {
  canReleaseVehicleAfterCompletedCompliance,
  calculateVorDurationDays,
  startVehicleVorPeriod,
} from "@/app/utils/vorPeriods";
import {
  addComplianceWeeks,
  buildHgvComplianceMigrationPatch,
  complianceVorReturnInspectionBlocker,
  evaluateHgvCompliance,
  getHgvComplianceVorDisplayRows,
  isHgvComplianceVehicle,
  syncCanonicalPmiAliases,
} from "@/app/utils/hgvCompliance";
import {
  Button as UIButton,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/app/components/ui";

/* UI tokens */
const UI = UI_TOKENS;

const pageWrap = {
  padding: "10px 16px 24px",
  background: UI.bg,
  minHeight: "100vh",
};
const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 10,
};
const title = { margin: 0, fontSize: 22, fontWeight: 750, letterSpacing: 0, color: UI.text, lineHeight: 1.08 };
const subtitle = { marginTop: 6, fontSize: 13.5, color: UI.muted, maxWidth: 760, lineHeight: 1.45 };

const card = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 12 };
const heroCard = {
  ...card,
  padding: 12,
  background: "var(--color-surface)",
  border: UI.border,
};
const vehicleToolbar = {
  padding: "0 0 4px",
  background: "transparent",
  border: "none",
  borderRadius: 0,
  boxShadow: "none",
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
      background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
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
      color: "var(--color-success)",
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
    background: "var(--button-primary-background)",
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
  fontSize: 13,
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: "var(--color-surface)",
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
  gap: 8,
});
const coreDueGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
  marginTop: 10,
};
const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8,
  marginTop: 10,
};
const metricCard = {
  ...card,
  borderRadius: UI.radius,
  padding: 12,
};
const sectionStack = { display: "flex", flexDirection: "column", gap: UI.gap };
const sidebarStack = {
  position: "sticky",
  top: 12,
  alignSelf: "start",
  display: "flex",
  flexDirection: "column",
  gap: UI.gap,
};

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

const formatOdometerInput = (value) => {
  if (String(value ?? "").trim() === "") return "";
  const numeric = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric >= 0
    ? numeric.toLocaleString("en-GB")
    : String(value || "");
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

const resolveFreqWeeks = (explicitFreq) => {
  const explicit = Number(explicitFreq || 0);
  return explicit > 0 ? explicit : 0;
};

const safeArr = (v) => (Array.isArray(v) ? v : []);

const ADDITIONAL_MAINTENANCE_SECTIONS = [
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
  {
    key: "tachoCalibration",
    label: "Tacho Calibration",
    fields: [
      { type: "date", label: "Last Tacho Calibration", name: "lastTachoCalibration" },
      { type: "text", label: "Tacho Calibration Freq (weeks)", name: "tachoCalibrationFreq" },
      { type: "date", label: "Next Tacho Calibration", name: "nextTachoCalibration" },
      { type: "text", label: "Tacho Calibration ISO Week", name: "tachoCalibrationISOWeek" },
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

const getLatestMotTest = (tests) => safeArr(tests)[0] || null;

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

const getMaintenanceBookingStartDate = (booking) =>
  toDate(getMaintenanceRecordDisplayDates(booking).displayDateISO);

const getMaintenanceBookingEndDate = (booking) =>
  toDate(booking?.endDate) ||
  toDate(booking?.endDateISO) ||
  (Array.isArray(booking?.bookingDates)
    ? toDate(booking.bookingDates[booking.bookingDates.length - 1])
    : null) ||
  getMaintenanceBookingStartDate(booking);

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

const isTransportLorryVehicle = isHgvComplianceVehicle;

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
  const [realtimeVehicleError, setRealtimeVehicleError] = useState("");
  const [categories, setCategories] = useState([]);
  const [vehicleComplianceSettings, setVehicleComplianceSettings] = useState(DEFAULT_VEHICLE_COMPLIANCE_SETTINGS);
  const [uploadingField, setUploadingField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const [fetchingMotHistory, setFetchingMotHistory] = useState(false);
  const [taxDatePrompt, setTaxDatePrompt] = useState(null);
  const [insuranceDatePrompt, setInsuranceDatePrompt] = useState(null);
  const [vorPrompt, setVorPrompt] = useState(null);
  const [savingVorPeriod, setSavingVorPeriod] = useState(false);
  const [vorPromptError, setVorPromptError] = useState("");
  const [dateOverrides, setDateOverrides] = useState({
    mot: false,
    service: false,
    inspection: false,
  });
  const [advancedDatesOpen, setAdvancedDatesOpen] = useState(false);
  const [maintenanceMenuOpen, setMaintenanceMenuOpen] = useState(false);
  const maintenanceMenuRef = useRef(null);
  const maintenanceMenuTriggerRef = useRef(null);

  useEffect(() => {
    if (!saveNotice) return undefined;
    const timeout = window.setTimeout(
      () => setSaveNotice(null),
      saveNotice.tone === "warning" ? 6500 : 3200
    );
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);

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

  useEffect(() => {
    if (!maintenanceMenuOpen) return undefined;
    const closeForOutsideClick = (event) => {
      if (!maintenanceMenuRef.current?.contains(event.target)) {
        setMaintenanceMenuOpen(false);
      }
    };
    const closeForEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMaintenanceMenuOpen(false);
      maintenanceMenuTriggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeForOutsideClick);
    document.addEventListener("keydown", closeForEscape);
    return () => {
      document.removeEventListener("mousedown", closeForOutsideClick);
      document.removeEventListener("keydown", closeForEscape);
    };
  }, [maintenanceMenuOpen]);

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
      const ad = getMaintenanceBookingStartDate(a) || toDate(a.createdAt) || new Date(0);
      const bd = getMaintenanceBookingStartDate(b) || toDate(b.createdAt) || new Date(0);
      return bd.getTime() - ad.getTime();
    });
    const sortedServiceRows = [...serviceRows].sort((a, b) => {
      const ad = toDate(a.serviceDateOnly || a.serviceDate || a.createdAt) || new Date(0);
      const bd = toDate(b.serviceDateOnly || b.serviceDate || b.createdAt) || new Date(0);
      return bd.getTime() - ad.getTime();
    });
    setVehicleBookings(sortedRows);
    setServiceRecords(sortedServiceRows);

    const active = rows.filter((booking) => isOpenMaintenanceBooking(booking));

    const byNewest = [...active].sort((a, b) => {
      const ad = getMaintenanceBookingStartDate(a) || toDate(a.createdAt) || new Date(0);
      const bd = getMaintenanceBookingStartDate(b) || toDate(b.createdAt) || new Date(0);
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

      if (isHgvComplianceVehicle(hydrated)) {
        const migration = buildHgvComplianceMigrationPatch(hydrated);
        Object.assign(hydrated, migration.patch);
        Object.assign(hydrated, syncCanonicalPmiAliases(hydrated));
        hydrated.complianceVor = evaluateHgvCompliance(hydrated).complianceVor;
        hydrated.hgvComplianceMigrationIssues = migration.issues;
      }

      setVehicle(syncStatusDateFields(hydrated));
    }
  };

  // load vehicle
  useEffect(() => {
    if (!id) return;
    setInitialSnapshot("");
    setShownAdditionalMaintenance([]);
    setDateOverrides({ mot: false, service: false, inspection: false });
    setAdvancedDatesOpen(false);
    reloadVehicle().catch((error) => {
      console.error("Failed to load vehicle:", error);
      setLoadError("Vehicle could not be loaded.");
      setVehicle(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, id]);

  useEffect(() => {
    if (!id) return undefined;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking || !gate.allowed) return undefined;

    const unsubscribe = onSnapshot(
      fsDoc(db, "vehicles", id),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.exists() || !shouldApplyRealtimeSnapshot(snapshot.metadata)) return;
        const remoteVehicle = normalizeVehicleRecord({ id: snapshot.id, ...(snapshot.data() || {}) });
        setRealtimeVehicleError("");
        setVehicle((previous) =>
          previous
            ? syncStatusDateFields(mergeVehicleRealtimeState(previous, remoteVehicle))
            : previous
        );
        setInitialSnapshot((previous) => {
          if (!previous) return previous;
          try {
            return JSON.stringify(
              mergeVehicleRealtimeState(JSON.parse(previous), remoteVehicle)
            );
          } catch {
            return previous;
          }
        });
      },
      (error) => {
        handleFirestoreAccessError(error, {
          collectionName: "vehicles",
          operation: "listen to vehicle updates",
        });
        setRealtimeVehicleError(
          "Live vehicle updates are unavailable. Reload before relying on the timeline."
        );
      }
    );

    return unsubscribe;
  }, [accessKey, dataAccessState, id]);

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
    if (getIsVehicleOutOfUse(vehicle)) return;

    const updates = {};
    const resumedDueDates =
      vehicle.maintenanceCountdownPause?.status === "resumed"
        ? vehicle.maintenanceCountdownPause?.resumedDueDates || {}
        : {};
    const keepResumedDate = (field) =>
      Boolean(
        resumedDueDates[field] &&
          String(resumedDueDates[field]) === String(vehicle[field] || "")
      );

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
      if ((!hasFetchedMotData || !vehicle.nextMOT) && !dateOverrides.mot) {
        const nextMOT = calcNextFromWeeks(
          vehicle.lastMOT,
          resolveFreqWeeks(vehicle.motFreq, vehicle.lastMOT, vehicle.nextMOT)
        );
        if (nextMOT && vehicle.nextMOT !== nextMOT && !keepResumedDate("nextMOT")) {
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
    } else if (!dateOverrides.service) {
      const nextService = calcNextFromWeeks(
        dateOnly(vehicle.lastService),
        resolveFreqWeeks(vehicle.serviceFreq, dateOnly(vehicle.lastService), vehicle.nextService)
      );
      if (nextService && vehicle.nextService !== nextService && !keepResumedDate("nextService")) updates.nextService = nextService;
    }

    // Tacho Inspection
    const nextTacho = calcNextFromWeeks(vehicle.lastTacho, vehicle.tachoFreq);
    if (nextTacho && vehicle.nextTacho !== nextTacho && !keepResumedDate("nextTacho")) updates.nextTacho = nextTacho;

    // Brake Test
    const nextBrakeTest = calcNextFromWeeks(vehicle.lastBrakeTest, vehicle.brakeTestFreq);
    if (nextBrakeTest && vehicle.nextBrakeTest !== nextBrakeTest && !keepResumedDate("nextBrakeTest")) updates.nextBrakeTest = nextBrakeTest;

    // PMI
    const nextPMI = calcNextFromWeeks(vehicle.lastPMI, vehicle.pmiFreq);
    if (nextPMI && vehicle.nextPMI !== nextPMI && !keepResumedDate("nextPMI")) updates.nextPMI = nextPMI;
    const canonicalNextPMI = updates.nextPMI || vehicle.nextPMI;
    if (canonicalNextPMI && vehicle.nextEightWeekInspection !== canonicalNextPMI) {
      updates.nextEightWeekInspection = canonicalNextPMI;
      updates.eightWeekInspectionISOWeek = getIsoWeekLabel(canonicalNextPMI);
    }

    // RFL
    const nextRFL = calcNextFromWeeks(vehicle.lastRFL, vehicle.rflFreq);
    if (nextRFL && vehicle.nextRFL !== nextRFL && !keepResumedDate("nextRFL")) updates.nextRFL = nextRFL;

    // Tacho Download
    const nextTachoDownload = calcNextFromWeeks(vehicle.lastTachoDownload, vehicle.tachoDownloadFreq);
    if (nextTachoDownload && vehicle.nextTachoDownload !== nextTachoDownload && !keepResumedDate("nextTachoDownload"))
      updates.nextTachoDownload = nextTachoDownload;

    // Tail-lift
    const nextTailLift = calcNextFromWeeks(vehicle.lastTailLift, vehicle.tailLiftFreq);
    if (nextTailLift && vehicle.nextTailLift !== nextTailLift && !keepResumedDate("nextTailLift")) updates.nextTailLift = nextTailLift;

    // LOLER
    const nextLoler = calcNextFromWeeks(vehicle.lastLoler, vehicle.lolerFreq);
    if (nextLoler && vehicle.nextLoler !== nextLoler && !keepResumedDate("nextLoler")) updates.nextLoler = nextLoler;

    // Tacho Calibration
    const nextTachoCalibration = calcNextFromWeeks(vehicle.lastTachoCalibration, vehicle.tachoCalibrationFreq);
    if (nextTachoCalibration && vehicle.nextTachoCalibration !== nextTachoCalibration && !keepResumedDate("nextTachoCalibration"))
      updates.nextTachoCalibration = nextTachoCalibration;

    // Legacy lorry inspection dates are PMI aliases, not a separate cycle.
    if (canonicalNextPMI && vehicle.nextLorryInspection !== canonicalNextPMI) {
      updates.nextLorryInspection = canonicalNextPMI;
      updates.lorryInspectionISOWeek = getIsoWeekLabel(canonicalNextPMI);
    }

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
    dateOverrides.mot,
    dateOverrides.service,
    dateOverrides.inspection,
  ]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (
      type === "date" &&
      /^last/i.test(name) &&
      value &&
      value > todayISO()
    ) {
      systemDialogs.showSystemNotification("A last-completed date cannot be in the future. Book the work instead, then mark it complete when it has been done.");
      return;
    }
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
      if (name === "assetNumber" || name === "sageAssetNumber") {
        next.assetNumber = value;
        next.sageAssetNumber = value;
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
      if (name === "lastPMI") {
        next.eightWeekInspectionStart = value;
      }
      if (name === "nextPMI") {
        next.nextEightWeekInspection = value;
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

  const handleWarrantyToggle = (event) => {
    const enabled = event.target.checked;
    setVehicle((previous) => ({
      ...previous,
      warranty: enabled ? "Yes" : "No",
    }));
  };

  const handleOperatingStatusChange = (event) => {
    const nextStatus = event.target.value;
    const currentlyVor = isVehicleOutOfUse;

    if (!isSelectableVehicleOperatingStatus(nextStatus)) return;

    if (nextStatus === "VOR" && !currentlyVor) {
      setVorPrompt({
        mode: "start",
        offRoadDate: todayISO(),
        odometer: formatOdometerInput(vehicle?.odometer),
        approvedBy: "",
        approvedPosition: "",
        reason: "",
        operatorLicenceNumber: vehicle?.operatorLicenceNumber || "OF0202656",
      });
      return;
    }

    if (nextStatus === "Active" && currentlyVor) {
      if (vehicle?.pendingReturnInspection?.status === "inspection_required") {
        const inspectionDate = formatDisplayDate(
          vehicle.pendingReturnInspection.inspectionDate
        );
        systemDialogs.showSystemNotification(
          `Complete the return-to-fleet PMI and brake-test inspection${
            inspectionDate ? ` scheduled for ${inspectionDate}` : ""
          } before returning this vehicle to Active.`
        );
        return;
      }
      const canReleaseCompletedInspections =
        canReleaseVehicleAfterCompletedCompliance(vehicle);
      setVorPrompt({
        mode: canReleaseCompletedInspections ? "release" : "return",
        returnedDate: todayISO(),
        odometer: formatOdometerInput(vehicle?.odometer),
        removedBy: "",
        removedPosition: "",
        signature: "",
        firstUseInspectionDate: "",
      });
      return;
    }

    setVehicle((previous) => syncVehicleOperatingStatus(previous, nextStatus));
  };

  const updateVorPrompt = (field, value) => {
    setVorPrompt((previous) => (previous ? { ...previous, [field]: value } : previous));
  };

  const openHistoricVorMigration = () => {
    setVorPromptError("");
    setVorPrompt({
      mode: "historic",
      offRoadDate: "",
      returnedDate: "",
      offRoadOdometer: "",
      returnOdometer: "",
      approvedBy: "",
      approvedPosition: "",
      removedBy: "",
      removedPosition: "",
      reason: "",
      firstUseInspectionDate: "",
      operatorLicenceNumber: vehicle?.operatorLicenceNumber || "OF0202656",
    });
  };

  const confirmVorPrompt = async () => {
    if (!vorPrompt) return;

    if (vorPrompt.mode === "historic") {
      const required = [
        ["offRoadDate", "historic start date"],
        ["returnedDate", "historic return date"],
        ["approvedBy", "VOR approver"],
        ["approvedPosition", "approver position"],
        ["removedBy", "return authoriser"],
        ["removedPosition", "return authoriser position"],
        ["reason", "reason for VOR/SORN"],
      ];
      const missing = required.find(([field]) => !String(vorPrompt[field] || "").trim());
      if (missing) {
        setVorPromptError(`Enter the ${missing[1]} before adding this historic period.`);
        return;
      }
      setSavingVorPeriod(true);
      setVorPromptError("");
      try {
        await mutateVehicleVor({
          vehicleId: id,
          operation: VEHICLE_VOR_OPERATIONS.ADD_HISTORIC,
          dataAccessState,
          payload: {
            registration: vehicle.registration || vehicle.reg || "",
            operatorLicenceNumber: vorPrompt.operatorLicenceNumber,
            offRoadDate: vorPrompt.offRoadDate,
            returnedDate: vorPrompt.returnedDate,
            offRoadOdometer: vorPrompt.offRoadOdometer,
            returnOdometer: vorPrompt.returnOdometer,
            approvedBy: vorPrompt.approvedBy,
            approvedPosition: vorPrompt.approvedPosition,
            removedBy: vorPrompt.removedBy,
            removedPosition: vorPrompt.removedPosition,
            reason: vorPrompt.reason,
            firstUseInspectionDate: vorPrompt.firstUseInspectionDate,
          },
        });
        setVorPrompt(null);
      } catch (migrationError) {
        console.error("Failed to add historic VOR/SORN period:", migrationError);
        setVorPromptError(
          migrationError.message || "Could not add this historic VOR/SORN period."
        );
      } finally {
        setSavingVorPeriod(false);
      }
      return;
    }

    if (vorPrompt.mode === "start") {
      const required = [
        ["offRoadDate", "date taken off the fleet"],
        ["approvedBy", "VOR approver"],
        ["approvedPosition", "approver position"],
        ["reason", "reason for VOR"],
      ];
      const missing = required.find(([field]) => !String(vorPrompt[field] || "").trim());
      if (missing) {
        systemDialogs.showSystemNotification(`Enter the ${missing[1]} before marking this vehicle VOR.`);
        return;
      }

      setSavingVorPeriod(true);
      try {
        await mutateVehicleVor({
          vehicleId: id,
          operation: VEHICLE_VOR_OPERATIONS.START,
          dataAccessState,
          payload: {
            offRoadDate: vorPrompt.offRoadDate,
            odometer: vorPrompt.odometer,
            approvedBy: vorPrompt.approvedBy,
            approvedPosition: vorPrompt.approvedPosition,
            reason: vorPrompt.reason,
            operatorLicenceNumber: vorPrompt.operatorLicenceNumber,
          },
        });
        setVorPrompt(null);
      } catch (error) {
        setVorPromptError(error?.message || "Could not start this VOR/SORN period.");
      } finally {
        setSavingVorPeriod(false);
      }
      return;
    }

    const required = [
      ["returnedDate", "date returned to the fleet"],
      ["odometer", "odometer reading"],
      ["removedBy", "person removing the VOR"],
      ["removedPosition", "position"],
      ["signature", "signature"],
    ];
    const missing = required.find(([field]) => !String(vorPrompt[field] || "").trim());
    if (missing) {
      systemDialogs.showSystemNotification(
        `Enter the ${missing[1]} before ${
          vorPrompt.mode === "release"
            ? "authorising the return to fleet"
            : "scheduling the return inspection"
        }.`
      );
      return;
    }
    const releaseCandidate = {
      ...vehicle,
    };
    releaseCandidate.complianceVor = evaluateHgvCompliance(releaseCandidate, {
      asOfDate: vorPrompt.returnedDate,
    }).complianceVor;
    const complianceBlocker = complianceVorReturnInspectionBlocker(releaseCandidate, {
      asOfDate: vorPrompt.returnedDate,
    });
    if (complianceBlocker) {
      systemDialogs.showSystemNotification(complianceBlocker);
      return;
    }
    const activeRecord =
      safeArr(vehicle.vorHistory).find(
        (record) =>
          record.id === vehicle.activeVorRecordId ||
          (!vehicle.activeVorRecordId && record.status === "open")
      ) || null;
    const offRoadDate =
      activeRecord?.offRoadDate || vehicle.maintenanceCountdownPause?.startedDate;
    const durationDays = calculateVorDurationDays(offRoadDate, vorPrompt.returnedDate);
    if (durationDays === null) {
      systemDialogs.showSystemNotification("The return date must be on or after the date the vehicle was taken off the fleet.");
      return;
    }
    if (vorPrompt.mode === "release") {
      try {
        await mutateVehicleVor({
          vehicleId: id,
          operation: VEHICLE_VOR_OPERATIONS.RELEASE,
          dataAccessState,
          payload: {
            returnedDate: vorPrompt.returnedDate,
            odometer: vorPrompt.odometer,
            removedBy: vorPrompt.removedBy,
            removedPosition: vorPrompt.removedPosition,
            signature: vorPrompt.signature,
          },
        });
        setVorPrompt(null);
      } catch (releaseError) {
        systemDialogs.showSystemNotification(releaseError?.message || "Could not authorise this vehicle's return to fleet.");
      }
      return;
    }
    try {
      await mutateVehicleVor({
        vehicleId: id,
        operation: VEHICLE_VOR_OPERATIONS.SCHEDULE_RETURN,
        dataAccessState,
        payload: {
          inspectionDate: vorPrompt.returnedDate,
          odometer: vorPrompt.odometer,
          removedBy: vorPrompt.removedBy,
          removedPosition: vorPrompt.removedPosition,
          signature: vorPrompt.signature,
        },
      });
      setVorPrompt(null);
    } catch (error) {
      setVorPromptError(error?.message || "Could not schedule the return inspection.");
    }
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
      systemDialogs.showSystemNotification("Select a road tax date before marking this vehicle as taxed.");
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
      systemDialogs.showSystemNotification("Select an insured until date before marking this vehicle as insured.");
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
      systemDialogs.showSystemNotification("Add a registration before fetching MOT history.");
      return;
    }

    setFetchingMotHistory(true);
    try {
      const currentUser = authAccess.user;
      if (!currentUser?.getIdToken) {
        throw new Error("You need to be signed in to fetch MOT history.");
      }
      const idToken = await currentUser.getIdToken();
      const res = await fetch("/api/dvla/mot-history/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vehicleId: vehicle.id }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || Number(data?.failed || 0) > 0) {
        throw new Error(
          data?.failures?.[0]?.message ||
          data?.details ||
          data?.error ||
          "Could not fetch MOT history."
        );
      }
      const baseline = (() => {
        try {
          return JSON.parse(initialSnapshot || "{}");
        } catch {
          return {};
        }
      })();
      const merged = mergeServerManagedVehicleFields(
        vehicle,
        baseline,
        data?.vehicle || {},
        data?.changedFields || []
      );
      setVehicle(syncStatusDateFields(merged.current));
      setInitialSnapshot(JSON.stringify(merged.baseline));
      setSaveNotice({ tone: "success", message: "DVSA MOT data fetched and saved." });
      systemDialogs.showSystemNotification("MOT history fetched and saved from DVSA.");
    } catch (err) {
      console.error("Failed to fetch MOT history:", err);
      systemDialogs.showSystemNotification(err.message || "Could not fetch MOT history.");
    } finally {
      setFetchingMotHistory(false);
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!vehicle || !initialSnapshot) return false;
    return JSON.stringify(vehicle) !== initialSnapshot;
  }, [vehicle, initialSnapshot]);

  const hasRestorableVorAppointment = useMemo(() => {
    if (normalizeVehicleOperatingStatus(vehicle) !== "Active") return false;
    const nextPmi = String(vehicle?.nextPMI || vehicle?.nextEightWeekInspection || "").slice(0, 10);
    const nextBrake = String(vehicle?.nextBrakeTest || "").slice(0, 10);
    if (!nextPmi || nextPmi !== nextBrake) return false;
    const isCombinedInspection = (booking) => {
      const typeIds = new Set(
        safeArr(booking?.maintenanceTypeIds).map((typeId) => String(typeId).trim().toLowerCase())
      );
      return typeIds.has("pmi") && typeIds.has("brake_test");
    };
    const isDueAppointment = (booking) =>
      isCombinedInspection(booking) &&
      toISODate(getMaintenanceBookingStartDate(booking)) === nextPmi;
    const hasActiveAppointment = vehicleBookings.some(
      (booking) => isOpenMaintenanceBooking(booking) && isDueAppointment(booking)
    );
    if (hasActiveAppointment) return false;
    return vehicleBookings.some(
      (booking) =>
        String(booking?.status || "").trim().toLowerCase() === "cancelled" &&
        String(booking?.cancellationSource || "").trim().toLowerCase() ===
          "vehicle_vor_transition" &&
        isDueAppointment(booking)
    );
  }, [vehicle, vehicleBookings]);

  const handleSave = async (options = {}) => {
    if (!vehicle?.id) return false;
    const { navigateOnSuccess = false } = options;
    setSaving(true);
    try {
      const previousVehicle = (() => {
        try {
          return JSON.parse(initialSnapshot || "{}");
        } catch {
          return {};
        }
      })();
      const directlyChangedProtectedFields = getChangedProtectedVehicleFields(
        vehicle,
        previousVehicle
      );
      const hasCompletedVorReturnDeclaration =
        String(vehicle?.complianceVor?.state || "").toLowerCase() === "clear" &&
        !vehicle?.pendingReturnInspection &&
        !safeArr(vehicle?.vorHistory).some(
          (record) => String(record?.status || "").toLowerCase() === "open"
        ) &&
        Boolean(vehicle?.vorEndedAt);
      const bypassedVorReturnWorkflow =
        normalizeVehicleOperatingStatus(previousVehicle) === "VOR" &&
        normalizeVehicleOperatingStatus(vehicle) === "Active" &&
        !hasCompletedVorReturnDeclaration;
      if (bypassedVorReturnWorkflow) {
        setVehicle((previous) => syncVehicleOperatingStatus(previous, "VOR"));
        systemDialogs.showSystemNotification(
          "This vehicle must remain VOR. Use the Active option and complete the return-to-fleet declaration."
        );
        return false;
      }

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
      const assetNumber = normalizeVehicleAssetNumber(
        payload.assetNumber || payload.sageAssetNumber
      );
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
      payload.assetNumber = assetNumber;
      payload.sageAssetNumber = assetNumber;
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
      payload.serviceHistory = serviceDisabled
        ? []
        : ensureServiceHistoryForLastService(payload.serviceHistory, lastService, {
            recordedAt: new Date().toISOString(),
          });
      payload.insuredUntil = insuredUntil;
      payload.insuranceExpiry = insuredUntil;
      payload.insuranceExpiryDate = insuredUntil;
      if (isHgvComplianceVehicle(payload)) {
        Object.assign(payload, syncCanonicalPmiAliases(payload));
        const migration = buildHgvComplianceMigrationPatch(payload);
        Object.assign(payload, migration.patch);
        const compliance = evaluateHgvCompliance(payload);
        payload.complianceVor = compliance.complianceVor;
        if (
          compliance.complianceVor.state !== "clear" &&
          normalizeVehicleOperatingStatus(payload) !== "VOR"
        ) {
          Object.assign(
            payload,
            startVehicleVorPeriod(
              payload,
              {
                offRoadDate: compliance.complianceVor.startedDate || todayISO(),
                odometer: payload.odometer,
                approvedBy: "HGV compliance system",
                approvedPosition: "Automated compliance control",
                reason: `Automatic compliance VOR: ${compliance.unresolvedTypes
                  .map((item) => item.replace("_", " ").toUpperCase())
                  .join(", ")}`,
                operatorLicenceNumber: payload.operatorLicenceNumber || "OF0202656",
              },
              {
                recordId: `compliance-vor-${compliance.complianceVor.startedDate || todayISO()}`,
                startedAt: compliance.complianceVor.triggeredAt || new Date().toISOString(),
              }
            )
          );
          payload.complianceVor = compliance.complianceVor;
        }
      }
      Object.assign(payload, syncStatusDateFields(payload));
      Object.assign(
        payload,
        syncVehicleOperatingStatus(
          {},
          normalizeVehicleOperatingStatus(payload)
        )
      );
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
      let cancelledVorBookingIds = [];
      let forecastBookings = vehicleBookings;
      let savedVehicle = { ...payload, id: vehicle.id };
      const becameVor =
        normalizeVehicleOperatingStatus(previousVehicle) !== "VOR" &&
        normalizeVehicleOperatingStatus(payload) === "VOR";
      const returnedFromVor =
        normalizeVehicleOperatingStatus(previousVehicle) === "VOR" &&
        normalizeVehicleOperatingStatus(payload) === "Active";
      const hasUnrestoredVorAppointments =
        normalizeVehicleOperatingStatus(payload) === "Active" &&
        hasRestorableVorAppointment;
      if (becameVor) {
        const activeRecord = safeArr(payload.vorHistory).find(
          (record) => record?.status === "open" && record?.id === payload.activeVorRecordId
        ) || safeArr(payload.vorHistory).find((record) => record?.status === "open") || null;
        const offRoadDate = activeRecord?.offRoadDate || payload.maintenanceCountdownPause?.startedDate || todayISO();
        const transition = await commitVehicleVorTransition({
          bookings: vehicleBookings,
          vehicleId: vehicle.id,
          vehicle: { ...previousVehicle, ...payload, id: vehicle.id },
          vehiclePayload: payload,
          offRoadDate,
          authState: dataAccessState,
          cancellationSource: "vehicle_vor_transition",
          sourceRecordId: activeRecord?.id || payload.activeVorRecordId || "",
        });
        Object.assign(payload, transition.vehicleUpdate);
        cancelledVorBookingIds = transition.cancelledIds;
        if (cancelledVorBookingIds.length) {
          const cancelledSet = new Set(cancelledVorBookingIds);
          forecastBookings = vehicleBookings.map((booking) =>
            cancelledSet.has(booking.id)
              ? {
                  ...booking,
                  status: "Cancelled",
                  cancellationReason:
                    "Vehicle became VOR; previous PMI/brake plans are no longer valid",
                }
              : booking
          );
          setVehicleBookings((previous) =>
            previous.map((booking) =>
              cancelledSet.has(booking.id)
                ? {
                    ...booking,
                    status: "Cancelled",
                    cancellationReason:
                      "Vehicle became VOR; previous PMI/brake plans are no longer valid",
                  }
                : booking
            )
          );
        }
      } else {
        const ordinaryPatch = buildVehicleEditorUpdatePatch(payload, previousVehicle);
        await updateDoc(
          refDoc,
          tenantPayload(dataAccessState, { ...ordinaryPatch, updatedAt: serverTimestamp() })
        );
        savedVehicle = {
          ...restoreProtectedVehicleFields(payload, previousVehicle),
          id: vehicle.id,
        };
      }
      let forecastSyncFailed = false;
      try {
        const currentYear = Number(todayISO().slice(0, 4));
        const scheduleYears = new Set([currentYear, currentYear + 1]);
        [
          payload.nextMOT,
          payload.nextService,
          payload.nextTacho,
          payload.nextBrakeTest,
          payload.nextPMI,
          payload.nextTachoDownload,
          payload.nextTailLift,
          payload.nextLoler,
          payload.nextTachoCalibration,
        ].forEach((date) => {
          const dueYear = Number(String(date || "").slice(0, 4));
          if (Number.isInteger(dueYear) && dueYear > 0) scheduleYears.add(dueYear);
        });
        for (const forecastYear of [...scheduleYears].sort()) {
          await syncVehicleAnnualMaintenanceForecast({
            vehicle: { ...payload, id: vehicle.id },
            year: forecastYear,
            maintenanceBookings: forecastBookings,
            authState: dataAccessState,
            restoreVorCancelledAppointments:
              returnedFromVor || hasUnrestoredVorAppointments,
          });
        }
      } catch (forecastError) {
        forecastSyncFailed = true;
        console.error("Could not synchronise the annual maintenance forecast:", forecastError);
      }
      const hasDeferredProtectedChanges =
        !becameVor && directlyChangedProtectedFields.length > 0;
      if (!hasDeferredProtectedChanges) setVehicle(savedVehicle);
      setInitialSnapshot(JSON.stringify(savedVehicle));
      setSaveNotice({
        tone: forecastSyncFailed || hasDeferredProtectedChanges ? "warning" : "success",
        message: hasDeferredProtectedChanges
          ? "Vehicle details were saved, but maintenance completion dates must be recorded through the maintenance workflow. Those date changes remain unsaved."
          : forecastSyncFailed
          ? "Vehicle updated, but its annual maintenance appointments could not be synchronised. Run the maintenance reconciliation before relying on the calendar."
          : cancelledVorBookingIds.length
          ? `Vehicle updated. ${cancelledVorBookingIds.length} future PMI/brake booking${cancelledVorBookingIds.length === 1 ? " was" : "s were"} cancelled with an audit record.`
          : "Vehicle updated successfully.",
      });
      if (navigateOnSuccess) {
        router.push("/vehicles");
      }
      return true;
    } catch (e) {
      console.error(e);
      const permissionDenied =
        e?.code === "permission-denied" ||
        String(e?.message || "").toLowerCase().includes("insufficient permissions");
      setSaveNotice({
        tone: "error",
        message: permissionDenied
          ? "Your account does not have permission to update this vehicle. Ask an administrator to check your User or Service workspace access."
          : "Could not save the vehicle. Please try again.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveMaintenanceBooking = async (bookingId) => {
    if (!bookingId || !await systemDialogs.confirmSystem("Archive this maintenance booking? Its audit history will be retained.")) return;
    const reason = await systemDialogs.promptSystem("Reason for archiving this legal maintenance requirement:", "");
    if (!String(reason || "").trim()) return;
    try {
      await deleteMaintenanceBooking({ bookingId, reason });
      setVehicleBookings((previous) =>
        previous.map((booking) =>
          booking.id === bookingId ? { ...booking, status: "Archived", archiveReason: reason } : booking
        )
      );
    } catch (error) {
      console.error("Could not archive maintenance booking:", error);
      systemDialogs.showSystemNotification(error?.message || "Could not archive maintenance booking.");
    }
  };

  const handleDelete = async () => {
    const ok = await systemDialogs.confirmSystem("Permanently delete this vehicle and all of its maintenance and workshop bookings?");
    if (!ok) return;
    try {
      const result = await deleteVehicleAndBookings(id);
      const count = Object.values(result.deletedBookings || {}).reduce((total, value) => total + Number(value || 0), 0);
      systemDialogs.showSystemNotification(`Vehicle deleted with ${count} linked booking${count === 1 ? "" : "s"}.`);
      router.push("/vehicles");
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      systemDialogs.showSystemNotification("Failed to delete vehicle.");
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
      systemDialogs.showSystemNotification("Error uploading files.");
    } finally {
      setUploadingField(null);
    }
  };

  const headerLabel = useMemo(() => {
    if (!vehicle) return "";
    return vehicle.name || vehicle.registration || vehicle.reg || "Unknown vehicle";
  }, [vehicle]);

  const summaryMotBooking = vehicleBookings.find((b) => b.id === vehicle?.motBookingId);
  const summaryServiceBooking = vehicleBookings.find((b) => b.id === vehicle?.serviceBookingId);
  const summaryInspectionBooking = vehicleBookings.find(
    (b) => b.id === vehicle?.inspectionBookingId
  );
  const activeMotBookingId =
    summaryMotBooking && isOpenMaintenanceBooking(summaryMotBooking)
      ? summaryMotBooking.id
      : latestMotBooking?.id || "";
  const activeServiceBookingId =
    summaryServiceBooking && isOpenMaintenanceBooking(summaryServiceBooking)
      ? summaryServiceBooking.id
      : latestServiceBooking?.id || "";
  const activeInspectionBookingId =
    summaryInspectionBooking && isOpenMaintenanceBooking(summaryInspectionBooking)
      ? summaryInspectionBooking.id
      : latestInspectionBooking?.id || "";
  const hasMotBooking = Boolean(activeMotBookingId);
  const hasServiceBooking = Boolean(activeServiceBookingId);
  const hasInspectionBooking = Boolean(activeInspectionBookingId);
  const showEightWeekInspection = isTransportLorryVehicle(vehicle || {});
  const dvsaMotMeta = vehicle?.motHistorySyncedAt
    ? `Auto-filled from DVSA${
        vehicle.motHistoryLatestTestNumber ? ` - test ${vehicle.motHistoryLatestTestNumber}` : ""
      }`
    : "";
  const normalizedTaxStatus = String(vehicle?.taxStatus || "Taxed").trim().toLowerCase();
  const normalizedInsuranceStatus = String(
    vehicle?.insuranceStatus || "Insured"
  ).trim().toLowerCase();
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
  const availableAdditionalMaintenanceSections = ADDITIONAL_MAINTENANCE_SECTIONS;
  const visibleAdditionalMaintenanceSections = availableAdditionalMaintenanceSections.filter(
    (section) =>
      !hiddenAdditionalMaintenance.includes(section.key) &&
      (sectionHasDateValue(vehicle, section) || shownAdditionalMaintenance.includes(section.key))
  );
  const enabledAdditionalMaintenance = visibleAdditionalMaintenanceSections.map(
    (section) => section.key
  );
  const complianceAttentionItems = buildVehicleComplianceAttention(vehicle || {}, {
    settings: vehicleComplianceSettings,
    requireEightWeekInspection: false,
    enabledAdditional: enabledAdditionalMaintenance,
  });
  const activeComplianceAttention = complianceAttentionItems.filter(
    (item) => item.status !== "in-date"
  );
  const isVehicleOutOfUse = getIsVehicleOutOfUse(vehicle || {});

  useUnsavedChangesGuard({
    enabled: Boolean(vehicle),
    isDirty: hasUnsavedChanges && !saving,
    onSave: () => handleSave({ navigateOnSuccess: false }),
  });

  const activeVehicleBookings = useMemo(
    () =>
      vehicleBookings
        .filter((booking) =>
          isOpenMaintenanceBooking(booking) && isConfirmedMaintenanceBooking(booking)
        )
        .sort((a, b) => {
          const ad = getMaintenanceBookingStartDate(a);
          const bd = getMaintenanceBookingStartDate(b);
          if (!ad && !bd) return 0;
          if (!ad) return 1;
          if (!bd) return -1;
          return ad.getTime() - bd.getTime();
        }),
    [vehicleBookings]
  );

  const visibleOpenWorkBookings = useMemo(() => {
    const now = new Date();
    const twelveWeekCutoff = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 12 * 7,
      23,
      59,
      59,
      999
    );

    return activeVehicleBookings.filter((booking) => {
      const bookingDate = getMaintenanceBookingStartDate(booking);
      return !bookingDate || bookingDate <= twelveWeekCutoff;
    });
  }, [activeVehicleBookings]);

  const completedMotHistory = useMemo(
    () =>
      vehicleBookings.filter((b) => {
        return isArchivedMotBooking(b);
      }),
    [vehicleBookings]
  );

  const motHistoryItems = useMemo(() => {
    const stored = (Array.isArray(vehicle?.motHistory) ? vehicle.motHistory : [])
      .filter((item) => String(item?.bookingId || "").trim())
      .map((item) => ({
        ...item,
        bookingStateLabel: "Completed booking",
      }));
    const derived = completedMotHistory.map((b) => ({
      completedDate: bookingCompletedLabel(b),
      bookingId: b.id,
      provider: b.provider || "",
      bookingRef: b.bookingRef || "",
      notes: b.notes || "",
      bookingStateLabel:
        String(b.status || "").trim().toLowerCase() === "completed"
          ? "Completed booking"
          : "Past booking",
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
    return buildServiceHistoryItems({ vehicle, serviceRecords });
  }, [vehicle, serviceRecords]);

  if (!vehicle) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={{ ...panel, textAlign: "center", color: loadError ? "var(--color-danger)" : UI.muted }}>
            {loadError || "Loading vehicle..."}
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  if (isRetentionPlateRecord(vehicle)) {
    const isTradePlate = isTradePlateRecord(vehicle);

    return (
      <HeaderSidebarLayout showBackButton={false}>
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
            <div className={layoutStyles.extracted1}>
              <div>
                <h1 style={title}>{vehicle.registration || vehicle.reg || vehicle.name || "Number Plate"}</h1>
                <div style={subtitle}>
                  {isTradePlate
                    ? "Trade plate. Edit the plate, yearly expiry date, and notes."
                    : "Number plate on retention. Edit the plate, expiry date, and notes."}
                </div>
              </div>

              <div className={layoutStyles.extracted2}>
                <button onClick={() => requestGuardedNavigation(() => router.push("/vehicles"))} style={btn("ghost")}>
                  <ArrowLeft size={15} />
                  Back
                </button>
                <button onClick={handleDelete} style={btn("danger")}>
                  <Trash2 size={15} />
                  Delete
                </button>
                <button onClick={() => handleSave()} style={btn()} disabled={saving}>
                  <Save size={15} />
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <div className={layoutStyles.extracted3}>
              <MetricCard label="Category" value={RETENTION_PLATE_CATEGORY} />
              <MetricCard label="Plate Type" value={isTradePlate ? "Trade plate" : "Retention plate"} />
            <MetricCard label={isTradePlate ? "Trade Plate Expiry" : "Retention Expiry"} value={formatDisplayDate(vehicle.retentionExpiry)} />
              {isTradePlate ? <MetricCard label="Frequency" value={`${tradePlateExpiryWeeks} weeks`} /> : null}
            </div>
          </div>

          <div style={{ ...panel, maxWidth: 860, marginTop: 12 }}>
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

              <div className={layoutStyles.extracted4}>
                <label style={labelStyle}>Category</label>
                <input value={RETENTION_PLATE_CATEGORY} readOnly style={{ ...inputField, background: "var(--color-surface-subtle)" }} />
              </div>

              <div className={layoutStyles.extracted5}>
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
      gap: 8,
      padding: "8px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 950,
      border: "1px solid var(--color-border)",
      background: "var(--color-surface)",
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
        <span style={{ width: 10, height: 10, borderRadius: 999, background: dot, display: "inline-block" }} />
        {status}
      </div>
    );
  })();

  const bookingTypeLabel = (b) => {
    const t = String(b?.type || "").toUpperCase();
    if (t === "MOT") return "MOT";
    if (t === "SERVICE") return "Service";
    if (t === "WORK") return "Maintenance";

    const typeIds = [
      ...(Array.isArray(b?.maintenanceTypeIds) ? b.maintenanceTypeIds : []),
      ...(Array.isArray(b?.canonicalItems)
        ? b.canonicalItems.map((item) => item?.maintenanceTypeId)
        : []),
      ...(Array.isArray(b?.items) ? b.items.map((item) => item?.maintenanceTypeId) : []),
      b?.maintenanceTypeId,
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    const uniqueTypeIds = [...new Set(typeIds)];

    if (uniqueTypeIds.includes("pmi") && uniqueTypeIds.includes("brake_test")) {
      return "PMI + brake test";
    }

    const workflowLabels = uniqueTypeIds
      .map(
        (typeId) =>
          ADDITIONAL_MAINTENANCE_WORKFLOWS.find(
            (workflow) => workflow.maintenanceTypeId === typeId
          )?.label ||
          (typeId === "eight_week_inspection" ? "8-week inspection" : "")
      )
      .filter(Boolean);
    if (workflowLabels.length) return [...new Set(workflowLabels)].join(" + ");

    return t === "INSPECTION" ? "Inspection" : t || "Maintenance";
  };

  const bookingDateLabel = (b) => {
    const dates = getMaintenanceRecordDisplayDates(b);
    const display = (value) => {
      const date = toDate(value);
      return date ? date.toLocaleDateString("en-GB") : "";
    };
    const due = display(dates.legalDueDateISO);
    const appointment = display(dates.appointmentDateISO);
    const completed = display(dates.completionDateISO);
    if (dates.status === "requested" && due) return `Due ${due} — not arranged`;
    if (dates.status === "deferred") {
      const date = appointment || due;
      return date ? `Deferred — ${date}` : "Deferred — no date";
    }
    if (dates.status === "completed") {
      const date = completed || appointment || due;
      return date ? `Completed ${date}` : "Completed — no date";
    }
    if (appointment) {
      return due && due !== appointment
        ? `Booked ${appointment} · due ${due}`
        : `Booked ${appointment}`;
    }
    if (due) return `Due ${due}`;
    return "No date";
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
    const ok = await systemDialogs.confirmSystem("Archive this maintenance requirement? Its audit history will be retained.");
    if (!ok) return;
    const reason = await systemDialogs.promptSystem("Reason for cancelling this legal maintenance requirement:", "");
    if (!String(reason || "").trim()) return;
    try {
      await deleteMaintenanceBookingRecord({
        bookingId,
        booking: vehicleBookings.find((booking) => booking.id === bookingId) || null,
        vehicleId: id,
        vehicle,
        authState: dataAccessState,
        reason,
      });
      await reloadVehicle();
      if (editBookingId === bookingId) setEditBookingId(null);
      systemDialogs.showSystemNotification("Maintenance requirement archived.");
    } catch (error) {
      console.error("Failed deleting maintenance booking:", error);
      systemDialogs.showSystemNotification(error?.message || "Could not archive this maintenance requirement.");
    }
  };

  const focusScheduleField = (key) => {
    const fieldByKey = {
      tax: "nextRFL",
      insurance: "insuredUntil",
      tachoInspection: "nextTacho",
      brakeTest: "nextBrakeTest",
      pmiInspection: "nextPMI",
      tachoDownload: "nextTachoDownload",
      tailLift: "nextTailLift",
      loler: "nextLoler",
    };
    const field = fieldByKey[key];
    if (!field) return;
    const target = document.querySelector(`[name="${field}"]`);
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target?.focus?.({ preventScroll: true });
  };

  const handleAttentionAction = (item) => {
    if (item.actionType === "book-mot") {
      hasMotBooking ? setEditBookingId(activeMotBookingId) : setShowMotBooking(true);
      return;
    }
    if (item.actionType === "book-service") {
      hasServiceBooking ? setEditBookingId(activeServiceBookingId) : setShowServiceBooking(true);
      return;
    }
    if (item.actionType === "book-inspection") {
      if (hasInspectionBooking) setEditBookingId(activeInspectionBookingId);
      else if (item.status === "missing") {
        const target = document.querySelector('[name="eightWeekInspectionStart"]');
        target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        target?.focus?.({ preventScroll: true });
      } else {
        setShowInspectionBooking(true);
      }
      return;
    }
    focusScheduleField(item.key);
  };

  const attentionDetail = (item) => {
    if (item.status === "missing") return "No schedule recorded";
    if (item.status === "overdue") {
      const days = Math.abs(Number(item.daysRemaining || 0));
      return `Due ${formatDisplayDate(item.dueDate)} · ${days} ${days === 1 ? "day" : "days"} overdue`;
    }
    const days = Number(item.daysRemaining || 0);
    return `Due ${formatDisplayDate(item.dueDate)} · ${days} ${days === 1 ? "day" : "days"}`;
  };

  const notesAndOpenWorkPanels = (
    <>
      <div className="vehicle-edit-notes">
        <h2 style={{ ...sectionTitle, margin: "0 0 8px 2px" }}>Notes</h2>
        <div style={{ ...panel, padding: 10 }}>
          <FormField
            className={layoutStyles.vehicleFormField}
            label="General vehicle notes"
            htmlFor="vehicle-notes"
            help="Operational information that is useful to anyone managing this vehicle."
          >
            <AutoGrowingTextarea
              id="vehicle-notes"
              name="notes"
              value={vehicle.notes || ""}
              onChange={handleChange}
              placeholder="General notes for this vehicle..."
            />
          </FormField>
        </div>
      </div>

      <div className="vehicle-edit-open-work">
        <div className={layoutStyles.sidebarSectionHeader}>
          <h2 style={sectionTitle}>Open Work / Maintenance</h2>
          <div style={sectionMeta}>Open bookings due within the next 12 weeks.</div>
        </div>
        <div style={{ ...panel, padding: 10 }}>
          {visibleOpenWorkBookings.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>
              No open maintenance bookings due within the next 12 weeks.
            </div>
          ) : (
            <div className={layoutStyles.extracted23}>
              {visibleOpenWorkBookings.map((booking) => {
                const bookingDetails = [
                  { label: "Provider", value: booking.provider },
                  { label: "Ref", value: booking.bookingRef },
                  { label: "Location", value: booking.location },
                ].filter(({ value }) => {
                  const normalizedValue = String(value || "").trim();
                  return normalizedValue && normalizedValue !== "-";
                });

                return (
                  <div key={booking.id} className={layoutStyles.openWorkCard}>
                    <div className={layoutStyles.openWorkSummary}>
                      <div className={layoutStyles.openWorkTitleLine}>
                        <span>{bookingTypeLabel(booking)}</span>
                        <span aria-hidden="true">–</span>
                        <span className={layoutStyles.openWorkDate}>
                          {bookingDateLabel(booking)}
                        </span>
                      </div>
                      {bookingDetails.length ? (
                        <div className={layoutStyles.openWorkDetails}>
                        {bookingDetails.map(({ label, value }) => (
                          <span key={label} className={layoutStyles.openWorkDetail}>
                            <strong>{label}:</strong> {value}
                          </span>
                        ))}
                        </div>
                      ) : null}
                    </div>

                    <div className={layoutStyles.openWorkControls}>
                      <div className={layoutStyles.openWorkStatus}>
                        {booking.status || "Booked"}
                      </div>
                      <div className={`${layoutStyles.extracted25} ${layoutStyles.openWorkActions}`}>
                        <button type="button" style={btn("ghost")} onClick={() => setEditBookingId(booking.id)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          style={btn("danger")}
                          onClick={() => handleArchiveMaintenanceBooking(booking.id)}
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {motHistoryItems.length ? (
            <div className={layoutStyles.motAppointmentHistory}>
              <div className={layoutStyles.motAppointmentHistoryHeader}>
                Previous MOT appointments
              </div>
              <div className={layoutStyles.extracted23}>
                {motHistoryItems.map((item, index) => {
                  const appointmentDetails = [
                    { label: "Provider", value: item.provider },
                    { label: "Ref", value: item.bookingRef },
                  ].filter(({ value }) => String(value || "").trim());

                  return (
                    <div
                      key={item.bookingId || `${item.completedDate}-${index}`}
                      className={layoutStyles.openWorkCard}
                    >
                      <div className={layoutStyles.openWorkSummary}>
                        <div className={layoutStyles.openWorkTitleLine}>
                          <span>MOT</span>
                          <span aria-hidden="true">–</span>
                          <span className={layoutStyles.openWorkDate}>
                            {formatDisplayDate(item.completedDate)}
                          </span>
                        </div>
                        {appointmentDetails.length ? (
                          <div className={layoutStyles.openWorkDetails}>
                            {appointmentDetails.map(({ label, value }) => (
                              <span key={label} className={layoutStyles.openWorkDetail}>
                                <strong>{label}:</strong> {value}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className={layoutStyles.openWorkControls}>
                        <div className={layoutStyles.openWorkStatus}>
                          {item.bookingStateLabel || "Past booking"}
                        </div>
                        {item.bookingId ? (
                          <button
                            type="button"
                            style={btn("ghost")}
                            className={layoutStyles.compactHistoryButton}
                            onClick={() => setEditBookingId(item.bookingId)}
                          >
                            View
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

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
          background: var(--color-surface);
          color: var(--color-text);
        }
        .vehicle-edit-left-rest .vehicle-edit-core { order: 1; }
        .vehicle-edit-left-rest .vehicle-edit-additional { order: 2; }
        .vehicle-edit-left-rest .vehicle-edit-dvsa { order: 3; }
        .vehicle-edit-left-rest .vehicle-edit-inspection-history { order: 4; }
        .vehicle-edit-history-sidebar { position: static !important; }
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
        {saveNotice ? (
          <div
            className={`${layoutStyles.saveNotice} ${layoutStyles[`saveNotice_${saveNotice.tone}`]}`}
            role={saveNotice.tone === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            <span className={layoutStyles.saveNoticeIcon} aria-hidden="true">
              {saveNotice.tone === "success" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            </span>
            <div className={layoutStyles.saveNoticeCopy}>
              <strong>{saveNotice.tone === "success" ? "Vehicle saved" : saveNotice.tone === "warning" ? "Saved with a warning" : "Save failed"}</strong>
              <span>{saveNotice.message}</span>
            </div>
            <button
              type="button"
              className={layoutStyles.saveNoticeClose}
              onClick={() => setSaveNotice(null)}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

        {realtimeVehicleError ? (
          <div
            role="alert"
            style={{
              ...panel,
              marginBottom: 10,
              borderColor: "var(--color-danger-border)",
              background: "var(--color-danger-soft)",
              color: "var(--color-danger)",
              fontWeight: 750,
            }}
          >
            {realtimeVehicleError}
          </div>
        ) : null}
        <div
          className={layoutStyles.stickyVehicleToolbar}
          style={vehicleToolbar}
        >
          <div className={layoutStyles.extracted6}>
            <div>
              <div className={layoutStyles.extracted7}>
                <h1 style={title}>{headerLabel}</h1>
                {motStatusPill}
                <span
                  className={`${layoutStyles.saveState} ${
                    hasUnsavedChanges || hasRestorableVorAppointment
                      ? layoutStyles.saveStateDirty
                      : layoutStyles.saveStateSaved
                  }`}
                  role="status"
                >
                  {saving
                    ? "Saving…"
                    : hasRestorableVorAppointment
                      ? "Booking restoration required"
                      : hasUnsavedChanges
                        ? "Unsaved changes"
                        : "Saved"}
                </span>
              </div>
              <div style={subtitle}>
                Vehicle identity, compliance schedules, bookings and maintenance history.
              </div>
            </div>

            <div className={layoutStyles.extracted8}>
              <button
                type="button"
                onClick={() => requestGuardedNavigation(() => router.push(`/vehicle-edit/${vehicle.id}/timeline`))}
                style={btn("ghost")}
              >
                <Activity size={15} />
                Vehicle Timeline
              </button>
              <button type="button" onClick={() => requestGuardedNavigation(() => router.push("/vehicle-checks"))} style={btn("ghost")}>
                <ClipboardList size={15} />
                Vehicle Checks
              </button>
              <div ref={maintenanceMenuRef} className={layoutStyles.maintenanceMenu}>
                <button
                  ref={maintenanceMenuTriggerRef}
                  type="button"
                  className={layoutStyles.maintenanceMenuTrigger}
                  aria-haspopup="menu"
                  aria-expanded={maintenanceMenuOpen}
                  onClick={() => setMaintenanceMenuOpen((open) => !open)}
                  onKeyDown={(event) => {
                    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
                    event.preventDefault();
                    setMaintenanceMenuOpen(true);
                    requestAnimationFrame(() => {
                      const items = maintenanceMenuRef.current?.querySelectorAll(
                        '[role="menuitem"]:not(:disabled)'
                      );
                      const target =
                        event.key === "ArrowUp" ? items?.[items.length - 1] : items?.[0];
                      target?.focus();
                    });
                  }}
                >
                  <CalendarPlus size={15} />
                  Book maintenance
                </button>
                {maintenanceMenuOpen ? (
                <div
                  className={layoutStyles.maintenanceMenuPanel}
                  role="menu"
                  aria-label="Book maintenance"
                  onKeyDown={(event) => {
                    const items = Array.from(
                      maintenanceMenuRef.current?.querySelectorAll(
                        '[role="menuitem"]:not(:disabled)'
                      ) || []
                    );
                    const currentIndex = items.indexOf(document.activeElement);
                    let nextIndex = currentIndex;
                    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
                    else if (event.key === "ArrowUp") {
                      nextIndex = (currentIndex - 1 + items.length) % items.length;
                    } else if (event.key === "Home") nextIndex = 0;
                    else if (event.key === "End") nextIndex = items.length - 1;
                    else return;
                    event.preventDefault();
                    items[nextIndex]?.focus();
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMaintenanceMenuOpen(false);
                      if (hasMotBooking) {
                        setEditBookingId(activeMotBookingId);
                      } else {
                        setShowMotBooking(true);
                      }
                    }}
                    disabled={isMotNotApplicable(vehicle)}
                  >
                    {isMotNotApplicable(vehicle)
                      ? "MOT not applicable"
                      : hasMotBooking
                        ? "Edit MOT booking"
                        : "Book MOT"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMaintenanceMenuOpen(false);
                      hasServiceBooking
                        ? setEditBookingId(activeServiceBookingId)
                        : setShowServiceBooking(true);
                    }}
                  >
                    {hasServiceBooking ? "Edit service booking" : "Book service"}
                  </button>
                  {showEightWeekInspection ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMaintenanceMenuOpen(false);
                        if (hasInspectionBooking) {
                          setEditBookingId(activeInspectionBookingId);
                        } else {
                          setShowInspectionBooking(true);
                        }
                      }}
                    >
                      {hasInspectionBooking
                        ? "Edit inspection booking"
                        : "Book HGV inspection"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMaintenanceMenuOpen(false);
                      setShowWorkBooking(true);
                    }}
                  >
                    Book work
                  </button>
                </div>
                ) : null}
              </div>
              <button
                className={layoutStyles.saveButton}
                onClick={() => handleSave()}
                style={btn()}
                disabled={saving || (!hasUnsavedChanges && !hasRestorableVorAppointment)}
              >
                <Save size={15} />
                {saving
                  ? "Saving..."
                  : hasRestorableVorAppointment
                    ? "Restore booking"
                    : "Save"}
              </button>
            </div>
          </div>
        </div>
        <div className={layoutStyles.vehicleMetricsCard}>
          <div className={layoutStyles.extracted9}>
            <MetricCard label="Registration" value={vehicle.registration || vehicle.reg || "-"} />
            <MetricCard label="Category" value={vehicle.category || "-"} />
            <MetricCard
              label="Operating Status"
              value={normalizeVehicleOperatingStatus(vehicle)}
            />
            <MetricCard label="Open Bookings" value={String(activeVehicleBookings.length)} />
            <MetricCard
              label="Needs Attention"
              value={
                isVehicleOutOfUse
                  ? "Paused"
                  : `${activeComplianceAttention.length} ${
                      activeComplianceAttention.length === 1 ? "item" : "items"
                    }`
              }
            />
          </div>
        </div>

        {!isVehicleOutOfUse && activeComplianceAttention.length > 0 ? (
          <section
            className={layoutStyles.attentionSection}
            aria-label="Compliance items needing attention"
          >
            <div className={layoutStyles.attentionPanel}>
              <div className={layoutStyles.attentionGrid}>
                {activeComplianceAttention.map((item) => (
                  <article
                    key={item.key}
                    className={`${layoutStyles.attentionItem} ${
                      item.status === "overdue"
                        ? layoutStyles.attentionOverdue
                        : item.status === "missing"
                          ? layoutStyles.attentionMissing
                          : layoutStyles.attentionSoon
                    }`}
                  >
                    <div className={layoutStyles.attentionItemContent}>
                      <strong className={layoutStyles.attentionItemTitle}>{item.label}</strong>
                      <div className={layoutStyles.attentionMeta}>
                        <span>{attentionDetail(item)}</span>
                        <span className={layoutStyles.attentionStatus}>
                          {item.status.replace("-", " ")}
                        </span>
                        <span>{item.source}</span>
                      </div>
                    </div>
                    <UIButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      className={layoutStyles.attentionAction}
                      onClick={() => handleAttentionAction(item)}
                    >
                      {item.status === "missing"
                        ? "Set schedule"
                        : item.actionType.startsWith("book-")
                          ? "Book or edit"
                          : "Edit schedule"}
                    </UIButton>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

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
            defaultDate={vehicle?.nextPMI || vehicle?.nextEightWeekInspection || todayISO()}
            sourceDueDate={vehicle?.nextPMI || vehicle?.nextEightWeekInspection || ""}
            sourceDueIsoWeek={
              vehicle?.pmiISOWeek ||
              vehicle?.eightWeekInspectionISOWeek ||
              getIsoWeekLabel(vehicle?.nextPMI || vehicle?.nextEightWeekInspection || "")
            }
            sourceDueKey={
              vehicle?.nextPMI || vehicle?.nextEightWeekInspection
                ? `inspection_due__${id}__${vehicle.nextPMI || vehicle.nextEightWeekInspection}`
                : ""
            }
            defaultMaintenanceTypeIds={
              getIsoWeekLabel(vehicle?.nextPMI || "") ===
              getIsoWeekLabel(vehicle?.nextBrakeTest || "")
                ? ["pmi", "brake_test"]
                : ["pmi"]
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
          <div className="vehicle-edit-left-column" style={{ ...sectionStack, minWidth: 0 }}>
            {isHgvComplianceVehicle(vehicle) &&
            (vehicle?.pendingReturnInspection?.status === "inspection_required" ||
              ["active", "ready_for_release"].includes(
                String(vehicle?.complianceVor?.state || "").toLowerCase()
              )) ? (
              <section style={{ ...panel, padding: 12, borderColor: "rgba(220,38,38,.42)" }}>
                <h2 style={{ ...sectionTitle, margin: 0 }}>HGV Compliance VOR</h2>
                <div style={{ ...sectionMeta, marginTop: 5 }}>
                  {canReleaseVehicleAfterCompletedCompliance(vehicle)
                    ? "All overdue items are resolved. Select Active and complete the authorised return-to-fleet declaration; no new inspection will be booked."
                    : vehicle?.pendingReturnInspection?.status === "inspection_required"
                    ? `Return-to-fleet PMI + brake test is required on ${formatDisplayDate(
                        vehicle.pendingReturnInspection.inspectionDate
                      )}. The vehicle remains VOR until it is completed.`
                    : "This vehicle must remain VOR until every item below is resolved and a fresh PMI is recorded."}
                </div>
                <div className={layoutStyles.extracted44}>
                  {getHgvComplianceVorDisplayRows(vehicle).map((reason) => (
                    <div
                      key={`${reason.type}-${reason.date}-${reason.status}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "7px 9px",
                        border: UI.border,
                        borderRadius: UI.radius,
                        background:
                          reason.status === "return_inspection_required"
                            ? "var(--color-warning-soft)"
                            : reason.status === "resolved"
                              ? "var(--color-success-soft)"
                              : "var(--color-warning-soft)",
                        fontWeight: 800,
                      }}
                    >
                      <span>{String(reason.type || "").replace("_", " ").toUpperCase()}</span>
                      <span>
                        {reason.status === "return_inspection_required"
                          ? `Return inspection required ${formatDisplayDate(reason.date)}`
                          : reason.status === "resolved"
                            ? `Resolved ${formatDisplayDate(reason.date)}`
                            : `Expired ${formatDisplayDate(reason.date)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {/* LEFT: Main form */}
            <div className="vehicle-edit-left" style={sectionStack}>
            {/* Main Information */}
            <div className="vehicle-edit-main">
              <div className={layoutStyles.mainInformationHeader}>
                <h2 style={{ ...sectionTitle, margin: 0 }}>Main Information</h2>
                <UIButton type="button" variant="secondary" size="sm" onClick={openHistoricVorMigration}>
                  Add historic VOR/SORN period
                </UIButton>
              </div>
              <div style={panel}>
                <div className="vehicle-edit-field-grid" style={grid(2)}>
                <Field label="Name" name="name" value={vehicle.name} onChange={handleChange} />
                <Field label="Registration" name="registration" value={vehicle.registration || vehicle.reg} onChange={handleChange} />
                <Field label="Manufacturer" name="manufacturer" value={vehicle.manufacturer} onChange={handleChange} />
                <Field label="Model" name="model" value={vehicle.model} onChange={handleChange} />

                <FormField className={layoutStyles.vehicleFormField} label="Category" htmlFor="vehicle-category">
                  <Select id="vehicle-category" name="category" value={vehicle.category || ""} onChange={handleChange} style={inputField}>
                    <option value="">Select category...</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <SelectField
                  label="Operating Status"
                  name="operationalStatus"
                  value={isVehicleOutOfUse ? "VOR" : "Active"}
                  onChange={handleOperatingStatusChange}
                  options={["Active", "VOR"]}
                />

                <Field
                  label="VIN / Chassis number"
                  name="chassis"
                  value={vehicle.chassis}
                  onChange={handleChange}
                  placeholder="Not recorded"
                />
                <Field
                  label="Odometer"
                  name="odometer"
                  value={formatOdometerInput(vehicle.odometer)}
                  onChange={handleChange}
                  meta={dvsaMotMeta || "Stored in miles"}
                  source={dvsaMotMeta ? "DVSA" : "Manual"}
                  suffix="mi"
                  inputMode="numeric"
                />

                <div className={layoutStyles.extracted10}>
                  <fieldset className={layoutStyles.complianceGroup}>
                    <legend>Tax</legend>
                    <div className={layoutStyles.complianceGroupFields}>
                      <FormField className={layoutStyles.vehicleFormField} label="Status" htmlFor="vehicle-taxStatus">
                        <Select id="vehicle-taxStatus" name="taxStatus" value={vehicle.taxStatus || "Taxed"} onChange={handleTaxStatusChange} style={inputField}>
                          <option value="Taxed">Taxed</option>
                          <option value="Sorn">Sorn</option>
                          <option value="N/A">N/A</option>
                        </Select>
                      </FormField>

                      <DateField
                        label="Taxed until"
                        name="nextRFL"
                        value={vehicle.nextRFL}
                        onChange={handleChange}
                        disabled={normalizedTaxStatus !== "taxed"}
                      />
                    </div>
                  </fieldset>

                  <fieldset className={layoutStyles.complianceGroup}>
                    <legend>Insurance</legend>
                    <div className={layoutStyles.complianceGroupFields}>
                      <FormField className={layoutStyles.vehicleFormField} label="Status" htmlFor="vehicle-insuranceStatus">
                        <Select
                          id="vehicle-insuranceStatus"
                          name="insuranceStatus"
                          value={vehicle.insuranceStatus || "Insured"}
                          onChange={handleInsuranceStatusChange}
                          style={inputField}
                        >
                          <option value="Insured">Insured</option>
                          <option value="Not Insured">Not Insured</option>
                          <option value="N/A">N/A</option>
                        </Select>
                      </FormField>

                      <DateField
                        label="Insured until"
                        name="insuredUntil"
                        value={getInsuredUntil(vehicle)}
                        onChange={handleChange}
                        disabled={normalizedInsuranceStatus !== "insured"}
                      />
                    </div>
                  </fieldset>
                  </div>
                </div>
              </div>
            </div>
            </div>

            <div className="vehicle-edit-left vehicle-edit-left-rest" style={sectionStack}>
            <div className="vehicle-edit-asset-information">
              <h2 style={sectionTitle}>Asset Information</h2>
              <div style={panel}>
                <div className="vehicle-edit-field-grid" style={grid(2)}>
                  <Field
                    label="Sage asset number"
                    name="assetNumber"
                    value={vehicle.assetNumber || vehicle.sageAssetNumber}
                    onChange={handleChange}
                    placeholder="e.g. 0103"
                    inputMode="numeric"
                    meta="The four-digit asset number used in the Sage vehicle register."
                    source={vehicle.assetNumberSource ? "Sage" : "Manual"}
                  />
                </div>
              </div>
            </div>

            {/* Due Dates & Intervals */}
            <div className="vehicle-edit-core">
              <div className={layoutStyles.coreDueHeader}>
                <div>
                  <h2 style={{ ...sectionTitle, margin: 0 }}>Core Due Dates</h2>
                  <div style={{ ...sectionMeta, marginTop: 3 }}>
                    Edit the last date and frequency; next will auto-calculate.
                  </div>
                </div>
                <div className={layoutStyles.coreDueHeaderActions}>
                  <label className={layoutStyles.coreDueOption}>
                    <input
                      type="checkbox"
                      name="motNotApplicable"
                      checked={isMotNotApplicable(vehicle)}
                      onChange={handleChange}
                    />
                    MOT not applicable
                  </label>
                  <label className={layoutStyles.coreDueOption}>
                    <input
                      type="checkbox"
                      name="serviceNotApplicable"
                      checked={isServiceNotApplicable(vehicle)}
                      onChange={handleChange}
                    />
                    Service not required
                  </label>
                </div>
              </div>
              <div style={{ ...panel, padding: 10 }}>
                <div className={layoutStyles.extracted11}>
                <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                  {vehicle.motAwaitingDvsaConfirmation
                    ? `Awaiting DVSA confirmation for the MOT completed ${formatDisplayDate(vehicle.motAwaitingDvsaCompletionDate)}. No previous expiry is being shown as the new result.`
                    : dvsaMotSyncLabel || "MOT dates can be pulled from DVSA; frequency remains as a manual fallback."}
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

              <div className={`vehicle-edit-core-grid ${layoutStyles.extracted12}`} >
                <DateField
                  label="Last MOT"
                  name="lastMOT"
                  value={vehicle.lastMOT}
                  onChange={handleChange}
                  disabled={isMotNotApplicable(vehicle)}
                  source={vehicle.motHistorySyncedAt ? "DVSA" : "Manual"}
                />
                <Field
                  label="MOT Freq (fallback weeks)"
                  name="motFreq"
                  value={vehicle.motFreq}
                  onChange={handleChange}
                  meta="Fallback used when DVSA data is unavailable."
                  disabled={isMotNotApplicable(vehicle)}
                />
                <DateField
                  label="Next MOT (Expiry)"
                  name="nextMOT"
                  value={vehicle.nextMOT}
                  onChange={handleChange}
                  disabled={isMotNotApplicable(vehicle)}
                  readOnly={Boolean(vehicle.motHistorySyncedAt) || !dateOverrides.mot}
                  source={vehicle.motHistorySyncedAt ? "DVSA" : dateOverrides.mot ? "Manual override" : "Calculated"}
                  allowOverride={!vehicle.motHistorySyncedAt}
                  overridden={dateOverrides.mot}
                  onToggleOverride={() =>
                    setDateOverrides((current) => ({ ...current, mot: !current.mot }))
                  }
                  meta={vehicle.motAwaitingDvsaConfirmation ? "Awaiting DVSA confirmation" : undefined}
                />
                {advancedDatesOpen ? (
                  <Field label="MOT ISO Week" name="motISOWeek" value={vehicle.motISOWeek} onChange={handleChange} disabled={isMotNotApplicable(vehicle)} readOnly source="Calculated" />
                ) : null}

                <div className={layoutStyles.coreDueDivider} aria-hidden="true" />
                <DateField label="Last Service" name="lastService" value={dateOnly(vehicle.lastService)} onChange={handleChange} disabled={isServiceNotApplicable(vehicle)} />
                <Field label="Service Freq (weeks)" name="serviceFreq" value={vehicle.serviceFreq} onChange={handleChange} disabled={isServiceNotApplicable(vehicle)} />
                <DateField
                  label="Next Service"
                  name="nextService"
                  value={vehicle.nextService}
                  onChange={handleChange}
                  disabled={isServiceNotApplicable(vehicle)}
                  readOnly={!dateOverrides.service}
                  source={dateOverrides.service ? "Manual override" : "Calculated"}
                  allowOverride
                  overridden={dateOverrides.service}
                  onToggleOverride={() =>
                    setDateOverrides((current) => ({ ...current, service: !current.service }))
                  }
                />
                {advancedDatesOpen ? (
                  <Field label="Service ISO Week" name="serviceISOWeek" value={vehicle.serviceISOWeek} onChange={handleChange} disabled={isServiceNotApplicable(vehicle)} readOnly source="Calculated" />
                ) : null}

                </div>
                <button
                  type="button"
                  className={layoutStyles.advancedToggle}
                  onClick={() => setAdvancedDatesOpen((open) => !open)}
                  aria-expanded={advancedDatesOpen}
                >
                  {advancedDatesOpen ? "Hide advanced date details" : "Show advanced date details"}
                </button>
              </div>
            </div>

            <div className="vehicle-edit-additional">
              <h2 style={{ ...sectionTitle, margin: "0 0 8px 2px" }}>
                Additional Maintenance
              </h2>
              <div style={{ ...panel, padding: 10 }}>
              <div style={sectionMeta}>
                Tick only the maintenance lines needed for this vehicle.
              </div>
              <div
                className={layoutStyles.extracted20}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    border: vehicle.warranty === "Yes" ? `1px solid ${UI.brandBorder}` : UI.border,
                    background: vehicle.warranty === "Yes" ? UI.brandSoft : "var(--color-surface)",
                    color: UI.text,
                    borderRadius: UI.radius,
                    padding: "6px 8px",
                    fontSize: 12,
                    fontWeight: 850,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={vehicle.warranty === "Yes"}
                    onChange={handleWarrantyToggle}
                    className={layoutStyles.extracted21}
                  />
                  Warranty
                </label>
                {availableAdditionalMaintenanceSections.map((section) => {
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
                        background: checked ? UI.brandSoft : "var(--color-surface)",
                        color: UI.text,
                        borderRadius: UI.radius,
                        padding: "6px 8px",
                        fontSize: 12,
                        fontWeight: 850,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleAdditionalMaintenanceToggle(section.key)}
                        className={layoutStyles.extracted21}
                      />
                      {section.label}
                    </label>
                  );
                })}
              </div>

              {vehicle.warranty === "Yes" ? (
                <div style={{ ...grid(2), marginTop: 10 }}>
                  <DateField
                    label="Warranty Expiry"
                    name="warrantyExpiry"
                    value={vehicle.warrantyExpiry}
                    onChange={handleChange}
                  />
                </div>
              ) : null}

              {visibleAdditionalMaintenanceSections.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: 13 }}>
                  All additional maintenance lines are hidden for this vehicle.
                </div>
              ) : null}

              <div className={layoutStyles.maintenanceGroups}>
                {visibleAdditionalMaintenanceSections.map((section) => (
                  <section
                    key={section.key}
                    className={layoutStyles.maintenanceGroupCard}
                    aria-labelledby={`maintenance-group-${section.key}`}
                  >
                    <div className={layoutStyles.maintenanceGroupHeader}>
                      <h3
                        id={`maintenance-group-${section.key}`}
                        className={layoutStyles.maintenanceGroupTitle}
                      >
                        {section.label}
                      </h3>
                      <button
                        type="button"
                        className={layoutStyles.maintenanceHistoryLink}
                        onClick={() =>
                          requestGuardedNavigation(() => router.push(
                            `/vehicle-edit/${vehicle.id}/maintenance-history/${section.key}`
                          ))
                        }
                      >
                        View history
                        <ExternalLink size={12} />
                      </button>
                    </div>
                    <div
                      className={`vehicle-edit-maintenance-grid ${layoutStyles.maintenanceGroupFields}`}
                    >
                      {section.fields.map((field) => {
                        const isIsoWeek = /isoweek$/i.test(field.name);
                        if (isIsoWeek && !advancedDatesOpen) return null;
                        if (field.type === "date") {
                          const isCalculatedNext = /^next/i.test(field.name);
                          const complianceType =
                            section.key === "pmiInspection"
                              ? "pmi"
                              : section.key === "brakeTest"
                                ? "brake_test"
                                : "";
                          const isVorComplianceDate = Boolean(
                            isCalculatedNext && complianceType && isVehicleOutOfUse
                          );
                          const isReadyForRelease =
                            isVorComplianceDate &&
                            canReleaseVehicleAfterCompletedCompliance(vehicle);
                          const hasPendingReturnInspection =
                            isVorComplianceDate &&
                            !isReadyForRelease &&
                            vehicle?.pendingReturnInspection?.status === "inspection_required";
                          const unresolvedComplianceReason = complianceType
                            ? vehicle?.complianceVor?.reasons?.[complianceType]
                            : null;
                          const isExpiredComplianceDate = Boolean(
                            isVorComplianceDate &&
                              !hasPendingReturnInspection &&
                              unresolvedComplianceReason &&
                              !unresolvedComplianceReason.resolvedAt
                          );
                          const vorSource = hasPendingReturnInspection
                            ? "Return inspection"
                            : isReadyForRelease
                              ? "Calculated from completed inspection"
                            : isExpiredComplianceDate
                              ? "Expired"
                              : isVorComplianceDate
                                ? "Not due while VOR"
                                : "";
                          const vorTone = hasPendingReturnInspection
                            ? "warning"
                            : isReadyForRelease
                              ? "success"
                            : isExpiredComplianceDate
                              ? "danger"
                              : isVorComplianceDate
                                ? "warning"
                                : "";
                          const displayLabel = hasPendingReturnInspection
                            ? complianceType === "pmi"
                              ? "Return PMI inspection date"
                              : "Return brake-test date"
                            : isReadyForRelease
                              ? complianceType === "pmi"
                                ? "Next PMI inspection"
                                : "Next brake-test"
                            : isExpiredComplianceDate
                              ? complianceType === "pmi"
                                ? "Expired PMI date"
                                : "Expired brake-test date"
                              : isVorComplianceDate
                                ? complianceType === "pmi"
                                  ? "PMI date while VOR"
                                  : "Brake-test date while VOR"
                                : field.label;
                          const readyForReleaseDate = isReadyForRelease
                            ? complianceType === "pmi"
                              ? calcNextFromWeeks(vehicle.lastPMI, vehicle.pmiFreq)
                              : calcNextFromWeeks(
                                  vehicle.lastBrakeTest,
                                  vehicle.brakeTestFreq
                                )
                            : "";
                          return (
                            <DateField
                              key={`${section.key}-${field.name}`}
                              label={displayLabel}
                              name={field.name}
                              value={readyForReleaseDate || vehicle[field.name]}
                              onChange={handleChange}
                              readOnly={isCalculatedNext}
                              source={vorSource || (isCalculatedNext ? "Calculated" : "")}
                              tone={vorTone}
                              max={!isCalculatedNext && /^last/i.test(field.name) ? todayISO() : undefined}
                            />
                          );
                        }
                        return (
                          <Field
                            key={`${section.key}-${field.name}`}
                            label={field.label}
                            name={field.name}
                            value={vehicle[field.name]}
                            onChange={handleChange}
                            readOnly={isIsoWeek}
                            source={isIsoWeek ? "Calculated" : ""}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              </div>
            </div>

            {/* (rest of your page continues as before...) */}
            </div>
          </div>

          {/* RIGHT: Notes and current work */}
          <div className="vehicle-edit-right-column" style={{ ...sectionStack, minWidth: 0 }}>
            <div
              className="vehicle-edit-sidebar vehicle-edit-notes-sidebar"
              style={{ ...sidebarStack, position: "static", width: "100%" }}
            >
              {notesAndOpenWorkPanels}
            </div>

            <div
              className="vehicle-edit-sidebar vehicle-edit-history-sidebar"
              style={{ ...sidebarStack, width: "100%" }}
            >
            {false ? (
              <>
            <div className="vehicle-edit-notes" style={panel}>
              <h2 style={sectionTitle}>Notes</h2>
              <FormField
                className={layoutStyles.vehicleFormField}
                label="General vehicle notes"
                htmlFor="vehicle-notes"
                help="Operational information that is useful to anyone managing this vehicle."
              >
                <AutoGrowingTextarea
                  id="vehicle-notes"
                  name="notes"
                  value={vehicle.notes || ""}
                  onChange={handleChange}
                  placeholder="General notes for this vehicle..."
                />
              </FormField>
            </div>

            <div className="vehicle-edit-open-work" style={panel}>
              <h2 style={sectionTitle}>Open Work / Maintenance</h2>
              <div style={sectionMeta}>
                Open bookings due within the next 12 weeks.
              </div>

              {visibleOpenWorkBookings.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: 13, marginTop: 10 }}>
                  No open maintenance bookings due within the next 12 weeks.
                </div>
              ) : (
                <div className={layoutStyles.extracted23}>
                  {visibleOpenWorkBookings.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        border: UI.border,
                        borderRadius: UI.radius,
                        padding: 10,
                        background: "var(--color-surface)",
                      }}
                    >
                      <div
                        className={layoutStyles.extracted24}
                      >
                        <div style={{ fontWeight: 800, color: UI.text, fontSize: 13.5 }}>
                          {bookingTypeLabel(b)}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: UI.text,
                            border: UI.border,
                            borderRadius: 999,
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

                      <div className={layoutStyles.extracted25}>
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
                          onClick={() => handleArchiveMaintenanceBooking(b.id)}
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
              </>
            ) : null}

            <div className="vehicle-edit-dvsa">
              <div
                className={`${layoutStyles.extracted13} ${layoutStyles.dvsaSummaryHeader}`}
              >
                <div>
                  <h2 style={sectionTitle}>DVSA MOT Summary</h2>
                  <div style={sectionMeta}>
                    Latest fetched MOT result, advisories, defects and DVSA vehicle identity.
                  </div>
                </div>
                <button
                  type="button"
                  style={btn("ghost")}
                  onClick={() => requestGuardedNavigation(() => router.push(`/vehicle-edit/${vehicle.id}/mot-history`))}
                >
                  <ExternalLink size={15} />
                  Full MOT History
                </button>
              </div>

              <div style={{ ...panel, padding: 10 }}>
                {!dvsaLatestMot ? (
                  <div style={{ color: UI.muted, fontSize: 13 }}>
                    No DVSA MOT data saved yet. Press Fetch DVSA MOT above, then Save.
                  </div>
                ) : (
                  <div className={layoutStyles.extracted14}>
                    <div className={`vehicle-edit-core-grid ${layoutStyles.extracted15}`}>
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
                          gap: 8,
                          alignItems: "flex-start",
                          border: "1px solid var(--color-accent)",
                          background: "var(--color-warning-soft)",
                          color: "var(--color-warning)",
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
                        <div className={layoutStyles.extracted16}>
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
                          background: "var(--color-surface)",
                          borderRadius: UI.radius,
                          padding: 10,
                          fontSize: 12.5,
                          color: UI.text,
                        }}
                      >
                        <div className={layoutStyles.extracted17}>
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
            </div>

            <div className="vehicle-edit-service-history">
              <div
                className={`${layoutStyles.extracted28} ${layoutStyles.sidebarSectionHeader}`}
              >
                <div>
                  <h2 style={sectionTitle}>Service History</h2>
                  <div style={sectionMeta}>Completed services and recorded service dates.</div>
                </div>
                <button
                  type="button"
                  style={btn("ghost")}
                  onClick={() => requestGuardedNavigation(() => router.push(`/vehicle-edit/${vehicle.id}/service-history`))}
                >
                  Full History
                </button>
              </div>

              <div style={{ ...panel, padding: 10 }}>
              {serviceHistoryItems.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: 13 }}>No completed service history yet.</div>
              ) : (
                <div className={layoutStyles.extracted29}>
                  {serviceHistoryItems.slice(0, 4).map((item, index) => (
                    <div
                      key={item.serviceRecordId || item.maintenanceBookingId || `${item.completedDate}-${index}`}
                      onClick={() =>
                        item.serviceRecordId
                          ? requestGuardedNavigation(() => router.push(`/vehicle-edit/${vehicle.id}/service-history/${item.serviceRecordId}`))
                          : item.maintenanceBookingId
                          ? setEditBookingId(item.maintenanceBookingId)
                          : requestGuardedNavigation(() => router.push(`/vehicle-edit/${vehicle.id}/service-history`))
                      }
                      style={{
                        border: UI.border,
                        borderRadius: UI.radius,
                        padding: 10,
                        background: "var(--color-surface)",
                        cursor: "pointer",
                      }}
                      title={
                        item.serviceRecordId
                          ? "Open full service details"
                          : item.maintenanceBookingId
                          ? "View completed service booking"
                          : "Open service history"
                      }
                    >
                      <div className={layoutStyles.extracted30}>
                        <div>
                          <div style={{ fontWeight: 800, color: UI.text, fontSize: 13.5 }}>
                            {formatDisplayDate(item.completedDate)}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 12.5, color: UI.muted }}>
                            {item.title || item.serviceType || item.bookingRef || item.sourceLabel || "Service record"}
                          </div>
                        </div>
                        <span style={{ color: UI.brand, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
                          {item.serviceRecordId
                            ? "Open details"
                            : item.maintenanceBookingId
                            ? "View booking"
                            : "Recorded date · no linked completion"}
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
            </div>

            </div>
          </div>
        </div>

        <Modal
          open={Boolean(vorPrompt)}
          onClose={() => setVorPrompt(null)}
          title={
            vorPrompt?.mode === "release"
              ? "Authorise return to fleet"
              : vorPrompt?.mode === "return"
              ? "Schedule return-to-fleet inspection"
              : vorPrompt?.mode === "historic"
              ? "Add historic VOR/SORN period"
              : "Vehicle Off-Road (VOR)"
          }
          description={
            vorPrompt?.mode === "release"
              ? "Completed PMI and brake-test evidence is already recorded. This declaration closes the VOR period without booking another inspection."
              : vorPrompt?.mode === "return"
              ? "Set the return date for the required combined PMI and brake-test inspection. The vehicle remains VOR until that inspection is completed."
              : vorPrompt?.mode === "historic"
              ? "Migrate a completed off-road period into this vehicle’s timeline."
              : "Complete the VOR Policy & Procedure record before taking this vehicle off the fleet."
          }
          size="lg"
          footer={
            <>
              <UIButton type="button" variant="ghost" onClick={() => setVorPrompt(null)} disabled={savingVorPeriod}>
                Cancel
              </UIButton>
              <UIButton type="button" onClick={confirmVorPrompt} disabled={savingVorPeriod}>
                {vorPrompt?.mode === "release"
                  ? "Authorise release"
                  : vorPrompt?.mode === "return"
                  ? "Schedule inspection"
                  : vorPrompt?.mode === "historic"
                  ? savingVorPeriod ? "Adding..." : "Add historic period"
                  : "Confirm VOR"}
              </UIButton>
            </>
          }
        >
          <div className={layoutStyles.vorPolicyNotice}>
            {vorPrompt?.mode === "release"
              ? "The existing completed PMI and brake test will be used as the first-use inspection evidence. Their next due dates will not be changed."
              : vorPrompt?.mode === "return"
              ? "The date below becomes the PMI and brake-test inspection date. Completing that inspection returns the vehicle to Active and calculates both next due dates from the completion date."
              : vorPrompt?.mode === "historic"
              ? "Historic periods are added to the vehicle timeline without changing current maintenance due dates."
              : "PMI and brake validity continue while the vehicle is VOR. Future open PMI/brake bookings will be cancelled with an audit record when this vehicle is saved."}
          </div>

          {vorPromptError ? (
            <div
              role="alert"
              className={layoutStyles.extracted45}
            >
              {vorPromptError}
            </div>
          ) : null}

          <div className={layoutStyles.vorFormGrid}>
            <FormField label="Vehicle registration / identification">
              <Input
                value={vehicle.registration || vehicle.reg || ""}
                readOnly
              />
            </FormField>

            {vorPrompt?.mode === "start" ? (
              <>
                <FormField label="Operator licence number" htmlFor="vor-operator-licence">
                  <Input
                    id="vor-operator-licence"
                    value={vorPrompt?.operatorLicenceNumber || ""}
                    onChange={(event) => updateVorPrompt("operatorLicenceNumber", event.target.value)}
                  />
                </FormField>
                <FormField label="Date taken off the fleet" htmlFor="vor-off-road-date">
                  <Input
                    id="vor-off-road-date"
                    type="date"
                    value={vorPrompt?.offRoadDate || ""}
                    onChange={(event) => updateVorPrompt("offRoadDate", event.target.value)}
                  />
                </FormField>
                <FormField label="Odometer when classified VOR (mi)" htmlFor="vor-off-road-odometer">
                  <Input
                    id="vor-off-road-odometer"
                    inputMode="decimal"
                    value={vorPrompt?.odometer || ""}
                    onChange={(event) => updateVorPrompt("odometer", event.target.value)}
                  />
                </FormField>
                <FormField label="VOR approved by" htmlFor="vor-approved-by">
                  <Input
                    id="vor-approved-by"
                    value={vorPrompt?.approvedBy || ""}
                    onChange={(event) => updateVorPrompt("approvedBy", event.target.value)}
                  />
                </FormField>
                <FormField label="Position" htmlFor="vor-approved-position">
                  <Input
                    id="vor-approved-position"
                    value={vorPrompt?.approvedPosition || ""}
                    onChange={(event) => updateVorPrompt("approvedPosition", event.target.value)}
                  />
                </FormField>
                <FormField
                  className={layoutStyles.vorReasonField}
                  label="Reason for VOR classification"
                  htmlFor="vor-reason"
                >
                  <Textarea
                    id="vor-reason"
                    rows={4}
                    value={vorPrompt?.reason || ""}
                    onChange={(event) => updateVorPrompt("reason", event.target.value)}
                    placeholder="Describe why the vehicle is being taken off the road..."
                  />
                </FormField>
              </>
            ) : ["return", "release"].includes(vorPrompt?.mode) ? (
              <>
                <FormField
                  label={
                    vorPrompt?.mode === "release"
                      ? "Return-to-fleet date"
                      : "Return-to-fleet / inspection date"
                  }
                  htmlFor="vor-returned-date"
                >
                  <Input
                    id="vor-returned-date"
                    type="date"
                    value={vorPrompt?.returnedDate || ""}
                    onChange={(event) => updateVorPrompt("returnedDate", event.target.value)}
                  />
                </FormField>
                <FormField label="Odometer when VOR removed (mi)" htmlFor="vor-return-odometer">
                  <Input
                    id="vor-return-odometer"
                    inputMode="decimal"
                    value={vorPrompt?.odometer || ""}
                    onChange={(event) => updateVorPrompt("odometer", event.target.value)}
                  />
                </FormField>
                <FormField label="VOR removed by" htmlFor="vor-removed-by">
                  <Input
                    id="vor-removed-by"
                    value={vorPrompt?.removedBy || ""}
                    onChange={(event) => updateVorPrompt("removedBy", event.target.value)}
                  />
                </FormField>
                <FormField label="Position" htmlFor="vor-removed-position">
                  <Input
                    id="vor-removed-position"
                    value={vorPrompt?.removedPosition || ""}
                    onChange={(event) => updateVorPrompt("removedPosition", event.target.value)}
                  />
                </FormField>
                <FormField label="Signature (type full name)" htmlFor="vor-signature">
                  <Input
                    id="vor-signature"
                    value={vorPrompt?.signature || ""}
                    onChange={(event) => updateVorPrompt("signature", event.target.value)}
                  />
                </FormField>
              </>
            ) : (
              <>
                <FormField label="Operator licence number" htmlFor="historic-vor-operator-licence">
                  <Input
                    id="historic-vor-operator-licence"
                    value={vorPrompt?.operatorLicenceNumber || ""}
                    onChange={(event) => updateVorPrompt("operatorLicenceNumber", event.target.value)}
                  />
                </FormField>
                <FormField label="VOR/SORN start date" htmlFor="historic-vor-start">
                  <Input id="historic-vor-start" type="date" value={vorPrompt?.offRoadDate || ""} onChange={(event) => updateVorPrompt("offRoadDate", event.target.value)} />
                </FormField>
                <FormField label="Return date" htmlFor="historic-vor-return">
                  <Input id="historic-vor-return" type="date" value={vorPrompt?.returnedDate || ""} onChange={(event) => updateVorPrompt("returnedDate", event.target.value)} />
                </FormField>
                <FormField label="Odometer when taken off road (mi)" htmlFor="historic-vor-start-odometer">
                  <Input id="historic-vor-start-odometer" inputMode="decimal" value={vorPrompt?.offRoadOdometer || ""} onChange={(event) => updateVorPrompt("offRoadOdometer", event.target.value)} />
                </FormField>
                <FormField label="Odometer when returned (mi)" htmlFor="historic-vor-return-odometer">
                  <Input id="historic-vor-return-odometer" inputMode="decimal" value={vorPrompt?.returnOdometer || ""} onChange={(event) => updateVorPrompt("returnOdometer", event.target.value)} />
                </FormField>
                <FormField label="VOR approved by" htmlFor="historic-vor-approved-by">
                  <Input id="historic-vor-approved-by" value={vorPrompt?.approvedBy || ""} onChange={(event) => updateVorPrompt("approvedBy", event.target.value)} />
                </FormField>
                <FormField label="Approver position" htmlFor="historic-vor-approved-position">
                  <Input id="historic-vor-approved-position" value={vorPrompt?.approvedPosition || ""} onChange={(event) => updateVorPrompt("approvedPosition", event.target.value)} />
                </FormField>
                <FormField label="Return authorised by" htmlFor="historic-vor-removed-by">
                  <Input id="historic-vor-removed-by" value={vorPrompt?.removedBy || ""} onChange={(event) => updateVorPrompt("removedBy", event.target.value)} />
                </FormField>
                <FormField label="Return authoriser position" htmlFor="historic-vor-removed-position">
                  <Input id="historic-vor-removed-position" value={vorPrompt?.removedPosition || ""} onChange={(event) => updateVorPrompt("removedPosition", event.target.value)} />
                </FormField>
                <FormField label="First-use inspection date (if known)" htmlFor="historic-vor-first-use">
                  <Input id="historic-vor-first-use" type="date" value={vorPrompt?.firstUseInspectionDate || ""} onChange={(event) => updateVorPrompt("firstUseInspectionDate", event.target.value)} />
                </FormField>
                <FormField className={layoutStyles.vorReasonField} label="Reason for VOR/SORN" htmlFor="historic-vor-reason">
                  <Textarea id="historic-vor-reason" rows={4} value={vorPrompt?.reason || ""} onChange={(event) => updateVorPrompt("reason", event.target.value)} />
                </FormField>
              </>
            )}
          </div>
        </Modal>

        <Modal
          open={Boolean(taxDatePrompt)}
          onClose={() => setTaxDatePrompt(null)}
          title="Set road tax date"
          description={vehicle.name || vehicle.registration || "Vehicle"}
          size="sm"
          footer={
            <>
              <UIButton type="button" variant="ghost" onClick={() => setTaxDatePrompt(null)}>
                Cancel
              </UIButton>
              <UIButton type="button" onClick={saveTaxDatePrompt}>Save taxed</UIButton>
            </>
          }
        >
          <FormField label="Taxed Until" htmlFor="taxed-until-prompt">
            <Input
              id="taxed-until-prompt"
              type="date"
              value={taxDatePrompt?.date || ""}
              onChange={(event) =>
                setTaxDatePrompt((previous) =>
                  previous ? { ...previous, date: event.target.value } : previous
                )
              }
              autoFocus
            />
          </FormField>
        </Modal>

        <Modal
          open={Boolean(insuranceDatePrompt)}
          onClose={() => setInsuranceDatePrompt(null)}
          title="Set insured until date"
          description={vehicle.name || vehicle.registration || "Vehicle"}
          size="sm"
          footer={
            <>
              <UIButton type="button" variant="ghost" onClick={() => setInsuranceDatePrompt(null)}>
                Cancel
              </UIButton>
              <UIButton type="button" onClick={saveInsuranceDatePrompt}>Save insured</UIButton>
            </>
          }
        >
          <FormField label="Insured Until" htmlFor="insured-until-prompt">
            <Input
              id="insured-until-prompt"
              type="date"
              value={insuranceDatePrompt?.date || ""}
              onChange={(event) =>
                setInsuranceDatePrompt((previous) =>
                  previous ? { ...previous, date: event.target.value } : previous
                )
              }
              autoFocus
            />
          </FormField>
        </Modal>

        <section className={layoutStyles.dangerZone} aria-labelledby="vehicle-danger-heading">
          <div>
            <h2 id="vehicle-danger-heading">Danger zone</h2>
            <p>Permanently delete this vehicle and all linked maintenance and workshop bookings.</p>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            style={{ ...btn("danger"), minHeight: 26, padding: "3px 7px", fontSize: 11.5, boxShadow: "none" }}
          >
            <Trash2 size={13} />
            Delete vehicle
          </button>
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}

/* small components */
function Field({
  label,
  name,
  value,
  onChange,
  meta,
  disabled = false,
  readOnly = false,
  source = "",
  placeholder = "",
  suffix = "",
  inputMode,
}) {
  return (
    <div>
      <FormField className={layoutStyles.vehicleFormField} label={label} htmlFor={`vehicle-${name}`}>
        <div id={`vehicle-${name}-wrap`} className={layoutStyles.fieldInputWrap}>
          <Input
            id={`vehicle-${name}`}
            type="text"
            name={name}
            value={value || ""}
            onChange={onChange}
            placeholder={placeholder}
            inputMode={inputMode}
            style={{
              ...inputField,
              ...(suffix ? { paddingRight: 46 } : {}),
              ...(readOnly ? { background: "var(--color-surface-subtle)" } : {}),
            }}
            disabled={disabled}
            readOnly={readOnly}
            data-source={source || undefined}
          />
          {suffix ? <span className={layoutStyles.fieldSuffix}>{suffix}</span> : null}
        </div>
      </FormField>
      {meta || source ? (
        <div className={layoutStyles.fieldMetaRow}>
          {meta ? <span className={layoutStyles.fieldMetaText}>{meta}</span> : null}
          {source ? <span className={layoutStyles.sourceBadge}>{source}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function DateField({
  label,
  name,
  value,
  onChange,
  meta,
  disabled = false,
  readOnly = false,
  source = "",
  allowOverride = false,
  overridden = false,
  onToggleOverride,
  tone = "",
  max,
}) {
  const toneStyle =
    tone === "danger"
      ? {
          background: "var(--color-danger-soft)",
          borderColor: "var(--color-danger-border)",
          color: "var(--color-danger)",
        }
      : tone === "warning"
        ? {
            background: "var(--color-warning-soft)",
            borderColor: "var(--color-warning-border)",
            color: "var(--color-warning)",
          }
        : {};
  return (
    <div>
      <FormField className={layoutStyles.vehicleFormField} label={label} htmlFor={`vehicle-${name}`} help={meta || undefined}>
        <Input
          id={`vehicle-${name}`}
          type="date"
          name={name}
          value={value || ""}
          onChange={onChange}
          style={{
            ...inputField,
            ...(readOnly ? { background: "var(--color-surface-subtle)" } : {}),
            ...toneStyle,
          }}
          disabled={disabled}
          readOnly={readOnly}
          data-source={source || undefined}
          max={max || undefined}
        />
      </FormField>
      {source || allowOverride ? (
        <div className={layoutStyles.fieldSourceRow}>
          {source ? (
            <span className={layoutStyles.sourceBadge} data-tone={tone || undefined}>
              {source}
            </span>
          ) : null}
          {allowOverride ? (
            <button
              type="button"
              className={layoutStyles.overrideButton}
              onClick={onToggleOverride}
            >
              {overridden ? "Use calculated date" : "Override date"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FieldMeta({ children }) {
  return (
    <div
      style={{
        marginTop: 4,
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
    <FormField className={layoutStyles.vehicleFormField} label={label} htmlFor={`vehicle-${name}`}>
      <Select id={`vehicle-${name}`} name={name} value={value || ""} onChange={onChange} style={inputField}>
        <option value="" disabled>Select...</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

function AutoGrowingTextarea({ value, onChange, style, ...props }) {
  const fieldRef = useRef(null);

  const resize = (field) => {
    if (!field) return;
    field.style.height = "auto";
    const nextHeight = Math.min(Math.max(field.scrollHeight, 38), 180);
    field.style.height = `${nextHeight}px`;
    field.style.overflowY = field.scrollHeight > 180 ? "auto" : "hidden";
  };

  useEffect(() => {
    resize(fieldRef.current);
  }, [value]);

  return (
    <Textarea
      {...props}
      ref={fieldRef}
      rows={1}
      value={value}
      onChange={(event) => {
        resize(event.currentTarget);
        onChange?.(event);
      }}
      style={{ minHeight: 38, maxHeight: 180, resize: "none", ...style }}
    />
  );
}

function TextAreaField({ label, name, value, onChange, placeholder }) {
  return (
    <FormField className={layoutStyles.vehicleFormField} label={label} htmlFor={`vehicle-${name}`}>
      <Textarea
        id={`vehicle-${name}`}
        name={name}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        rows={6}
        style={{ ...textarea, minHeight: 140 }}
      />
    </FormField>
  );
}

function FileUploadField({ label, field, files, onUpload, uploadingField }) {
  const isUploading = uploadingField === field;
  const list = Array.isArray(files) ? files : [];

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div className={layoutStyles.extracted40}>
        <input type="file" multiple onChange={(e) => onUpload(e, field)} />
        {isUploading ? <span style={{ fontSize: 12, color: UI.muted }}>Uploading...</span> : null}
      </div>

      {list.length ? (
        <div className={layoutStyles.extracted41}>
          {list.map((f, idx) => (
            <a
              key={`${field}-${idx}`}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 13,
                color: UI.brand,
                fontWeight: 800,
                textDecoration: "none",
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
              }}
              title={f.url}
            >
              {f.name || `File ${idx + 1}`} - Open
            </a>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>No files uploaded.</div>
      )}
    </div>
  );
}

function MiniLine({ label, value }) {
  return (
    <div className={layoutStyles.extracted42}>
      <span style={{ color: UI.muted, fontWeight: 900 }}>{label}</span>
      <span style={{ color: UI.text, fontWeight: 950 }}>{value || "-"}</span>
    </div>
  );
}

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
      className={layoutStyles.extracted43}
    >
      <span style={{ color: UI.muted, fontWeight: 900 }}>{label}</span>
      <span style={{ color: UI.text, fontWeight: 900 }}>{value || "-"}</span>
    </div>
  );
}
