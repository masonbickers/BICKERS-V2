"use client";

import layoutStyles from "./page.styles.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import EnquiryActionJobSheet from "@/app/components/EnquiryActionJobSheet";
import LinkedBookingContinuationFields from "@/app/components/LinkedBookingContinuationFields";
import SavedContactPicker from "@/app/components/SavedContactPicker";
import { useAuth } from "@/app/context/authContext";
import { auth, db, getFirebaseStorageTools } from "@/app/utils/firebaseClient";
import { datePickerValues } from "@/app/utils/dateDisplay";
import { readCachedBookingForEdit } from "@/app/utils/editBookingCache";
import {
  queueSystemNotification,
  showSystemNotification,
} from "@/app/utils/systemNotifications";
import * as systemDialogs from "@/app/utils/systemNotifications";
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import {
  buildExistingJobDetailsLookup,
  canSaveEnquiryWithoutContact,
  contactIdFromEmail,
  employeesKey,
  findMismatchedQuoteAttachments,
  getExistingJobDetailMismatches,
  hasBookingContactDetails,
  hasBookingProductionIdentity,
  mergeBookingContacts,
  normalizeJobNumberForLookup,
  normalizeVehicleKeysListForLookup,
  uniqEmpObjects,
} from "@/app/utils/bookingFormShared";
import {
  loadBookingFormReferenceData,
  loadSavedContacts,
} from "@/app/utils/bookingFormReferenceData";
import {
  holidayDateKeysFromRecord,
  loadBookingAvailabilityForDates,
  loadVehicleChecksForVehicles,
} from "@/app/utils/bookingAvailability";
import {
  getCanonicalDueDate,
  ymd as toYmd,
} from "@/app/utils/maintenanceSchema";
import {
  buildBookingDerivedFields,
  buildInitialLifecycle,
  buildInitialStatusHistory,
  buildNextLifecycle,
  buildNextStatusHistory,
  buildSynchronizedVehicleStatus,
  isInactiveBookingStatus,
} from "@/app/utils/bookingLifecycle";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { companyStoragePath } from "@/app/utils/storageAccess";
import { requestGuardedNavigation, useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import {
  buildUCraneArmFittedForSave,
  isUCraneArmFitted,
  isUCraneVehicle,
  normalizeUCraneArmFitted,
} from "@/app/utils/uCraneBookingConfiguration";
import {
  blockingStatusesForPriorityEdit,
  canAutoAssignVehicleAsSecondPencil,
  canRetainVehiclePriorityOnEdit,
  existingVehicleStatusesConflictWithRequested,
} from "@/app/utils/bookingVehiclePriority";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Package,
  Printer,
  Save,
  Search,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { getFixedJobStatusStyle } from "@/app/utils/jobStatusColors";
import { buildBookingCallTimePayload } from "@/app/utils/bookingCallTimes";
import {
  buildLinkedContinuationPayload,
  linkedContinuationAllowsResourceOverlap,
  normaliseLinkedContinuation,
  overlappingBookingDateKeys,
} from "@/app/utils/linkedBookingContinuation";

const DatePicker = dynamic(() => import("react-multi-date-picker"), {
  ssr: false,
  loading: () => <div style={{ ...field.input, color: UI.muted }}>Loading dates...</div>,
});

/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens + shared styles (MATCH CREATE)
──────────────────────────────────────────────────────────────────────────── */
const UI = UI_TOKENS;
const SPACE = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24 });
const jobStatusBadgeStyle = (status) => {
  const tone = getFixedJobStatusStyle(status);
  return { background: tone.bg, color: tone.text, borderColor: tone.border };
};

const pageWrap = {
  minHeight: "100%",
  boxSizing: "border-box",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: UI.page,
  padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.xl * 2}px`,
};

const mainWrap = {
  color: UI.text,
  width: "100%",
};

const h1Style = {
  color: UI.text,
  marginBottom: 0,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: 0,
};

const pageHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: SPACE.md,
  marginBottom: SPACE.md,
  flexWrap: "wrap",
};

const headerChecks = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: SPACE.md,
  marginBottom: SPACE.md,
};

const headerChecksBox = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: SPACE.md,
  flexWrap: "wrap",
  padding: SPACE.md,
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: UI.card,
  boxShadow: UI.shadow,
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 0.78fr) minmax(420px, 1.1fr) minmax(420px, 1.12fr)",
  gap: SPACE.md,
  marginTop: SPACE.md,
};

const card = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadow,
  padding: SPACE.md,
};
const cardTitle = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: UI.text,
  letterSpacing: 0,
};

const field = {
  label: {
    display: "block",
    fontWeight: 800,
    marginTop: SPACE.md,
    marginBottom: SPACE.xs,
    color: UI.muted,
    fontSize: 11.5,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    width: "100%",
    height: 36,
    padding: SPACE.sm,
    fontSize: 13,
    borderRadius: UI.radiusXs,
    border: UI.border,
    background: "var(--color-surface)",
    color: UI.text,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 80,
    padding: SPACE.sm,
    fontSize: 13,
    borderRadius: UI.radiusXs,
    border: UI.border,
    background: "var(--color-surface)",
    color: UI.text,
    boxSizing: "border-box",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    fontWeight: 700,
    fontSize: 13,
    marginBottom: SPACE.sm,
  },
};

const accordionBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: `${SPACE.sm}px ${SPACE.md}px`,
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 12.5,
  color: UI.text,
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.sm,
  padding: `${SPACE.xs}px ${SPACE.sm}px`,
  fontSize: 12,
  borderRadius: 999,
  background: UI.brandSoft,
  border: `1px solid ${UI.brandBorder}`,
  color: UI.brand,
  fontWeight: 700,
};

const divider = { height: 1, background: "var(--color-border)", margin: `${SPACE.md}px 0` };

const checkboxGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(160px, 210px))",
  gap: `${SPACE.sm}px ${SPACE.xl}px`,
  alignItems: "start",
};

const driverCheckboxGrid = {
  ...checkboxGrid,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: `${SPACE.sm}px ${SPACE.lg}px`,
};

const personCheckboxLabel = {
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.sm,
  marginBottom: SPACE.xs,
  fontSize: 13.5,
  lineHeight: 1.25,
};

const actionsRow = {
  display: "flex",
  gap: SPACE.sm,
  justifyContent: "flex-end",
  marginTop: SPACE.lg,
};

const subCard = {
  padding: SPACE.md,
  borderRadius: UI.radiusSm,
  background: UI.bgAlt,
  border: "1px solid var(--color-border)",
};

const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: SPACE.sm,
  padding: `${SPACE.sm}px ${SPACE.md}px`,
  borderRadius: UI.radiusXs,
  border: `1px solid ${UI.brand}`,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
};
const btnPrimary = {
  ...btn,
  background: "var(--button-primary-background)",
  borderColor: "var(--button-primary-border)",
  color: "var(--button-primary-text)",
  boxShadow: "0 8px 18px rgba(31,75,122,0.16)",
};
const btnGhost = {
  ...btn,
  background: "var(--color-surface)",
  color: UI.text,
  border: `1px solid ${UI.brandBorder}`,
};
const btnDanger = {
  ...btn,
  background: "var(--color-surface)",
  borderColor: "var(--color-danger)",
  color: "var(--color-danger)",
};

const formatSummaryDate = (date) => {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const formatSummaryDates = (dates) => dates.map(formatSummaryDate).filter(Boolean).join(", ");

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 32,
  height: 32,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const pageSub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: SPACE.xs };
const sectionTitleRow = { display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.md };
const focusCss = `
  input:focus, select:focus, textarea:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: var(--color-info-border) !important;
  }
  @media (max-width: 1080px) {
    .edit-booking-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 760px) {
    .edit-booking-two,
    .edit-booking-assets,
    .edit-booking-crew-box,
    .edit-booking-hotel { grid-template-columns: 1fr !important; }
  }
`;

/* ────────────────────────────────────────────────────────────────────────────
   Status + blocking
──────────────────────────────────────────────────────────────────────────── */
const VEHICLE_STATUSES = [
  "Confirmed",
  "Bickers",
  "First Pencil",
  "Second Pencil",
  "Enquiry",
  "Stunt", //  added
  "Maintenance",
  "DNH",
  "Lost",
  "Postponed",
  "Cancelled",
  "Complete",
];

const SECOND_PENCIL_STATUS = "Second Pencil";
const BLOCKING_STATUSES = ["Confirmed", "First Pencil", SECOND_PENCIL_STATUS];
const doesBlockBooking = (b) =>
  BLOCKING_STATUSES.includes((b.status || "").trim());
const isVehicleBlockingStatus = (status) => {
  const s = (status || "").trim();
  return BLOCKING_STATUSES.includes(s) || s === "Maintenance";
};
const existingVehicleStatusConflictsWithRequested = (existingStatuses = [], requestedStatus = "") => {
  return existingVehicleStatusesConflictWithRequested(existingStatuses, requestedStatus);
};

const OFF_ROAD_ALLOWED_GROUPS = new Set([
  "bike",
  "electric tracking vehicles",
  "small tracking vehicles",
]);
const isOffRoadAllowedGroup = (group) =>
  OFF_ROAD_ALLOWED_GROUPS.has(String(group || "").trim().toLowerCase());

/* ────────────────────────────────────────────────────────────────────────────
   UTC day helpers
──────────────────────────────────────────────────────────────────────────── */
const parseYMD_UTC = (ymd) => {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};
const formatYMD_UTC = (dt) => dt.toISOString().slice(0, 10);
const addDaysUTC = (dt, n) => {
  const copy = new Date(dt.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
};
const enumerateDaysYMD_UTC = (startYMD, endYMD) => {
  const start = parseYMD_UTC(startYMD);
  const end = parseYMD_UTC(endYMD);
  if (!start || !end) return [];
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(formatYMD_UTC(cur));
    cur = addDaysUTC(cur, 1);
  }
  return out;
};

const toYMD = (raw) => {
  if (!raw) return "";
  if (typeof raw === "string") {
    // could be "YYYY-MM-DD" or ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  if (typeof raw?.toDate === "function") {
    const d = raw.toDate();
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  if (typeof raw?.seconds === "number") {
    const d = new Date(raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1_000_000));
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const expandBookingDates = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length)
    return b.bookingDates;
  const one = (b.date || "").slice(0, 10);
  const s = (b.startDate || "").slice(0, 10);
  const e = (b.endDate || "").slice(0, 10);
  if (one) return [one];
  if (s && e) return enumerateDaysYMD_UTC(s, e);
  return [];
};

const expandMaintenanceBookingDates = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) return b.bookingDates;

  const appointmentISO = String(b.appointmentDateISO || "").slice(0, 10);
  const startISO = String(b.startDateISO || "").slice(0, 10);
  const endISO = String(b.endDateISO || "").slice(0, 10);
  if (appointmentISO) return [appointmentISO];
  if (startISO && endISO) return enumerateDaysYMD_UTC(startISO, endISO);

  const one = toYMD(b.appointmentDate || b.date);
  const s = toYMD(b.startDate || b.date || b.start);
  const e = toYMD(b.endDate || b.end || b.startDate || b.date);
  if (one) return [one];
  if (s && e) return enumerateDaysYMD_UTC(s, e);
  return [];
};

const isActiveMaintenanceBooking = (booking = {}) =>
  !["completed", "complete", "cancelled", "canceled", "failed", "archived"].includes(
    String(booking.status || booking.bookingStatus || "booked").trim().toLowerCase()
  );

const anyDateOverlap = (datesA, datesB) => {
  if (!Array.isArray(datesA) || !Array.isArray(datesB)) return false;
  if (!datesA.length || !datesB.length) return false;
  const setA = new Set(datesA);
  return datesB.some((d) => setA.has(d));
};

/* ────────────────────────────────────────────────────────────────────────────
   Travel + time options
──────────────────────────────────────────────────────────────────────────── */
const buildTravelDurationOptions = () => {
  const out = [];
  for (let mins = 15; mins <= 360; mins += 15) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const label = h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
    out.push({ value: String(mins), label });
  }
  return out;
};
const TRAVEL_DURATION_OPTIONS = buildTravelDurationOptions();

const buildTimeOptions = () => {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      );
    }
  }
  return out;
};
const TIME_OPTIONS = buildTimeOptions();

/* ────────────────────────────────────────────────────────────────────────────
   Contacts helpers
──────────────────────────────────────────────────────────────────────────── */
const FILM_DEPARTMENTS = [
  "Production",
  "Director",
  "Assistant Director",
  "Locations",
  "Art Department",
  "Camera",
  "Grip",
  "Electric",
  "Costume",
  "Makeup & Hair",
  "Stunts",
  "Sound",
  "Post-Production",
  "Other",
];

/* ────────────────────────────────────────────────────────────────────────────
   Employee helpers
──────────────────────────────────────────────────────────────────────────── */
const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const normalizeQuoteNumbers = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : String(value || "").split(/[\n,]+/))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

const splitQuoteRevision = (quoteNumber = "") => {
  const text = String(quoteNumber || "").trim();
  const match = text.match(/^(.+)\.(\d+)$/);
  return {
    base: (match ? match[1] : text).trim(),
    revision: match?.[2] ? Number(match[2]) : 0,
  };
};

const publicQuoteNumber = (quoteNumber = "") => splitQuoteRevision(quoteNumber).base;

const normalizePublicQuoteNumbers = (value) =>
  Array.from(
    normalizeQuoteNumbers(value).reduce((map, number) => {
      const publicNumber = publicQuoteNumber(number);
      const key = String(publicNumber || "").trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, publicNumber);
      return map;
    }, new Map()).values()
  );

const quoteRevisionLabel = (quoteNumber = "") => {
  const revision = splitQuoteRevision(quoteNumber).revision;
  return revision > 0 ? `Rev ${revision}` : "Original";
};

const quoteVersionFromNumber = (quoteNumber = "") => {
  const match = String(publicQuoteNumber(quoteNumber) || "").match(/(?:^|-)(\d{1,4})$/);
  const version = Number(match?.[1] || 0);
  return Number.isInteger(version) && version > 0 ? version : 0;
};

const quoteDisplayName = (quote = {}) => {
  const name = String(quote?.quoteName || quote?.displayName || "").trim();
  if (name) return name;
  return String(quote?.templateName || quote?.templateFile || "").trim();
};

const quoteNumberInputValue = (booking = {}) => {
  const quoteNumbers = normalizePublicQuoteNumbers(booking.quoteNumbers);
  if (quoteNumbers.length) return quoteNumbers.join("\n");
  return publicQuoteNumber(booking.quoteNumber || "");
};

const nextPublicQuoteNumber = (jobNumber = "", quoteNumbers = []) => {
  const job = String(jobNumber || "").trim();
  const base = job ? (job.toUpperCase().startsWith("Q") ? job : `Q${job}`) : "";
  const versions = quoteNumbers
    .map(publicQuoteNumber)
    .map((number) => String(number || "").match(/(?:^|-)(\d{1,4})$/)?.[1])
    .filter(Boolean)
    .map(Number);
  const nextVersion = Math.max(0, ...versions) + 1;
  const suffix = String(nextVersion).padStart(3, "0");
  return base ? `${base}-${suffix}` : suffix;
};

/* ────────────────────────────────────────────────────────────────────────────
   Vehicle lookup: id / reg / name
──────────────────────────────────────────────────────────────────────────── */
const toJsDate = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw?.toDate === "function") return raw.toDate();
  if (typeof raw?.seconds === "number") {
    return new Date(raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1_000_000));
  }
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
};

const fallbackVehicleKeys = (list) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((raw) => {
          if (raw && typeof raw === "object") {
            return raw.id || raw.vehicleId || raw.registration || raw.name || "";
          }
          return raw;
        })
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const vehicleInfoFromRaw = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") {
    const id = String(raw.id || raw.vehicleId || raw.registration || raw.name || "").trim();
    if (!id) return null;
    return {
      id,
      name: String(raw.name || raw.vehicleName || raw.registration || id).trim(),
      registration: String(raw.registration || raw.reg || "").trim(),
      group: String(raw.group || raw.category || "Selected").trim() || "Selected",
      ...raw,
    };
  }
  const id = String(raw || "").trim();
  return id ? { id, name: id, registration: "", group: "Selected" } : null;
};

const mergeSelectedVehiclesIntoGroups = (groups = {}, rawVehicles = []) => {
  const next = { ...(groups || {}) };
  const existingIds = new Set(
    Object.values(next)
      .flat()
      .map((vehicle) => String(vehicle?.id || "").trim())
      .filter(Boolean)
  );

  rawVehicles.map(vehicleInfoFromRaw).filter(Boolean).forEach((vehicle) => {
    if (existingIds.has(vehicle.id)) return;
    const group = vehicle.group || "Selected";
    next[group] = [...(next[group] || []), vehicle];
    existingIds.add(vehicle.id);
  });

  return next;
};

const mergeSelectedEquipmentIntoGroups = (groups = {}, selectedEquipment = []) => {
  const next = { ...(groups || {}) };
  const existingNames = new Set(
    Object.values(next)
      .flat()
      .map((name) => String(name || "").trim().toLowerCase())
      .filter(Boolean)
  );

  selectedEquipment.forEach((rawName) => {
    const name = String(rawName || "").trim();
    if (!name || existingNames.has(name.toLowerCase())) return;
    next.Selected = [...(next.Selected || []), name];
    existingNames.add(name.toLowerCase());
  });

  return next;
};

/* ────────────────────────────────────────────────────────────────────────────
   Money helpers
──────────────────────────────────────────────────────────────────────────── */
const toMoney = (raw) => {
  if (raw === null || typeof raw === "undefined") return "";
  const s = String(raw).replace(/[^\d.]/g, "");
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : "";
};

const buildDatePrefillState = (bookingData = {}) => {
  const bd = Array.isArray(bookingData.bookingDates)
    ? bookingData.bookingDates.map(toYMD).filter(Boolean)
    : [];
  const sY = toYMD(bookingData.startDate);
  const eY = toYMD(bookingData.endDate);
  const dY = toYMD(bookingData.date);

  if (sY && eY) {
    return {
      useCustomDates: false,
      isRange: true,
      startDate: sY,
      endDate: eY,
      customDates: [],
    };
  }

  if (dY) {
    return {
      useCustomDates: false,
      isRange: false,
      startDate: dY,
      endDate: "",
      customDates: [],
    };
  }

  if (bd.length) {
    const sorted = [...bd].sort();
    const consecutive =
      sorted.length > 1
        ? enumerateDaysYMD_UTC(sorted[0], sorted[sorted.length - 1]).length === sorted.length
        : false;

    if (consecutive && sorted.length > 1) {
      return {
        useCustomDates: false,
        isRange: true,
        startDate: sorted[0],
        endDate: sorted[sorted.length - 1],
        customDates: [],
      };
    }

    if (sorted.length === 1) {
      return {
        useCustomDates: false,
        isRange: false,
        startDate: sorted[0],
        endDate: "",
        customDates: [],
      };
    }

    return {
      useCustomDates: true,
      isRange: false,
      startDate: "",
      endDate: "",
      customDates: sorted,
    };
  }

  return {
    useCustomDates: false,
    isRange: false,
    startDate: "",
    endDate: "",
    customDates: [],
  };
};

const buildEditBookingPrefillState = (bookingData) => {
  const booking = bookingData || {};
  const dateState = buildDatePrefillState(booking);
  const dateStateHasDates = Boolean(dateState.startDate || (Array.isArray(dateState.customDates) && dateState.customDates.length));
  const rawEmployees = Array.isArray(booking.employees) ? booking.employees : [];
  const employees = rawEmployees.length
    ? uniqEmpObjects(
        rawEmployees.map((employee) =>
          typeof employee === "string"
            ? { role: "Precision Driver", name: employee }
            : employee
        )
      )
    : [];
  const rawVehicles = Array.isArray(booking.vehicles) ? booking.vehicles : [];
  const vehicleIds = fallbackVehicleKeys(rawVehicles);
  const vehicleStatus = {
    ...(booking.vehicleStatus && typeof booking.vehicleStatus === "object"
      ? booking.vehicleStatus
      : {}),
  };
  vehicleIds.forEach((vehicleId) => {
    if (!vehicleStatus[vehicleId]) vehicleStatus[vehicleId] = booking.status || "Confirmed";
  });
  const equipment = Array.from(
    new Set(
      (Array.isArray(booking.equipment) ? booking.equipment : [])
        .map((item) => (typeof item === "string" ? item : item?.name))
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    )
  );
  const hasUsefulBooking = Boolean(
    bookingData?.id && Object.keys(booking).some((key) => key !== "id")
  );

  return {
    hasBooking: hasUsefulBooking,
    quoteNumber: quoteNumberInputValue(booking),
    quoteNumbers: normalizePublicQuoteNumbers(booking.quoteNumbers),
    jobNumber: booking.jobNumber || "",
    client: booking.client || "",
    production: booking.production || "",
    location: booking.location || "",
    showInvoicingDetails: Boolean(booking.po || booking.invoiceContactName || booking.invoiceContactEmail || booking.invoiceContactPhone || booking.invoiceDocument),
    po: booking.po || "",
    invoiceContactName: booking.invoiceContactName || "",
    invoiceContactEmail: booking.invoiceContactEmail || "",
    invoiceContactPhone: booking.invoiceContactPhone || "",
    invoiceDocument: booking.invoiceDocument && typeof booking.invoiceDocument === "object" ? booking.invoiceDocument : null,
    status: booking.status || "Confirmed",
    shootType: booking.shootType || "Day",
    statusReasons: Array.isArray(booking.statusReasons) ? booking.statusReasons : [],
    statusReasonOther: booking.statusReasonOther || "",
    enquiryDatesEnabled: booking.enquiryDatesEnabled ?? (booking.status !== "Enquiry" || dateStateHasDates),
    ...dateState,
    linkedContinuation: normaliseLinkedContinuation(booking.linkedContinuation),
    notesByDate: booking.notesByDate && typeof booking.notesByDate === "object" ? booking.notesByDate : {},
    notes: booking.notes || "",
    callTime: booking.callTime || "",
    callTimesByDate:
      booking.callTimesByDate && typeof booking.callTimesByDate === "object"
        ? booking.callTimesByDate
        : {},
    hasHotel: Boolean(booking.hasHotel ?? booking.hotelBooked ?? booking.isHotelBooked ?? booking.hotel),
    hotelPaidBy: String(booking.hotelPaidBy ?? booking.hotelPaid ?? booking.hotelPayer ?? ""),
    hotelNights:
      booking.hotelNights === 0 || booking.hotelNights
        ? String(booking.hotelNights)
        : booking.nights === 0 || booking.nights
        ? String(booking.nights)
        : booking.hotelNightCount === 0 || booking.hotelNightCount
        ? String(booking.hotelNightCount)
        : "",
    hotelPricePerNight: toMoney(
      booking.hotelPricePerNight ??
        booking.pricePerNight ??
        booking.hotelRate ??
        booking.hotelCostPerNight ??
        ""
    ),
    hasRiggingAddress: Boolean(booking.hasRiggingAddress),
    riggingAddress: booking.riggingAddress || "",
    isSecondPencil: Boolean(booking.isSecondPencil),
    isCrewed: Boolean(booking.isCrewed),
    hasHS: Boolean(booking.hasHS),
    hasRiskAssessment: Boolean(booking.hasRiskAssessment),
    offRoadTracking: Boolean(booking.offRoadTracking),
    requiredCrewCount: Number.isFinite(Number(booking.requiredCrewCount))
      ? Number(booking.requiredCrewCount)
      : 1,
    employees,
    employeesByDate:
      booking.employeesByDate && typeof booking.employeesByDate === "object"
        ? booking.employeesByDate
        : {},
    vehicles: vehicleIds,
    vehicleStatus,
    uCraneArmFitted: normalizeUCraneArmFitted(booking.uCraneArmFitted),
    equipment,
    additionalContacts: (Array.isArray(booking.additionalContacts) ? booking.additionalContacts : []).map(
      (contact) => ({
        department: contact.department || "",
        departmentOther: "",
        name: contact.name || "",
        email: contact.email || "",
        phone: contact.phone || "",
      })
    ),
    attachments: Array.isArray(booking.attachments) ? booking.attachments : [],
    quote: booking.quote && typeof booking.quote === "object" ? booking.quote : null,
    quoteVersions: Array.isArray(booking.quoteVersions)
      ? booking.quoteVersions.filter((entry) => entry && typeof entry === "object")
      : [],
    existingHistory: Array.isArray(booking.history) ? booking.history : [],
    existingStatusHistory: Array.isArray(booking.statusHistory) ? booking.statusHistory : [],
    existingLifecycle:
      booking.lifecycle && typeof booking.lifecycle === "object" ? booking.lifecycle : null,
    createdAtIso: booking.createdAt || null,
    createdByEmail: booking.createdBy || null,
    createdByUid: booking.createdByUid || null,
    originalBookingData: bookingData || null,
  };
};

const formatAuditDate = (raw) => {
  if (!raw) return "";
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-");
    return `${d}/${m}/${y.slice(-2)}`;
  }
  const dt = toJsDate(raw);
  if (!dt) return str;
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = String(dt.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

const AUDIT_FIELDS = [
  "quoteNumber",
  "quoteNumbers",
  "jobNumber",
  "client",
  "production",
  "location",
  "status",
  "statusReasons",
  "statusReasonOther",
  "shootType",
  "bookingDates",
  "date",
  "startDate",
  "endDate",
  "linkedContinuation",
  "callTime",
  "callTimesByDate",
  "employees",
  "employeesByDate",
  "vehicles",
  "vehicleStatus",
  "uCraneArmFitted",
  "equipment",
  "notes",
  "notesByDate",
  "isCrewed",
  "requiredCrewCount",
  "hasHS",
  "hasRiskAssessment",
  "offRoadTracking",
  "hasHotel",
  "hotelPaidBy",
  "hotelNights",
  "hotelPricePerNight",
  "hasRiggingAddress",
  "riggingAddress",
  "additionalContacts",
  "attachments",
];

const AUDIT_LABELS = {
  quoteNumber: "Quote number",
  quoteNumbers: "Quote numbers",
  jobNumber: "Job number",
  client: "Production Company",
  production: "Production",
  location: "Location",
  status: "Status",
  statusReasons: "Status reasons",
  statusReasonOther: "Status reason detail",
  shootType: "Shoot type",
  bookingDates: "Dates",
  date: "Single date",
  startDate: "Start date",
  endDate: "End date",
  linkedContinuation: "Linked job continuation",
  callTime: "Call time",
  callTimesByDate: "Call times by day",
  employees: "Employees",
  employeesByDate: "Employees by day",
  vehicles: "Vehicles",
  vehicleStatus: "Vehicle statuses",
  uCraneArmFitted: "U-Crane arm setup",
  equipment: "Equipment",
  notes: "Notes",
  notesByDate: "Day notes",
  isCrewed: "Crewed",
  requiredCrewCount: "Required crew count",
  hasHS: "HS",
  hasRiskAssessment: "Risk assessment",
  offRoadTracking: "Off road tracking",
  hasHotel: "Hotel",
  hotelPaidBy: "Hotel paid by",
  hotelNights: "Hotel nights",
  hotelPricePerNight: "Hotel price per night",
  hasRiggingAddress: "Rigging",
  riggingAddress: "Rigging address",
  additionalContacts: "Additional contacts",
  attachments: "Attachments",
};

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableSortObject(value[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

function normalizeAuditValue(key, value) {
  switch (key) {
    case "employees":
      return (Array.isArray(value) ? value : [])
        .map((e) => `${e?.role || ""}:${e?.name || ""}`)
        .filter(Boolean)
        .sort();
    case "employeesByDate":
      return Object.keys(value || {})
        .sort()
        .reduce((acc, date) => {
          acc[date] = normalizeAuditValue("employees", value?.[date]);
          return acc;
        }, {});
    case "vehicles":
    case "equipment":
    case "bookingDates":
    case "statusReasons":
    case "quoteNumbers":
      return (Array.isArray(value) ? value : []).map(String).sort();
    case "vehicleStatus":
    case "callTimesByDate":
    case "notesByDate":
      return stableSortObject(value || {});
    case "additionalContacts":
      return (Array.isArray(value) ? value : [])
        .map((c) => ({
          department: String(c?.department || "").trim(),
          name: String(c?.name || "").trim(),
          email: String(c?.email || "").trim(),
          phone: String(c?.phone || "").trim(),
        }))
        .sort((a, b) =>
          `${a.department}|${a.name}|${a.email}|${a.phone}`.localeCompare(
            `${b.department}|${b.name}|${b.email}|${b.phone}`
          )
        );
    case "attachments":
      return (Array.isArray(value) ? value : [])
        .map((file) => String(file?.name || file?.label || file?.url || file || "").trim())
        .filter(Boolean)
        .sort();
    default:
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value === "string") return value.trim();
      return stableSortObject(value ?? null);
  }
}

function auditVehicleLabel(value, lookup = {}) {
  const rawKey = String(
    value && typeof value === "object"
      ? value.id || value.vehicleId || value.registration || value.reg || value.name || ""
      : value || ""
  ).trim();
  const vehicle =
    lookup?.byId?.[rawKey] ||
    lookup?.byReg?.[rawKey.toUpperCase()] ||
    lookup?.byName?.[rawKey.toLowerCase()] ||
    (value && typeof value === "object" ? value : null) ||
    {};
  return String(
    vehicle.name ||
      [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ") ||
      vehicle.registration ||
      vehicle.reg ||
      "Unknown vehicle"
  ).trim();
}

function summarizeAuditValue(key, value, vehicleLookup = {}) {
  if (
    value === null ||
    typeof value === "undefined" ||
    value === "" ||
    (Array.isArray(value) && !value.length) ||
    (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)
  ) {
    return "None";
  }

  switch (key) {
    case "employees":
      return (Array.isArray(value) ? value : [])
        .map((e) => [e?.role, e?.name].filter(Boolean).join(": "))
        .filter(Boolean)
        .join(", ") || "None";
    case "employeesByDate":
      return Object.keys(value || {})
        .sort()
        .map((date) => `${formatAuditDate(date)} (${summarizeAuditValue("employees", value?.[date], vehicleLookup)})`)
        .join("; ") || "None";
    case "vehicles":
      return (Array.isArray(value) ? value : [])
        .map((item) => auditVehicleLabel(item, vehicleLookup))
        .join(", ") || "None";
    case "equipment":
    case "bookingDates":
    case "statusReasons":
    case "quoteNumbers":
      return (Array.isArray(value) ? value : [])
        .map((item) =>
          key === "bookingDates" ? formatAuditDate(item) : String(item)
        )
        .join(", ") || "None";
    case "vehicleStatus":
      return Object.keys(value || {})
        .sort()
        .map((vehicleId) => `${auditVehicleLabel(vehicleId, vehicleLookup)}: ${String(value[vehicleId] ?? "").trim() || "None"}`)
        .join("; ") || "None";
    case "callTimesByDate":
    case "notesByDate":
      return Object.keys(value || {})
        .sort()
        .map((k) => `${formatAuditDate(k)}: ${String(value[k] ?? "").trim() || "None"}`)
        .join("; ") || "None";
    case "date":
    case "startDate":
    case "endDate":
      return formatAuditDate(value);
    case "additionalContacts":
      return (Array.isArray(value) ? value : [])
        .map((c) => [c?.name, c?.department, c?.email, c?.phone].filter(Boolean).join(" / "))
        .filter(Boolean)
        .join("; ") || "None";
    case "attachments":
      return (Array.isArray(value) ? value : [])
        .map((file) => String(file?.name || file?.label || file?.url || file || "").trim())
        .filter(Boolean)
        .join(", ") || "None";
    case "isCrewed":
    case "hasHS":
    case "hasRiskAssessment":
    case "hasHotel":
    case "hasRiggingAddress":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

function buildBookingChangeList(before = {}, after = {}, vehicleLookup = {}) {
  return AUDIT_FIELDS.reduce((changes, key) => {
    const beforeNorm = normalizeAuditValue(key, before?.[key]);
    const afterNorm = normalizeAuditValue(key, after?.[key]);
    if (JSON.stringify(beforeNorm) === JSON.stringify(afterNorm)) return changes;

    changes.push(
      `${AUDIT_LABELS[key] || key}: ${summarizeAuditValue(key, before?.[key], vehicleLookup)} -> ${summarizeAuditValue(
        key,
        after?.[key],
        vehicleLookup
      )}`
    );
    return changes;
  }, []);
}

/* ────────────────────────────────────────────────────────────────────────────
   Edit Booking Page (MATCH CREATE UI)
──────────────────────────────────────────────────────────────────────────── */
const normalizeDashboardView = (value) => (value === "month" ? "month" : "week");

const buildDashboardHref = ({ returnDate = "", returnView = "week", updated = false } = {}) => {
  const params = new URLSearchParams();
  const cleanDate = String(returnDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) params.set("date", cleanDate);
  params.set("view", normalizeDashboardView(returnView));
  if (updated) params.set("updated", "true");
  const query = params.toString();
  return `/dashboard${query ? `?${query}` : ""}`;
};

const normalizeAppReturnTo = (value = "") => {
  const clean = String(value || "").trim();
  if (!clean || !clean.startsWith("/") || clean.startsWith("//")) return "";

  try {
    const url = new URL(clean, "https://bickers.local");
    if (url.origin !== "https://bickers.local") return "";
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (!href || href.startsWith("/edit-booking/")) return "";
    return href;
  } catch {
    return "";
  }
};

const withUpdatedFlag = (href = "") => {
  const fallback = "/dashboard?updated=true";
  const clean = normalizeAppReturnTo(href);
  if (!clean) return fallback;

  const url = new URL(clean, "https://bickers.local");
  url.searchParams.set("updated", "true");
  return `${url.pathname}${url.search}${url.hash}`;
};

export default function EditBookingPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
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
  const bookingId = params?.id;
  const cachedBooking = useMemo(() => readCachedBookingForEdit(bookingId), [bookingId]);
  const prefill = useMemo(() => buildEditBookingPrefillState(cachedBooking), [cachedBooking]);
  const dashboardReturnContext = useMemo(
    () => ({
      returnDate: searchParams.get("returnDate") || "",
      returnView: normalizeDashboardView(searchParams.get("returnView") || "week"),
    }),
    [searchParams]
  );
  const dashboardReturnHref = useMemo(
    () => buildDashboardHref(dashboardReturnContext),
    [dashboardReturnContext]
  );
  const returnHref = useMemo(
    () => normalizeAppReturnTo(searchParams.get("returnTo")) || dashboardReturnHref,
    [dashboardReturnHref, searchParams]
  );
  const updatedReturnHref = useMemo(
    () => withUpdatedFlag(returnHref),
    [returnHref]
  );

  const [loading, setLoading] = useState(!prefill.hasBooking);
  const [saving, setSaving] = useState(false);

  // Core fields
  const [quoteNumber, setQuoteNumber] = useState(prefill.quoteNumber);
  const [jobNumber, setJobNumber] = useState(prefill.jobNumber);
  const [client, setClient] = useState(prefill.client);
  const [production, setProduction] = useState(prefill.production);
  const [location, setLocation] = useState(prefill.location);
  const [showInvoicingDetails, setShowInvoicingDetails] = useState(prefill.showInvoicingDetails);
  const [po, setPo] = useState(prefill.po);
  const [invoiceContactName, setInvoiceContactName] = useState(prefill.invoiceContactName);
  const [invoiceContactEmail, setInvoiceContactEmail] = useState(prefill.invoiceContactEmail);
  const [invoiceContactPhone, setInvoiceContactPhone] = useState(prefill.invoiceContactPhone);
  const [invoiceDocument, setInvoiceDocument] = useState(prefill.invoiceDocument);
  const [invoiceDocumentFile, setInvoiceDocumentFile] = useState(null);

  const [status, setStatus] = useState(prefill.status);
  const [shootType, setShootType] = useState(prefill.shootType);

  const [statusReasons, setStatusReasons] = useState(prefill.statusReasons);
  const [statusReasonOther, setStatusReasonOther] = useState(prefill.statusReasonOther);

  // Dates
  const [isRange, setIsRange] = useState(prefill.isRange);
  const [useCustomDates, setUseCustomDates] = useState(prefill.useCustomDates);
  const [enquiryDatesEnabled, setEnquiryDatesEnabled] = useState(prefill.enquiryDatesEnabled);
  const [customDates, setCustomDates] = useState(prefill.customDates);
  const [startDate, setStartDate] = useState(prefill.startDate);
  const [endDate, setEndDate] = useState(prefill.endDate);
  const [linkedContinuation, setLinkedContinuation] = useState(prefill.linkedContinuation);

  // Notes per day
  const [notesByDate, setNotesByDate] = useState(prefill.notesByDate);
  const [notes, setNotes] = useState(prefill.notes);

  // Call times
  const [callTime, setCallTime] = useState(prefill.callTime);
  const [callTimesByDate, setCallTimesByDate] = useState(prefill.callTimesByDate);

  // Hotel / rigging
  const [hasHotel, setHasHotel] = useState(prefill.hasHotel);

  //  restored hotel details
  const [hotelPaidBy, setHotelPaidBy] = useState(prefill.hotelPaidBy); // "Production" | "Bickers"
  const [hotelNights, setHotelNights] = useState(prefill.hotelNights); // string for input
  const [hotelPricePerNight, setHotelPricePerNight] = useState(prefill.hotelPricePerNight); // string for input

  const [hasRiggingAddress, setHasRiggingAddress] = useState(prefill.hasRiggingAddress);
  const [riggingAddress, setRiggingAddress] = useState(prefill.riggingAddress);

  // Flags
  const [isSecondPencil, setIsSecondPencil] = useState(prefill.isSecondPencil);

  //  manual crewing only
  const [isCrewed, setIsCrewed] = useState(prefill.isCrewed);

  const [hasHS, setHasHS] = useState(prefill.hasHS);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(prefill.hasRiskAssessment);
  const [offRoadTracking, setOffRoadTracking] = useState(prefill.offRoadTracking);

  // Crew requirement is guidance only. "Crewed" is controlled manually.
  const [requiredCrewCount, setRequiredCrewCount] = useState(prefill.requiredCrewCount);

  // Employees
  const [employees, setEmployees] = useState(prefill.employees); // [{role,name}]
  const [employeesByDate, setEmployeesByDate] = useState(prefill.employeesByDate);
  const [customEmployee, setCustomEmployee] = useState("");

  // Vehicles
  const [vehicles, setVehicles] = useState(prefill.vehicles); // vehicleIds
  const [vehicleStatus, setVehicleStatus] = useState(prefill.vehicleStatus); // {vehicleId: status}
  const [uCraneArmFitted, setUCraneArmFitted] = useState(prefill.uCraneArmFitted);

  // Equipment
  const [equipment, setEquipment] = useState(prefill.equipment);
  const [assetSearch, setAssetSearch] = useState("");
  const [resourceTab, setResourceTab] = useState("vehicles");

  // Contacts block
  const [additionalContacts, setAdditionalContacts] = useState(prefill.additionalContacts);
  const [savedContacts, setSavedContacts] = useState([]);
  const [savedContactsLoaded, setSavedContactsLoaded] = useState(false);
  const [savedContactsLoading, setSavedContactsLoading] = useState(false);
  const [savedContactSearch, setSavedContactSearch] = useState("");
  const [contactsExpanded, setContactsExpanded] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState(prefill.attachments); // existing
  const [newFiles, setNewFiles] = useState([]);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [quoteDraft, setQuoteDraft] = useState(prefill.quote);
  const [quoteDrafts, setQuoteDrafts] = useState(prefill.quoteVersions);
  const [deletingQuoteNumber, setDeletingQuoteNumber] = useState("");
  const [previewQuoteNumber, setPreviewQuoteNumber] = useState("");
  const [selectedQuoteRevisions, setSelectedQuoteRevisions] = useState({});

  // Data lists
  const [allBookings, setAllBookings] = useState([]);
  const [existingJobDetailsByNumber, setExistingJobDetailsByNumber] = useState({});
  const [dismissedExistingJobNumber, setDismissedExistingJobNumber] = useState("");
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [unavailableNotes, setUnavailableNotes] = useState([]);
  const [employeeList, setEmployeeList] = useState([]); // drivers
  const [freelancerList, setFreelancerList] = useState([]);

  const [vehicleGroups, setVehicleGroups] = useState({});
  const [openGroups, setOpenGroups] = useState({});

  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [openEquipGroups, setOpenEquipGroups] = useState({});

  // Lookups
  const [vehicleLookup, setVehicleLookup] = useState({
    byId: {},
    byReg: {},
    byName: {},
  });

  // Maintenance bookings
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [vehicleChecks, setVehicleChecks] = useState([]);

  // Employee code map
  const [nameToCode, setNameToCode] = useState({});

  const assetSearchLower = useMemo(
    () => String(assetSearch || "").trim().toLowerCase(),
    [assetSearch]
  );

  const filteredVehicleGroups = useMemo(() => {
    if (!assetSearchLower) return vehicleGroups;
    const out = {};
    Object.entries(vehicleGroups || {}).forEach(([group, items]) => {
      out[group] = (items || []).filter((vehicle) => {
        const text = `${vehicle?.name || ""} ${vehicle?.registration || ""}`.toLowerCase();
        return text.includes(assetSearchLower);
      });
    });
    return out;
  }, [vehicleGroups, assetSearchLower]);

  const filteredEquipmentGroups = useMemo(() => {
    if (!assetSearchLower) return equipmentGroups;
    const out = {};
    Object.entries(equipmentGroups || {}).forEach(([group, items]) => {
      out[group] = (items || []).filter((rawName) =>
        String(rawName || "").toLowerCase().includes(assetSearchLower)
      );
    });
    return out;
  }, [equipmentGroups, assetSearchLower]);

  const sortedSavedContacts = useMemo(() => {
    return [...savedContacts].sort((a, b) => {
      const aLabel = `${String(a?.name || "").trim()} ${String(a?.department || "").trim()}`.trim().toLowerCase();
      const bLabel = `${String(b?.name || "").trim()} ${String(b?.department || "").trim()}`.trim().toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [savedContacts]);

  const filteredSavedContacts = useMemo(() => {
    const query = savedContactSearch.trim().toLowerCase();
    if (!query) return sortedSavedContacts;
    return sortedSavedContacts.filter((contact) => {
      const haystack = [
        contact?.name,
        contact?.department,
        contact?.email,
        contact?.phone,
        contact?.number,
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [sortedSavedContacts, savedContactSearch]);

  // Preserve existing history on save
  const [existingHistory, setExistingHistory] = useState(prefill.existingHistory);
  const [createdAtIso, setCreatedAtIso] = useState(prefill.createdAtIso);
  const [createdByEmail, setCreatedByEmail] = useState(prefill.createdByEmail);
  const [createdByUid, setCreatedByUid] = useState(prefill.createdByUid);
  const [existingStatusHistory, setExistingStatusHistory] = useState(prefill.existingStatusHistory);
  const [existingLifecycle, setExistingLifecycle] = useState(prefill.existingLifecycle);
  const [originalBookingData, setOriginalBookingData] = useState(prefill.originalBookingData);
  const savedBookingSignatureRef = useRef("");

  const bookingDraftSignature = JSON.stringify({
    quoteNumber,
    jobNumber,
    client,
    production,
    location,
    po,
    invoiceContactName,
    invoiceContactEmail,
    invoiceContactPhone,
    invoiceDocument,
    invoiceDocumentFile: invoiceDocumentFile?.name || "",
    status,
    shootType,
    statusReasons,
    statusReasonOther,
    isRange,
    useCustomDates,
    enquiryDatesEnabled,
    customDates,
    startDate,
    endDate,
    linkedContinuation,
    notesByDate,
    notes,
    callTime,
    callTimesByDate,
    hasHotel,
    hotelPaidBy,
    hotelNights,
    hotelPricePerNight,
    hasRiggingAddress,
    riggingAddress,
    isSecondPencil,
    isCrewed,
    hasHS,
    hasRiskAssessment,
    offRoadTracking,
    requiredCrewCount,
    employees,
    employeesByDate,
    vehicles,
    vehicleStatus,
    uCraneArmFitted,
    equipment,
    additionalContacts,
    attachments,
    newFiles: newFiles.map((file) => file?.name || "new-file"),
  });

  useEffect(() => {
    if (loading || savedBookingSignatureRef.current) return;
    savedBookingSignatureRef.current = bookingDraftSignature;
  }, [bookingDraftSignature, loading]);

  const isMaintenance = status === "Maintenance";
  const isBickersJob = status === "Bickers";
  const dateEntryEnabled = status !== "Enquiry" || enquiryDatesEnabled;

  // Derived dates (same as create)
  const selectedDates = useMemo(() => {
    if (!dateEntryEnabled) return [];
    if (useCustomDates) return customDates;
    if (!startDate) return [];
    if (isRange && endDate) return enumerateDaysYMD_UTC(startDate, endDate);
    return [startDate];
  }, [dateEntryEnabled, useCustomDates, customDates, startDate, isRange, endDate]);
  const availabilityDateKey = useMemo(
    () => [...selectedDates].filter(Boolean).sort().join("|"),
    [selectedDates]
  );
  const selectedVehicleKey = useMemo(
    () => [...vehicles].filter(Boolean).sort().join("|"),
    [vehicles]
  );
  const retainedPriorityVehicleIds = useMemo(() => {
    if (!originalBookingData) return new Set();

    const originalDates = expandBookingDates(originalBookingData).map(toYMD).filter(Boolean);
    const originalVehicleIds = normalizeVehicleKeysListForLookup(
      originalBookingData.vehicles || [],
      vehicleLookup
    );
    const originalStatusesById = {};

    Object.entries(originalBookingData.vehicleStatus || {}).forEach(([rawKey, rawStatus]) => {
      const [resolvedId] = normalizeVehicleKeysListForLookup([rawKey], vehicleLookup);
      if (resolvedId) originalStatusesById[resolvedId] = rawStatus;
    });

    return new Set(
      originalVehicleIds.filter((vehicleId) =>
        canRetainVehiclePriorityOnEdit({
          originalStatus: originalStatusesById[vehicleId] || originalBookingData.status,
          requestedStatus: vehicleStatus[vehicleId] || status,
          originalDates,
          requestedDates: selectedDates,
        })
      )
    );
  }, [originalBookingData, selectedDates, status, vehicleLookup, vehicleStatus]);

  const hasProductionIdentity = hasBookingProductionIdentity({ client, production });
  const coreFilled = isMaintenance
    ? Boolean((location || "").trim())
    : isBickersJob
    ? hasProductionIdentity
    : Boolean(hasProductionIdentity && (location || "").trim());

  const hasRequiredContact = hasBookingContactDetails(additionalContacts);
  const contactRequirementSatisfied =
    hasRequiredContact ||
    canSaveEnquiryWithoutContact({
      status,
      userEmail: authAccess.realUser?.email || authAccess.user?.email,
    });
  const normalizedJobNumber = normalizeJobNumberForLookup(jobNumber);
  const existingJobDetails = existingJobDetailsByNumber[normalizedJobNumber] || null;
  const existingJobMismatches = existingJobDetails
    ? getExistingJobDetailMismatches(
        { client, production, additionalContacts },
        existingJobDetails
      )
    : [];
  const shouldOfferExistingJobDetails = Boolean(
    existingJobDetails &&
      existingJobMismatches.length &&
      dismissedExistingJobNumber !== normalizedJobNumber
  );
  const existingJobMismatchLabels = existingJobMismatches.map((key) =>
    key === "client" ? "Production Company" : key === "production" ? "Production" : "Contacts"
  );

  const saveTooltip = isMaintenance
    ? !coreFilled
      ? "Fill Location to save"
      : !contactRequirementSatisfied
      ? "Add a contact name with an email or phone number"
      : ""
    : isBickersJob
    ? !coreFilled
      ? "Fill Production or Production Company to save"
      : !contactRequirementSatisfied
      ? "Add a contact name with an email or phone number"
      : ""
    : !coreFilled
    ? "Fill Production or Production Company, and Location to save"
    : !contactRequirementSatisfied
    ? "Add a contact name with an email or phone number"
    : "";

  const selectedVehicleDetails = useMemo(() => {
    return (vehicles || [])
      .map((vehicleId) => vehicleLookup?.byId?.[vehicleId] || null)
      .filter(Boolean);
  }, [vehicles, vehicleLookup]);

  const offRoadEligibility = useMemo(() => {
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      return {
        eligible: false,
        reason: "Select at least one vehicle first.",
        ineligible: [],
      };
    }

    const eligible = selectedVehicleDetails.filter((v) => isOffRoadAllowedGroup(v.group));
    const ineligible = selectedVehicleDetails.filter((v) => !isOffRoadAllowedGroup(v.group));

    if (!eligible.length) {
      const names = ineligible
        .map((v) => v.name || v.registration || "Vehicle")
        .slice(0, 3)
        .join(", ");
      return {
        eligible: false,
        reason: `Select a Bike / Electric Tracking Vehicle / Small Tracking Vehicle first. Selected: ${names}`,
        eligibleVehicles: [],
        ineligible,
      };
    }

    if (ineligible.length) {
      const names = ineligible
        .map((v) => v.name || v.registration || "Vehicle")
        .slice(0, 3)
        .join(", ");
      return {
        eligible: true,
        reason: `Applies to eligible off-road vehicles only. Still checking road legality for: ${names}`,
        eligibleVehicles: eligible,
        ineligible,
      };
    }

    return { eligible: true, reason: "", eligibleVehicles: eligible, ineligible: [] };
  }, [selectedVehicleDetails, vehicles]);

  const bookingWindowEnd = useMemo(() => {
    const sorted = [...(selectedDates || [])].map((d) => String(d || "").trim()).filter(Boolean).sort();
    return sorted[sorted.length - 1] || toYmd(new Date());
  }, [selectedDates]);

  /* ────────────────────────────────────────────────────────────
      Allocated crew count is display-only; crewed is always manual.
  ───────────────────────────────────────────────────────────── */
  const allocatedCrewCount = useMemo(() => {
    const selectedCount = employees.filter(
      (e) => e?.name && e.name !== "Other"
    ).length;

    const customNames = customEmployee
      ? customEmployee
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];

    return selectedCount + customNames.length;
  }, [employees, customEmployee]);

  /* ────────────────────────────────────────────────────────────
     Load lists + booking
  ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      if (window.localStorage.getItem("debugBookingLoads") === "1") {
        console.log("[booking-load] edit route mounted");
      }
    } catch {
      // Debug logging is optional.
    }
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      if (!bookingId) return;
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load edit booking" });
        setLoading(false);
        return;
      }

      setLoading(!prefill.hasBooking);

      const bookingLoadStartedAt =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const referenceDataPromise = loadBookingFormReferenceData(db, { accessState: dataAccessState });
      const existingJobDetailsPromise = getDocs(
        tenantCollectionQuery(db, "bookings", dataAccessState)
      ).catch((err) => {
        if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "load edit job-number details" })) {
          console.warn("Failed loading existing job-number details:", err);
        }
        return null;
      });
      const bookingDocSnap = await getDoc(doc(db, "bookings", bookingId));

      if (!bookingDocSnap.exists()) {
        systemDialogs.showSystemNotification("Booking not found.");
        router.push(returnHref);
        return;
      }

      const bookingData = { id: bookingDocSnap.id, ...bookingDocSnap.data() };
      try {
        if (window.localStorage.getItem("debugBookingLoads") === "1") {
          const now =
            typeof performance !== "undefined" && typeof performance.now === "function"
              ? performance.now()
              : Date.now();
          console.log("[booking-load] edit booking doc loaded", Math.round(now - bookingLoadStartedAt), "ms");
        }
      } catch {
        // Debug logging is optional.
      }
      setOriginalBookingData(bookingDocSnap.data() || {});

      // ---- Prefill booking fields ----
      setQuoteNumber(quoteNumberInputValue(bookingData));
      setJobNumber(bookingData.jobNumber || "");
      setClient(bookingData.client || "");
      setProduction(bookingData.production || "");
      setLocation(bookingData.location || "");
      setShowInvoicingDetails(Boolean(bookingData.po || bookingData.invoiceContactName || bookingData.invoiceContactEmail || bookingData.invoiceContactPhone || bookingData.invoiceDocument));
      setPo(bookingData.po || "");
      setInvoiceContactName(bookingData.invoiceContactName || "");
      setInvoiceContactEmail(bookingData.invoiceContactEmail || "");
      setInvoiceContactPhone(bookingData.invoiceContactPhone || "");
      setInvoiceDocument(bookingData.invoiceDocument && typeof bookingData.invoiceDocument === "object" ? bookingData.invoiceDocument : null);
      setInvoiceDocumentFile(null);
      setQuoteDraft(bookingData.quote && typeof bookingData.quote === "object" ? bookingData.quote : null);
      setQuoteDrafts(
        Array.isArray(bookingData.quoteVersions)
          ? bookingData.quoteVersions.filter((entry) => entry && typeof entry === "object")
          : []
      );
      setStatus(bookingData.status || "Confirmed");
      setShootType(bookingData.shootType || "Day");

      setStatusReasons(
        Array.isArray(bookingData.statusReasons) ? bookingData.statusReasons : []
      );
      setStatusReasonOther(bookingData.statusReasonOther || "");
      setLinkedContinuation(normaliseLinkedContinuation(bookingData.linkedContinuation));

      // flags
      setIsSecondPencil(Boolean(bookingData.isSecondPencil));
      setIsCrewed(Boolean(bookingData.isCrewed)); //  manual stored value
      setHasHS(Boolean(bookingData.hasHS));
      setHasRiskAssessment(Boolean(bookingData.hasRiskAssessment));
      setOffRoadTracking(Boolean(bookingData.offRoadTracking));

      // crew requirement (kept as guidance)
      const req = Number(bookingData.requiredCrewCount);
      setRequiredCrewCount(Number.isFinite(req) ? req : 1);

      // notes/call/hotel/rigging
      setNotes(bookingData.notes || "");
      setNotesByDate(
        bookingData.notesByDate && typeof bookingData.notesByDate === "object"
          ? bookingData.notesByDate
          : {}
      );
      setCallTime(bookingData.callTime || "");
      setCallTimesByDate(
        bookingData.callTimesByDate &&
          typeof bookingData.callTimesByDate === "object"
          ? bookingData.callTimesByDate
          : {}
      );

      //  HOTEL (supports likely legacy keys too)
      const loadedHasHotel = Boolean(
        bookingData.hasHotel ??
          bookingData.hotelBooked ??
          bookingData.isHotelBooked ??
          bookingData.hotel
      );
      setHasHotel(loadedHasHotel);

      const paidBy =
        bookingData.hotelPaidBy ??
        bookingData.hotelPaid ??
        bookingData.hotelPayer ??
        "";
      setHotelPaidBy(String(paidBy || ""));

      const nights =
        bookingData.hotelNights ??
        bookingData.nights ??
        bookingData.hotelNightCount ??
        "";
      setHotelNights(
        nights === 0 || nights ? String(nights) : ""
      );

      const pppn =
        bookingData.hotelPricePerNight ??
        bookingData.pricePerNight ??
        bookingData.hotelRate ??
        bookingData.hotelCostPerNight ??
        "";
      setHotelPricePerNight(toMoney(pppn));

      setHasRiggingAddress(Boolean(bookingData.hasRiggingAddress));
      setRiggingAddress(bookingData.riggingAddress || "");

      // employees
      const rawEmployees = Array.isArray(bookingData.employees)
        ? bookingData.employees
        : [];
      const cleanedEmployees = rawEmployees.length
        ? uniqEmpObjects(
            rawEmployees.map((e) =>
              typeof e === "string" ? { role: "Precision Driver", name: e } : e
            )
          )
        : [];
      setEmployees(cleanedEmployees);

      // employeesByDate
      setEmployeesByDate(
        bookingData.employeesByDate &&
          typeof bookingData.employeesByDate === "object"
          ? bookingData.employeesByDate
          : {}
      );

      setCustomEmployee("");

      // vehicles (normalise to ids)
      const rawVehicles = Array.isArray(bookingData.vehicles)
        ? bookingData.vehicles
        : [];
      const vehicleIds = fallbackVehicleKeys(rawVehicles);
      setVehicles(vehicleIds);
      setVehicleGroups((prev) => mergeSelectedVehiclesIntoGroups(prev, rawVehicles));

      const vs =
        bookingData.vehicleStatus && typeof bookingData.vehicleStatus === "object"
          ? bookingData.vehicleStatus
          : {};
      // ensure statuses exist for selected vehicles
      const vsFixed = { ...vs };
      vehicleIds.forEach((vid) => {
        if (!vsFixed[vid]) vsFixed[vid] = bookingData.status || "Confirmed";
      });
      setVehicleStatus(vsFixed);
      setUCraneArmFitted(normalizeUCraneArmFitted(bookingData.uCraneArmFitted));

      // equipment
      const rawEquip = Array.isArray(bookingData.equipment)
        ? bookingData.equipment
        : [];
      const equipNames = rawEquip
        .map((x) => (typeof x === "string" ? x : x?.name))
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      setEquipment(Array.from(new Set(equipNames)));
      setEquipmentGroups((prev) => mergeSelectedEquipmentIntoGroups(prev, equipNames));

      // contacts
      const rawContacts = Array.isArray(bookingData.additionalContacts)
        ? bookingData.additionalContacts
        : [];
      setAdditionalContacts(
        rawContacts.map((c) => ({
          department: c.department || "",
          departmentOther: "",
          name: c.name || "",
          email: c.email || "",
          phone: c.phone || "",
        }))
      );

      // attachments
      const rawAtt = Array.isArray(bookingData.attachments)
        ? bookingData.attachments
        : [];
      setAttachments(rawAtt);

      // created meta/history
      setExistingHistory(Array.isArray(bookingData.history) ? bookingData.history : []);
      setExistingStatusHistory(
        Array.isArray(bookingData.statusHistory) ? bookingData.statusHistory : []
      );
      setExistingLifecycle(
        bookingData.lifecycle && typeof bookingData.lifecycle === "object"
          ? bookingData.lifecycle
          : null
      );
      setCreatedAtIso(bookingData.createdAt || null);
      setCreatedByEmail(bookingData.createdBy || null);
      setCreatedByUid(bookingData.createdByUid || null);

      // dates mode reconstruction
      const bd = Array.isArray(bookingData.bookingDates) ? bookingData.bookingDates : [];
      const sY = toYMD(bookingData.startDate);
      const eY = toYMD(bookingData.endDate);
      const dY = toYMD(bookingData.date);
      const loadedHasDates = Boolean(sY || eY || dY || bd.length);
      setEnquiryDatesEnabled(bookingData.enquiryDatesEnabled ?? (bookingData.status !== "Enquiry" || loadedHasDates));

      if (sY && eY) {
        setUseCustomDates(false);
        setIsRange(true);
        setStartDate(sY);
        setEndDate(eY);
        setCustomDates([]);
      } else if (dY) {
        setUseCustomDates(false);
        setIsRange(false);
        setStartDate(dY);
        setEndDate("");
        setCustomDates([]);
      } else if (bd.length) {
        // If bookingDates are consecutive, prefer range UI; otherwise custom dates UI
        const sorted = [...bd].sort();
        const consecutive =
          sorted.length > 1
            ? enumerateDaysYMD_UTC(sorted[0], sorted[sorted.length - 1]).length ===
              sorted.length
            : false;

        if (consecutive && sorted.length > 1) {
          setUseCustomDates(false);
          setIsRange(true);
          setStartDate(sorted[0]);
          setEndDate(sorted[sorted.length - 1]);
          setCustomDates([]);
        } else if (sorted.length === 1) {
          setUseCustomDates(false);
          setIsRange(false);
          setStartDate(sorted[0]);
          setEndDate("");
          setCustomDates([]);
        } else {
          setUseCustomDates(true);
          setIsRange(false);
          setCustomDates(sorted);
          setStartDate("");
          setEndDate("");
        }
      } else {
        setUseCustomDates(false);
        setIsRange(false);
        setStartDate("");
        setEndDate("");
        setCustomDates([]);
      }

      setLoading(false);
      existingJobDetailsPromise.then((bookingSnap) => {
        if (!bookingSnap) return;
        setExistingJobDetailsByNumber(
          buildExistingJobDetailsLookup(
            bookingSnap.docs
              .filter((docSnap) => docSnap.id !== bookingId)
              .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          )
        );
      });
      try {
        const referenceData = await referenceDataPromise;

        setEmployeeList(referenceData.employeeList || []);
        setFreelancerList(referenceData.freelancerList || []);
        setNameToCode(referenceData.nameToCode || {});
        setVehicleGroups(mergeSelectedVehiclesIntoGroups(referenceData.vehicleGroups || {}, rawVehicles));
        setVehicleLookup(referenceData.vehicleLookup || { byId: {}, byReg: {}, byName: {} });
        setEquipmentGroups(mergeSelectedEquipmentIntoGroups(referenceData.equipmentGroups || {}, equipNames));
        setOpenEquipGroups(referenceData.openEquipGroups || {});

        const nextVehicleLookup = referenceData.vehicleLookup || { byId: {}, byReg: {}, byName: {} };
        const normalizedVehicleIds = normalizeVehicleKeysListForLookup(rawVehicles, nextVehicleLookup);
        const resolvedVehicleIds = normalizedVehicleIds.length > 0 ? normalizedVehicleIds : vehicleIds;
        setVehicles(resolvedVehicleIds);
        setVehicleStatus((prev) => {
          const next = { ...prev };
          resolvedVehicleIds.forEach((vid) => {
            if (!next[vid]) next[vid] = bookingData.status || "Confirmed";
          });
          Object.keys(next).forEach((vid) => {
            if (!resolvedVehicleIds.includes(vid)) delete next[vid];
          });
          return next;
        });
      } catch (err) {
        console.error("Failed loading edit page supporting data:", err);
      }
    };

    loadAll().catch((err) => {
      if (prefill.hasBooking) {
        console.warn("Edit booking re-read failed; using dashboard cached booking:", {
          code: err?.code || "",
          message: err?.message || String(err || ""),
          bookingId,
        });
        setLoading(false);
        return;
      }
      if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "load edit booking" })) {
        console.error("Failed loading edit page:", err);
      }
      systemDialogs.showSystemNotification(`Failed to load booking${err?.code ? ` (${err.code})` : ""}.`);
      router.push(returnHref);
    });
  }, [accessKey, bookingId, dataAccessState, prefill.hasBooking, returnHref, router]);

  useEffect(() => {
    const dates = availabilityDateKey.split("|").filter(Boolean);
    if (!dates.length) {
      setAllBookings([]);
      setHolidayBookings([]);
      setUnavailableNotes([]);
      setMaintenanceBookings([]);
      return undefined;
    }
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "read edit booking availability" });
      return undefined;
    }

    let cancelled = false;
    loadBookingAvailabilityForDates(db, dates, { accessState: dataAccessState, currentBookingId: bookingId })
      .then((availability) => {
        if (cancelled) return;
        setAllBookings(availability.bookings || []);
        setHolidayBookings(availability.holidays || []);
        setUnavailableNotes(availability.unavailableNotes || []);
        setMaintenanceBookings(availability.maintenanceBookings || []);
      })
      .catch((err) => {
        if (!cancelled && !handleFirestoreAccessError(err, { collectionName: "bookings", operation: "read edit booking availability" })) {
          console.error("Failed loading edit booking availability data:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessKey, availabilityDateKey, bookingId, dataAccessState]);

  useEffect(() => {
    const vehicleIds = selectedVehicleKey.split("|").filter(Boolean);
    if (!vehicleIds.length) {
      setVehicleChecks([]);
      return undefined;
    }
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicleChecks", operation: "read edit vehicle checks" });
      return undefined;
    }

    let cancelled = false;
    loadVehicleChecksForVehicles(db, vehicleIds, { accessState: dataAccessState })
      .then((checks) => {
        if (!cancelled) setVehicleChecks(checks || []);
      })
      .catch((err) => {
        if (!cancelled && !handleFirestoreAccessError(err, { collectionName: "vehicleChecks", operation: "read edit vehicle checks" })) {
          console.error("Failed loading vehicle check data:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessKey, dataAccessState, selectedVehicleKey]);

  useEffect(() => {
    if (!isBickersJob) return;
    setHasHS(false);
    setHasRiskAssessment(false);
  }, [isBickersJob]);

  useEffect(() => {
    if (!offRoadTracking) return;
    if (offRoadEligibility.eligible) return;
    setOffRoadTracking(false);
  }, [offRoadEligibility.eligible, offRoadTracking]);

  /* ────────────────────────────────────────────────────────────
     Conflicts (exclude current booking)
  ───────────────────────────────────────────────────────────── */
  const overlapping = useMemo(() => {
    if (!selectedDates.length) return [];
    return (allBookings || [])
      .filter((b) => b?.id && b.id !== bookingId)
      .filter((b) => anyDateOverlap(expandBookingDates(b), selectedDates));
  }, [allBookings, selectedDates, bookingId]);

  const allowsLinkedResourceOverlap = useCallback(
    (booking, resourceType, resourceKey, dates = selectedDates) =>
      linkedContinuationAllowsResourceOverlap({
        currentBookingId: bookingId,
        currentContinuation: linkedContinuation,
        otherBooking: booking,
        overlapDates: overlappingBookingDateKeys(expandBookingDates(booking), dates),
        resourceType,
        resourceKey,
      }),
    [bookingId, linkedContinuation, selectedDates]
  );

  const { bookedVehicleIds, heldVehicleIds, vehicleBlockingStatusById, vehicleBlockingStatusesById } = useMemo(() => {
    const blockingById = {};
    const blockingStatusesById = {};
    const booked = [];
    const held = [];

    overlapping.forEach((b) => {
      const keys = normalizeVehicleKeysListForLookup(b.vehicles || [], vehicleLookup);
      const vmap = b.vehicleStatus || {};

      keys.forEach((vid) => {
        if (allowsLinkedResourceOverlap(b, "vehicle", vid)) return;
        const itemStatus = (vmap[vid] ?? b.status) || "";
        if (!itemStatus) return;

        if (isVehicleBlockingStatus(itemStatus)) {
          if (!blockingStatusesById[vid]) blockingStatusesById[vid] = [];
          if (!blockingStatusesById[vid].includes(itemStatus)) {
            blockingStatusesById[vid].push(itemStatus);
          }
          if (!blockingById[vid]) {
            blockingById[vid] = itemStatus;
            booked.push(vid);
          }
        } else {
          if (!held.includes(vid)) held.push(vid);
        }
      });
    });

    return {
      bookedVehicleIds: booked,
      heldVehicleIds: held,
      vehicleBlockingStatusById: blockingById,
      vehicleBlockingStatusesById: blockingStatusesById,
    };
  }, [overlapping, vehicleLookup, allowsLinkedResourceOverlap]);

  const bookedEquipment = useMemo(() => {
    return overlapping
      .filter(doesBlockBooking)
      .flatMap((b) => (Array.isArray(b.equipment) ? b.equipment : []))
      .map((x) => (typeof x === "string" ? x : x?.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }, [overlapping]);

  const heldEquipment = useMemo(() => {
    return overlapping
      .filter((b) => !doesBlockBooking(b))
      .flatMap((b) => (Array.isArray(b.equipment) ? b.equipment : []))
      .map((x) => (typeof x === "string" ? x : x?.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }, [overlapping]);

  const bookedEmployeeNames = useMemo(() => {
    return overlapping
      .filter(doesBlockBooking)
      .flatMap((b) =>
        (Array.isArray(b.employees) ? b.employees : []).filter((employee) => {
          const name = typeof employee === "string" ? employee : employee?.name;
          return !allowsLinkedResourceOverlap(b, "employee", name);
        })
      )
      .map((e) => (typeof e === "string" ? e : e?.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }, [overlapping, allowsLinkedResourceOverlap]);

  const heldEmployeeNames = useMemo(() => {
    return overlapping
      .filter((b) => !doesBlockBooking(b))
      .flatMap((b) => (Array.isArray(b.employees) ? b.employees : []))
      .map((e) => (typeof e === "string" ? e : e?.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }, [overlapping]);

  const maintenanceVehicleBlocking = useMemo(() => {
    const ids = new Set();
    const reasonById = {};
    const reasonFromType = (booking) => {
      const explicit = String(
        booking?.maintenanceTypeLabel || booking?.maintenanceTypeOther || booking?.type || booking?.maintenanceType || ""
      )
        .trim()
        .toUpperCase();
      if (explicit === "MOT") return "MOT";
      if (explicit === "SERVICE") return "Service";
      return "Maintenance";
    };

    maintenanceBookings.filter(isActiveMaintenanceBooking).forEach((b) => {
      const overlaps = anyDateOverlap(expandMaintenanceBookingDates(b), selectedDates);
      if (!overlaps) return;
      const reason = reasonFromType(b);

      if (Array.isArray(b.vehicles) && b.vehicles.length) {
        b.vehicles.forEach((v) => {
          const resolved = normalizeVehicleKeysListForLookup([v], vehicleLookup);
          resolved.forEach((id) => {
            ids.add(id);
            if (!reasonById[id]) reasonById[id] = reason;
          });
        });
      } else {
        const candidate = b.vehicleId || b.vehicle || b.vehicleName || b.registration || b.reg;
        const resolved = normalizeVehicleKeysListForLookup([candidate], vehicleLookup);
        resolved.forEach((id) => {
          ids.add(id);
          if (!reasonById[id]) reasonById[id] = reason;
        });
      }
    });

    return { ids, reasonById };
  }, [maintenanceBookings, selectedDates, vehicleLookup]);

  const maintenanceEquipmentBlocking = useMemo(() => {
    const names = new Set();
    const reasonByName = {};
    const reasonFromType = (booking) => {
      const explicit = String(
        booking?.maintenanceTypeLabel || booking?.maintenanceTypeOther || booking?.type || booking?.maintenanceType || ""
      )
        .trim()
        .toUpperCase();
      if (explicit === "MOT") return "MOT";
      if (explicit === "SERVICE") return "Service";
      return "Maintenance";
    };

    maintenanceBookings.filter(isActiveMaintenanceBooking).forEach((b) => {
      const overlaps = anyDateOverlap(expandMaintenanceBookingDates(b), selectedDates);
      if (!overlaps) return;
      const reason = reasonFromType(b);

      (Array.isArray(b.equipment) ? b.equipment : [])
        .map((item) => (typeof item === "string" ? item : item?.name))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .forEach((name) => {
          names.add(name);
          if (!reasonByName[name]) reasonByName[name] = reason;
        });
    });

    return { names, reasonByName };
  }, [maintenanceBookings, selectedDates]);

  const complianceVehicleBlocking = useMemo(() => {
    const ids = new Set();
    const reasonById = {};
    const refDate = new Date(`${bookingWindowEnd}T00:00:00`);

    Object.values(vehicleLookup?.byId || {}).forEach((vehicle) => {
      const id = String(vehicle?.id || "").trim();
      if (!id) return;

      const taxStatus = String(vehicle?.taxStatus || "").trim().toLowerCase();
      if (taxStatus === "sorn" || taxStatus === "untaxed" || taxStatus === "no tax") {
        ids.add(id);
        reasonById[id] = taxStatus === "sorn" ? "SORN / off road" : taxStatus.toUpperCase();
        return;
      }

      const motDue = getCanonicalDueDate(vehicle, "mot");
      const serviceDue = getCanonicalDueDate(vehicle, "service");
      const overdueMatch = [
        ["MOT overdue", motDue],
        ["Service overdue", serviceDue],
      ].find(([, due]) => due instanceof Date && !Number.isNaN(due.getTime()) && due < refDate);

      if (overdueMatch) {
        ids.add(id);
        reasonById[id] = overdueMatch[0];
      }
    });

    return { ids, reasonById };
  }, [bookingWindowEnd, vehicleLookup]);

  const defectVehicleBlocking = useMemo(() => {
    const ids = new Set();
    const reasonById = {};

    (vehicleChecks || []).forEach((check) => {
      if (!Array.isArray(check?.items)) return;

      const hasImmediateDefect = check.items.some((item) => {
        const review = item?.review || {};
        const category = String(review.category || review.route || review.bucket || "").trim().toLowerCase();
        const maintenanceStatus = String(item?.maintenance?.status || "").trim().toLowerCase();
        return item?.status === "defect" && review.status === "approved" && category === "immediate" && maintenanceStatus !== "resolved";
      });

      if (!hasImmediateDefect) return;

      const candidates = [check.vehicleId, check.vehicle, check.registration, check.reg];
      const resolved = normalizeVehicleKeysListForLookup(candidates, vehicleLookup);
      resolved.forEach((id) => {
        ids.add(id);
        if (!reasonById[id]) reasonById[id] = "Open safety defect";
      });
    });

    return { ids, reasonById };
  }, [vehicleChecks, vehicleLookup]);

  /* ────────────────────────────────────────────────────────────
     Holiday checks
  ───────────────────────────────────────────────────────────── */
  const isEmployeeOnHolidayForDates = (employeeName, dates) => {
    const target = String(employeeName || "").trim().toLowerCase();
    const dateSet = new Set((dates || []).map((d) => String(d || "").slice(0, 10)));
    if (!target || !dateSet.size) return false;
    return holidayBookings.some((h) => {
      const holidayEmployee = String(h.employee || h.employeeName || "").trim().toLowerCase();
      return holidayEmployee === target && holidayDateKeysFromRecord(h).some((dateKey) => dateSet.has(dateKey));
    });
  };

  const getEmployeeUnavailableNoteForDates = (employeeName, dates) => {
    const target = String(employeeName || "").trim().toLowerCase();
    if (!target || !dates?.length) return null;
    const dateSet = new Set((dates || []).map((d) => String(d || "").slice(0, 10)));

    return (
      unavailableNotes.find((note) => {
        const noteEmployee = String(note.employee || note.employeeName || "").trim().toLowerCase();
        if (noteEmployee !== target) return false;
        const noteDate = String(note.date || note.startDate || "").slice(0, 10);
        return noteDate && dateSet.has(noteDate);
      }) || null
    );
  };

  const isEmployeeUnavailableByNoteForDates = (employeeName, dates) =>
    Boolean(getEmployeeUnavailableNoteForDates(employeeName, dates));

  const buildVehicleBlockingMapsFromBookings = (
    bookingRows = [],
    dates = selectedDates,
    continuation = linkedContinuation
  ) => {
    const blockingById = {};
    const blockingStatusesById = {};

    (bookingRows || [])
      .filter((booking) => anyDateOverlap(expandBookingDates(booking), dates))
      .forEach((booking) => {
        const keys = normalizeVehicleKeysListForLookup(booking.vehicles || [], vehicleLookup);
        const vmap = booking.vehicleStatus || {};

        keys.forEach((vid) => {
          const overlapDates = overlappingBookingDateKeys(expandBookingDates(booking), dates);
          if (linkedContinuationAllowsResourceOverlap({
            currentBookingId: bookingId,
            currentContinuation: continuation,
            otherBooking: booking,
            overlapDates,
            resourceType: "vehicle",
            resourceKey: vid,
          })) return;
          const itemStatus = (vmap[vid] ?? booking.status) || "";
          if (!isVehicleBlockingStatus(itemStatus)) return;
          if (!blockingStatusesById[vid]) blockingStatusesById[vid] = [];
          if (!blockingStatusesById[vid].includes(itemStatus)) {
            blockingStatusesById[vid].push(itemStatus);
          }
          if (!blockingById[vid]) blockingById[vid] = itemStatus;
        });
      });

    return { blockingById, blockingStatusesById };
  };

  /* ────────────────────────────────────────────────────────────
     Options that include custom Other names so they stay selectable
  ───────────────────────────────────────────────────────────── */
  const uniqStrings = (arr) =>
    Array.from(new Set((arr || []).map((s) => String(s || "").trim()).filter(Boolean)));

  const selectedNamesByRole = (role) =>
    uniqStrings(
      employees
        .filter((e) => e?.role === role)
        .map((e) => e?.name)
        .filter((n) => n && n !== "Other")
    );

  const driverOptions = useMemo(() => {
    const base = employeeList.map((e) => e?.name).filter(Boolean);
    const selected = selectedNamesByRole("Precision Driver");
    const customSelected = selected.filter((n) => !base.includes(n));
    return uniqStrings([...base, ...customSelected]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeList, employees]);

  const freelancerOptions = useMemo(() => {
    const base = freelancerList.map((e) => e?.name).filter(Boolean);
    const selected = selectedNamesByRole("Freelancer");
    const customSelected = selected.filter((n) => !base.includes(n));
    return [...uniqStrings([...base, ...customSelected]), "Other"];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freelancerList, employees]);

  /* ────────────────────────────────────────────────────────────
     Employee schedule helpers (per-day)
  ───────────────────────────────────────────────────────────── */
  const upsertEmployeeDates = (role, name, add) => {
    setEmployeesByDate((prev) => {
      const next = { ...prev };
      if (add) {
        selectedDates.forEach((d) => {
          if (!d) return;
          const list = Array.isArray(next[d]) ? next[d] : [];
          const exists = list.some((e) => e.name === name && e.role === role);
          if (!exists) next[d] = [...list, { role, name }];
        });
      } else {
        Object.keys(next).forEach((d) => {
          const list = Array.isArray(next[d]) ? next[d] : [];
          const filtered = list.filter((e) => !(e.name === name && e.role === role));
          if (filtered.length) next[d] = filtered;
          else delete next[d];
        });
      }
      return next;
    });
  };

  // Auto-open groups containing selected equipment
  useEffect(() => {
    setOpenEquipGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(equipmentGroups).forEach(([group, items]) => {
        const hasSelected = items?.some((name) => equipment.includes(name));
        if (hasSelected && !next[group]) {
          next[group] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [equipmentGroups, equipment]);

  /* ────────────────────────────────────────────────────────────
     Contacts actions
  ───────────────────────────────────────────────────────────── */
  const handleAddContactRow = () => {
    setAdditionalContacts((prev) => [
      ...prev,
      { department: "", departmentOther: "", name: "", email: "", phone: "" },
    ]);
  };

  const handleUpdateContactRow = (index, key, value) => {
    setAdditionalContacts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  };

  const handleRemoveContactRow = (index) => {
    setAdditionalContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const ensureSavedContactsLoaded = async () => {
    if (savedContactsLoaded || savedContactsLoading) return;
    setSavedContactsLoading(true);
    try {
      const contacts = await loadSavedContacts(db, { accessState: dataAccessState, force: true });
      setSavedContacts(contacts || []);
      setSavedContactsLoaded(true);
    } catch (err) {
      if (!handleFirestoreAccessError(err, { collectionName: "contacts", operation: "load edit saved contacts" })) {
        console.error("Failed loading saved contacts:", err);
      }
    } finally {
      setSavedContactsLoading(false);
    }
  };

  const handleQuickAddSavedContact = (id) => {
    if (!id) return;
    const found = savedContacts.find((c) => c.id === id);
    if (!found) return;
    setAdditionalContacts((prev) => [
      ...prev,
      {
        department: found.department || "",
        departmentOther: "",
        name: found.name || "",
        email: found.email || "",
        phone: found.phone || found.number || "",
      },
    ]);
  };

  /* ────────────────────────────────────────────────────────────
     Vehicle toggle
  ───────────────────────────────────────────────────────────── */
  const toggleVehicle = (vehicleId, checked, selectedStatus = "") => {
    setVehicles((prev) =>
      checked ? uniq([...prev, vehicleId]) : prev.filter((v) => v !== vehicleId)
    );
    setVehicleStatus((prev) => {
      const next = { ...prev };
      if (checked) {
        if (selectedStatus) next[vehicleId] = selectedStatus;
        else if (!next[vehicleId]) next[vehicleId] = status;
      } else {
        delete next[vehicleId];
      }
      return next;
    });
    if (!checked) {
      setUCraneArmFitted((prev) => {
        const next = { ...prev };
        delete next[vehicleId];
        return next;
      });
    }
  };

  /* ────────────────────────────────────────────────────────────
     Attachment remove (optional but useful on edit)
  ───────────────────────────────────────────────────────────── */
  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ────────────────────────────────────────────────────────────
     Submit (UPDATE)
  ───────────────────────────────────────────────────────────── */
  const selectedVehicleConflictLabels = (
    selectedIds,
    statuses,
    blockingStatuses = vehicleBlockingStatusesById,
    blockingStatus = vehicleBlockingStatusById
  ) =>
    (selectedIds || [])
      .filter((vehicleId) =>
        existingVehicleStatusConflictsWithRequested(
          blockingStatusesForPriorityEdit(
            blockingStatuses[vehicleId] || [],
            retainedPriorityVehicleIds.has(vehicleId)
          ),
          statuses?.[vehicleId] || status
        )
      )
      .map((vehicleId) => {
        const vehicle = vehicleLookup?.byId?.[vehicleId] || {};
        const label = [vehicle.name, vehicle.registration].filter(Boolean).join(" - ") || "Unknown vehicle";
        const existingStatus = (blockingStatuses[vehicleId] || [blockingStatus[vehicleId] || "booked"]).join(", ");
        return `${label} (${existingStatus})`;
      });

  const handleUpdate = async (options = {}) => {
    const { navigateOnSuccess = true } = options;
    if (!bookingId) return false;

    if (dateEntryEnabled) {
      if (useCustomDates) {
        if (!customDates.length) {
          systemDialogs.showSystemNotification("Please select at least one date.");
          return false;
        }
      } else {
        if (!startDate) {
          systemDialogs.showSystemNotification("Please select a start date.");
          return false;
        }
        if (isRange && !endDate) {
          systemDialogs.showSystemNotification("Please select an end date.");
          return false;
        }
      }
    }

    if (!coreFilled) {
      const missing = [];
      if (!isMaintenance && !hasProductionIdentity) missing.push("Production or Production Company");
      if (!isBickersJob && !(location || "").trim()) missing.push("Location");
      systemDialogs.showSystemNotification("Please provide: " + missing.join(", ") + ".");
      return false;
    }

    if (!contactRequirementSatisfied) {
      setContactsExpanded(true);
      ensureSavedContactsLoaded();
      systemDialogs.showSystemNotification("Please add a contact name with either an email address or phone number.");
      return false;
    }

    const mismatchedQuoteAttachments = findMismatchedQuoteAttachments(jobNumber, [
      ...(attachments || []),
      ...(newFiles || []),
    ]);
    if (mismatchedQuoteAttachments.length) {
      const quoteJobs = Array.from(
        new Set(mismatchedQuoteAttachments.map(({ quoteJobNumber }) => quoteJobNumber))
      ).join(", ");
      systemDialogs.showSystemNotification(
        `${mismatchedQuoteAttachments.length} quote ${
          mismatchedQuoteAttachments.length === 1 ? "file belongs" : "files belong"
        } to another job (${quoteJobs}). Remove ${
          mismatchedQuoteAttachments.length === 1 ? "it" : "them"
        } or correct the job number before saving.`
      );
      return false;
    }

    const needsReason = ["Lost", "Postponed", "Cancelled"].includes(status);
    if (needsReason) {
      if (!statusReasons.length) {
        systemDialogs.showSystemNotification("Please choose at least one reason.");
        return false;
      }
      if (statusReasons.includes("Other") && !statusReasonOther.trim()) {
        systemDialogs.showSystemNotification("Please enter the 'Other' reason.");
        return false;
      }
    }

    const customNames = customEmployee
      ? customEmployee.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    const selectedEmployees = uniqEmpObjects([
      ...employees.filter((e) => e?.name && e.name !== "Other"),
      ...customNames.map((n) => ({ role: "Precision Driver", name: n })),
    ]);
    const inactiveBooking = isInactiveBookingStatus(status);
    const cleanedEmployees = inactiveBooking ? [] : selectedEmployees;
    const vehicleStatusForSave = inactiveBooking
      ? buildSynchronizedVehicleStatus({ vehicles, vehicleStatus }, status)
      : vehicleStatus;
    const uCraneArmFittedForSave = buildUCraneArmFittedForSave({
      vehicleIds: vehicles,
      vehicleLookup,
      configuration: uCraneArmFitted,
    });

    const bookingDates = dateEntryEnabled ? selectedDates : [];
    let availabilityForSave = null;
    if (bookingDates.length) {
      try {
        availabilityForSave = await loadBookingAvailabilityForDates(db, bookingDates, {
          accessState: dataAccessState,
          currentBookingId: bookingId,
        });
        setAllBookings(availabilityForSave.bookings || []);
        setHolidayBookings(availabilityForSave.holidays || []);
        setUnavailableNotes(availabilityForSave.unavailableNotes || []);
        setMaintenanceBookings(availabilityForSave.maintenanceBookings || []);
      } catch (err) {
        if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "check edit booking availability" })) {
          console.error("Failed checking booking availability before update:", err);
        }
        systemDialogs.showSystemNotification("Could not check availability for the selected dates. Please try saving again.");
        return false;
      }
    }

    const previousBookingForSave = linkedContinuation
      ? (availabilityForSave?.bookings || allBookings || []).find(
          (booking) => booking?.id === linkedContinuation.fromBookingId
        )
      : null;
    const linkedContinuationResult = buildLinkedContinuationPayload({
      formValue: isMaintenance ? null : linkedContinuation,
      previousBooking: previousBookingForSave
        ? {
            ...previousBookingForSave,
            vehicles: normalizeVehicleKeysListForLookup(
              previousBookingForSave.vehicles || [],
              vehicleLookup
            ),
          }
        : null,
      bookingDates,
      vehicles,
      employees: cleanedEmployees,
    });
    if (linkedContinuationResult.error) {
      systemDialogs.showSystemNotification(linkedContinuationResult.error);
      return false;
    }
    const linkedContinuationForSave = linkedContinuationResult.value;

    const freshVehicleBlocking = availabilityForSave
      ? buildVehicleBlockingMapsFromBookings(
          availabilityForSave.bookings || [],
          bookingDates,
          linkedContinuationForSave
        )
      : null;

    const vehicleConflicts = selectedVehicleConflictLabels(
      vehicles,
      vehicleStatusForSave,
      freshVehicleBlocking?.blockingStatusesById || vehicleBlockingStatusesById,
      freshVehicleBlocking?.blockingById || vehicleBlockingStatusById
    );
    if (bookingDates.length && vehicleConflicts.length) {
      systemDialogs.showSystemNotification(
        `One or more selected vehicles already have a booking that conflicts with the selected vehicle status on the selected date(s):\n\n${vehicleConflicts.join(
          "\n"
        )}\n\nUse Second Pencil where the vehicle is already Confirmed or First Pencil. Vehicles already on Second Pencil cannot be booked again for those date(s).`
      );
      return false;
    }

    const filteredNotesByDate = {};
    bookingDates.forEach((d) => {
      filteredNotesByDate[d] = notesByDate[d] || "";
      if (typeof notesByDate[`${d}-other`] !== "undefined")
        filteredNotesByDate[`${d}-other`] = notesByDate[`${d}-other`];
      if (typeof notesByDate[`${d}-travelMins`] !== "undefined")
        filteredNotesByDate[`${d}-travelMins`] = notesByDate[`${d}-travelMins`];
    });

    const cleanedSet = new Set(cleanedEmployees.map(employeesKey));
    let employeesByDatePayload = {};

    if (bookingDates.length && cleanedEmployees.length) {
      bookingDates.forEach((date) => {
        const fromState = employeesByDate[date];
        const baseList =
          Array.isArray(fromState) && fromState.length ? fromState : cleanedEmployees;
        const filtered = baseList.filter((e) => cleanedSet.has(employeesKey(e)));
        if (filtered.length) employeesByDatePayload[date] = filtered;
      });

      if (!Object.keys(employeesByDatePayload).length) {
        bookingDates.forEach((date) => {
          employeesByDatePayload[date] = [...cleanedEmployees];
        });
      }
    }

    const holidaysForSave = availabilityForSave?.holidays || holidayBookings;
    const unavailableNotesForSave = availabilityForSave?.unavailableNotes || unavailableNotes;
    const isEmployeeOnHolidayForSave = (employeeName, dates) => {
      const target = String(employeeName || "").trim().toLowerCase();
      const dateSet = new Set((dates || []).map((d) => String(d || "").slice(0, 10)));
      if (!target || !dateSet.size) return false;
      return (holidaysForSave || []).some((holiday) => {
        const holidayEmployee = String(holiday.employee || holiday.employeeName || "").trim().toLowerCase();
        return (
          holidayEmployee === target &&
          holidayDateKeysFromRecord(holiday).some((dateKey) => dateSet.has(dateKey))
        );
      });
    };
    const getEmployeeUnavailableNoteForSave = (employeeName, dates) => {
      const target = String(employeeName || "").trim().toLowerCase();
      const dateSet = new Set((dates || []).map((d) => String(d || "").slice(0, 10)));
      if (!target || !dateSet.size) return null;
      return (
        (unavailableNotesForSave || []).find((note) => {
          const noteEmployee = String(note.employee || note.employeeName || "").trim().toLowerCase();
          const noteDate = String(note.date || note.startDate || "").slice(0, 10);
          return noteEmployee === target && noteDate && dateSet.has(noteDate);
        }) || null
      );
    };

    for (const employee of cleanedEmployees) {
      const datesForEmp = bookingDates.filter((d) => {
        const list = employeesByDatePayload[d] || [];
        return list.some((e) => e.name === employee.name && e.role === employee.role);
      });
      if (datesForEmp.length && isEmployeeOnHolidayForSave(employee.name, datesForEmp)) {
        systemDialogs.showSystemNotification(`${employee.name} is on holiday for one or more selected dates.`);
        return;
      }
      const unavailableNote = getEmployeeUnavailableNoteForSave(employee.name, datesForEmp);
      if (datesForEmp.length && unavailableNote) {
        systemDialogs.showSystemNotification(
          `${employee.name} is marked unavailable on a note for one or more selected dates.${unavailableNote.text ? `\n\nNote: ${unavailableNote.text}` : ""}`
        );
        return;
      }
    }

    const employeeCodes = cleanedEmployees
      .map((e) => nameToCode[String(e?.name || "").trim().toLowerCase()])
      .filter(Boolean);

    const callTimePayload = buildBookingCallTimePayload({
      bookingDates,
      callTimesByDate,
      isRange,
      useCustomDates,
    });

    let nextAttachments = [...(attachments || [])];
    let nextInvoiceDocument = invoiceDocument || null;

    setSaving(true);
    setPdfProgress(0);

    // Upload new files if any
    if (newFiles.length > 0 || invoiceDocumentFile) {
      const uploaded = [];
      const { storage, ref, uploadBytesResumable, getDownloadURL } =
        await getFirebaseStorageTools();
      for (const file of newFiles) {
        const safeName = `${jobNumber || "nojob"}_${file.name}`.replace(/\s+/g, "_");
        const folder = file.name.toLowerCase().endsWith(".pdf") ? "booking_pdfs" : "quotes";
        const storageRefObj = ref(storage, companyStoragePath(dataAccessState, `${folder}/${safeName}`));

        const contentType =
          file.type ||
          (safeName.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : safeName.toLowerCase().endsWith(".xlsx")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : safeName.toLowerCase().endsWith(".xls")
            ? "application/vnd.ms-excel"
            : safeName.toLowerCase().endsWith(".csv")
            ? "text/csv"
            : safeName.toLowerCase().endsWith(".jpg") || safeName.toLowerCase().endsWith(".jpeg")
            ? "image/jpeg"
            : "application/octet-stream");

        const task = uploadBytesResumable(storageRefObj, file, { contentType });

        await new Promise((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) =>
              setPdfProgress(
                Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
              ),
            (err) => reject(err),
            async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              uploaded.push({
                url,
                name: file.name,
                contentType,
                size: file.size,
                folder,
              });
              resolve();
            }
          );
        });
      }

      nextAttachments = [...nextAttachments, ...uploaded];

      if (invoiceDocumentFile) {
        const safeName = `${jobNumber || "nojob"}_invoice_${invoiceDocumentFile.name}`.replace(/\s+/g, "_");
        const storagePath = companyStoragePath(dataAccessState, `invoice_documents/${safeName}`);
        const storageRefObj = ref(storage, storagePath);
        const contentType =
          invoiceDocumentFile.type ||
          (safeName.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : safeName.toLowerCase().endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : safeName.toLowerCase().endsWith(".doc")
            ? "application/msword"
            : safeName.toLowerCase().endsWith(".xlsx")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : safeName.toLowerCase().endsWith(".xls")
            ? "application/vnd.ms-excel"
            : safeName.toLowerCase().endsWith(".csv")
            ? "text/csv"
            : safeName.toLowerCase().endsWith(".jpg") || safeName.toLowerCase().endsWith(".jpeg")
            ? "image/jpeg"
            : safeName.toLowerCase().endsWith(".png")
            ? "image/png"
            : "application/octet-stream");

        const task = uploadBytesResumable(storageRefObj, invoiceDocumentFile, { contentType });

        await new Promise((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) =>
              setPdfProgress(
                Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
              ),
            (err) => reject(err),
            async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              nextInvoiceDocument = {
                url,
                name: invoiceDocumentFile.name,
                contentType,
                size: invoiceDocumentFile.size,
                storagePath,
                uploadedAt: new Date().toISOString(),
                purpose: "invoice-details",
              };
              resolve();
            }
          );
        });
      }
    }

    const firstUrl = nextAttachments[0]?.url || null;

    const additionalContactsToSave = (additionalContacts || [])
      .map((c) => ({
        department:
          c.department === "Other" && c.departmentOther ? c.departmentOther : c.department || "",
        name: (c.name || "").trim(),
        email: (c.email || "").trim(),
        phone: (c.phone || "").trim(),
      }))
      .filter((c) => c.name || c.email || c.phone || c.department);

    const user = auth.currentUser;

    const req = Number(requiredCrewCount);
    const allocatedAtSave = cleanedEmployees.length;

    const manualCrewed = inactiveBooking ? false : Boolean(isCrewed);

    //  Hotel payload
    const hotelPaidByClean = hasHotel ? String(hotelPaidBy || "").trim() : "";
    const hotelNightsNum = hasHotel ? Number(String(hotelNights || "").trim()) : 0;
    const hotelPricePerNightNum = hasHotel
      ? Number(String(hotelPricePerNight || "").trim())
      : 0;

    const nowIso = new Date().toISOString();
    const previousStatus = originalBookingData?.status || "Confirmed";
    const statusChanged = previousStatus !== status;
    const baseStatusHistory = Array.isArray(existingStatusHistory) && existingStatusHistory.length
      ? existingStatusHistory
      : buildInitialStatusHistory(previousStatus, createdAtIso || nowIso, {
          email: createdByEmail || user?.email || "Unknown",
          uid: createdByUid || user?.uid || "",
        });
    const ensuredStatusHistory = statusChanged
      ? buildNextStatusHistory(baseStatusHistory, previousStatus, status, nowIso, {
          email: user?.email || "Unknown",
          uid: user?.uid || "",
        })
      : baseStatusHistory;
    const nextLifecycleBase = existingLifecycle && typeof existingLifecycle === "object"
      ? existingLifecycle
      : buildInitialLifecycle(previousStatus, createdAtIso || nowIso);
    const nextLifecycle = buildNextLifecycle(nextLifecycleBase, previousStatus, status, nowIso);

    const derivedFields = buildBookingDerivedFields({
      status,
      bookingDates,
      createdAt: createdAtIso || nowIso,
      employees: cleanedEmployees,
      vehicles,
      equipment,
      additionalContacts: additionalContactsToSave,
      attachments: nextAttachments,
      requiredCrewCount: Number.isFinite(req) ? req : 0,
      allocatedCrewCount: allocatedAtSave,
    });

    const quoteNumbersForSave = normalizePublicQuoteNumbers(quoteNumber);
    const primaryQuoteNumber = quoteNumbersForSave[0] || "";

    const payload = {
      quoteNumber: primaryQuoteNumber,
      quoteNumbers: quoteNumbersForSave,
      jobNumber,
      client,
      production,
      location,
      po: String(po || "").trim(),
      invoiceContactName: String(invoiceContactName || "").trim(),
      invoiceContactEmail: String(invoiceContactEmail || "").trim(),
      invoiceContactPhone: String(invoiceContactPhone || "").trim(),
      invoiceDocument: nextInvoiceDocument,

      employees: cleanedEmployees,
      employeesByDate: employeesByDatePayload,
      employeeCodes,
      ...(inactiveBooking && {
        crew: [],
        crewMembers: [],
        staff: [],
        assignedEmployeeCodes: [],
        employeeAssignmentsByDate: {},
        employeeCodesByDate: {},
        assignedEmployeeCodesByDate: {},
      }),

      vehicles,
      vehicleStatus: vehicleStatusForSave,
      uCraneArmFitted: uCraneArmFittedForSave,
      equipment,
      linkedContinuation: linkedContinuationForSave,

      isSecondPencil,
      isCrewed: manualCrewed,
      hasHS,
      hasRiskAssessment,
      offRoadTracking,
      notes,

      requiredCrewCount: Number.isFinite(req) ? req : 0,
      allocatedCrewCount: allocatedAtSave,

      notesByDate: filteredNotesByDate,
      status,
      enquiryDatesEnabled: dateEntryEnabled,
      bookingDates,
      shootType,

      attachments: nextAttachments,
      quoteUrl: firstUrl || null,
      pdfURL: firstUrl || null,

      //  hotel fields restored
      hasHotel,
      hotelPaidBy: hotelPaidByClean,
      hotelNights: Number.isFinite(hotelNightsNum) ? hotelNightsNum : 0,
      hotelPricePerNight: Number.isFinite(hotelPricePerNightNum)
        ? hotelPricePerNightNum
        : 0,
      hotelTotal:
        hasHotel && Number.isFinite(hotelNightsNum) && Number.isFinite(hotelPricePerNightNum)
          ? hotelNightsNum * hotelPricePerNightNum
          : 0,

      // Always overwrite both call-time fields so clearing a selection removes
      // the old value rather than leaving it behind in Firestore.
      ...callTimePayload,

      hasRiggingAddress,
      riggingAddress: hasRiggingAddress ? riggingAddress || "" : "",

      ...(needsReason && {
        statusReasons,
        statusReasonOther: statusReasons.includes("Other") ? statusReasonOther.trim() : "",
      }),

      additionalContacts: additionalContactsToSave,

      ...(dateEntryEnabled && !useCustomDates
        ? isRange
          ? {
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate).toISOString(),
              date: null,
            }
          : { date: new Date(startDate).toISOString(), startDate: null, endDate: null }
        : { date: null, startDate: null, endDate: null }),

      // preserve created meta
      createdBy: createdByEmail || user?.email || "Unknown",
      createdByUid: createdByUid || user?.uid || "",
      createdAt: createdAtIso || nowIso,

      // update meta
      lastEditedBy: user?.email || "Unknown",
      lastEditedByUid: user?.uid || "",
      updatedAt: nowIso,
      statusChangedAt: statusChanged
        ? nowIso
        : originalBookingData?.statusChangedAt || createdAtIso || nowIso,
      statusHistory: ensuredStatusHistory,
      lifecycle: nextLifecycle,
      ...derivedFields,
    };
    payload.employeeNames = cleanedEmployees.map((emp) => (typeof emp === "string" ? emp : emp?.name)).filter(Boolean);
    payload.dayNotes = filteredNotesByDate;
    payload.startDateISO = payload.startDate ? String(payload.startDate).slice(0, 10) : "";
    payload.endDateISO = payload.endDate ? String(payload.endDate).slice(0, 10) : "";
    payload.dateISO = payload.date ? String(payload.date).slice(0, 10) : "";

    const changeLines = buildBookingChangeList(originalBookingData || {}, payload, vehicleLookup);

    payload.history = [
      ...(Array.isArray(existingHistory) ? existingHistory : []),
      {
        action: "Edited",
        user: user?.email || "Unknown",
        timestamp: nowIso,
        changes: changeLines,
        details: changeLines.join("\n") || "No field-level changes detected.",
      },
    ];

    try {
      await updateDoc(doc(db, "bookings", bookingId), tenantPayload(dataAccessState, payload));

      // Save contacts back into contacts collection (merge)
      for (const c of additionalContactsToSave) {
        const id = contactIdFromEmail(c.email);
        if (!id) continue;
        await setDoc(
          doc(db, "contacts", id),
          tenantPayload(dataAccessState, {
            name: c.name,
            email: c.email,
            phone: c.phone,
            number: c.phone,
            department: c.department,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      }

      setPdfProgress(0);
      setNewFiles([]);
      setInvoiceDocument(nextInvoiceDocument);
      setInvoiceDocumentFile(null);
      queueSystemNotification({
        type: "success",
        title: "Booking updated",
        message: `Job ${jobNumber || bookingId} was saved successfully.`,
      });
      savedBookingSignatureRef.current = bookingDraftSignature;
      if (navigateOnSuccess) router.push(updatedReturnHref);
      return true;
    } catch (err) {
      if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "update booking" })) {
        console.error(" Error updating booking:", err);
      }
      showSystemNotification({
        type: "danger",
        title: "Booking update failed",
        message: err?.message || "The booking could not be saved. Please try again.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  useUnsavedChangesGuard({
    enabled: !loading,
    isDirty: Boolean(savedBookingSignatureRef.current && bookingDraftSignature !== savedBookingSignatureRef.current && !saving),
    message: "You have unsaved booking updates.",
    saveLabel: "Save Updates & Leave",
    onSave: () => handleUpdate({ navigateOnSuccess: false }),
  });

  const isEmployeeBooked = (name) => bookedEmployeeNames.includes(name);
  const isEmployeeHeld = (name) => heldEmployeeNames.includes(name);

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <style>{focusCss}</style>
        <div style={pageWrap}>
          <div style={mainWrap}>
            <h1 style={h1Style}>Edit Booking</h1>
            <div style={card}>Loading...</div>
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  //  hotel computed for UI + summary
  const hotelTotal =
    hasHotel &&
    Number.isFinite(Number(hotelNights)) &&
    Number.isFinite(Number(hotelPricePerNight))
      ? Number(hotelNights || 0) * Number(hotelPricePerNight || 0)
      : 0;
  const quoteNumbers = normalizePublicQuoteNumbers(quoteNumber);
  const quoteNumberFieldIsMulti = vehicles.length > 1 || quoteNumbers.length > 1;
  const quoteNumberSummary = quoteNumbers.length ? quoteNumbers.join(", ") : "-";
  const nextQuoteNumber = nextPublicQuoteNumber(jobNumber, [
    ...quoteNumbers,
    ...(Array.isArray(quoteDrafts) ? quoteDrafts.map((entry) => entry?.quoteNumber) : []),
    quoteDraft?.quoteNumber,
  ]);
  const addAnotherQuoteHref = `/quote/${bookingId}?quote=${encodeURIComponent(nextQuoteNumber)}`;
  const deleteQuoteFromEditPage = async (quoteCard) => {
    if (!quoteCard || deletingQuoteNumber) return;
    const targetQuoteNumber = String(quoteCard.selectedRevisionNumber || quoteCard.internalQuoteNumber || quoteCard.quoteNumber || "").trim();
    if (!targetQuoteNumber) return;

    if (!quoteCard.isSaved) {
      const confirmed = await systemDialogs.confirmSystem(
        `Cancel draft quote ${quoteCard.quoteNumber}?\n\nThis draft quote has not been saved to Firestore and will be removed from this booking edit screen.`
      );
      if (!confirmed) return;
      const remainingPublicNumbers = quoteNumbers.filter(
        (number) => publicQuoteNumber(number).toLowerCase() !== quoteCard.quoteNumber.toLowerCase()
      );
      setQuoteNumber(remainingPublicNumbers.join("\n"));
      setPreviewQuoteNumber((current) => (current === quoteCard.quoteNumber ? "" : current));
      systemDialogs.showSystemNotification("Draft quote cancelled.");
      return;
    }

    const confirmed = await systemDialogs.confirmSystem(
      `Delete quote ${quoteCard.quoteNumber}?\n\nThis quote will be permanently removed from Firestore, including the quote builder data linked to this booking. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingQuoteNumber(targetQuoteNumber);
    const deleteKey = String(targetQuoteNumber).trim().toLowerCase();
    const remainingDrafts = (Array.isArray(quoteDrafts) ? quoteDrafts : []).filter(
      (entry) => String(entry?.quoteNumber || "").trim().toLowerCase() !== deleteKey
    );
    const latestRemainingQuote = remainingDrafts.reduce((latest, entry) => {
      if (!latest) return entry;
      const latestTime = new Date(latest.savedAt || latest.updatedAt || latest.createdAt || 0).getTime() || 0;
      const entryTime = new Date(entry.savedAt || entry.updatedAt || entry.createdAt || 0).getTime() || 0;
      if (entryTime !== latestTime) return entryTime > latestTime ? entry : latest;
      return splitQuoteRevision(entry.quoteNumber).revision >= splitQuoteRevision(latest.quoteNumber).revision ? entry : latest;
    }, null);
    const remainingPublicNumbers = normalizePublicQuoteNumbers(remainingDrafts.map((entry) => entry?.quoteNumber));
    const deletedAcceptedQuote =
      publicQuoteNumber(targetQuoteNumber).toLowerCase() ===
      publicQuoteNumber(originalBookingData?.acceptedQuoteNumber || "").toLowerCase();
    const user = auth.currentUser;
    const nowIso = new Date().toISOString();

    // TODO: delete associated Storage files/PDFs/generated docs when quote assets get their own storage metadata.
    const patch = {
      quoteVersions: remainingDrafts,
      quoteNumbers: remainingPublicNumbers,
      quote: latestRemainingQuote || null,
      quoteNumber: latestRemainingQuote?.quoteNumber || remainingPublicNumbers[0] || "",
      quoteVersion: latestRemainingQuote ? quoteVersionFromNumber(latestRemainingQuote.quoteNumber) : 0,
      updatedAt: nowIso,
      lastEditedBy: user?.email || "Unknown",
      lastEditedByUid: user?.uid || "",
    };

    if (deletedAcceptedQuote) {
      patch.acceptedQuoteNumber = "";
      patch.acceptedQuoteName = "";
    }

    try {
      await updateDoc(doc(db, "bookings", bookingId), tenantPayload(dataAccessState, patch));
      setQuoteDrafts(remainingDrafts);
      setQuoteDraft(latestRemainingQuote || null);
      setQuoteNumber(remainingPublicNumbers.join("\n"));
      setSelectedQuoteRevisions((current) => {
        const next = { ...current };
        delete next[quoteCard.quoteNumber];
        return next;
      });
      setPreviewQuoteNumber((current) => (current === quoteCard.quoteNumber ? "" : current));
      systemDialogs.showSystemNotification(`Quote ${quoteCard.quoteNumber} deleted successfully.`);
      router.push("/completed-quotes");
    } catch (error) {
      if (!handleFirestoreAccessError(error, { collectionName: "bookings", operation: "delete quote from edit booking" })) {
        console.error("Failed deleting quote:", error);
        systemDialogs.showSystemNotification("Failed to delete quote. Please try again.");
      }
    } finally {
      setDeletingQuoteNumber("");
    }
  };
  const quoteCards = (() => {
    const savedQuotes = Array.isArray(quoteDrafts) ? quoteDrafts : [];
    const legacyQuoteNumber = quoteDraft?.quoteNumber || (quoteDraft?.lineItems?.length ? quoteNumbers[0] : "");
    const publicCardNumbers = [
      ...quoteNumbers.map(publicQuoteNumber),
      ...savedQuotes.map((entry) => publicQuoteNumber(entry?.quoteNumber)),
      publicQuoteNumber(legacyQuoteNumber),
    ].filter(Boolean);
    const cardNumbers = Array.from(
      publicCardNumbers.reduce((map, number) => {
        const key = String(number || "").trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, number);
        return map;
      }, new Map()).values()
    );
    return cardNumbers.map((number) => {
      const publicNumber = publicQuoteNumber(number);
      const matchingSavedQuotes = savedQuotes
        .filter(
          (entry) => publicQuoteNumber(entry?.quoteNumber).toLowerCase() === String(publicNumber || "").trim().toLowerCase()
        )
        .sort((a, b) => splitQuoteRevision(b?.quoteNumber).revision - splitQuoteRevision(a?.quoteNumber).revision);
      const savedQuote =
        matchingSavedQuotes[0] ||
        (String(legacyQuoteNumber || "").trim().toLowerCase() === String(number || "").trim().toLowerCase()
          ? quoteDraft
          : null);
      const internalQuoteNumber = savedQuote?.quoteNumber || publicNumber;
      const revisionOptions = matchingSavedQuotes.length
        ? matchingSavedQuotes.map((entry) => ({
            quoteNumber: entry.quoteNumber,
            label: quoteRevisionLabel(entry.quoteNumber),
            savedAt: entry.savedAt || entry.updatedAt || "",
          }))
        : internalQuoteNumber
        ? [{ quoteNumber: internalQuoteNumber, label: quoteRevisionLabel(internalQuoteNumber), savedAt: savedQuote?.savedAt || savedQuote?.updatedAt || "" }]
        : [];
      const selectedRevisionNumber =
        selectedQuoteRevisions[publicNumber] &&
        revisionOptions.some((option) => option.quoteNumber === selectedQuoteRevisions[publicNumber])
          ? selectedQuoteRevisions[publicNumber]
          : internalQuoteNumber;
      const selectedSavedQuote =
        matchingSavedQuotes.find((entry) => entry.quoteNumber === selectedRevisionNumber) || savedQuote;
      const lineCount = Array.isArray(selectedSavedQuote?.lineItems) ? selectedSavedQuote.lineItems.length : 0;
      const subtotal = Number(selectedSavedQuote?.subtotal);
      return {
        quoteNumber: publicNumber,
        internalQuoteNumber,
        selectedRevisionNumber,
        revisions: revisionOptions,
        revisionCount: matchingSavedQuotes.length,
        name: quoteDisplayName(selectedSavedQuote) || "Unnamed quote",
        savedQuote: selectedSavedQuote,
        href: `/quote/${bookingId}?quote=${encodeURIComponent(selectedRevisionNumber)}`,
        printHref: `/quote/${bookingId}?quote=${encodeURIComponent(selectedRevisionNumber)}&action=print`,
        downloadHref: `/quote/${bookingId}?quote=${encodeURIComponent(selectedRevisionNumber)}&action=download`,
        status: selectedSavedQuote?.status || (selectedSavedQuote ? "Draft" : "Not started"),
        isAccepted:
          String(selectedSavedQuote?.status || "").trim() === "Accepted" ||
          publicQuoteNumber(selectedSavedQuote?.quoteNumber || number || "").trim() === publicQuoteNumber(originalBookingData?.acceptedQuoteNumber || "").trim(),
        description: selectedSavedQuote?.templateName || selectedSavedQuote?.templateFile || "No template selected",
        lineCount,
        total: Number.isFinite(subtotal) && subtotal > 0 ? `GBP ${subtotal.toFixed(2)}` : "",
        savedAt: selectedSavedQuote?.savedAt || selectedSavedQuote?.updatedAt || "",
        savedBy: selectedSavedQuote?.savedBy || selectedSavedQuote?.updatedBy || "",
        previewLines: Array.isArray(selectedSavedQuote?.lineItems) ? selectedSavedQuote.lineItems.slice(0, 5) : [],
        isSaved: Boolean(selectedSavedQuote),
      };
    });
  })();
  const previewQuoteCard = quoteCards.find((quoteCard) => quoteCard.quoteNumber === publicQuoteNumber(previewQuoteNumber));

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div className={layoutStyles.pageShell} style={pageWrap}>
        <div className={layoutStyles.workspaceMain} style={mainWrap}>
          <div className={`${layoutStyles.extracted2} ${layoutStyles.compactPageHeader}`}>
            <div className={layoutStyles.compactTitleBlock}>
              <div className={layoutStyles.compactTitleLine}>
                <h1 style={h1Style}>Edit Booking</h1>
                <span className={layoutStyles.jobReference}><ClipboardList size={13} /> Job {jobNumber || "Draft"}</span>
              </div>
              <div style={pageSub}>
                {client || "Production company"} · {production || "Production"} · {selectedDates.length || 0} day{selectedDates.length === 1 ? "" : "s"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(quoteCards.length ? addAnotherQuoteHref : `/quote/${bookingId}`)}
              className={layoutStyles.primaryAction}
              style={{ ...btnPrimary, whiteSpace: "nowrap" }}
            ><FileText size={14} /> {quoteCards.length ? "Add another quote" : "Create Quote"}</button>
          </div>
          <div className={layoutStyles.compactControlBar}>
            {!isBickersJob && (
              <>
                  <label className={layoutStyles.compactControl}>
                    <input type="checkbox" checked={hasHS} onChange={(e) => setHasHS(e.target.checked)} />
                    Health & Safety
                  </label>
                  <label className={layoutStyles.compactControl}>
                    <input type="checkbox" checked={hasRiskAssessment} onChange={(e) => setHasRiskAssessment(e.target.checked)} />
                    Risk Assessment
                  </label>
                  <span className={layoutStyles.controlDivider} aria-hidden="true" />
              </>
            )}
                <label className={layoutStyles.compactControl} title={offRoadEligibility.reason || ""}>
                  <input
                    type="checkbox"
                    checked={offRoadTracking}
                    disabled={!offRoadEligibility.eligible}
                    onChange={(e) => setOffRoadTracking(e.target.checked)}
                  />
                  <Truck size={14} /> Off Road Tracking
                </label>
                <span className={layoutStyles.compactControlHint}>
                  {offRoadEligibility.reason || "Skips tax/SORN compliance only. Insurance is still required."}
                </span>
          </div>

          <form
            className={layoutStyles.workspaceForm}
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdate();
            }}
          >
            <div className={`edit-booking-grid ${layoutStyles.extracted6} ${layoutStyles.bookingColumns}`} >
              {/* Column 1: Job Info */}
              <div style={{ ...card, background: UI.page }}>
                <div className={layoutStyles.extracted7}>
                  <span style={iconBox()}><FileText size={17} /></span>
                  <h3 style={cardTitle}>Job Info</h3>
                </div>

                <div className={`edit-booking-two ${layoutStyles.extracted8}`} >
                  <div>
                    <label style={field.label}>Job Number</label>
                    <input
                      value={jobNumber}
                      onChange={(e) => {
                        setJobNumber(e.target.value);
                        setDismissedExistingJobNumber("");
                      }}
                      required
                      style={field.input}
                    />
                  </div>

                  <div>
                    <label style={field.label}>{quoteNumberFieldIsMulti ? "Quote Numbers" : "Quote Number"}</label>
                    {quoteNumberFieldIsMulti ? (
                      <textarea
                        value={quoteNumber}
                        onChange={(e) => setQuoteNumber(e.target.value)}
                        rows={Math.max(2, Math.min(5, Math.max(vehicles.length, quoteNumbers.length)))}
                        placeholder="One quote number per line"
                        style={{ ...field.textarea, minHeight: 36, height: "auto", resize: "vertical" }}
                      />
                    ) : (
                      <input
                        value={quoteNumber}
                        onChange={(e) => setQuoteNumber(e.target.value)}
                        placeholder={vehicles.length > 1 ? "One quote number per line" : ""}
                        style={field.input}
                      />
                    )}
                  </div>
                </div>

                {shouldOfferExistingJobDetails && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      marginTop: SPACE.sm,
                      padding: SPACE.md,
                      borderRadius: UI.radiusSm,
                      border: `1px solid ${UI.warnBorder}`,
                      background: UI.warnSoft,
                      color: UI.text,
                    }}
                  >
                    <div className={layoutStyles.extracted69}>
                      Job {jobNumber.trim()} has different {existingJobMismatchLabels.join(", ")} on{" "}
                      {existingJobDetails.bookingCount} other{" "}
                      {existingJobDetails.bookingCount === 1 ? "booking" : "bookings"}.
                    </div>
                    <div style={{ marginTop: SPACE.xs, color: UI.muted, fontSize: 12 }}>
                      Job details: {existingJobDetails.client || "No Production Company"} ·{" "}
                      {existingJobDetails.production || "No Production"}
                      {existingJobDetails.additionalContacts.length
                        ? ` · ${existingJobDetails.additionalContacts
                            .map((contact) => contact.name || contact.email || contact.phone)
                            .filter(Boolean)
                            .join(", ")}`
                        : " · No contacts"}
                    </div>
                    <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.sm, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (existingJobDetails.client) setClient(existingJobDetails.client);
                          if (existingJobDetails.production) setProduction(existingJobDetails.production);
                          if (existingJobDetails.additionalContacts.length) {
                            setAdditionalContacts((current) =>
                              mergeBookingContacts(existingJobDetails.additionalContacts, current)
                            );
                          }
                          setDismissedExistingJobNumber(normalizedJobNumber);
                        }}
                        style={{ ...btnPrimary, padding: "6px 10px", fontSize: 12 }}
                      >
                        Use job details & contacts
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedExistingJobNumber(normalizedJobNumber)}
                        style={{ ...btn, padding: "6px 10px", fontSize: 12 }}
                      >
                        Keep this booking
                      </button>
                    </div>
                  </div>
                )}

                <div className={`edit-booking-two ${layoutStyles.extracted8}`}>
                  <div>
                    <label style={field.label}>Status</label>
                    <select
                      value={status}
                      onChange={(e) => {
                        const next = e.target.value;
                        const reasonRequiredStatuses = ["Lost", "Postponed", "Cancelled"];
                        const enteringNewReasonRequiredStatus =
                          reasonRequiredStatuses.includes(next) && next !== status;
                        setStatus(next);
                        setEnquiryDatesEnabled(next !== "Enquiry");
                        if (!reasonRequiredStatuses.includes(next) || enteringNewReasonRequiredStatus) {
                          setStatusReasons([]);
                          setStatusReasonOther("");
                        }
                      }}
                      style={field.input}
                    >
                      {VEHICLE_STATUSES.filter((s) => s !== "Complete" || status === "Complete").map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={field.label}>Shoot Type</label>
                    <select value={shootType} onChange={(e) => setShootType(e.target.value)} style={field.input}>
                      <option value="Day">Day</option>
                      <option value="Night">Night</option>
                    </select>
                  </div>
                </div>

                {["Lost", "Postponed", "Cancelled"].includes(status) && (
                  <div
                    style={{
                      border: UI.border,
                      borderRadius: UI.radiusSm,
                      padding: 12,
                    marginTop: SPACE.md,
                      background: UI.bgAlt,
                    }}
                  >
                    <h4 className={layoutStyles.extracted9}>Reason</h4>
                    {["Cost", "Weather", "Competitor", "DNH", "Other"].map((r) => (
                      <label
                        key={r}
                        className={layoutStyles.extracted10}
                      >
                        <input
                          type="checkbox"
                          checked={statusReasons.includes(r)}
                          onChange={() =>
                            setStatusReasons((prev) =>
                              prev.includes(r)
                                ? prev.filter((x) => x !== r)
                                : [...prev, r]
                            )
                          }
                        />
                        {r}
                      </label>
                    ))}
                    {statusReasons.includes("Other") && (
                      <div className={layoutStyles.extracted11}>
                        <input
                          type="text"
                          placeholder="Other reason..."
                          value={statusReasonOther}
                          onChange={(e) => setStatusReasonOther(e.target.value)}
                          style={field.input}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className={layoutStyles.extracted12} />

                <div className={`edit-booking-two ${layoutStyles.extracted8}`}>
                  <div>
                    <label style={field.label}>Production Company</label>
                    <input value={client} onChange={(e) => setClient(e.target.value)} style={field.input} />
                  </div>
                  <div>
                    <label style={field.label}>Production</label>
                    <input
                      value={production}
                      onChange={(e) => setProduction(e.target.value)}
                      style={field.input}
                      required={!isMaintenance && !(client || "").trim()}
                    />
                  </div>
                </div>

                {/* Contacts block only */}
                <div
                  style={{
                    marginTop: 12,
                    padding: SPACE.md,
                    borderRadius: UI.radiusSm,
                    border: UI.border,
                    background: UI.bgAlt,
                  }}
                >
                  <div
                    className={layoutStyles.extracted13}
                  >
                    <span className={layoutStyles.extracted14}>
                      Contacts
                    </span>
                    <div className={layoutStyles.contactActions}>
                      {contactsExpanded && (
                        <button
                          type="button"
                          onClick={handleAddContactRow}
                          style={{ ...btn, padding: "4px 8px", fontSize: 12, borderRadius: 999 }}
                        >
                          + Add contact
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (!contactsExpanded) ensureSavedContactsLoaded();
                          setContactsExpanded((open) => !open);
                        }}
                        style={{ ...btn, padding: "4px 8px", fontSize: 12, borderRadius: 999 }}
                      >
                        {contactsExpanded ? "Done" : additionalContacts.length ? "Edit" : "Add contact"}
                      </button>
                    </div>
                  </div>

                  {!contactRequirementSatisfied ? (
                    <p className={layoutStyles.contactRequirement}>
                      Required: add a contact name with either an email address or phone number.
                    </p>
                  ) : null}

                  {!contactsExpanded ? (
                    <button
                      type="button"
                      className={layoutStyles.contactSummary}
                      onClick={() => setContactsExpanded(true)}
                    >
                      <span>
                        {additionalContacts.length
                          ? additionalContacts
                              .map((contact) => {
                                const department = contact.department === "Other"
                                  ? contact.departmentOther
                                  : contact.department;
                                return [contact.name || contact.email || "Unnamed contact", department]
                                  .filter(Boolean)
                                  .join(" · ");
                              })
                              .join(", ")
                          : "No contacts added"}
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ) : (<>
                  {additionalContacts.map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: UI.radiusXs,
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <div
                        className={layoutStyles.extracted15}
                      >
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginTop: 0,
                              marginBottom: 4,
                            }}
                          >
                            Department
                          </label>
                          <select
                            value={row.department}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "department",
                                e.target.value
                              )
                            }
                            style={field.input}
                          >
                            <option value="">Select department</option>
                            {FILM_DEPARTMENTS.map((dep) => (
                              <option key={dep} value={dep}>
                                {dep}
                              </option>
                            ))}
                          </select>
                          {row.department === "Other" && (
                            <input
                              type="text"
                              placeholder="Custom department"
                              value={row.departmentOther || ""}
                              onChange={(e) =>
                                handleUpdateContactRow(
                                  idx,
                                  "departmentOther",
                                  e.target.value
                                )
                              }
                    style={{ ...field.input, marginTop: SPACE.sm }}
                            />
                          )}
                        </div>

                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginTop: 0,
                              marginBottom: 4,
                            }}
                          >
                            Name
                          </label>
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) =>
                              handleUpdateContactRow(idx, "name", e.target.value)
                            }
                            style={field.input}
                            placeholder="Contact name"
                          />
                        </div>
                      </div>

                      <div
                        className={layoutStyles.extracted16}
                      >
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginTop: 0,
                              marginBottom: 4,
                            }}
                          >
                            Email
                          </label>
                          <input
                            type="email"
                            value={row.email}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "email",
                                e.target.value
                              )
                            }
                            style={field.input}
                            placeholder="Email"
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginTop: 0,
                              marginBottom: 4,
                            }}
                          >
                            Number
                          </label>
                          <input
                            type="tel"
                            value={row.phone}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "phone",
                                e.target.value
                              )
                            }
                            style={field.input}
                            placeholder="Phone number"
                          />
                        </div>
                      </div>

                      <div
                        className={layoutStyles.extracted17}
                      >
                        <button
                          type="button"
                          onClick={() => handleRemoveContactRow(idx)}
                          style={{
                            ...btn,
                            padding: "4px 8px",
                            fontSize: 11,
                            borderRadius: 999,
                            borderColor: "var(--color-danger)",
                            color: "var(--color-danger)",
                            background: "var(--color-surface)",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  <SavedContactPicker
                    contacts={filteredSavedContacts}
                    existingContacts={additionalContacts}
                    loaded={savedContactsLoaded}
                    loading={savedContactsLoading}
                    query={savedContactSearch}
                    onQueryChange={setSavedContactSearch}
                    onLoad={ensureSavedContactsLoaded}
                    onSelect={handleQuickAddSavedContact}
                  />
                  </>)}
                </div>

                <label style={field.label}>Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={field.input}
                  required
                />
                  <div style={{ marginTop: SPACE.md, padding: SPACE.md, borderRadius: UI.radiusSm, border: UI.border, background: UI.bgAlt }}>
                  <label style={{ ...field.checkboxRow, marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={showInvoicingDetails}
                      onChange={(e) => setShowInvoicingDetails(e.target.checked)}
                    />
                    Add invoicing details
                  </label>
                  {showInvoicingDetails && (
                    <div className={layoutStyles.extracted19}>
                      <div>
                        <label style={{ ...field.label, marginTop: 0 }}>Purchase Order (PO)</label>
                        <input value={po} onChange={(e) => setPo(e.target.value)} style={{ ...field.input, background: "var(--color-surface)" }} placeholder="PO reference for invoicing" />
                      </div>
                      <div className={layoutStyles.extracted20}>
                        <div>
                          <label style={{ ...field.label, marginTop: 0 }}>Invoicing contact</label>
                          <input value={invoiceContactName} onChange={(e) => setInvoiceContactName(e.target.value)} style={{ ...field.input, background: "var(--color-surface)" }} placeholder="Name" />
                        </div>
                        <div>
                          <label style={{ ...field.label, marginTop: 0 }}>Email</label>
                          <input type="email" value={invoiceContactEmail} onChange={(e) => setInvoiceContactEmail(e.target.value)} style={{ ...field.input, background: "var(--color-surface)" }} placeholder="accounts@example.com" />
                        </div>
                      </div>
                      <div>
                        <label style={{ ...field.label, marginTop: 0 }}>Phone</label>
                        <input type="tel" value={invoiceContactPhone} onChange={(e) => setInvoiceContactPhone(e.target.value)} style={{ ...field.input, background: "var(--color-surface)" }} placeholder="Optional phone number" />
                      </div>
                      <div>
                        <label style={{ ...field.label, marginTop: 0 }}>Invoice details document</label>
                        {invoiceDocument?.url && !invoiceDocumentFile && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              padding: 8,
                              borderRadius: UI.radiusSm,
                              border: UI.border,
                              background: "var(--color-surface)",
                        marginBottom: SPACE.sm,
                            }}
                          >
                            <span className={layoutStyles.extracted21}>
                              {invoiceDocument.name || "Invoice details document"}
                            </span>
                        <a href={invoiceDocument.url} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: `${SPACE.xs}px ${SPACE.sm}px`, textDecoration: "none", flexShrink: 0 }}>
                              Open
                            </a>
                          </div>
                        )}
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,image/jpeg,image/png"
                          onChange={(e) => setInvoiceDocumentFile(e.target.files?.[0] || null)}
                    style={{ ...field.input, height: "auto", padding: SPACE.md, background: "var(--color-surface)" }}
                        />
                        {invoiceDocumentFile && (
                  <div style={{ marginTop: SPACE.xs, fontSize: 12, color: UI.muted }}>
                            {invoiceDocumentFile.name} selected - it will replace the saved document on Update.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  <div style={{ marginTop: SPACE.md, padding: SPACE.md, borderRadius: UI.radiusSm, border: UI.border, background: UI.bgAlt }}>
                  <label style={{ ...field.checkboxRow, marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={hasRiggingAddress}
                      onChange={(e) => setHasRiggingAddress(e.target.checked)}
                    />
                    Add Rigging Address
                  </label>
                  {hasRiggingAddress && (
                    <textarea
                      value={riggingAddress}
                      onChange={(e) => setRiggingAddress(e.target.value)}
                      rows={3}
                      style={{ ...field.textarea, minHeight: 70, marginTop: 8, background: "var(--color-surface)" }}
                      placeholder="Enter rigging address..."
                    />
                  )}
                </div>

                <div className={layoutStyles.inlineSection}>
                  <div className={layoutStyles.inlineSectionHeader}>
                    <FileText size={15} />
                    <strong>Files</strong>
                    <span>{attachments.length + newFiles.length} attached</span>
                  </div>
                  {attachments.length > 0 && (
                    <div className={layoutStyles.compactFileList}>
                      {attachments.map((attachment, index) => (
                        <div key={`${attachment?.url || "file"}-${index}`}>
                          <span title={attachment?.name || "Unnamed file"}>
                            {attachment?.name || "Unnamed file"}
                          </span>
                          <div>
                            {attachment?.url && (
                              <a href={attachment.url} target="_blank" rel="noreferrer">Open</a>
                            )}
                            <button type="button" onClick={() => removeAttachment(index)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,image/jpeg"
                    onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                    className={layoutStyles.fileInput}
                    style={{ ...field.input, height: "auto", padding: SPACE.sm }}
                  />
                  {pdfProgress > 0 && <div className={layoutStyles.inlineHint}>Uploading: {pdfProgress}%</div>}
                  {newFiles.length > 0 && (
                    <div className={layoutStyles.inlineHint}>
                      {newFiles.length} file{newFiles.length === 1 ? "" : "s"} selected — uploads on Update.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Dates & People */}
              <div style={{ ...card, background: UI.page }}>
                <div className={layoutStyles.extracted22}>
                  <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}><CalendarDays size={17} /></span>
                  <h3 style={cardTitle}>Dates & People</h3>
                </div>

                {status === "Enquiry" && (
                  <label style={field.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={enquiryDatesEnabled}
                      onChange={(e) => setEnquiryDatesEnabled(e.target.checked)}
                    />
                    Date is available
                  </label>
                )}

                {dateEntryEnabled ? (
                  <>
                    <div className={layoutStyles.dateModeRow}>
                      <label style={field.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={useCustomDates}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setUseCustomDates(on);
                            if (on) setIsRange(false);
                          }}
                        />
                        Select non-consecutive dates
                      </label>

                      {!useCustomDates && (
                        <label style={field.checkboxRow}>
                          <input type="checkbox" checked={isRange} onChange={() => setIsRange(!isRange)} />
                          Multi-day booking (consecutive)
                        </label>
                      )}
                    </div>

                    {useCustomDates ? (
                      <div className={layoutStyles.extracted23}>
                        <DatePicker
                          multiple
                          value={datePickerValues(customDates)}
                          format="DD/MM/YYYY"
                          onChange={(vals) => {
                            const normalised = (Array.isArray(vals) ? vals : [])
                              .map((v) =>
                                typeof v?.format === "function"
                                  ? v.format("YYYY-MM-DD")
                                  : String(v)
                              )
                              .sort();
                            setCustomDates(normalised);
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className="edit-booking-two"
                        style={{
                          display: "grid",
                          gridTemplateColumns: isRange ? "1fr 1fr" : "1fr",
                          gap: 12,
                        }}
                      >
                        <div>
                          <label style={field.label}>
                            {isRange ? "Start Date" : "Date"}
                          </label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            required={status !== "Enquiry"}
                            style={field.input}
                          />
                        </div>
                        {isRange && (
                          <div>
                            <label style={field.label}>End Date</label>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              required={status !== "Enquiry"}
                              style={field.input}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                    <div style={{ border: UI.border, borderRadius: UI.radiusSm, padding: SPACE.md, background: "var(--color-surface-subtle)", color: UI.muted, fontSize: 13 }}>
                    No dates recorded yet.
                  </div>
                )}

                {!isMaintenance && dateEntryEnabled && (
                  <LinkedBookingContinuationFields
                    value={linkedContinuation}
                    onChange={setLinkedContinuation}
                    candidates={allBookings}
                    selectedDates={selectedDates}
                    currentBookingId={bookingId}
                  />
                )}

                {selectedDates.length > 0 && (
                  <div className={layoutStyles.extracted24}>
                    <h4 className={layoutStyles.extracted25}>
                      {selectedDates.length > 1
                        ? "Notes for Each Day"
                        : "Note for the Day"}
                    </h4>

                    <div
                      className={layoutStyles.extracted26}
                    >
                      {selectedDates.map((date) => {
                        const selectedNote = notesByDate[date] || "";
                        const isOther = selectedNote === "Other";
                        const customOtherValue = notesByDate[`${date}-other`] || "";
                        const callTimeForDate = callTimesByDate[date] || "";
                        return (
                          <div
                            key={date}
                            style={{
                              border: UI.border,
                              borderRadius: UI.radiusSm,
                              padding: 8,
                              background: "var(--color-surface-subtle)",
                            }}
                          >
                            <div className={layoutStyles.extracted27}>
                              {formatSummaryDate(date)}
                            </div>

                            <div className={`edit-booking-two ${layoutStyles.extracted28}`} >
                              <div>
                                  <label style={{ ...field.label, marginTop: 0, marginBottom: SPACE.xs, fontSize: 10.5, lineHeight: 1 }}>Day note</label>
                                <select
                                  value={selectedNote}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: e.target.value,
                                    })
                                  }
                                    style={{ ...field.input, height: 32, padding: `${SPACE.xs}px ${SPACE.sm}px` }}
                                >
                                  <option value="">Select note</option>
                                  <option value="1/2 Day Travel">1/2 Day Travel</option>
                                  <option value="Night Shoot">Night Shoot</option>
                                  <option value="On Set">Shoot Day</option>
                                  <option value="Other">Other</option>
                                  <option value="Rehearsal Day">Rehearsal Day</option>
                                  <option value="Rest Day">Rest Day</option>
                                  <option value="Rig Day">Rig Day</option>
                                  <option value="Standby Day">Standby Day</option>
                                  <option value="Spilt Day">Spilt Day</option>
                                  <option value="Travel Day">Travel Day</option>
                                  <option value="Travel Time">Travel Time</option>
                                  <option value="Turnaround Day">Turnaround Day</option>
                                  <option value="Recce Day">Recce Day</option>
                                </select>
                              </div>
                              <div>
                                  <label style={{ ...field.label, marginTop: 0, marginBottom: SPACE.xs, fontSize: 10.5, lineHeight: 1 }}>Call Time</label>
                                <select
                                  value={callTimeForDate}
                                  onChange={(e) => setCallTimesByDate((prev) => ({ ...prev, [date]: e.target.value }))}
                                    style={{ ...field.input, height: 32, padding: `${SPACE.xs}px ${SPACE.sm}px` }}
                                >
                                  <option value="">Select time</option>
                                  {TIME_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {isOther && (
                              <div className={layoutStyles.extracted29}>
                                <input
                                  type="text"
                                  placeholder="Enter custom note"
                                  value={customOtherValue}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: "Other",
                                      [`${date}-other`]: e.target.value,
                                    })
                                  }
                                  style={field.input}
                                />
                              </div>
                            )}

                            {selectedNote === "Travel Time" && (
                              <div className={layoutStyles.extracted30}>
                            <label style={{ ...field.label, marginBottom: SPACE.sm }}>
                                  Travel duration
                                </label>
                                <select
                                  value={notesByDate[`${date}-travelMins`] || ""}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: "Travel Time",
                                      [`${date}-travelMins`]: e.target.value,
                                    })
                                  }
                                  style={field.input}
                                >
                                  <option value="">Select duration</option>
                                  {TRAVEL_DURATION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className={layoutStyles.extracted31} />

                <div className={layoutStyles.crewSummaryHeader}>
                  <div className={layoutStyles.crewSelection}>
                    <Users size={15} aria-hidden="true" />
                    {employees.filter((employee) => employee.name).length ? (
                      employees.filter((employee) => employee.name).map((employee) => (
                        <span key={`${employee.role}-${employee.name}`} className={layoutStyles.selectionChip}>
                          {employee.name}
                          <button
                            type="button"
                            aria-label={`Remove ${employee.name}`}
                            onClick={() => {
                              setEmployees((current) => current.filter((item) => !(item.name === employee.name && item.role === employee.role)));
                              upsertEmployeeDates(employee.role, employee.name, false);
                            }}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className={layoutStyles.emptySelection}>No crew selected</span>
                    )}
                  </div>
                </div>

                <h4 className={layoutStyles.extracted32}>
                  <Users size={15} /> Precision Driver
                </h4>
                <div className={layoutStyles.extracted33}>
                {driverOptions.map((name) => {
                  const isSelected = employees.some(
                    (e) => e.name === name && e.role === "Precision Driver"
                  );
                  const isBooked = isEmployeeBooked(name);
                  const isHeld = isEmployeeHeld(name);
                  const isHoliday = isEmployeeOnHolidayForDates(name, selectedDates);
                  const isUnavailable = isEmployeeUnavailableByNoteForDates(name, selectedDates);
                  const disabled = (isBooked || isHoliday || isUnavailable) && !isSelected;

                  return (
                    <label key={`pd-${name}`} className={layoutStyles.extracted34}>
                      <input
                        type="checkbox"
                        value={name}
                        disabled={disabled}
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const next = uniqEmpObjects([
                              ...employees,
                              { role: "Precision Driver", name },
                            ]);
                            setEmployees(next);
                            upsertEmployeeDates("Precision Driver", name, true);
                          } else {
                            const next = employees.filter(
                              (sel) =>
                                !(
                                  sel.name === name &&
                                  sel.role === "Precision Driver"
                                )
                            );
                            setEmployees(next);
                            upsertEmployeeDates("Precision Driver", name, false);
                          }
                        }}
                      />
                      <span style={{ color: disabled ? "var(--color-text-muted)" : UI.text }}>
                        {name} {isBooked && "(Booked)"} {!isBooked && isHeld && "(Held)"}{" "}
                        {isHoliday && "(Holiday)"} {isUnavailable && "(Unavailable)"}
                      </span>
                    </label>
                  );
                })}
                </div>

                {/* Required crew guidance + manual crewed checkbox */}
                <div className={layoutStyles.crewAllocationBar}>
                    <label className={layoutStyles.crewVisibilityToggle}>
                      <input
                        type="checkbox"
                        checked={isCrewed}
                        onChange={(e) => setIsCrewed(e.target.checked)}
                        className={layoutStyles.extracted36}
                      />
                      <span><strong>Employee app</strong><small>Show assigned crew</small></span>
                    </label>
                    <label className={layoutStyles.crewRequiredMetric}>
                      <span>Required</span>
                      <input
                        aria-label="Required crew"
                        type="number"
                        min={0}
                        step={1}
                        value={requiredCrewCount}
                        onChange={(e) => {
                          const v = Math.max(0, parseInt(e.target.value || "0", 10));
                          setRequiredCrewCount(Number.isFinite(v) ? v : 0);
                        }}
                      />
                    </label>
                    <div className={layoutStyles.crewAllocatedMetric}>
                      <span>Allocated</span>
                      <strong>{allocatedCrewCount} / {Math.max(0, Number(requiredCrewCount) || 0)}</strong>
                    </div>
                    <span className={`${layoutStyles.crewVisibilityStatus} ${isCrewed ? layoutStyles.crewVisibilityStatusActive : ""}`}>
                      {isCrewed ? "Visible in app" : "Hidden from app"}
                    </span>
                </div>

                <h4 className={layoutStyles.extracted38}>
                  <Users size={15} /> Freelancers
                </h4>
                <div className={layoutStyles.extracted39}>
                {freelancerOptions.map((name) => {
                  const isSelected = employees.some(
                    (e) => e.name === name && e.role === "Freelancer"
                  );
                  const isBooked = isEmployeeBooked(name);
                  const isHoliday = isEmployeeOnHolidayForDates(name, selectedDates);
                  const isUnavailable = isEmployeeUnavailableByNoteForDates(name, selectedDates);
                  const disabled = (isBooked || isHoliday || isUnavailable) && !isSelected;

                  return (
                    <label key={`fl-${name}`} className={layoutStyles.extracted40}>
                      <input
                        type="checkbox"
                        value={name}
                        disabled={disabled}
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const next = uniqEmpObjects([
                              ...employees,
                              { role: "Freelancer", name },
                            ]);
                            setEmployees(next);
                            upsertEmployeeDates("Freelancer", name, true);
                          } else {
                            const next = employees.filter(
                              (sel) =>
                                !(
                                  sel.name === name && sel.role === "Freelancer"
                                )
                            );
                            setEmployees(next);
                            upsertEmployeeDates("Freelancer", name, false);
                          }
                        }}
                      />
                      <span style={{ color: disabled ? "var(--color-text-muted)" : UI.text }}>
                        {name} {isBooked && "(Booked)"} {isHoliday && "(Holiday)"} {isUnavailable && "(Unavailable)"}
                      </span>
                    </label>
                  );
                })}
                </div>

                {employees.some((e) => e.name === "Other") && (
                  <div className={layoutStyles.extracted41}>
                    <input
                      type="text"
                      placeholder="Other employee(s), comma-separated"
                      value={customEmployee}
                      onChange={(e) => setCustomEmployee(e.target.value)}
                      style={field.input}
                    />
                  </div>
                )}

                {selectedDates.length > 0 &&
                  employees.filter((e) => e.name && e.name !== "Other").length > 0 && (
                    <>
                      <div className={layoutStyles.extracted42} />
                      <h4 className={layoutStyles.extracted43}>Employee schedule by day</h4>
                      <p style={{ fontSize: 12, color: UI.muted, marginBottom: 8 }}>
                        Default = everyone works every selected day. Use this grid to fine-tune.
                      </p>

                      <div
                        className={layoutStyles.extracted44}
                      >
                        {selectedDates.map((date) => {
                          const assigned = employeesByDate[date] || [];
                          const pretty = formatSummaryDate(date);

                          return (
                            <div
                              key={date}
                              style={{
                                border: UI.border,
                                borderRadius: UI.radiusSm,
                    padding: SPACE.md,
                                background: UI.bgAlt,
                              }}
                            >
                              <div className={layoutStyles.extracted45}>
                                {pretty}
                              </div>

                              {employees
                                .filter((e) => e.name && e.name !== "Other")
                                .map((emp) => {
                                  const isOnDay = assigned.some(
                                    (x) => x.name === emp.name && x.role === emp.role
                                  );

                                  return (
                                    <label
                                      key={`${emp.role}-${emp.name}-${date}`}
                                      className={layoutStyles.extracted46}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isOnDay}
                                        onChange={() =>
                                          setEmployeesByDate((prev) => {
                                            const next = { ...prev };
                                            const list = Array.isArray(next[date])
                                              ? next[date]
                                              : [];
                                            const exists = list.some(
                                              (x) =>
                                                x.name === emp.name &&
                                                x.role === emp.role
                                            );
                                            if (exists) {
                                              const filtered = list.filter(
                                                (x) =>
                                                  !(
                                                    x.name === emp.name &&
                                                    x.role === emp.role
                                                  )
                                              );
                                              if (filtered.length) next[date] = filtered;
                                              else delete next[date];
                                            } else {
                                              next[date] = [
                                                ...list,
                                                { role: emp.role, name: emp.name },
                                              ];
                                            }
                                            return next;
                                          })
                                        }
                                      />{" "}
                                      {emp.name}{" "}
                                      <span style={{ color: UI.muted }}>
                                        ({emp.role})
                                      </span>
                                    </label>
                                  );
                                })}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                <div className={layoutStyles.inlineSection}>
                  <div className={layoutStyles.inlineSectionHeader}>
                    <FileText size={15} />
                    <strong>Notes & accommodation</strong>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    style={{ ...field.textarea, minHeight: 70, background: "var(--color-surface)" }}
                    placeholder="Anything extra to include for this booking..."
                  />
                  <label style={{ ...field.checkboxRow, marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={hasHotel}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setHasHotel(on);
                        if (!on) {
                          setHotelPaidBy("");
                          setHotelNights("");
                          setHotelPricePerNight("");
                        }
                      }}
                    />
                    Hotel Booked
                  </label>
                  {hasHotel && (
                    <>
                      <div className={`edit-booking-hotel ${layoutStyles.extracted84}`}>
                        <div>
                          <label style={field.label}>Paid by</label>
                          <select value={hotelPaidBy} onChange={(e) => setHotelPaidBy(e.target.value)} style={field.input}>
                            <option value="">Select</option>
                            <option value="Production">Production</option>
                            <option value="Bickers">Bickers</option>
                          </select>
                        </div>
                        <div>
                          <label style={field.label}>Nights</label>
                          <input type="number" min={0} step={1} value={hotelNights} onChange={(e) => setHotelNights(e.target.value)} style={field.input} />
                        </div>
                        <div>
                          <label style={field.label}>Price per night</label>
                          <input type="number" min={0} step="0.01" value={hotelPricePerNight} onChange={(e) => setHotelPricePerNight(e.target.value)} style={field.input} />
                        </div>
                      </div>
                      <div className={layoutStyles.inlineHint}>
                        Total: <b>{hotelTotal ? `GBP ${hotelTotal.toFixed(2)}` : "-"}</b>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Column 3: Vehicles + Equipment */}
              <div className={layoutStyles.resourceCard} style={{ ...card, background: UI.page }}>
                <div className={layoutStyles.extracted47}>
                  <span style={iconBox(UI.brand, UI.brandSoft, UI.brandBorder)}><Truck size={17} /></span>
                  <h3 style={cardTitle}>Vehicles & Resources</h3>
                </div>
                <div className={layoutStyles.resourceHeader}>
                  <div className={layoutStyles.resourceTabs} role="tablist" aria-label="Booking resources">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={resourceTab === "vehicles"}
                      className={`${layoutStyles.resourceTab} ${resourceTab === "vehicles" ? layoutStyles.resourceTabActive : ""}`}
                      onClick={() => setResourceTab("vehicles")}
                    >
                      <Truck size={15} />
                      Vehicles
                      <span>{vehicles.length}</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={resourceTab === "equipment"}
                      className={`${layoutStyles.resourceTab} ${resourceTab === "equipment" ? layoutStyles.resourceTabActive : ""}`}
                      onClick={() => setResourceTab("equipment")}
                    >
                      <Package size={15} />
                      Equipment
                      <span>{equipment.length}</span>
                    </button>
                  </div>
                  <div className={layoutStyles.resourceSelectionSummary}>
                    {vehicles.length + equipment.length} selected
                  </div>
                </div>
                {(selectedVehicleDetails.length > 0 || equipment.length > 0) && (
                  <div className={layoutStyles.selectedResources} aria-label="Selected resources">
                    {selectedVehicleDetails.map((vehicle) => {
                      const label = vehicle.registration
                        ? `${vehicle.name} · ${vehicle.registration}`
                        : vehicle.name;
                      return (
                        <span key={vehicle.id} className={layoutStyles.selectionChip}>
                          <Truck size={12} aria-hidden="true" />
                          {label}
                          <button
                            type="button"
                            aria-label={`Remove ${label}`}
                            onClick={() => toggleVehicle(vehicle.id, false)}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })}
                    {equipment.map((name) => (
                      <span key={name} className={layoutStyles.selectionChip}>
                        <Package size={12} aria-hidden="true" />
                        {name}
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          onClick={() => setEquipment((current) => current.filter((item) => item !== name))}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className={layoutStyles.extracted48}>
                  <Search size={16} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} />
                  <input
                    type="text"
                    placeholder={resourceTab === "vehicles" ? "Search vehicles..." : "Search equipment..."}
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    style={{ ...field.input, paddingLeft: 34 }}
                  />
                </div>

                {resourceTab === "vehicles" && <>
                <div className={`edit-booking-assets ${layoutStyles.extracted49}`} >
                {Object.entries(filteredVehicleGroups).map(([group, items]) => {
                  const isOpen = openGroups[group] || false;

                  return (
                    <div key={group}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))
                        }
                        style={accordionBtn}
                      >
                        <span className={layoutStyles.extracted50}>
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {group}
                        </span>
                        <span style={pill}>{items.length}</span>
                      </button>

                      {isOpen && (
                        <div className={layoutStyles.extracted51}>
                          {items.map((vehicle) => {
                            const key = vehicle.id;
                            const isBooked = bookedVehicleIds.includes(key);
                            const statusesForConflict = blockingStatusesForPriorityEdit(
                              vehicleBlockingStatusesById[key] || [],
                              retainedPriorityVehicleIds.has(key)
                            );
                            const hasBookingConflict = existingVehicleStatusConflictsWithRequested(statusesForConflict, status);
                            const blockedStatus = vehicleBlockingStatusById[key];
                            const isHeld = heldVehicleIds.includes(key);
                            const isSelected = vehicles.includes(key);
                            const priorityStatuses = statusesForConflict.filter((existingStatus) =>
                              ["Confirmed", "First Pencil"].includes(String(existingStatus || "").trim())
                            );
                            const canAddAsSecondPencil =
                              hasBookingConflict &&
                              canAutoAssignVehicleAsSecondPencil(statusesForConflict, status);

                            const isMaintBlocked = maintenanceVehicleBlocking.ids.has(key);
                            const maintReason = maintenanceVehicleBlocking.reasonById[key] || "Maintenance";
                            const isComplianceBlocked = complianceVehicleBlocking.ids.has(key);
                            const complianceReason = complianceVehicleBlocking.reasonById[key] || "Compliance hold";
                            const isDefectBlocked = defectVehicleBlocking.ids.has(key);
                            const defectReason = defectVehicleBlocking.reasonById[key] || "Open safety defect";
                            // Maintenance, inspection/compliance and defect states remain visible as
                            // warnings. Only the existing booking pencil/status rules prevent selection.
                            const disabled = hasBookingConflict && !isSelected && !canAddAsSecondPencil;
                            const selectedBehindPriority =
                              isSelected &&
                              priorityStatuses.length > 0 &&
                              (vehicleStatus[key] || status) === SECOND_PENCIL_STATUS;

                            return (
                              <div
                                key={key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  marginBottom: 8,
                                  opacity: disabled ? 0.55 : 1,
                                  cursor: disabled ? "not-allowed" : "",
                                }}
                                title={
                                  disabled
                                    ? status === SECOND_PENCIL_STATUS
                                      ? "Vehicle already has a Second Pencil booking on overlapping date(s)"
                                      : `Vehicle is already ${blockedStatus || "booked"} on overlapping date(s). Use Second Pencil to add a softer hold.`
                                    : [
                                        canAddAsSecondPencil
                                          ? `Already ${priorityStatuses.join(" / ")} on the selected date(s). Selecting it will add it as Second Pencil.`
                                          : "",
                                        isMaintBlocked ? `${maintReason} overlaps the selected date(s)` : "",
                                        isComplianceBlocked ? complianceReason : "",
                                        isDefectBlocked ? defectReason : "",
                                      ].filter(Boolean).join("; ")
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={disabled}
                                  onChange={(e) =>
                                    toggleVehicle(
                                      key,
                                      e.target.checked,
                                      e.target.checked && canAddAsSecondPencil ? SECOND_PENCIL_STATUS : ""
                                    )
                                  }
                                />
                                <span style={{ flex: "1 1 180px", color: disabled ? "var(--color-text-muted)" : UI.text }}>
                                  {vehicle.name}
                                  {vehicle.registration ? ` - ${vehicle.registration}` : ""}
                                  {isDefectBlocked && !isBooked && !isMaintBlocked && ` (${defectReason})`}
                                  {isComplianceBlocked && !isBooked && !isMaintBlocked && ` (${complianceReason})`}
                                  {isMaintBlocked && !isBooked && ` (${maintReason})`}
                                  {isBooked && ` (${blockedStatus || "Blocked"})`}
                                  {!isBooked && !isMaintBlocked && isHeld && " (Held)"}
                                </span>

                                {isSelected && isUCraneVehicle(vehicle) && (
                                  <select
                                    value={isUCraneArmFitted(uCraneArmFitted, key) ? "fitted" : "not-fitted"}
                                    onChange={(e) =>
                                      setUCraneArmFitted((prev) => ({
                                        ...prev,
                                        [key]: e.target.value === "fitted",
                                      }))
                                    }
                                    className={layoutStyles.extracted52}
                                    aria-label={`${vehicle.name || "U-Crane vehicle"} arm setup`}
                                    title="Choose whether the U-Crane arm is fitted for this booking"
                                  >
                                    <option value="fitted">Arm fitted</option>
                                    <option value="not-fitted">Vehicle only — no arm</option>
                                  </select>
                                )}

                                {isSelected && (
                                  <select
                                    value={vehicleStatus[key] || status}
                                    onChange={(e) =>
                                      setVehicleStatus((prev) => ({
                                        ...prev,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    className={layoutStyles.extracted52}
                                    title="Vehicle status"
                                  >
                                    {VEHICLE_STATUSES.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {selectedBehindPriority && (
                                  <div
                                    role="status"
                                    style={{
                                      flex: "1 1 calc(100% - 24px)",
                                      maxWidth: "calc(100% - 24px)",
                                      minWidth: 0,
                                      marginLeft: 24,
                                      boxSizing: "border-box",
                                      padding: "6px 8px",
                                      border: `1px solid ${UI.amberBorder}`,
                                      borderRadius: UI.radiusSm,
                                      background: UI.amberSoft,
                                      color: UI.amber,
                                      fontSize: 12,
                                      fontWeight: 700,
                                    }}
                                  >
                                    This vehicle is already {priorityStatuses.join(" / ")} on the selected date(s). It has been added as Second Pencil.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>

                {Object.entries(filteredVehicleGroups).length === 0 && (
                  <div style={{ fontSize: 13, color: UI.muted, marginTop: 4 }}>No vehicles match that search.</div>
                )}
                </>}

                {resourceTab === "equipment" && <>
                <div className={`edit-booking-assets ${layoutStyles.extracted55}`} >
                {Object.entries(filteredEquipmentGroups).map(([group, items]) => {
                  const isOpen = openEquipGroups[group] || false;

                  return (
                    <div key={group}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenEquipGroups((prev) => ({ ...prev, [group]: !prev[group] }))
                        }
                        style={accordionBtn}
                      >
                        <span className={layoutStyles.extracted56}>
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {group}
                        </span>
                        <span style={pill}>{items.length}</span>
                      </button>

                      {isOpen && (
                        <div className={layoutStyles.extracted57}>
                          {items.map((rawName) => {
                            const name = String(rawName || "").trim();
                            const isBooked = bookedEquipment.includes(name);
                            const isHeld = heldEquipment.includes(name);
                            const isSelected = equipment.includes(name);
                            const isMaintBlocked = maintenanceEquipmentBlocking.names.has(name);
                            const maintReason = maintenanceEquipmentBlocking.reasonByName[name] || "Maintenance";
                            const disabled = (isBooked || isMaintBlocked) && !isSelected;

                            return (
                              <label
                                key={name}
                                style={{
                                  display: "block",
                  marginBottom: SPACE.sm,
                                  opacity: disabled ? 0.55 : 1,
                                  cursor: disabled ? "not-allowed" : "",
                                }}
                                title={
                                  disabled
                                    ? isMaintBlocked
                                      ? `Equipment is already booked for ${maintReason} on overlapping date(s)`
                                      : `Equipment is already booked on overlapping date(s)`
                                    : ""
                                }
                              >
                                <input
                                  type="checkbox"
                                  value={name}
                                  disabled={disabled}
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setEquipment((prev) => Array.from(new Set([...prev, name])));
                                    else setEquipment((prev) => prev.filter((x) => x !== name));
                                  }}
                                />{" "}
                                <span style={{ color: disabled ? "var(--color-text-muted)" : UI.text }}>
                                  {name}
                                  {isMaintBlocked && !isBooked && ` (${maintReason})`}
                                  {isBooked && " (Booked)"}
                                  {!isBooked && !isMaintBlocked && isHeld && " (Held)"}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>

                {Object.entries(filteredEquipmentGroups).length === 0 && (
                  <div style={{ fontSize: 13, color: UI.muted, marginTop: 4 }}>No equipment matches that search.</div>
                )}
                </>}
              </div>
            </div>

            {quoteCards.length ? (
              <div style={{ ...card, marginTop: SPACE.sm }}>
              <div className={layoutStyles.extracted58}>
                <div className={layoutStyles.extracted59}>
                  <span style={iconBox()}><FileText size={17} /></span>
                  <div>
                    <h3 style={cardTitle}>Quotes on this booking</h3>
                    <div style={{ color: UI.muted, fontSize: 12.5, marginTop: SPACE.xs }}>
                      Open, preview, print, download or remove an existing quote.
                    </div>
                  </div>
                </div>
              </div>
              <div className={layoutStyles.extracted60}>
                  {quoteCards.map((quoteCard) => (
                    <div
                      key={quoteCard.quoteNumber}
                      style={{
                        width: "100%",
                        display: "grid",
                        gridTemplateColumns: "minmax(150px, 0.7fr) minmax(220px, 1.5fr) auto",
                  gap: SPACE.md,
                        alignItems: "center",
                        textAlign: "left",
                  padding: SPACE.md,
                        border: UI.border,
                        borderRadius: UI.radiusSm,
                        background: quoteCard.isSaved ? "var(--color-surface)" : UI.bgAlt,
                        color: UI.text,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(quoteCard.href)}
                        style={{
                          display: "grid",
                    gap: SPACE.xs,
                          border: 0,
                          background: "transparent",
                          color: UI.text,
                          padding: 0,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <strong className={layoutStyles.extracted61}>{quoteCard.quoteNumber}</strong>
                        <span style={{ fontSize: 12, color: quoteCard.isSaved ? UI.green : UI.amber, fontWeight: 800 }}>
                          {quoteCard.isAccepted ? "Accepted" : quoteCard.status}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(quoteCard.href)}
                        style={{
                          display: "grid",
                    gap: SPACE.xs,
                          minWidth: 0,
                          border: 0,
                          background: "transparent",
                          color: UI.text,
                          padding: 0,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <span className={layoutStyles.extracted62}>
                          {quoteCard.name}
                        </span>
                        <span style={{ fontSize: 12, color: UI.muted }}>
                          {quoteCard.description}
                          {quoteCard.revisionCount > 1 ? ` - ${quoteCard.revisionCount} revisions` : ""}
                          {" - "}
                          {quoteCard.lineCount ? `${quoteCard.lineCount} line${quoteCard.lineCount === 1 ? "" : "s"}` : "No lines yet"}
                          {quoteCard.total ? ` - ${quoteCard.total}` : ""}
                          {quoteCard.savedAt ? ` - saved ${formatAuditDate(quoteCard.savedAt)}` : ""}
                          {quoteCard.savedBy ? ` by ${quoteCard.savedBy}` : ""}
                        </span>
                      </button>
                      <div className={layoutStyles.extracted63}>
                        {quoteCard.revisions.length > 1 ? (
                          <select
                            value={quoteCard.selectedRevisionNumber}
                            onChange={(event) =>
                              setSelectedQuoteRevisions((current) => ({
                                ...current,
                                [quoteCard.quoteNumber]: event.target.value,
                              }))
                            }
                            style={{
                              minHeight: 32,
                              border: "1px solid var(--color-border-strong)",
                              borderRadius: 8,
                              background: "var(--color-surface)",
                              color: UI.text,
                              fontSize: 12,
                              fontWeight: 800,
                            padding: `${SPACE.xs}px ${SPACE.sm}px`,
                            }}
                            title="Select quote revision"
                          >
                            {quoteCard.revisions.map((revision) => (
                              <option key={revision.quoteNumber} value={revision.quoteNumber}>
                                {revision.label}
                                {revision.savedAt ? ` - ${formatAuditDate(revision.savedAt)}` : ""}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => router.push(quoteCard.href)}
                          style={{ ...btnPrimary, minHeight: 32, padding: `${SPACE.xs}px ${SPACE.sm}px`, justifyContent: "center" }}
                        >
                          <FileText size={14} />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewQuoteNumber((current) =>
                              current === quoteCard.quoteNumber ? "" : quoteCard.quoteNumber
                            )
                          }
                            style={{ ...btnGhost, minHeight: 32, padding: `${SPACE.xs}px ${SPACE.sm}px`, justifyContent: "center" }}
                        >
                          <Search size={14} />
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(quoteCard.printHref)}
                            style={{ ...btnGhost, minHeight: 32, padding: `${SPACE.xs}px ${SPACE.sm}px`, justifyContent: "center" }}
                        >
                          <Printer size={14} />
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(quoteCard.downloadHref)}
                            style={{ ...btnGhost, minHeight: 32, padding: `${SPACE.xs}px ${SPACE.sm}px`, justifyContent: "center" }}
                        >
                          <Download size={14} />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteQuoteFromEditPage(quoteCard)}
                          disabled={Boolean(deletingQuoteNumber)}
                          style={{
                            ...btnDanger,
                            minHeight: 32,
                              padding: `${SPACE.xs}px ${SPACE.sm}px`,
                            justifyContent: "center",
                            cursor: deletingQuoteNumber ? "not-allowed" : "pointer",
                            opacity: deletingQuoteNumber ? 0.68 : 1,
                          }}
                        >
                          <Trash2 size={14} />
                          {deletingQuoteNumber === quoteCard.selectedRevisionNumber ? "Deleting..." : quoteCard.isSaved ? "Delete" : "Cancel draft"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {previewQuoteCard ? (
                    <div
                      style={{
                        border: UI.border,
                        borderRadius: UI.radiusSm,
                        background: "var(--color-surface-subtle)",
                        padding: 12,
                        display: "grid",
              gap: SPACE.md,
                      }}
                    >
                      <div className={layoutStyles.extracted64}>
                        <div>
                          <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800, textTransform: "uppercase" }}>
                            Preview
                          </div>
                          <div className={layoutStyles.extracted65}>{previewQuoteCard.name}</div>
                          <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                            {previewQuoteCard.quoteNumber}
                            {previewQuoteCard.revisionCount > 1 ? ` - ${previewQuoteCard.revisionCount} revisions` : ""}
                          </div>
                        </div>
                        <div className={layoutStyles.extracted66}>
                          <span style={{ ...pill, background: previewQuoteCard.isSaved ? UI.greenSoft : UI.amberSoft, color: previewQuoteCard.isSaved ? UI.green : UI.amber, borderColor: previewQuoteCard.isSaved ? UI.greenBorder : UI.amberBorder }}>
                            {previewQuoteCard.status}
                          </span>
                          {previewQuoteCard.total ? <span className={layoutStyles.extracted67}>{previewQuoteCard.total}</span> : null}
                        </div>
                      </div>
                      <div className={layoutStyles.extracted68}>
                        <div>
                          <div style={{ fontSize: 11, color: UI.muted, fontWeight: 800 }}>Description</div>
                          <div className={layoutStyles.extracted69}>{previewQuoteCard.description}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: UI.muted, fontWeight: 800 }}>Saved</div>
                          <div className={layoutStyles.extracted70}>
                            {previewQuoteCard.savedAt ? formatAuditDate(previewQuoteCard.savedAt) : "Not saved yet"}
                            {previewQuoteCard.savedBy ? ` by ${previewQuoteCard.savedBy}` : ""}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: UI.muted, fontWeight: 800 }}>Lines</div>
                          <div className={layoutStyles.extracted71}>{previewQuoteCard.lineCount || 0}</div>
                        </div>
                      </div>
                      {previewQuoteCard.previewLines.length ? (
                        <div className={layoutStyles.extracted72}>
                          {previewQuoteCard.previewLines.map((line, index) => (
                            <div
                              key={line.id || `${previewQuoteCard.quoteNumber}-line-${index}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(0, 1fr) auto auto",
                                gap: 8,
                                alignItems: "center",
                                fontSize: 12.5,
                                borderTop: index === 0 ? "1px solid var(--color-border)" : 0,
                                paddingTop: index === 0 ? 8 : 0,
                              }}
                            >
                              <span className={layoutStyles.extracted73}>
                                {line.description || line.section || "Untitled line"}
                              </span>
                              <span style={{ color: UI.muted }}>{line.qty ? `Qty ${line.qty}` : "-"}</span>
                              <span style={{ color: UI.muted }}>{line.unitPrice ? `GBP ${line.unitPrice}` : "-"}</span>
                            </div>
                          ))}
                          {previewQuoteCard.lineCount > previewQuoteCard.previewLines.length ? (
                            <div style={{ fontSize: 12, color: UI.muted }}>
                              +{previewQuoteCard.lineCount - previewQuoteCard.previewLines.length} more line{previewQuoteCard.lineCount - previewQuoteCard.previewLines.length === 1 ? "" : "s"}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: UI.muted }}>No quote lines saved yet.</div>
                      )}
                    </div>
                  ) : null}
              </div>
            </div>
            ) : null}

              <div className={layoutStyles.stickyActionBar}>
                <div className={layoutStyles.compactReview} aria-label="Booking review">
                  <strong>Job {jobNumber || "Draft"}</strong>
                  <span className={layoutStyles.reviewStatus} style={jobStatusBadgeStyle(status)}>{status || "No status"}</span>
                  <span>{formatSummaryDates(selectedDates) || "No dates"}</span>
                  <span>{location || "No location"}</span>
                  <span>{employees.filter((employee) => employee.name).length} crew</span>
                  <span>{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"} · {equipment.length} equipment</span>
                </div>
                <div className={layoutStyles.stickyActions}>
                  <button type="button" onClick={() => requestGuardedNavigation(() => router.push(returnHref))} style={btnGhost}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => window.print()} style={btnGhost}>
                    <Printer size={14} /> Print Job Sheet
                  </button>
                  <button
                    type="submit"
                    disabled={!coreFilled || saving}
                    title={saveTooltip}
                    className={layoutStyles.primaryAction}
                    style={{
                      ...btnPrimary,
                      opacity: coreFilled && !saving ? 1 : 0.5,
                      cursor: coreFilled && !saving ? "pointer" : "not-allowed",
                    }}
                  >
                    <Save size={14} />
                    {saving ? "Updating..." : "Update Booking"}
                  </button>
                </div>
              </div>
          </form>
        </div>
      </div>
      <EnquiryActionJobSheet
        enquiry={{
          jobNumber,
          quoteNumber,
          client,
          production,
          location,
          po,
          invoiceContactName,
          invoiceContactEmail,
          invoiceContactPhone,
          shootType,
          bookingDates: selectedDates,
          additionalContacts,
          selectedVehicles: selectedVehicleDetails,
          equipment,
          notes,
          hasHS,
          hasHotel,
          hotelNights,
        }}
      />
    </HeaderSidebarLayout>
  );
}
