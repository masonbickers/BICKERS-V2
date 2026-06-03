// src/app/add-vehicle/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import { getIsoWeekLabel } from "@/app/utils/maintenanceSchema";
import { ArrowLeft, Save } from "lucide-react";

/* UI tokens */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowMd: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandBorder: "#c8d6e3",
  brandSoft: "#edf3f8",
  danger: "#dc2626",
};

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
  background: "#fff",
  color: UI.text,
  outline: "none",
};
const textarea = { ...input, minHeight: 92, resize: "vertical" };

const btn = (bg = "#fff", fg = UI.text, bd = "1px solid #e5e7eb") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  border: bg === UI.brand ? `1px solid ${UI.brand}` : bd === "1px solid #e5e7eb" ? `1px solid ${UI.brandBorder}` : bd,
  background:
    bg === UI.brand
      ? "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)"
      : "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: bg === UI.brand ? "#fff" : fg,
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
const calcNextEightWeekFromCycle = (baseISO, currentNextISO) => {
  const base = parseLocalDateOnly(baseISO);
  if (!base) return "";

  const currentNext = parseLocalDateOnly(currentNextISO);
  if (currentNext && currentNext.getTime() > base.getTime()) {
    const diffDays = Math.round((currentNext.getTime() - base.getTime()) / 86400000);
    if (diffDays > 0 && diffDays % 56 === 0) return clampISODate(currentNext);
  }

  return addWeeksToISO(baseISO, 8);
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

export default function AddVehiclePage() {
  const router = useRouter();
  const [isNumberPlateMode, setIsNumberPlateMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [existingCategories, setExistingCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [shownAdditionalMaintenance, setShownAdditionalMaintenance] = useState([]);

  const [formData, setFormData] = useState({ ...INITIAL_FORM_DATA });

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

  // Pull categories from existing vehicles so the dropdown stays consistent
  useEffect(() => {
    const loadCats = async () => {
      try {
        const snap = await getDocs(collection(db, "vehicles"));
        const cats = snap.docs
          .map((d) => d.data()?.category)
          .filter(Boolean);
        const unique = Array.from(new Set([...cats, RETENTION_PLATE_CATEGORY])).sort((a, b) => String(a).localeCompare(String(b)));
        setExistingCategories(unique);
      } catch (e) {
        console.error("Load categories failed:", e);
      }
    };
    loadCats();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

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

    setFormData((prev) => ({
      ...prev,
      [name]: v,
      ...(name === "plateType" && value === "trade" ? { plateExpiryFreq: "52" } : {}),
    }));
  };

  // Auto-calc next dates and ISO week labels so new records match edit-page behaviour.
  useEffect(() => {
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
    if (formData.eightWeekInspectionStart) {
      const calc = calcNextEightWeekFromCycle(formData.eightWeekInspectionStart, formData.nextEightWeekInspection);
      if (calc && formData.nextEightWeekInspection !== calc) updates.nextEightWeekInspection = calc;
    }

    [
      ["lastTacho", "tachoFreq", "nextTacho"],
      ["lastBrakeTest", "brakeTestFreq", "nextBrakeTest"],
      ["lastPMI", "pmiFreq", "nextPMI"],
      ["lastTachoDownload", "tachoDownloadFreq", "nextTachoDownload"],
      ["lastTailLift", "tailLiftFreq", "nextTailLift"],
      ["lastLoler", "lolerFreq", "nextLoler"],
      ["lastTachoCalibration", "tachoCalibrationFreq", "nextTachoCalibration"],
      ["lastLorryInspection", "lorryInspectionFreq", "nextLorryInspection"],
    ].forEach(([lastKey, freqKey, nextKey]) => {
      if (!formData[lastKey] || !formData[freqKey]) return;
      const calc = addWeeksToISO(formData[lastKey], formData[freqKey]);
      if (calc && formData[nextKey] !== calc) updates[nextKey] = calc;
    });

    const nextMot = updates.nextMOT ?? formData.nextMOT;
    const nextService = updates.nextService ?? formData.nextService;
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

  const showEightWeekInspection = useMemo(() => isTransportLorryVehicle(formData), [formData]);

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

      // Build clean payload (avoid empty strings where possible)
      const payload = {
        name: isNumberPlateMode ? (formData.name.trim() || registration) : formData.name.trim(),
        vehicleName: isNumberPlateMode ? (formData.name.trim() || registration) : formData.name.trim(),
        registration,
        reg: registration,
        registrationNumber: registration,
        category: isNumberPlateMode ? RETENTION_PLATE_CATEGORY : formData.category.trim(),
        recordType: isNumberPlateMode ? "numberPlateRetention" : "vehicle",
        operationalStatus: isNumberPlateMode ? "Active" : formData.operationalStatus || "Active",
        fleetStatus: isNumberPlateMode ? "Active" : formData.operationalStatus || "Active",
        vehicleStatus: isNumberPlateMode ? "Active" : formData.operationalStatus || "Active",
        plateType: isNumberPlateMode ? formData.plateType || "retention" : "",
        plateExpiryFreq: isNumberPlateMode && formData.plateType === "trade" ? "52" : formData.plateExpiryFreq || "",

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
        serviceHistory: [],
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
        motHistory: [],
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
        hiddenAdditionalMaintenance: [],
        defects: [],
        attachments: [],
        files: [],

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "vehicles"), payload);

      alert(isNumberPlateMode ? "Number plate added" : "Vehicle added");
      if (navigateOnSuccess) {
        router.push("/vehicles");
        router.refresh?.();
      }
      return true;
    } catch (err) {
      console.error("Error adding vehicle:", err);
      alert("Failed to add vehicle");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => router.push("/vehicles");

  useUnsavedChangesGuard({
    enabled: true,
    isDirty: hasUnsavedChanges && !saving,
    onSave: () => handleSubmit(null, { navigateOnSuccess: false }),
  });

  if (isNumberPlateMode) {
    return (
      <HeaderSidebarLayout>
        <div style={shell}>
          <main style={{ ...main, maxWidth: 860 }}>
            <div style={headerRow}>
              <div>
                <h1 style={h1}>Add Retention Plate</h1>
                <div style={sub}>Create a simple number plate record and track the retention expiry date.</div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="add-vehicle-action" style={btn("#fff", UI.text)} onClick={handleCancel}>
                  <ArrowLeft size={15} />
                  Cancel
                </button>
                <button
                  type="button"
                  className="add-vehicle-action"
                  style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                  onClick={handleSubmit}
                  disabled={!canSave || saving}
                  title={!canSave ? "Fill Number Plate" : ""}
                >
                  <Save size={15} />
                  {saving ? "Saving..." : "Save Number Plate"}
                </button>
              </div>
            </div>

            <div style={{ height: 14 }} />

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
              <div style={{ ...card, padding: 12 }}>
                <div style={sectionTitle}>Number Plate Details</div>

                <div className="add-vehicle-form-grid" style={grid}>
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
                      value={formData.plateType === "trade" ? "52" : formData.plateExpiryFreq}
                      onChange={handleChange}
                      style={input}
                      inputMode="numeric"
                      readOnly={formData.plateType === "trade"}
                    />
                  </div>

                  <div style={col(12)}>
                    <label style={label}>Category</label>
                    <input value={RETENTION_PLATE_CATEGORY} readOnly style={{ ...input, background: "#f8fafc" }} />
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

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="add-vehicle-action" style={btn("#fff", UI.text)} onClick={handleCancel}>
                  <ArrowLeft size={15} />
                  Cancel
                </button>
                <button
                  type="submit"
                  className="add-vehicle-action"
                  style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
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
          input:focus, select:focus, textarea:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: #9fb7cf !important; }
          .add-vehicle-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowMd} !important; }
          @media (max-width: 820px) {
            .add-vehicle-form-grid > div { grid-column: span 12 !important; }
          }
        `}</style>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <div style={shell}>
        <main style={main}>
          <div style={headerRow}>
            <div>
              <h1 style={h1}>{isNumberPlateMode ? "Add Retention Plate" : "Add Vehicle"}</h1>
              <div style={sub}>
                {isNumberPlateMode
                  ? "Create a simple number plate record and track the retention expiry date."
                  : "Create a new vehicle record. Next MOT/Service can auto-calc from last date + frequency."}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="add-vehicle-action" style={btn("#fff", UI.text)} onClick={handleCancel}>
                <ArrowLeft size={15} />
                Cancel
              </button>
              <button
                type="button"
                className="add-vehicle-action"
                style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                onClick={handleSubmit}
                disabled={!canSave || saving}
                title={!canSave ? (isNumberPlateMode ? "Fill Number Plate" : "Fill Name, Registration, and Category") : ""}
              >
                <Save size={15} />
                {saving ? "Saving..." : "Save Vehicle"}
              </button>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            {/* Main details */}
            <div style={{ ...card, padding: 12 }}>
              <div style={sectionTitle}>Main Information</div>

              <div className="add-vehicle-form-grid" style={grid}>
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
                  <select name="operationalStatus" value={formData.operationalStatus} onChange={handleChange} style={input}>
                    <option value="Active">Active</option>
                    <option value="Out of use">Out of use</option>
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

                <div style={col(6)}>
                  <label style={label}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} style={textarea} placeholder="Anything useful: quirks, kit, keys, restrictions..." />
                </div>
              </div>
            </div>

            {/* Maintenance */}
            <div style={{ ...card, padding: 12 }}>
              <div style={sectionTitle}>Maintenance</div>

              <div className="add-vehicle-form-grid" style={grid}>
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
                </div>

                <div style={col(4)}>
                  <label style={label}>MOT ISO Week</label>
                  <input name="motISOWeek" value={formData.motISOWeek} onChange={handleChange} style={input} />
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
                </div>

                <div style={col(4)}>
                  <label style={label}>Service ISO Week</label>
                  <input name="serviceISOWeek" value={formData.serviceISOWeek} onChange={handleChange} style={input} />
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
                      <input value="8" readOnly style={{ ...input, background: "#f8fafc" }} />
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
              <div className="add-vehicle-form-grid" style={{ ...grid, marginTop: 10, marginBottom: 12 }}>
                <div style={col(4)}>
                  <label style={label}>Warranty</label>
                  <select name="warranty" value={formData.warranty} onChange={handleChange} style={input}>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>

                <div style={col(4)}>
                  <label style={label}>Warranty Expiry</label>
                  <input type="date" name="warrantyExpiry" value={formData.warrantyExpiry} onChange={handleChange} style={input} />
                </div>
              </div>

              <div style={helpText}>Tick the extra maintenance lines this vehicle needs.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, marginBottom: 12 }}>
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
                        background: checked ? UI.brandSoft : "#fff",
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
                        style={{ margin: 0 }}
                      />
                      {section.label}
                    </label>
                  );
                })}
              </div>

              {visibleAdditionalMaintenanceSections.length ? (
                <div className="add-vehicle-form-grid" style={grid}>
                  {visibleAdditionalMaintenanceSections.flatMap((section) =>
                    section.fields.map((field) => (
                      <div key={`${section.key}-${field.name}`} style={col(3)}>
                        <label style={label}>{field.label}</label>
                        <input
                          type={field.type === "date" ? "date" : "text"}
                          name={field.name}
                          value={formData[field.name]}
                          onChange={handleChange}
                          style={input}
                          inputMode={field.label.includes("Freq") ? "numeric" : undefined}
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
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="add-vehicle-action" style={btn("#fff", UI.text)} onClick={handleCancel}>
                <ArrowLeft size={15} />
                Cancel
              </button>
              <button
                type="submit"
                className="add-vehicle-action"
                style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                disabled={!canSave || saving}
              >
                <Save size={15} />
                {saving ? "Saving..." : "Save Vehicle"}
              </button>
            </div>
          </form>
        </main>
      </div>

      <style jsx global>{`
        input:disabled, select:disabled, textarea:disabled { opacity: 0.7; cursor: not-allowed; }
        button:disabled { opacity: 0.7; cursor: not-allowed; }
        input:focus, select:focus, textarea:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: #9fb7cf !important; }
        .add-vehicle-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowMd} !important; }
        @media (max-width: 820px) {
          .add-vehicle-form-grid > div { grid-column: span 12 !important; }
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}
