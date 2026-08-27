// src/app/add-vehicle/page.js
"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { requestGuardedNavigation, useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import {
  getIsoWeekLabel,
  normalizeVehicleOperatingStatus,
  syncVehicleOperatingStatus,
} from "@/app/utils/maintenanceSchema";
import { buildVorPauseState } from "@/app/utils/vorPeriods";
import {
  HGV_COMPLIANCE_MIGRATION_VERSION,
  isHgvComplianceVehicle,
  syncCanonicalPmiAliases,
} from "@/app/utils/hgvCompliance";
import { ensureServiceHistoryForLastService } from "@/app/utils/serviceHistory";
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
import { ArrowLeft, Save } from "lucide-react";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import {
  Button as UIButton,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/app/components/ui";
import { syncVehicleAnnualMaintenanceForecast } from "@/app/utils/maintenanceMutationClient";

/* UI tokens */
const UI = UI_TOKENS;

const shell = { minHeight: "100vh", background: UI.bg, color: UI.text };
const main = { flex: 1, padding: "16px 16px 32px", maxWidth: 1280, margin: "0 auto" };
const headerRow = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const h1 = { margin: 0, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0 };
const sub = { marginTop: 6, fontSize: 13.5, lineHeight: 1.45, color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const sectionTitle = { margin: "0 0 10px", fontSize: 15, fontWeight: 950, color: UI.text };

const grid = { display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 10 };
const col = (span) => ({ gridColumn: `span ${span}`, minWidth: 0 });

const label = { display: "block", marginBottom: 4, fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: 0 };
const input = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: 13,
  background: "var(--color-surface)",
  color: UI.text,
  outline: "none",
};
const textarea = { ...input, minHeight: 92, resize: "vertical" };

const btn = (bg = "var(--color-white)", fg = UI.text, bd = "1px solid var(--color-border)") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  border: bg === UI.brand ? `1px solid ${UI.brand}` : bd === "1px solid var(--color-border)" ? `1px solid ${UI.brandBorder}` : bd,
  background:
    bg === UI.brand
      ? "var(--button-primary-background)"
      : "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
  color: bg === UI.brand ? "var(--color-white)" : fg,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  boxShadow:
    bg === UI.brand
      ? "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)"
      : "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
  fontSize: 12.5,
  lineHeight: 1.2,
});

const helpText = { marginTop: 6, fontSize: 12, color: UI.muted };
const RETENTION_PLATE_CATEGORY = "Number Plates On Retention";
const NEW_CATEGORY_OPTION = "__new_category__";
const INITIAL_FORM_DATA = {
  name: "",
  registration: "",
  category: "",
  manufacturer: "",
  model: "",
  chassis: "",
  odometer: "",
  operationalStatus: "Active",
  notes: "",
  retentionExpiry: "",
  plateType: "retention",
  plateExpiryFreq: "",
  lastService: "",
  serviceFreq: "",
  nextService: "",
  serviceISOWeek: "",
  lastMOT: "",
  motFreq: "",
  nextMOT: "",
  motISOWeek: "",
  taxStatus: "Taxed",
  lastRFL: "",
  rflFreq: "",
  nextRFL: "",
  insuranceStatus: "Insured",
  insuredUntil: "",
  warranty: "No",
  warrantyExpiry: "",
  eightWeekInspectionStart: "",
  nextEightWeekInspection: "",
  eightWeekInspectionISOWeek: "",
  lastTacho: "",
  tachoFreq: "",
  nextTacho: "",
  tachoISOWeek: "",
  lastBrakeTest: "",
  brakeTestFreq: "",
  nextBrakeTest: "",
  brakeISOWeek: "",
  lastPMI: "",
  pmiFreq: "",
  nextPMI: "",
  pmiISOWeek: "",
  lastTachoDownload: "",
  tachoDownloadFreq: "",
  nextTachoDownload: "",
  tachoDownloadISOWeek: "",
  lastTailLift: "",
  tailLiftFreq: "",
  nextTailLift: "",
  tailLiftISOWeek: "",
  lastLoler: "",
  lolerFreq: "",
  nextLoler: "",
  lolerISOWeek: "",
  lastTachoCalibration: "",
  tachoCalibrationFreq: "",
  nextTachoCalibration: "",
  tachoCalibrationISOWeek: "",
  lastLorryInspection: "",
  lorryInspectionFreq: "",
  nextLorryInspection: "",
  lorryInspectionISOWeek: "",
};

const ADDITIONAL_MAINTENANCE_SECTIONS = [
  {
    key: "tachoInspection",
    workflowKey: "tacho_inspection",
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
    workflowKey: "brake_test",
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
    workflowKey: "pmi",
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
    workflowKey: "tacho_download",
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
    workflowKey: "tail_lift",
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
    workflowKey: "loler",
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
    workflowKey: "tacho_calibration",
    label: "Tacho Calibration",
    fields: [
      { type: "date", label: "Last Tacho Calibration", name: "lastTachoCalibration" },
      { type: "text", label: "Tacho Calibration Freq (weeks)", name: "tachoCalibrationFreq" },
      { type: "date", label: "Next Tacho Calibration", name: "nextTachoCalibration" },
      { type: "text", label: "Tacho Calibration ISO Week", name: "tachoCalibrationISOWeek" },
    ],
  },
];

const parseLocalDateOnly = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const clampISODate = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const addWeeksToISO = (isoDate, weeks) => {
  const d = parseLocalDateOnly(isoDate);
  const w = Number(weeks || 0);
  if (!d || !w) return "";
  d.setDate(d.getDate() + w * 7);
  return clampISODate(d);
};
const isPastISODate = (isoDate) => {
  const d = parseLocalDateOnly(isoDate);
  if (!d) return false;
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return d.getTime() < todayMidnight.getTime();
};
const isTransportLorryVehicle = (vehicle = {}) => {
  const haystack = [vehicle.category, vehicle.name, vehicle.manufacturer, vehicle.model]
    .map((value) => String(value || "").trim().toLowerCase())
    .join(" ");
  return haystack.includes("lorry") || haystack.includes("transport");
};
const sectionHasValue = (formData, section) =>
  section.fields.some((field) => String(formData?.[field.name] || "").trim());
const safeArr = (value) => (Array.isArray(value) ? value : []);
const initialComplianceHistory = ({
  maintenanceTypeId,
  label: historyLabel,
  completedDate,
  user,
}) =>
  completedDate
    ? [
        {
          maintenanceTypeId,
          label: historyLabel,
          completedDate,
          completedAt: new Date().toISOString(),
          completedBy: {
            uid: String(user?.uid || "").trim(),
            name: String(user?.displayName || user?.email || "").trim(),
            email: String(user?.email || "").trim(),
          },
          source: "vehicle_creation",
          bookingId: "",
          documents: [],
        },
      ]
    : [];

export default function AddVehiclePage() {
  const router = useRouter();
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);
  const [isNumberPlateMode, setIsNumberPlateMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [existingCategories, setExistingCategories] = useState([]);
  const [vehicleComplianceSettings, setVehicleComplianceSettings] = useState(DEFAULT_VEHICLE_COMPLIANCE_SETTINGS);
  const [newCategory, setNewCategory] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [shownAdditionalMaintenance, setShownAdditionalMaintenance] = useState([]);
  const [vorPrompt, setVorPrompt] = useState(null);

  const [formData, setFormData] = useState({ ...INITIAL_FORM_DATA });
  const tradePlateExpiryWeeks = String(
    vehicleComplianceSettings.tradePlateExpiryWeeks || DEFAULT_VEHICLE_COMPLIANCE_SETTINGS.tradePlateExpiryWeeks
  );
  const isHgvVehicle = useMemo(() => isHgvComplianceVehicle(formData), [formData]);

  useEffect(() => {
    setIsNumberPlateMode(new URLSearchParams(window.location.search).get("type") === "number-plate");
  }, []);

  useEffect(() => {
    if (!isNumberPlateMode) return;
    setFormData((prev) => ({
      ...prev,
      category: RETENTION_PLATE_CATEGORY,
      taxStatus: "N/A",
      insuranceStatus: "N/A",
    }));
  }, [isNumberPlateMode]);

  useEffect(() => {
    if (!isHgvVehicle || isNumberPlateMode) return;
    setShownAdditionalMaintenance((current) => [
      ...new Set([...current, "brakeTest", "pmiInspection"]),
    ]);
    setFormData((previous) => {
      const updates = {};
      if (!previous.brakeTestFreq) updates.brakeTestFreq = "8";
      if (!previous.pmiFreq) updates.pmiFreq = "8";
      return Object.keys(updates).length ? { ...previous, ...updates } : previous;
    });
  }, [isHgvVehicle, isNumberPlateMode]);

  // Pull categories from existing vehicles so the dropdown stays consistent
  useEffect(() => {
    const loadCats = async () => {
      const gate = resolveDataAccess(authState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "load vehicle categories" });
        return;
      }

      try {
        const [snap, fleetSettings] = await Promise.all([
          getDocs(tenantCollectionQuery(db, "vehicles", authState)),
          loadVehicleFleetSettings(db).catch((error) => {
            console.warn("Vehicle category settings unavailable:", error);
            return { categories: [], compliance: DEFAULT_VEHICLE_COMPLIANCE_SETTINGS };
          }),
        ]);
        const cats = snap.docs
          .map((d) => d.data()?.category)
          .filter(Boolean);
        setVehicleComplianceSettings(fleetSettings.compliance || DEFAULT_VEHICLE_COMPLIANCE_SETTINGS);
        const unique = uniqueVehicleCategoryNames([
          ...(fleetSettings.categories || []),
          ...cats,
          "HGV",
          "HGV Trailers",
          RETENTION_PLATE_CATEGORY,
        ]);
        setExistingCategories(unique);
      } catch (e) {
        console.error("Load categories failed:", e);
      }
    };
    loadCats();
  }, [accessKey, authState]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (/^last/i.test(name) && value && value > clampISODate(new Date())) {
      systemDialogs.showSystemNotification("A last-completed date cannot be in the future. Create the vehicle, book the work, then mark it complete when it has been done.");
      return;
    }

    if (name === "category") {
      if (value === NEW_CATEGORY_OPTION) {
        setIsCreatingCategory(true);
        setFormData((prev) => ({ ...prev, category: newCategory.trim() }));
        return;
      }

      setIsCreatingCategory(false);
      setNewCategory("");
      setFormData((prev) => ({ ...prev, category: value }));
      return;
    }

    // numeric fields
    const numeric = [
      "odometer",
      "serviceFreq",
      "motFreq",
      "plateExpiryFreq",
      "rflFreq",
      "tachoFreq",
      "brakeTestFreq",
      "pmiFreq",
      "tachoDownloadFreq",
      "tailLiftFreq",
      "lolerFreq",
      "tachoCalibrationFreq",
      "lorryInspectionFreq",
    ];
    const v = numeric.includes(name) ? (value === "" ? "" : String(value).replace(/[^\d]/g, "")) : value;

    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: v,
        ...(name === "plateType" && value === "trade"
          ? { plateExpiryFreq: tradePlateExpiryWeeks }
          : {}),
      };
      const calculation = [
        ["lastMOT", "motFreq", "nextMOT", "motISOWeek"],
        ["lastService", "serviceFreq", "nextService", "serviceISOWeek"],
        ["lastRFL", "rflFreq", "nextRFL", ""],
        ["lastTacho", "tachoFreq", "nextTacho", "tachoISOWeek"],
        ["lastBrakeTest", "brakeTestFreq", "nextBrakeTest", "brakeISOWeek"],
        ["lastPMI", "pmiFreq", "nextPMI", "pmiISOWeek"],
        ["lastTachoDownload", "tachoDownloadFreq", "nextTachoDownload", "tachoDownloadISOWeek"],
        ["lastTailLift", "tailLiftFreq", "nextTailLift", "tailLiftISOWeek"],
        ["lastLoler", "lolerFreq", "nextLoler", "lolerISOWeek"],
        ["lastTachoCalibration", "tachoCalibrationFreq", "nextTachoCalibration", "tachoCalibrationISOWeek"],
        ["lastLorryInspection", "lorryInspectionFreq", "nextLorryInspection", "lorryInspectionISOWeek"],
      ].find(([lastKey, freqKey]) => name === lastKey || name === freqKey);

      if (calculation) {
        const [lastKey, freqKey, nextKey, isoKey] = calculation;
        const nextDate = addWeeksToISO(next[lastKey], next[freqKey]);
        if (nextDate) {
          next[nextKey] = nextDate;
          if (isoKey) next[isoKey] = getIsoWeekLabel(nextDate);
        }
      }
      return next;
    });
  };

  const handleWarrantyToggle = (event) => {
    const enabled = event.target.checked;
    setFormData((previous) => ({
      ...previous,
      warranty: enabled ? "Yes" : "No",
    }));
  };

  const handleOperatingStatusChange = (event) => {
    const nextStatus = normalizeVehicleOperatingStatus(event.target.value);
    if (nextStatus === "VOR") {
      setVorPrompt({
        offRoadDate: clampISODate(new Date()),
        odometer: formData.odometer || "",
        approvedBy: "",
        approvedPosition: "",
        reason: "",
        operatorLicenceNumber: "OF0202656",
      });
      return;
    }
    setFormData((previous) => ({
      ...syncVehicleOperatingStatus(previous, "Active"),
      vorStartedAt: "",
      activeVorRecordId: "",
      vorHistory: [],
    }));
  };

  const updateVorPrompt = (field, value) => {
    setVorPrompt((previous) => (previous ? { ...previous, [field]: value } : previous));
  };

  const confirmNewVehicleVor = () => {
    const required = [
      ["offRoadDate", "date taken off the fleet"],
      ["approvedBy", "VOR approver"],
      ["approvedPosition", "approver position"],
      ["reason", "reason for VOR"],
    ];
    const missing = required.find(([field]) => !String(vorPrompt?.[field] || "").trim());
    if (missing) {
      systemDialogs.showSystemNotification(`Enter the ${missing[1]} before marking this vehicle VOR.`);
      return;
    }
    const startedAt = new Date().toISOString();
    const recordId = `vor-${Date.now()}`;
    const maintenancePause = buildVorPauseState(
      formData,
      vorPrompt.offRoadDate,
      recordId
    );
    const record = {
      id: recordId,
      status: "open",
      registration: formData.registration || "",
      operatorLicenceNumber: String(vorPrompt.operatorLicenceNumber || "").trim(),
      offRoadDate: vorPrompt.offRoadDate,
      offRoadOdometer: String(vorPrompt.odometer || "").trim(),
      approvedBy: String(vorPrompt.approvedBy || "").trim(),
      approvedPosition: String(vorPrompt.approvedPosition || "").trim(),
      reason: String(vorPrompt.reason || "").trim(),
      maintenanceDueDatesAtStart: maintenancePause.dueDates,
      startedAt,
    };
    setFormData((previous) => ({
      ...syncVehicleOperatingStatus(previous, "VOR"),
      odometer: vorPrompt.odometer || previous.odometer,
      vorStartedAt: startedAt,
      activeVorRecordId: record.id,
      maintenanceCountdownPause: maintenancePause,
      vorHistory: [record],
    }));
    setVorPrompt(null);
  };

  // Auto-calc next dates and ISO week labels so new records match edit-page behaviour.
  useEffect(() => {
    if (normalizeVehicleOperatingStatus(formData) === "VOR") return;
    const updates = {};

    if (formData.lastMOT && formData.motFreq) {
      const calc = addWeeksToISO(formData.lastMOT, formData.motFreq);
      if (calc && formData.nextMOT !== calc) updates.nextMOT = calc;
    }
    if (formData.lastService && formData.serviceFreq) {
      const calc = addWeeksToISO(formData.lastService, formData.serviceFreq);
      if (calc && formData.nextService !== calc) updates.nextService = calc;
    }
    if (formData.lastRFL && formData.rflFreq) {
      const calc = addWeeksToISO(formData.lastRFL, formData.rflFreq);
      if (calc && formData.nextRFL !== calc) updates.nextRFL = calc;
    }
    [
      ["lastTacho", "tachoFreq", "nextTacho"],
      ["lastBrakeTest", "brakeTestFreq", "nextBrakeTest"],
      ["lastPMI", "pmiFreq", "nextPMI"],
      ["lastTachoDownload", "tachoDownloadFreq", "nextTachoDownload"],
      ["lastTailLift", "tailLiftFreq", "nextTailLift"],
      ["lastLoler", "lolerFreq", "nextLoler"],
      ["lastTachoCalibration", "tachoCalibrationFreq", "nextTachoCalibration"],
    ].forEach(([lastKey, freqKey, nextKey]) => {
      if (!formData[lastKey] || !formData[freqKey]) return;
      const calc = addWeeksToISO(formData[lastKey], formData[freqKey]);
      if (calc && formData[nextKey] !== calc) updates[nextKey] = calc;
    });

    const nextMot = updates.nextMOT ?? formData.nextMOT;
    const nextService = updates.nextService ?? formData.nextService;
    const nextPmi = updates.nextPMI ?? formData.nextPMI;
    if (nextPmi && formData.nextEightWeekInspection !== nextPmi) {
      updates.nextEightWeekInspection = nextPmi;
    }
    if (nextPmi && formData.nextLorryInspection !== nextPmi) {
      updates.nextLorryInspection = nextPmi;
    }
    const nextInspection = updates.nextEightWeekInspection ?? formData.nextEightWeekInspection;
    const motIso = getIsoWeekLabel(nextMot);
    const serviceIso = getIsoWeekLabel(nextService);
    const inspectionIso = getIsoWeekLabel(nextInspection);

    if (motIso && formData.motISOWeek !== motIso) updates.motISOWeek = motIso;
    if (serviceIso && formData.serviceISOWeek !== serviceIso) updates.serviceISOWeek = serviceIso;
    if (inspectionIso && formData.eightWeekInspectionISOWeek !== inspectionIso) {
      updates.eightWeekInspectionISOWeek = inspectionIso;
    }

    [
      ["nextTacho", "tachoISOWeek"],
      ["nextBrakeTest", "brakeISOWeek"],
      ["nextPMI", "pmiISOWeek"],
      ["nextTachoDownload", "tachoDownloadISOWeek"],
      ["nextTailLift", "tailLiftISOWeek"],
      ["nextLoler", "lolerISOWeek"],
      ["nextTachoCalibration", "tachoCalibrationISOWeek"],
      ["nextLorryInspection", "lorryInspectionISOWeek"],
    ].forEach(([nextKey, isoKey]) => {
      const iso = getIsoWeekLabel(updates[nextKey] ?? formData[nextKey]);
      if (iso && formData[isoKey] !== iso) updates[isoKey] = iso;
    });

    if (Object.keys(updates).length) {
      setFormData((prev) => ({ ...prev, ...updates }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.lastMOT,
    formData.motFreq,
    formData.nextMOT,
    formData.lastService,
    formData.serviceFreq,
    formData.nextService,
    formData.lastRFL,
    formData.rflFreq,
    formData.nextRFL,
    formData.eightWeekInspectionStart,
    formData.nextEightWeekInspection,
    formData.lastTacho,
    formData.tachoFreq,
    formData.lastBrakeTest,
    formData.brakeTestFreq,
    formData.lastPMI,
    formData.pmiFreq,
    formData.lastTachoDownload,
    formData.tachoDownloadFreq,
    formData.lastTailLift,
    formData.tailLiftFreq,
    formData.lastLoler,
    formData.lolerFreq,
    formData.lastTachoCalibration,
    formData.tachoCalibrationFreq,
    formData.lastLorryInspection,
    formData.lorryInspectionFreq,
  ]);

  const showEightWeekInspection = useMemo(
    () => isTransportLorryVehicle(formData) && !isHgvVehicle,
    [formData, isHgvVehicle]
  );

  const visibleAdditionalMaintenanceSections = useMemo(
    () =>
      ADDITIONAL_MAINTENANCE_SECTIONS.filter(
        (section) => shownAdditionalMaintenance.includes(section.key) || sectionHasValue(formData, section)
      ),
    [formData, shownAdditionalMaintenance]
  );

  const toggleAdditionalMaintenance = (key) => {
    setShownAdditionalMaintenance((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const canSave = useMemo(() => {
    if (isNumberPlateMode) return formData.registration.trim();

    return (
      formData.name.trim() &&
      formData.registration.trim() &&
      formData.category.trim()
    );
  }, [formData, isNumberPlateMode]);

  const hasUnsavedChanges = useMemo(() => {
    const baseline = isNumberPlateMode
      ? {
          ...INITIAL_FORM_DATA,
          category: RETENTION_PLATE_CATEGORY,
          taxStatus: "N/A",
          insuranceStatus: "N/A",
        }
      : INITIAL_FORM_DATA;

    return Object.entries(formData).some(([key, value]) => {
      return String(value || "").trim() !== String(baseline[key] || "").trim();
    });
  }, [formData, isNumberPlateMode]);

  const handleSubmit = async (e, options = {}) => {
    e?.preventDefault?.();
    if (!canSave || saving) return false;

    const { navigateOnSuccess = true } = options;
    const gate = resolveDataAccess(authState);
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "add vehicle" });
      systemDialogs.showSystemNotification(gate.reason || "You do not have permission to add vehicles.");
      return false;
    }

    setSaving(true);
    try {
      const odometerValue = isNumberPlateMode || formData.odometer === "" ? "" : Number(formData.odometer);
      const registration = formData.registration.trim();
      const manufacturer = isNumberPlateMode ? "" : formData.manufacturer.trim();
      const lastMot = isNumberPlateMode ? "" : formData.lastMOT || "";
      const nextMot = isNumberPlateMode ? "" : formData.nextMOT || "";
      const lastService = isNumberPlateMode ? "" : formData.lastService || "";
      const nextService = isNumberPlateMode ? "" : formData.nextService || "";
      const insuredUntil =
        isNumberPlateMode || formData.insuranceStatus !== "Insured" || isPastISODate(formData.insuredUntil)
          ? ""
          : formData.insuredUntil || "";
      const nextRFL =
        isNumberPlateMode || formData.taxStatus !== "Taxed" || isPastISODate(formData.nextRFL)
          ? ""
          : formData.nextRFL || "";
      const taxStatus =
        isNumberPlateMode
          ? "N/A"
          : formData.taxStatus === "Taxed" && formData.nextRFL && isPastISODate(formData.nextRFL)
            ? "Sorn"
            : formData.taxStatus || "Taxed";
      const insuranceStatus =
        isNumberPlateMode
          ? "N/A"
          : formData.insuranceStatus === "Insured" && formData.insuredUntil && isPastISODate(formData.insuredUntil)
            ? "Not Insured"
            : formData.insuranceStatus || "Insured";
      const hiddenAdditionalMaintenance = ADDITIONAL_MAINTENANCE_SECTIONS
        .filter(
          (section) =>
            !shownAdditionalMaintenance.includes(section.key) &&
            !sectionHasValue(formData, section)
        )
        .map((section) => section.workflowKey);
      const createdBy = authState?.user || null;

      // Build clean payload (avoid empty strings where possible)
      const payload = {
        name: isNumberPlateMode ? (formData.name.trim() || registration) : formData.name.trim(),
        vehicleName: isNumberPlateMode ? (formData.name.trim() || registration) : formData.name.trim(),
        registration,
        reg: registration,
        registrationNumber: registration,
        category: isNumberPlateMode ? RETENTION_PLATE_CATEGORY : formData.category.trim(),
        recordType: isNumberPlateMode ? "numberPlateRetention" : "vehicle",
        ...syncVehicleOperatingStatus(
          {},
          isNumberPlateMode ? "Active" : normalizeVehicleOperatingStatus(formData)
        ),
        vorStartedAt: isNumberPlateMode ? "" : formData.vorStartedAt || "",
        activeVorRecordId: isNumberPlateMode ? "" : formData.activeVorRecordId || "",
        maintenanceCountdownPause: isNumberPlateMode
          ? null
          : formData.maintenanceCountdownPause || null,
        vorHistory: isNumberPlateMode ? [] : safeArr(formData.vorHistory),
        plateType: isNumberPlateMode ? formData.plateType || "retention" : "",
        plateExpiryFreq: isNumberPlateMode && formData.plateType === "trade" ? tradePlateExpiryWeeks : formData.plateExpiryFreq || "",

        manufacturer,
        make: manufacturer,
        model: isNumberPlateMode ? "" : formData.model.trim(),
        chassis: isNumberPlateMode ? "" : formData.chassis.trim(),

        odometer: odometerValue,
        mileage: odometerValue,
        serviceOdometer: odometerValue,
        notes: formData.notes || "",
        retentionExpiry: isNumberPlateMode ? formData.retentionExpiry || "" : "",

        lastService,
        lastServiceDate: lastService,
        serviceFreq: isNumberPlateMode ? "" : formData.serviceFreq || "",
        nextService,
        nextServiceDate: nextService,
        serviceDueDate: nextService,
        serviceISOWeek: isNumberPlateMode ? "" : formData.serviceISOWeek || getIsoWeekLabel(nextService),
        serviceHistory: ensureServiceHistoryForLastService([], lastService, {
          recordedAt: new Date().toISOString(),
        }),
        serviceHistoryFiles: [],

        lastMOT: lastMot,
        lastMot,
        lastMotDate: lastMot,
        motFreq: isNumberPlateMode ? "" : formData.motFreq || "",
        nextMOT: nextMot,
        nextMot,
        nextMotDate: nextMot,
        motDueDate: nextMot,
        motISOWeek: isNumberPlateMode ? "" : formData.motISOWeek || getIsoWeekLabel(nextMot),
        motHistory: initialComplianceHistory({
          maintenanceTypeId: "mot",
          label: "MOT",
          completedDate: lastMot,
          user: createdBy,
        }),
        dvsaMotTests: [],
        motPrecheckStatus: "",
        motPrecheckDate: "",
        preChecksSummary: "",
        preChecksNotes: "",
        preChecks: {},
        preChecksFiles: [],

        taxStatus,
        lastRFL: isNumberPlateMode ? "" : formData.lastRFL || "",
        rflFreq: isNumberPlateMode ? "" : formData.rflFreq || "",
        nextRFL,
        insuredUntil,
        insuranceExpiry: insuredUntil,
        insuranceExpiryDate: insuredUntil,
        insuranceUntil: insuredUntil,
        insuranceStatus,

        warranty: isNumberPlateMode ? "No" : formData.warranty || "No",
        warrantyExpiry: isNumberPlateMode ? "" : formData.warrantyExpiry || "",

        eightWeekInspectionStart: isNumberPlateMode ? "" : formData.eightWeekInspectionStart || "",
        nextEightWeekInspection: isNumberPlateMode ? "" : formData.nextEightWeekInspection || "",
        eightWeekInspectionISOWeek:
          isNumberPlateMode
            ? ""
            : formData.eightWeekInspectionISOWeek || getIsoWeekLabel(formData.nextEightWeekInspection),
        eightWeekInspectionHistory: [],

        lastTacho: isNumberPlateMode ? "" : formData.lastTacho || "",
        tachoFreq: isNumberPlateMode ? "" : formData.tachoFreq || "",
        nextTacho: isNumberPlateMode ? "" : formData.nextTacho || "",
        tachoISOWeek: isNumberPlateMode ? "" : formData.tachoISOWeek || getIsoWeekLabel(formData.nextTacho),
        lastBrakeTest: isNumberPlateMode ? "" : formData.lastBrakeTest || "",
        brakeTestFreq: isNumberPlateMode ? "" : formData.brakeTestFreq || "",
        nextBrakeTest: isNumberPlateMode ? "" : formData.nextBrakeTest || "",
        brakeISOWeek: isNumberPlateMode ? "" : formData.brakeISOWeek || getIsoWeekLabel(formData.nextBrakeTest),
        lastPMI: isNumberPlateMode ? "" : formData.lastPMI || "",
        pmiFreq: isNumberPlateMode ? "" : formData.pmiFreq || "",
        nextPMI: isNumberPlateMode ? "" : formData.nextPMI || "",
        pmiISOWeek: isNumberPlateMode ? "" : formData.pmiISOWeek || getIsoWeekLabel(formData.nextPMI),
        pmiHistory: initialComplianceHistory({
          maintenanceTypeId: "pmi",
          label: "PMI inspection",
          completedDate: isNumberPlateMode ? "" : formData.lastPMI,
          user: createdBy,
        }),
        brakeTestHistory: initialComplianceHistory({
          maintenanceTypeId: "brake_test",
          label: "Brake test",
          completedDate: isNumberPlateMode ? "" : formData.lastBrakeTest,
          user: createdBy,
        }),
        lastTachoDownload: isNumberPlateMode ? "" : formData.lastTachoDownload || "",
        tachoDownloadFreq: isNumberPlateMode ? "" : formData.tachoDownloadFreq || "",
        nextTachoDownload: isNumberPlateMode ? "" : formData.nextTachoDownload || "",
        tachoDownloadISOWeek:
          isNumberPlateMode ? "" : formData.tachoDownloadISOWeek || getIsoWeekLabel(formData.nextTachoDownload),
        lastTailLift: isNumberPlateMode ? "" : formData.lastTailLift || "",
        tailLiftFreq: isNumberPlateMode ? "" : formData.tailLiftFreq || "",
        nextTailLift: isNumberPlateMode ? "" : formData.nextTailLift || "",
        tailLiftISOWeek: isNumberPlateMode ? "" : formData.tailLiftISOWeek || getIsoWeekLabel(formData.nextTailLift),
        lastLoler: isNumberPlateMode ? "" : formData.lastLoler || "",
        lolerFreq: isNumberPlateMode ? "" : formData.lolerFreq || "",
        nextLoler: isNumberPlateMode ? "" : formData.nextLoler || "",
        lolerISOWeek: isNumberPlateMode ? "" : formData.lolerISOWeek || getIsoWeekLabel(formData.nextLoler),
        lastTachoCalibration: isNumberPlateMode ? "" : formData.lastTachoCalibration || "",
        tachoCalibrationFreq: isNumberPlateMode ? "" : formData.tachoCalibrationFreq || "",
        nextTachoCalibration: isNumberPlateMode ? "" : formData.nextTachoCalibration || "",
        tachoCalibrationISOWeek:
          isNumberPlateMode ? "" : formData.tachoCalibrationISOWeek || getIsoWeekLabel(formData.nextTachoCalibration),
        lastLorryInspection: isNumberPlateMode ? "" : formData.lastLorryInspection || "",
        lorryInspectionFreq: isNumberPlateMode ? "" : formData.lorryInspectionFreq || "",
        nextLorryInspection: isNumberPlateMode ? "" : formData.nextLorryInspection || "",
        lorryInspectionISOWeek:
          isNumberPlateMode ? "" : formData.lorryInspectionISOWeek || getIsoWeekLabel(formData.nextLorryInspection),
        hiddenAdditionalMaintenance: isNumberPlateMode
          ? ADDITIONAL_MAINTENANCE_SECTIONS.map((section) => section.workflowKey)
          : hiddenAdditionalMaintenance,
        hgvComplianceMigrationVersion:
          !isNumberPlateMode && isHgvVehicle
            ? HGV_COMPLIANCE_MIGRATION_VERSION
            : 0,
        hgvComplianceMigratedAt:
          !isNumberPlateMode && isHgvVehicle ? new Date().toISOString() : "",
        complianceVor:
          !isNumberPlateMode && isHgvVehicle
            ? {
                version: 1,
                state: "clear",
                reasons: {},
                freshPmiCompletedAt: "",
                releaseRequired: false,
                lastEvaluatedAt: new Date().toISOString(),
              }
            : null,
        defects: [],
        attachments: [],
        files: [],

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (!isNumberPlateMode && isHgvVehicle) {
        Object.assign(payload, syncCanonicalPmiAliases(payload));
      }

      const createdVehicle = await addDoc(
        collection(db, "vehicles"),
        tenantPayload(authState, payload)
      );
      let forecastSyncFailed = false;
      if (!isNumberPlateMode) {
        const scheduleYears = new Set();
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
        try {
          for (const forecastYear of [...scheduleYears].sort()) {
            await syncVehicleAnnualMaintenanceForecast({
              vehicle: { ...payload, id: createdVehicle.id },
              year: forecastYear,
            });
          }
        } catch (forecastError) {
          forecastSyncFailed = true;
          console.error("Could not create initial maintenance due items:", forecastError);
        }
      }

      systemDialogs.showSystemNotification(
        isNumberPlateMode
          ? "Number plate added"
          : forecastSyncFailed
          ? "Vehicle added, but its maintenance due items could not be created. Ask a Service, Workshop or Admin user to run maintenance reconciliation."
          : "Vehicle added"
      );
      if (navigateOnSuccess) {
        router.push("/vehicles");
        router.refresh?.();
      }
      return true;
    } catch (err) {
      if (handleFirestoreAccessError(err, { collectionName: "vehicles", operation: "add vehicle" })) {
        systemDialogs.showSystemNotification("You do not have permission to add vehicles.");
        return false;
      }
      console.error("Error adding vehicle:", err);
      systemDialogs.showSystemNotification("Failed to add vehicle");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => requestGuardedNavigation(() => router.push("/vehicles"));

  useUnsavedChangesGuard({
    enabled: true,
    isDirty: hasUnsavedChanges && !saving,
    onSave: () => handleSubmit(null, { navigateOnSuccess: false }),
  });

  if (isNumberPlateMode) {
    return (
      <HeaderSidebarLayout showBackButton={false}>
        <div style={shell}>
          <main className={layoutStyles.extracted1}>
            <div className={layoutStyles.extracted2}>
              <div>
                <h1 className={layoutStyles.extracted3}>Add Retention Plate</h1>
                <div style={sub}>Create a simple number plate record and track the retention expiry date.</div>
              </div>

              <div className={layoutStyles.extracted4}>
                <button type="button" className="add-vehicle-action" style={btn("var(--color-white)", UI.text)} onClick={handleCancel}>
                  <ArrowLeft size={15} />
                  Cancel
                </button>
                <button
                  type="button"
                  className="add-vehicle-action"
                  style={btn(UI.brand, "var(--color-white)", `1px solid ${UI.brand}`)}
                  onClick={handleSubmit}
                  disabled={!canSave || saving}
                  title={!canSave ? "Fill Number Plate" : ""}
                >
                  <Save size={15} />
                  {saving ? "Saving..." : "Save Number Plate"}
                </button>
              </div>
            </div>

            <div className={layoutStyles.extracted5} />

            <form onSubmit={handleSubmit} className={layoutStyles.extracted6}>
              <div style={{ ...card, padding: 12 }}>
                <div style={sectionTitle}>Number Plate Details</div>

                <div className={`add-vehicle-form-grid ${layoutStyles.extracted7}`} >
                  <div style={col(6)}>
                    <label style={label}>Number Plate *</label>
                    <input
                      name="registration"
                      value={formData.registration}
                      onChange={handleChange}
                      style={input}
                      placeholder="e.g., AB12 CDE"
                    />
                  </div>

                  <div style={col(6)}>
                    <label style={label}>{formData.plateType === "trade" ? "Trade Plate Expiry" : "Retention Expiry"}</label>
                    <input
                      type="date"
                      name="retentionExpiry"
                      value={formData.retentionExpiry}
                      onChange={handleChange}
                      style={input}
                    />
                  </div>

                  <div style={col(6)}>
                    <label style={label}>Plate Type</label>
                    <select name="plateType" value={formData.plateType} onChange={handleChange} style={input}>
                      <option value="retention">Retention plate</option>
                      <option value="trade">Trade plate</option>
                    </select>
                  </div>

                  <div style={col(6)}>
                    <label style={label}>Expiry Frequency (weeks)</label>
                    <input
                      name="plateExpiryFreq"
                      value={formData.plateType === "trade" ? tradePlateExpiryWeeks : formData.plateExpiryFreq}
                      onChange={handleChange}
                      style={input}
                      inputMode="numeric"
                      readOnly={formData.plateType === "trade"}
                    />
                  </div>

                  <div style={col(12)}>
                    <label style={label}>Category</label>
                    <input value={RETENTION_PLATE_CATEGORY} readOnly style={{ ...input, background: "var(--color-surface-subtle)" }} />
                  </div>

                  <div style={col(12)}>
                    <label style={label}>Notes</label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      style={textarea}
                      placeholder="Retention certificate details, owner notes, or reminders..."
                    />
                  </div>
                </div>
              </div>

              <div className={layoutStyles.extracted8}>
                <button type="button" className="add-vehicle-action" style={btn("var(--color-white)", UI.text)} onClick={handleCancel}>
                  <ArrowLeft size={15} />
                  Cancel
                </button>
                <button
                  type="submit"
                  className="add-vehicle-action"
                  style={btn(UI.brand, "var(--color-white)", `1px solid ${UI.brand}`)}
                  disabled={!canSave || saving}
                >
                  <Save size={15} />
                  {saving ? "Saving..." : "Save Number Plate"}
                </button>
              </div>
            </form>
          </main>
        </div>

        <style jsx global>{`
          input:disabled, select:disabled, textarea:disabled { opacity: 0.7; cursor: not-allowed; }
          button:disabled { opacity: 0.7; cursor: not-allowed; }
          input:focus, select:focus, textarea:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: var(--shell-muted) !important; }
          .add-vehicle-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowMd} !important; }
          @media (max-width: 820px) {
            .add-vehicle-form-grid > div { grid-column: span 12 !important; }
          }
        `}</style>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout showBackButton={false}>
      <div style={shell}>
        <main className={layoutStyles.extracted9}>
          <div className={layoutStyles.extracted10}>
            <div>
              <h1 className={layoutStyles.extracted11}>{isNumberPlateMode ? "Add Retention Plate" : "Add Vehicle"}</h1>
              <div style={sub}>
                {isNumberPlateMode
                  ? "Create a simple number plate record and track the retention expiry date."
                  : "Create the vehicle once; its maintenance dates will automatically feed the Maintenance Calendar and HGV planner."}
              </div>
            </div>

            <div className={layoutStyles.extracted12}>
              <button type="button" className="add-vehicle-action" style={btn("var(--color-white)", UI.text)} onClick={handleCancel}>
                <ArrowLeft size={15} />
                Cancel
              </button>
              <button
                type="button"
                className="add-vehicle-action"
                style={btn(UI.brand, "var(--color-white)", `1px solid ${UI.brand}`)}
                onClick={handleSubmit}
                disabled={!canSave || saving}
                title={!canSave ? (isNumberPlateMode ? "Fill Number Plate" : "Fill Name, Registration, and Category") : ""}
              >
                <Save size={15} />
                {saving ? "Saving..." : "Save Vehicle"}
              </button>
            </div>
          </div>

          <div className={layoutStyles.extracted13} />

          <form onSubmit={handleSubmit} className={layoutStyles.extracted14}>
            {/* Main details */}
            <div style={{ ...card, padding: 12 }}>
              <div style={sectionTitle}>Main Information</div>

              <div className={`add-vehicle-form-grid ${layoutStyles.extracted15}`} >
                <div style={col(4)}>
                  <label style={label}>Name *</label>
                  <input name="name" value={formData.name} onChange={handleChange} style={input} placeholder="e.g., Silverado" />
                </div>

                <div style={col(4)}>
                  <label style={label}>Registration *</label>
                  <input name="registration" value={formData.registration} onChange={handleChange} style={input} placeholder="e.g., AB12 CDE" />
                </div>

                <div style={col(4)}>
                  <label style={label}>Category *</label>
                  <select
                    name="category"
                    value={isCreatingCategory ? NEW_CATEGORY_OPTION : formData.category}
                    onChange={handleChange}
                    style={input}
                    required
                  >
                    <option value="">Select category...</option>
                    {existingCategories.length ? (
                      existingCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))
                    ) : (
                      <>
                        <option value="Fleet Vehicle">Fleet Vehicle</option>
                        <option value="Lifting Vans">Lifting Vans</option>
                        <option value="Bike">Bike</option>
                        <option value="Lorry">Lorry</option>
                        <option value="Taurus">Taurus</option>
                        <option value="Electric Tracking Vehicles">Electric Tracking Vehicles</option>
                        <option value="Pod Cars">Pod Cars</option>
                        <option value="HGV">HGV</option>
                        <option value="HGV Trailers">HGV Trailers</option>
                      </>
                    )}
                    <option value={NEW_CATEGORY_OPTION}>+ Add new category</option>
                  </select>
                  {isCreatingCategory ? (
                    <input
                      value={newCategory}
                      onChange={(e) => {
                        const next = e.target.value;
                        setNewCategory(next);
                        setFormData((prev) => ({ ...prev, category: next }));
                      }}
                      style={{ ...input, marginTop: 8 }}
                      placeholder="Type new category name"
                      required
                    />
                  ) : null}
                  <div style={helpText}>Categories are used to group vehicles on the Vehicle Overview page.</div>
                </div>

                <div style={col(3)}>
                  <label style={label}>Manufacturer</label>
                  <input name="manufacturer" value={formData.manufacturer} onChange={handleChange} style={input} placeholder="e.g., Volkswagen" />
                </div>

                <div style={col(3)}>
                  <label style={label}>Model</label>
                  <input name="model" value={formData.model} onChange={handleChange} style={input} placeholder="e.g., Amarok" />
                </div>

                <div style={col(3)}>
                  <label style={label}>Chassis No.</label>
                  <input name="chassis" value={formData.chassis} onChange={handleChange} style={input} />
                </div>

                <div style={col(3)}>
                  <label style={label}>Odometer</label>
                  <input name="odometer" value={formData.odometer} onChange={handleChange} style={input} placeholder="e.g., 124000" inputMode="numeric" />
                </div>

                <div style={col(3)}>
                  <label style={label}>Operating Status</label>
                  <select
                    name="operationalStatus"
                    value={normalizeVehicleOperatingStatus(formData)}
                    onChange={handleOperatingStatusChange}
                    style={input}
                  >
                    <option value="Active">Active</option>
                    <option value="VOR">VOR</option>
                  </select>
                </div>

                <div style={col(3)}>
                  <label style={label}>Tax Status</label>
                  <select name="taxStatus" value={formData.taxStatus} onChange={handleChange} style={input}>
                    <option value="Taxed">Taxed</option>
                    <option value="Sorn">SORN</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>

                <div style={col(3)}>
                  <label style={label}>Taxed Until</label>
                  <input type="date" name="nextRFL" value={formData.nextRFL} onChange={handleChange} style={input} />
                </div>

                <div style={col(3)}>
                  <label style={label}>Insurance Status</label>
                  <select name="insuranceStatus" value={formData.insuranceStatus} onChange={handleChange} style={input}>
                    <option value="Insured">Insured</option>
                    <option value="Not Insured">Not Insured</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>

                <div style={col(3)}>
                  <label style={label}>Insured Until</label>
                  <input type="date" name="insuredUntil" value={formData.insuredUntil} onChange={handleChange} style={input} />
                </div>

                <div style={col(9)}>
                  <label style={label}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} style={textarea} placeholder="Anything useful: quirks, kit, keys, restrictions..." />
                </div>
              </div>
            </div>

            {/* Maintenance */}
            <div style={{ ...card, padding: 12 }}>
              <div style={sectionTitle}>Maintenance</div>
              {isHgvVehicle ? (
                <div className={layoutStyles.hgvNotice}>
                  HGV compliance enabled — PMI and Brake Test are set to an eight-week cycle and will populate the Maintenance Calendar automatically.
                </div>
              ) : null}

              <div className={`add-vehicle-form-grid ${layoutStyles.extracted16}`} >
                {/* MOT */}
                <div style={col(12)}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: UI.text, marginBottom: 8 }}>MOT</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Last MOT</label>
                  <input type="date" name="lastMOT" value={formData.lastMOT} onChange={handleChange} style={input} />
                </div>

                <div style={col(4)}>
                  <label style={label}>MOT Frequency (weeks)</label>
                  <input name="motFreq" value={formData.motFreq} onChange={handleChange} style={input} placeholder="e.g., 52" inputMode="numeric" />
                  <div style={helpText}>If set, Next MOT will auto-calculate.</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Next MOT</label>
                  <input type="date" name="nextMOT" value={formData.nextMOT} onChange={handleChange} style={input} />
                  <div style={helpText}>
                    {formData.motISOWeek ? `Due ${formData.motISOWeek}` : "ISO week appears when a due date is set."}
                  </div>
                </div>

                {/* Service */}
                <div style={col(12)}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: UI.text, margin: "10px 0 8px" }}>Service</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Last Service</label>
                  <input type="date" name="lastService" value={formData.lastService} onChange={handleChange} style={input} />
                </div>

                <div style={col(4)}>
                  <label style={label}>Service Frequency (weeks)</label>
                  <input name="serviceFreq" value={formData.serviceFreq} onChange={handleChange} style={input} placeholder="e.g., 26" inputMode="numeric" />
                  <div style={helpText}>If set, Next Service will auto-calculate.</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Next Service</label>
                  <input type="date" name="nextService" value={formData.nextService} onChange={handleChange} style={input} />
                  <div style={helpText}>
                    {formData.serviceISOWeek ? `Due ${formData.serviceISOWeek}` : "ISO week appears when a due date is set."}
                  </div>
                </div>

                {/* RFL */}
                <div style={col(12)}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: UI.text, margin: "10px 0 8px" }}>Road Tax / RFL</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Last RFL</label>
                  <input type="date" name="lastRFL" value={formData.lastRFL} onChange={handleChange} style={input} />
                </div>

                <div style={col(4)}>
                  <label style={label}>RFL Frequency (weeks)</label>
                  <input name="rflFreq" value={formData.rflFreq} onChange={handleChange} style={input} inputMode="numeric" />
                </div>

                <div style={col(4)}>
                  <label style={label}>Next RFL / Taxed Until</label>
                  <input type="date" name="nextRFL" value={formData.nextRFL} onChange={handleChange} style={input} />
                </div>

                {showEightWeekInspection ? (
                  <>
                    <div style={col(12)}>
                      <div style={{ fontSize: 12, fontWeight: 950, color: UI.text, margin: "10px 0 8px" }}>8 Week Inspection</div>
                    </div>

                    <div style={col(4)}>
                      <label style={label}>8 Week Inspection Base Date</label>
                      <input
                        type="date"
                        name="eightWeekInspectionStart"
                        value={formData.eightWeekInspectionStart}
                        onChange={handleChange}
                        style={input}
                      />
                    </div>

                    <div style={col(4)}>
                      <label style={label}>Inspection Frequency (weeks)</label>
                      <input value="8" readOnly style={{ ...input, background: "var(--color-surface-subtle)" }} />
                    </div>

                    <div style={col(4)}>
                      <label style={label}>Next 8 Week Inspection</label>
                      <input
                        type="date"
                        name="nextEightWeekInspection"
                        value={formData.nextEightWeekInspection}
                        onChange={handleChange}
                        style={input}
                      />
                    </div>

                    <div style={col(4)}>
                      <label style={label}>Inspection ISO Week</label>
                      <input
                        name="eightWeekInspectionISOWeek"
                        value={formData.eightWeekInspectionISOWeek}
                        onChange={handleChange}
                        style={input}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* Additional maintenance */}
            <div style={{ ...card, padding: 12 }}>
              <div style={sectionTitle}>Additional Maintenance</div>
              <div style={helpText}>Tick the extra maintenance lines this vehicle needs.</div>
              <div className={layoutStyles.extracted18}>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    border: formData.warranty === "Yes" ? `1px solid ${UI.brandBorder}` : UI.border,
                    background: formData.warranty === "Yes" ? UI.brandSoft : "var(--color-surface)",
                    color: UI.text,
                    borderRadius: UI.radius,
                    padding: "7px 9px",
                    fontSize: 12,
                    fontWeight: 850,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.warranty === "Yes"}
                    onChange={handleWarrantyToggle}
                    className={layoutStyles.extracted19}
                  />
                  Warranty
                </label>
                {ADDITIONAL_MAINTENANCE_SECTIONS.map((section) => {
                  const checked = shownAdditionalMaintenance.includes(section.key) || sectionHasValue(formData, section);
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
                        padding: "7px 9px",
                        fontSize: 12,
                        fontWeight: 850,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAdditionalMaintenance(section.key)}
                        className={layoutStyles.extracted19}
                      />
                      {section.label}
                    </label>
                  );
                })}
              </div>

              {formData.warranty === "Yes" || visibleAdditionalMaintenanceSections.length ? (
                <div className={`add-vehicle-form-grid ${layoutStyles.extracted20}`} >
                  {formData.warranty === "Yes" ? (
                    <div style={col(3)}>
                      <label style={label}>Warranty Expiry</label>
                      <input
                        type="date"
                        name="warrantyExpiry"
                        value={formData.warrantyExpiry}
                        onChange={handleChange}
                        style={input}
                      />
                    </div>
                  ) : null}
                  {visibleAdditionalMaintenanceSections.flatMap((section) =>
                    section.fields.map((field) => (
                      <div key={`${section.key}-${field.name}`} style={col(3)}>
                        <label style={label}>{field.label}</label>
                        <input
                          type={field.type === "date" ? "date" : "text"}
                          name={field.name}
                          value={formData[field.name]}
                          onChange={field.name.endsWith("ISOWeek") ? undefined : handleChange}
                          readOnly={field.name.endsWith("ISOWeek")}
                          style={
                            field.name.endsWith("ISOWeek")
                              ? { ...input, background: "var(--color-surface-subtle)" }
                              : input
                          }
                          inputMode={field.label.includes("Freq") ? "numeric" : undefined}
                          max={field.type === "date" && /^last/i.test(field.name) ? clampISODate(new Date()) : undefined}
                          title={
                            field.name.endsWith("ISOWeek")
                              ? "Calculated automatically from the next due date"
                              : undefined
                          }
                        />
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div style={{ color: UI.muted, fontSize: 13 }}>No additional maintenance lines selected.</div>
              )}
            </div>

            {/* Footer actions (redundant + nice UX) */}
            <div className={layoutStyles.extracted21}>
              <button type="button" className="add-vehicle-action" style={btn("var(--color-white)", UI.text)} onClick={handleCancel}>
                <ArrowLeft size={15} />
                Cancel
              </button>
              <button
                type="submit"
                className="add-vehicle-action"
                style={btn(UI.brand, "var(--color-white)", `1px solid ${UI.brand}`)}
                disabled={!canSave || saving}
              >
                <Save size={15} />
                {saving ? "Saving..." : "Save Vehicle"}
              </button>
            </div>
          </form>
        </main>
      </div>

      <Modal
        open={Boolean(vorPrompt)}
        onClose={() => setVorPrompt(null)}
        title="Vehicle Off-Road (VOR)"
        description="Complete the VOR Policy & Procedure record before creating this vehicle as VOR."
        size="lg"
        footer={
          <>
            <UIButton type="button" variant="ghost" onClick={() => setVorPrompt(null)}>
              Cancel
            </UIButton>
            <UIButton type="button" onClick={confirmNewVehicleVor}>
              Confirm VOR
            </UIButton>
          </>
        }
      >
        <div
          className={layoutStyles.extracted22}
        >
          This record must be completed on the day the vehicle is taken off the fleet.
          Compliance schedules will remain paused while its status is VOR.
        </div>
        <div
          className={layoutStyles.extracted23}
        >
          <FormField label="Vehicle registration / identification">
            <Input value={formData.registration || ""} readOnly />
          </FormField>
          <FormField label="Operator licence number" htmlFor="add-vor-operator-licence">
            <Input
              id="add-vor-operator-licence"
              value={vorPrompt?.operatorLicenceNumber || ""}
              onChange={(event) => updateVorPrompt("operatorLicenceNumber", event.target.value)}
            />
          </FormField>
          <FormField label="Date taken off the fleet" htmlFor="add-vor-off-road-date">
            <Input
              id="add-vor-off-road-date"
              type="date"
              value={vorPrompt?.offRoadDate || ""}
              onChange={(event) => updateVorPrompt("offRoadDate", event.target.value)}
            />
          </FormField>
          <FormField label="Odometer when classified VOR (mi)" htmlFor="add-vor-odometer">
            <Input
              id="add-vor-odometer"
              inputMode="decimal"
              value={vorPrompt?.odometer || ""}
              onChange={(event) => updateVorPrompt("odometer", event.target.value)}
            />
          </FormField>
          <FormField label="VOR approved by" htmlFor="add-vor-approved-by">
            <Input
              id="add-vor-approved-by"
              value={vorPrompt?.approvedBy || ""}
              onChange={(event) => updateVorPrompt("approvedBy", event.target.value)}
            />
          </FormField>
          <FormField label="Position" htmlFor="add-vor-approved-position">
            <Input
              id="add-vor-approved-position"
              value={vorPrompt?.approvedPosition || ""}
              onChange={(event) => updateVorPrompt("approvedPosition", event.target.value)}
            />
          </FormField>
          <div className={layoutStyles.extracted24}>
            <FormField
              label="Reason for VOR classification"
              htmlFor="add-vor-reason"
            >
              <Textarea
                id="add-vor-reason"
                rows={4}
                value={vorPrompt?.reason || ""}
                onChange={(event) => updateVorPrompt("reason", event.target.value)}
                placeholder="Describe why the vehicle is being taken off the road..."
              />
            </FormField>
          </div>
        </div>
      </Modal>

      <style jsx global>{`
        input:disabled, select:disabled, textarea:disabled { opacity: 0.7; cursor: not-allowed; }
        button:disabled { opacity: 0.7; cursor: not-allowed; }
        input:focus, select:focus, textarea:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: var(--shell-muted) !important; }
        .add-vehicle-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowMd} !important; }
        @media (max-width: 820px) {
          .add-vehicle-form-grid > div { grid-column: span 12 !important; }
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}
