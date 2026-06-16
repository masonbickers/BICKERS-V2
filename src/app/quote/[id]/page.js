"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ArrowLeft, Plus, Printer, Save, Search, Trash2, Wand2 } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { db } from "@/app/utils/firebaseClient";
import { loadBookingFormReferenceData } from "@/app/utils/bookingFormReferenceData";
import { normalizeVehicleKeysListForLookup } from "@/app/utils/bookingFormShared";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { FULL_SIZE_TRACKING_QUOTE_TEMPLATES, quoteTemplateOptions } from "@/app/utils/quoteTemplates";

const UI = {
  page: "#eef2f6",
  paper: "#ffffff",
  text: "#111827",
  muted: "#5f6f82",
  border: "#111827",
  grid: "#9ca3af",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
};

const emptyQuote = {
  status: "Draft",
  templateId: "",
  templateFile: "",
  templateName: "",
  lineItems: [],
  notes: "",
};

const compact = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseNumber = (value) => {
  const cleaned = String(value ?? "").replace(/[£,]/g, "").trim();
  if (!cleaned || cleaned.toUpperCase() === "TBC") return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const money = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const quoteDate = () =>
  new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatDate = (raw) => {
  if (!raw) return "";
  const text = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [year, month, day] = text.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }
  return text;
};

const formatBookingDates = (booking = {}) => {
  const list = Array.isArray(booking.bookingDates) ? booking.bookingDates : [];
  if (list.length) return list.map(formatDate).join(", ");
  return formatDate(booking.date || booking.startDate || "");
};

const getItemLabel = (item) => {
  if (!item) return "";
  if (typeof item === "string") return item;
  return (
    item.name ||
    item.label ||
    item.vehicleName ||
    item.equipmentName ||
    item.title ||
    item.registration ||
    item.reg ||
    item.id ||
    ""
  );
};

const formatVehicleLabel = (vehicle) => {
  if (!vehicle) return "";
  const name = String(vehicle.name || vehicle.vehicleName || vehicle.label || "").trim();
  const registration = String(vehicle.registration || vehicle.reg || "").trim().toUpperCase();
  if (name && registration) return `${name} (${registration})`;
  return name || registration || String(vehicle.id || "").trim();
};

const resolveVehicleLabels = (items = [], lookup = {}) => {
  if (!Array.isArray(items) || !items.length) return [];
  const ids = normalizeVehicleKeysListForLookup(items, lookup);
  const byIdLabels = ids.map((id) => formatVehicleLabel(lookup?.byId?.[id])).filter(Boolean);
  if (byIdLabels.length) return byIdLabels;
  return items.map(getItemLabel).map((item) => String(item || "").trim()).filter(Boolean);
};

const formatSummaryList = (items = []) => {
  if (!Array.isArray(items) || !items.length) return "-";
  const labels = items.map(getItemLabel).map((item) => String(item || "").trim()).filter(Boolean);
  if (!labels.length) return "-";
  if (labels.length <= 4) return labels.join(", ");
  return `${labels.slice(0, 4).join(", ")} +${labels.length - 4} more`;
};

const formatVehicleSummaryList = (items = [], lookup = {}) => {
  const labels = resolveVehicleLabels(items, lookup);
  if (!labels.length) return "-";
  if (labels.length <= 4) return labels.join(", ");
  return `${labels.slice(0, 4).join(", ")} +${labels.length - 4} more`;
};

const getDayNoteRows = (booking = {}) => {
  const dates = getBookingDateKeys(booking);
  return dates
    .map((date) => {
      const note = booking.notesByDate && typeof booking.notesByDate === "object" ? booking.notesByDate[date] : "";
      return note ? { date: formatDate(date), note } : null;
    })
    .filter(Boolean);
};

const getBookingDateKeys = (booking = {}) => {
  const keys = Array.isArray(booking.bookingDates)
    ? booking.bookingDates.map((date) => String(date || "").slice(0, 10)).filter(Boolean)
    : [];
  if (keys.length) return Array.from(new Set(keys));

  const startText = String(booking.startDate || booking.date || "").slice(0, 10);
  const endText = String(booking.endDate || booking.startDate || booking.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startText)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endText)) return [startText];

  const start = new Date(`${startText}T00:00:00`);
  const end = new Date(`${endText}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [startText];

  const dates = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
};

const getDayNote = (booking = {}, dateKey = "") =>
  compact(booking.notesByDate && typeof booking.notesByDate === "object" ? booking.notesByDate[dateKey] : "");

const getLabourDayCount = (booking = {}) => {
  const dates = getBookingDateKeys(booking);
  if (!dates.length) return 1;
  const chargeable = dates.filter((date) => !getDayNote(booking, date).includes("rest day"));
  return chargeable.length || dates.length;
};

const getVehicleRentalDayCount = (booking = {}) => {
  const dates = getBookingDateKeys(booking);
  if (!dates.length) return 1;
  const excluded = /travel|recce|rest|rig day|standby|turnaround/;
  const shootDates = dates.filter((date) => {
    const note = getDayNote(booking, date);
    return !note || note.includes("shoot") || note.includes("on set") || note.includes("night shoot") || note.includes("rehearsal") || note.includes("spilt day") || !excluded.test(note);
  });
  return shootDates.length;
};

const buildInitialQuoteNumber = (booking = {}, quote = {}) => {
  const existing = String(quote.quoteNumber || booking.quoteNumber || "").trim();
  if (existing) return existing;
  const firstBookingQuoteNumber = normalizeQuoteNumbers(booking.quoteNumbers)[0];
  if (firstBookingQuoteNumber) return firstBookingQuoteNumber;
  const job = String(booking.jobNumber || quote.jobNumber || "").trim();
  if (!job) return "001";
  const base = job.toUpperCase().startsWith("Q") ? job : `Q${job}`;
  return `${base}-001`;
};

const getQuoteNumberBase = (booking = {}, quote = {}) => {
  const job = String(booking.jobNumber || quote.jobNumber || "").trim();
  if (job) return job.toUpperCase().startsWith("Q") ? job : `Q${job}`;
  const existing = String(quote.quoteNumber || booking.quoteNumber || "").trim();
  const match = existing.match(/^(.*?)-\d+$/);
  return match?.[1] || "";
};

const formatQuoteNumberForVersion = (booking = {}, quote = {}, version = 1) => {
  const suffix = String(Math.max(1, Number(version) || 1)).padStart(3, "0");
  const base = getQuoteNumberBase(booking, quote);
  return base ? `${base}-${suffix}` : suffix;
};

const getVersionFromQuoteNumber = (quoteNumber = "") => {
  const text = String(quoteNumber || "").trim();
  const match = text.match(/(?:^|-)(\d{1,4})$/);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isInteger(version) && version > 0 ? version : null;
};

const normalizeQuoteNumbers = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : String(value || "").split(/[\n,]+/))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

const getBookingQuoteNumbers = (booking = {}) =>
  normalizeQuoteNumbers([
    ...normalizeQuoteNumbers(booking.quoteNumbers),
    booking.quoteNumber,
    booking.quote?.quoteNumber,
    ...normalizeQuoteVersions(booking).map((entry) => entry.quoteNumber),
  ]);

const cloneTemplateItem = (item, index) => ({
  id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
  section: item.section || "",
  description: item.description || "",
  qty: item.qty || "",
  unitPrice: item.unitPrice || "",
  totalMode: item.totalMode || "auto",
  sourceRow: item.sourceRow || null,
});

const isLabourLine = (item = {}) => {
  const section = compact(item.section);
  const description = compact(item.description);
  return section.includes("labour") || /driver|technician|operator|crew/.test(description);
};

const isVehicleRentalLine = (item = {}) => {
  const section = compact(item.section);
  const description = compact(item.description);
  if (!section.includes("equipment")) return false;
  if (/generator|rigger|scaffold|pre rig|pre-rig|prep|discount|driver|technician|mileage|travel|charge/.test(description)) {
    return false;
  }
  return /tracking vehicle|vehicle|car|trojan|twizzy|quad|motorcycle|bike|bicycle|trike|low loader|trailer|rig|sprinter|panther|maverick|bandit|atlas|rubicon|dominator|enduromax|raptor|silverado|cheyenne|gmc|land rover|discovery|mini cooper|audi|dodge|pulse|tiger|horse/.test(description);
};

const applyQuoteAutofill = (lineItems = [], booking = {}) => {
  const labourQty = getLabourDayCount(booking);
  const vehicleQty = getVehicleRentalDayCount(booking);
  return lineItems.map((item) => {
    if (String(item.qty || "").trim()) return item;
    if (isLabourLine(item)) {
      return { ...item, qty: String(labourQty), autoFilledQty: true };
    }
    if (vehicleQty > 0 && (!item.totalMode || item.totalMode === "auto") && isVehicleRentalLine(item)) {
      return { ...item, qty: String(vehicleQty), autoFilledQty: true };
    }
    return item;
  });
};

const calculateSubtotal = (lineItems = []) =>
  lineItems.reduce((sum, item) => {
    if (item.totalMode && item.totalMode !== "auto") return sum;
    return sum + parseNumber(item.qty) * parseNumber(item.unitPrice);
  }, 0);

const hasSavedQuote = (quote = {}) =>
  Boolean(
    quote &&
      typeof quote === "object" &&
      (quote.savedAt ||
        quote.updatedAt ||
        quote.quoteNumber ||
        quote.templateId ||
        quote.templateName ||
        (Array.isArray(quote.lineItems) && quote.lineItems.length))
  );

const normalizeQuoteVersions = (booking = {}) => {
  const versions = Array.isArray(booking.quoteVersions)
    ? booking.quoteVersions.filter((entry) => entry && typeof entry === "object")
    : [];
  if (versions.length) {
    return versions
      .map((entry, index) => ({
        ...entry,
        version:
          getVersionFromQuoteNumber(entry.quoteNumber) ||
          (Number.isFinite(Number(entry.version)) ? Number(entry.version) : index + 1),
      }))
      .sort((a, b) => a.version - b.version);
  }
  if (!hasSavedQuote(booking.quote)) return [];
  return [
    {
      ...(booking.quote || {}),
      version: getVersionFromQuoteNumber(booking.quote?.quoteNumber) || Number(booking.quote?.version || 1),
      savedAt: booking.quote?.savedAt || booking.quote?.updatedAt || booking.updatedAt || "",
      savedBy: booking.quote?.savedBy || booking.quote?.updatedBy || booking.lastEditedBy || "Unknown",
    },
  ];
};

const getNextQuoteVersion = (booking = {}) => {
  const versions = normalizeQuoteVersions(booking);
  const savedVersionNumbers = versions.map((entry) => Number(entry.version) || 0);
  const currentVersion = getVersionFromQuoteNumber(booking.quoteNumber || booking.quote?.quoteNumber) || 0;
  const latestVersion = Math.max(currentVersion, ...savedVersionNumbers, 0);
  return latestVersion + 1;
};

const getNextQuoteNumber = (booking = {}, quote = {}) =>
  formatQuoteNumberForVersion(booking, quote, getNextQuoteVersion(booking));

const hydrateQuote = (booking = {}, quote = {}) => ({
  ...emptyQuote,
  ...(quote && typeof quote === "object" ? quote : {}),
  quoteNumber: buildInitialQuoteNumber(booking, quote || {}),
  jobNumber: booking.jobNumber || quote?.jobNumber || "",
  client: booking.client || quote?.client || "",
  location: booking.location || quote?.location || "",
  lineItems: Array.isArray(quote?.lineItems) ? quote.lineItems : [],
});

const findSuggestedTemplate = (booking = {}) => {
  const vehicleText = [
    ...(Array.isArray(booking.vehicles) ? booking.vehicles : []),
    ...(Array.isArray(booking.equipment) ? booking.equipment : []),
    booking.notes,
  ].join(" ");
  const haystack = compact(vehicleText);
  if (!haystack) return null;

  const aliases = [
    ["silverado", "silverado"],
    ["cheyenne", "cheyenne"],
    ["mini cooper", "mini cooper"],
    ["mini", "mini cooper"],
    ["pulse", "pulse"],
    ["audi", "audi rs4"],
    ["rs4", "audi rs4"],
    ["dodge", "dodge ram"],
    ["ram", "dodge ram"],
    ["explorer", "explorer"],
    ["glc", "glc"],
    ["gmc", "gmc"],
    ["sierra", "sierra"],
    ["land rover", "land rover"],
    ["discovery", "discovery"],
    ["lightning", "lightning f150"],
    ["f150", "lightning f150"],
    ["raptor", "raptor"],
    ["sprinter no 1", "sprinter no 1"],
    ["sprinter no 2", "sprinter no 2"],
    ["sprinter", "sprinter"],
    ["tiger", "tiger"],
    ["horse", "horse"],
    ["low loader no 1", "low loader no 1"],
    ["low loader no 2", "low loader no 2"],
    ["low-loader no 1", "low loader no 1"],
    ["low-loader no 2", "low loader no 2"],
    ["low loader", "low loader"],
    ["low-loader", "low loader"],
    ["pod car build", "pod car build"],
    ["pod car", "pod car"],
    ["top driver", "top driver"],
    ["teams zoom", "teams zoom"],
    ["teams/zoom", "teams zoom"],
    ["zoom meeting", "teams zoom"],
    ["teams meeting", "teams zoom"],
    ["recce", "recce"],
    ["trojan electric", "trojan electric"],
    ["petrol powered trojan", "petrol powered trojan"],
    ["trojan", "trojan"],
    ["twizzy", "twizzy"],
    ["atlas e bike", "atlas e bike"],
    ["atlas e-bike", "atlas e bike"],
    ["bandit", "bandit"],
    ["can am", "can am"],
    ["maverick", "maverick"],
    ["dominator", "dominator"],
    ["electric bicycle", "electric bicycle"],
    ["e-bike", "e bike"],
    ["ebike", "e bike"],
    ["enduromax", "enduromax"],
    ["e trike", "e trike"],
    ["e-trike", "e trike"],
    ["tricycle", "tricycle"],
    ["panther", "panther"],
    ["racing quad", "racing quad"],
    ["rubicon", "rubicon"],
    ["quad", "quad"],
    ["motorcycle", "motorcycle"],
    ["bicycle banking", "bicycle banking"],
    ["motorcycle banking", "motorcycle banking"],
    ["mini low loader", "mini low loader"],
  ];

  const match = aliases.find(([needle]) => haystack.includes(needle));
  if (!match) return null;
  return (
    FULL_SIZE_TRACKING_QUOTE_TEMPLATES.find((template) =>
      compact(`${template.file} ${template.serviceDescription}`).includes(match[1])
    ) || null
  );
};

const normalizeQuote = (booking = {}) => {
  const versions = normalizeQuoteVersions(booking);
  const latestSavedQuote = versions[versions.length - 1];
  return hydrateQuote(booking, latestSavedQuote || booking.quote || {});
};

const buildBlankQuote = (booking = {}, quoteNumber = "") =>
  hydrateQuote(booking, {
    ...emptyQuote,
    quoteNumber: quoteNumber || getNextQuoteNumber(booking, {}),
    createdAt: new Date().toISOString(),
  });

const SectionBreak = ({ children }) => (
  <tr>
    <td colSpan={4} style={sectionCell}>
      {children}
    </td>
  </tr>
);

const InfoField = ({ label, value }) => (
  <div style={screenInfoCell}>
    <div style={screenInfoLabel}>{label}</div>
    <div style={screenInfoValue}>{value}</div>
  </div>
);

export default function QuotePage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params?.id;
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

  const [booking, setBooking] = useState(null);
  const [quote, setQuote] = useState(emptyQuote);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [vehicleLookup, setVehicleLookup] = useState({ byId: {}, byReg: {}, byName: {} });
  const pageRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load quote booking" });
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "bookings", bookingId));
        if (!alive) return;
        const data = snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
        setBooking(data);
        setQuote(normalizeQuote(data || {}));
      } catch (err) {
        if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "load quote booking" })) {
          console.error("Failed loading quote booking:", err);
          alert("Failed to load quote booking.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [accessKey, bookingId, dataAccessState]);

  useEffect(() => {
    let alive = true;
    const loadLookup = async () => {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking || !gate.allowed) return;
      try {
        const referenceData = await loadBookingFormReferenceData(db, { accessState: dataAccessState });
        if (alive) setVehicleLookup(referenceData.vehicleLookup || { byId: {}, byReg: {}, byName: {} });
      } catch (err) {
        console.warn("Failed loading quote vehicle lookup:", err);
      }
    };
    loadLookup();
    return () => {
      alive = false;
    };
  }, [accessKey, dataAccessState]);

  const suggestedTemplate = useMemo(() => findSuggestedTemplate(booking || {}), [booking]);
  const subtotal = useMemo(() => calculateSubtotal(quote.lineItems), [quote.lineItems]);
  const savedQuotes = useMemo(() => normalizeQuoteVersions(booking || {}), [booking]);
  const quoteNumberOptions = useMemo(() => getBookingQuoteNumbers(booking || {}), [booking]);
  const currentQuoteNumber = String(quote.quoteNumber || "").trim();
  const quoteSelectOptions = useMemo(
    () => normalizeQuoteNumbers([currentQuoteNumber, ...quoteNumberOptions]),
    [currentQuoteNumber, quoteNumberOptions]
  );
  const currentSavedQuote = savedQuotes.find(
    (entry) => String(entry.quoteNumber || "").trim().toLowerCase() === currentQuoteNumber.toLowerCase()
  );
  const filteredQuoteTemplateOptions = useMemo(() => {
    const needle = compact(templateSearch);
    const filtered = needle
      ? quoteTemplateOptions.filter((option) => compact(option.label).includes(needle))
      : quoteTemplateOptions;
    if (!quote.templateId || filtered.some((option) => option.id === quote.templateId)) return filtered;
    const selected = quoteTemplateOptions.find((option) => option.id === quote.templateId);
    return selected ? [selected, ...filtered] : filtered;
  }, [quote.templateId, templateSearch]);

  const updateQuote = (patch) => {
    const nextLineItems = patch.lineItems || quote.lineItems;
    setQuote((prev) => ({
      ...prev,
      ...patch,
      subtotal: calculateSubtotal(nextLineItems),
      updatedAt: new Date().toISOString(),
    }));
  };

  const loadTemplate = (templateId) => {
    const template = FULL_SIZE_TRACKING_QUOTE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) {
      updateQuote({ templateId: "", templateFile: "", templateName: "", lineItems: [] });
      setTemplateSearch("");
      return;
    }
    updateQuote({
      templateId: template.id,
      templateFile: template.file,
      templateName: template.serviceDescription,
      lineItems: applyQuoteAutofill(template.lineItems.map(cloneTemplateItem), booking || {}),
      createdAt: quote.createdAt || new Date().toISOString(),
      quoteNumber: buildInitialQuoteNumber(booking || {}, quote),
    });
  };

  const loadQuoteNumber = (quoteNumber) => {
    const nextQuoteNumber = String(quoteNumber || "").trim();
    if (!nextQuoteNumber) return;
    const savedQuote = savedQuotes.find(
      (entry) => String(entry.quoteNumber || "").trim().toLowerCase() === nextQuoteNumber.toLowerCase()
    );
    setQuote(savedQuote ? hydrateQuote(booking || {}, savedQuote) : buildBlankQuote(booking || {}, nextQuoteNumber));
  };

  const createNewQuote = () => {
    if (!booking?.id) return;
    const defaultQuoteNumber = getNextQuoteNumber(booking, quote);
    const quoteNumberInput = window.prompt("New quote number:", defaultQuoteNumber);
    if (quoteNumberInput === null) return;
    const nextQuoteNumber = String(quoteNumberInput || "").trim();
    if (!nextQuoteNumber) {
      alert("Please enter a quote number.");
      return;
    }
    const quoteNumberExists = savedQuotes.some(
      (entry) => String(entry.quoteNumber || "").trim().toLowerCase() === nextQuoteNumber.toLowerCase()
    );
    if (quoteNumberExists && !window.confirm(`${nextQuoteNumber} already exists. Open that saved quote?`)) return;
    loadQuoteNumber(nextQuoteNumber);
  };

  const updateLineItem = (index, patch) => {
    updateQuote({
      lineItems: quote.lineItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    });
  };

  const addLine = () => {
    updateQuote({
      lineItems: [
        ...quote.lineItems,
        {
          id: `${Date.now()}-manual`,
          section: "Manual additions",
          description: "",
          qty: "",
          unitPrice: "",
          totalMode: "auto",
        },
      ],
    });
  };

  const removeLine = (index) => {
    updateQuote({ lineItems: quote.lineItems.filter((_, itemIndex) => itemIndex !== index) });
  };

  const saveQuote = async () => {
    if (!booking?.id) return;
    const suggestedQuoteNumber = String(quote.quoteNumber || "").trim() || getNextQuoteNumber(booking, quote);
    const quoteNumberInput = window.prompt("Save quote number:", suggestedQuoteNumber);
    if (quoteNumberInput === null) return;
    const nextQuoteNumber = String(quoteNumberInput || "").trim();
    if (!nextQuoteNumber) {
      alert("Please enter a quote number.");
      return;
    }
    const quoteVersion =
      getVersionFromQuoteNumber(nextQuoteNumber) || getNextQuoteVersion(booking);
    const existingVersions = normalizeQuoteVersions(booking);
    const quoteNumberExists = existingVersions.some(
      (entry) => String(entry.quoteNumber || "").trim().toLowerCase() === nextQuoteNumber.toLowerCase()
    );
    if (
      quoteNumberExists &&
      !window.confirm(`${nextQuoteNumber} already exists. Replace that saved quote?`)
    ) {
      return;
    }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const quotePayload = {
      ...quote,
      version: quoteVersion,
      quoteNumber: nextQuoteNumber,
      jobNumber: booking.jobNumber || quote.jobNumber || "",
      client: booking.client || quote.client || "",
      location: booking.location || quote.location || "",
      bookingDates: Array.isArray(booking.bookingDates) ? booking.bookingDates : [],
      subtotal,
      savedAt: nowIso,
      savedBy: authAccess.user?.email || "Unknown",
      updatedAt: nowIso,
      updatedBy: authAccess.user?.email || "Unknown",
    };
    const quoteVersions = [
      ...existingVersions.filter(
        (entry) => String(entry.quoteNumber || "").trim().toLowerCase() !== nextQuoteNumber.toLowerCase()
      ),
      quotePayload,
    ].sort((a, b) => (Number(a.version) || 0) - (Number(b.version) || 0));
    const quoteNumbers = normalizeQuoteNumbers([...getBookingQuoteNumbers(booking), nextQuoteNumber]);
    try {
      await updateDoc(
        doc(db, "bookings", booking.id),
        tenantPayload(dataAccessState, {
          quote: quotePayload,
          quoteVersions,
          quoteVersion,
          quoteNumber: quotePayload.quoteNumber,
          quoteNumbers,
          updatedAt: nowIso,
          lastEditedBy: authAccess.user?.email || "Unknown",
          lastEditedByUid: authAccess.user?.uid || "",
        })
      );
      setQuote(quotePayload);
      setBooking((prev) => ({
        ...(prev || {}),
        quote: quotePayload,
        quoteVersions,
        quoteVersion,
        quoteNumber: quotePayload.quoteNumber,
        quoteNumbers,
      }));
      alert(`${nextQuoteNumber} saved.`);
    } catch (err) {
      if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "save quote" })) {
        console.error("Failed saving quote:", err);
        alert("Failed to save quote.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>Loading quote...</div>
      </HeaderSidebarLayout>
    );
  }

  if (!booking) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>Booking not found.</div>
      </HeaderSidebarLayout>
    );
  }

  const groupedRows = [];
  let lastSection = "";
  quote.lineItems.forEach((item, index) => {
    const section = item.section || "";
    if (section && section !== lastSection) {
      groupedRows.push({ type: "section", section, key: `section-${index}-${section}` });
      lastSection = section;
    }
    groupedRows.push({ type: "line", item, index, key: item.id || `line-${index}` });
  });

  const screenSections = [];
  quote.lineItems.forEach((item, index) => {
    const section = item.section || "Quote lines";
    let group = screenSections.find((entry) => entry.section === section);
    if (!group) {
      group = { section, rows: [] };
      screenSections.push(group);
    }
    group.rows.push({ item, index, key: item.id || `line-${index}` });
  });
  return (
    <HeaderSidebarLayout>
      <div ref={pageRef} className="quote-print-page" style={pageWrap}>
        <div className="quote-print-toolbar" style={toolbar}>
          <div style={toolbarTop}>
            <button type="button" onClick={() => router.push(`/edit-booking/${booking.id}`)} style={backButton}>
              <ArrowLeft size={16} />
              Booking
            </button>
            <div style={toolbarTitleBlock}>
              <div style={toolbarEyebrow}>Quote Builder</div>
              <div style={toolbarTitle}>
                {booking.jobNumber || "New quote"} - {booking.client || "No production company"}
              </div>
            </div>
            <div style={toolbarMeta}>{quoteDate()}</div>
          </div>

          <div style={toolbarBottom}>
            <select
              value={currentQuoteNumber}
              onChange={(event) => loadQuoteNumber(event.target.value)}
              style={toolbarSelect}
            >
              <option value="">Select quote</option>
              {quoteSelectOptions.map((quoteNumberOption) => {
                const isSaved = savedQuotes.some(
                  (entry) =>
                    String(entry.quoteNumber || "").trim().toLowerCase() ===
                    String(quoteNumberOption || "").trim().toLowerCase()
                );
                return (
                  <option key={quoteNumberOption} value={quoteNumberOption}>
                    {quoteNumberOption}{isSaved ? " - saved" : " - new"}
                  </option>
                );
              })}
            </select>
            <button type="button" onClick={createNewQuote} style={ghostButton}>
              <Plus size={16} />
              New quote
            </button>
            <label style={templateSearchWrap}>
              <Search size={16} style={templateSearchIcon} />
              <input
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
                style={templateSearchInput}
                placeholder="Search templates..."
              />
            </label>
            <select
              value={quote.templateId || ""}
              onChange={(event) => loadTemplate(event.target.value)}
              style={toolbarSelect}
            >
              <option value="">Select quote template</option>
              {filteredQuoteTemplateOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {suggestedTemplate && suggestedTemplate.id !== quote.templateId ? (
              <button type="button" onClick={() => loadTemplate(suggestedTemplate.id)} style={ghostButton}>
                <Wand2 size={16} />
                Use suggested
              </button>
            ) : null}
            <select
              value={quote.status || "Draft"}
              onChange={(event) => updateQuote({ status: event.target.value })}
              style={toolbarSelectSmall}
            >
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Revised">Revised</option>
              <option value="Lost">Lost</option>
            </select>
            <div style={toolbarActions}>
              <button type="button" onClick={() => window.print()} style={ghostButton}>
                <Printer size={16} />
                Print
              </button>
              <button type="button" onClick={addLine} style={ghostButton}>
                <Plus size={16} />
                Add line
              </button>
              <button type="button" onClick={saveQuote} disabled={saving} style={primaryButton}>
                <Save size={16} />
                {saving ? "Saving..." : "Save Quote"}
              </button>
            </div>
          </div>
        </div>

        <div className="quote-screen-editor" style={screenEditor}>
          <section style={screenQuoteTop}>
            <div style={screenHeaderGrid}>
              <InfoField label="Quote Date" value={quoteDate()} />
              <InfoField label="Job No" value={booking.jobNumber || "-"} />
              <InfoField label="Quote No" value={quote.quoteNumber || booking.quoteNumber || "-"} />
              <InfoField label="Production Company" value={booking.client || "-"} />
              <InfoField label="Production" value={booking.production || "-"} />
              <InfoField
                label="Production Contact"
                value={
                  Array.isArray(booking.additionalContacts) && booking.additionalContacts[0]?.name
                    ? booking.additionalContacts[0].name
                    : "-"
                }
              />
              <InfoField label="Location" value={booking.location || "-"} />
              <InfoField label="Shoot Dates" value={formatBookingDates(booking) || "-"} />
              <InfoField label="Bickers Contact" value={quote.bickersContact || "Adam Eastall"} />
            </div>

            <div style={screenDescriptionBar}>
              <label style={screenFieldLabel}>
                Description of services
                <input
                  value={quote.templateName || ""}
                  onChange={(event) => updateQuote({ templateName: event.target.value })}
                  style={screenInput}
                  placeholder="Description of services"
                />
              </label>
              <div style={screenTotal}>
                <span>Total Price</span>
                <strong>£{money(subtotal)}</strong>
              </div>
              <label style={screenFieldLabel}>
                Quote notes
                <input
                  value={quote.notes || ""}
                  onChange={(event) => updateQuote({ notes: event.target.value })}
                  style={screenInput}
                  placeholder="Optional notes"
                />
              </label>
            </div>
          </section>

          {screenSections.length ? (
            <div style={screenSectionsStack}>
              {screenSections.map((section) => (
                <section key={section.section} style={screenSectionBlock}>
                  <h3 style={screenSectionTitle}>{section.section}</h3>
                  <div style={screenLinesOneCol}>
                    {section.rows.map((row) => {
                      const item = row.item;
                      const total =
                        item.totalMode === "tbc"
                          ? "TBC"
                          : item.totalMode === "production"
                          ? "Production"
                          : `£${money(parseNumber(item.qty) * parseNumber(item.unitPrice))}`;

                      return (
                        <div key={row.key} style={screenLineCard}>
                          <input
                            value={item.description || ""}
                            onChange={(event) => updateLineItem(row.index, { description: event.target.value })}
                            style={screenLineDescription}
                          />
                          <input
                            value={item.qty || ""}
                            onChange={(event) => updateLineItem(row.index, { qty: event.target.value })}
                            style={screenSmallInput}
                            placeholder="Qty"
                          />
                          <input
                            value={item.unitPrice || ""}
                            onChange={(event) => updateLineItem(row.index, { unitPrice: event.target.value })}
                            style={screenSmallInput}
                            placeholder="Unit"
                          />
                          <select
                            value={item.totalMode || "auto"}
                            onChange={(event) => updateLineItem(row.index, { totalMode: event.target.value })}
                            style={screenTotalSelect}
                            title={total}
                          >
                            <option value="auto">{total || "-"}</option>
                            <option value="tbc">TBC</option>
                            <option value="production">Production</option>
                          </select>
                          <button type="button" onClick={() => removeLine(row.index)} style={screenIconButton} title="Remove line">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <section style={screenPanel}>
              <div style={screenEmpty}>Select a quote template to load line items.</div>
            </section>
          )}
        </div>

        <div
          className="quote-scale-shell"
          style={scaleShell}
        >
        <div
          className="quote-print-paper"
          style={paper}
        >
          <div style={quoteBanner}>
            <Image
              src="/quote-carbon-header.png"
              alt="Bickers Action quotation"
              width={1067}
              height={203}
              priority
              style={quoteBannerImage}
            />
          </div>

          <table style={headerTable}>
            <tbody>
              <tr>
                <td style={labelCell}>Quote Date</td>
                <td style={labelCell}>Job No</td>
                <td style={labelCell}>Quote No</td>
              </tr>
              <tr>
                <td style={valueCell}>{quoteDate()}</td>
                <td style={valueCell}>{booking.jobNumber || ""}</td>
                <td style={valueCell}>{quote.quoteNumber || booking.quoteNumber || ""}</td>
              </tr>
              <tr>
                <td style={labelCell}>Production Company</td>
                <td style={labelCell}>Production</td>
                <td style={labelCell}>Production Contact</td>
              </tr>
              <tr>
                <td style={valueCell}>{booking.client || ""}</td>
                <td style={valueCell}>{booking.production || ""}</td>
                <td style={valueCell}>
                  {Array.isArray(booking.additionalContacts) && booking.additionalContacts[0]?.name
                    ? booking.additionalContacts[0].name
                    : ""}
                </td>
              </tr>
              <tr>
                <td style={labelCell}>Location</td>
                <td style={labelCell}>Shoot Dates</td>
                <td style={labelCell}>Bickers Contact</td>
              </tr>
              <tr>
                <td style={valueCell}>{booking.location || ""}</td>
                <td style={valueCell}>{formatBookingDates(booking)}</td>
                <td style={valueCell}>{quote.bickersContact || "Adam Eastall"}</td>
              </tr>
            </tbody>
          </table>

          <div style={descriptionLabel}>Description of Services</div>
          <input
            value={quote.templateName || ""}
            onChange={(event) => updateQuote({ templateName: event.target.value })}
            style={serviceInput}
            placeholder="Description of services"
          />

          <table style={quoteTable}>
            <thead>
              <tr>
                <th style={descriptionHeader}>DESCRIPTION</th>
                <th style={smallHeader}>QTY</th>
                <th style={smallHeader}>UNIT PRICE</th>
                <th style={smallHeader}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.length ? (
                groupedRows.map((row) => {
                  if (row.type === "section") {
                    return <SectionBreak key={row.key}>{row.section}</SectionBreak>;
                  }
                  const item = row.item;
                  const total =
                    item.totalMode === "tbc"
                      ? "TBC"
                      : item.totalMode === "production"
                      ? "Production"
                      : money(parseNumber(item.qty) * parseNumber(item.unitPrice));
                  return (
                    <tr key={row.key} className="quote-spreadsheet-row">
                      <td style={quoteCell}>
                        <input
                          className="quote-spreadsheet-input"
                          value={item.description || ""}
                          onChange={(event) => updateLineItem(row.index, { description: event.target.value })}
                          style={lineInput}
                        />
                      </td>
                      <td style={quoteCell}>
                        <input
                          className="quote-spreadsheet-input"
                          value={item.qty || ""}
                          onChange={(event) => updateLineItem(row.index, { qty: event.target.value })}
                          style={qtyInput}
                        />
                      </td>
                      <td style={quoteCell}>
                        <input
                          className="quote-spreadsheet-input"
                          value={item.unitPrice || ""}
                          onChange={(event) => updateLineItem(row.index, { unitPrice: event.target.value })}
                          style={moneyInput}
                        />
                      </td>
                      <td style={quoteCell}>
                        <select
                          className="quote-spreadsheet-input quote-spreadsheet-select"
                          value={item.totalMode || "auto"}
                          onChange={(event) => updateLineItem(row.index, { totalMode: event.target.value })}
                          style={totalSelect}
                        >
                          <option value="auto">{total || "-"}</option>
                          <option value="tbc">TBC</option>
                          <option value="production">Production</option>
                        </select>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} style={emptyCell}>
                    Select a quote template to load the line items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={quoteFooter}>
            <div style={footerBlackFill}></div>
            <div style={totalRows}>
              <div style={totalRow}>
                <span>Total Price £</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <div style={vatText}>Excludes VAT</div>
            </div>
          </div>

          {quote.notes ? (
            <textarea
              value={quote.notes || ""}
              onChange={(event) => updateQuote({ notes: event.target.value })}
              style={notesInput}
              placeholder="Quote notes..."
            />
          ) : null}

          <div style={warningBox}>
            ALL TRACKING ACTIVITY ON A PUBLIC HIGHWAY MUST HAVE THE APPROVAL OF THE POLICE & LOCAL AUTHORITY
          </div>

          <div style={contactFooter}>
            <div style={contactText}>For more information,<br />please contact us</div>
            <div style={contactPair}>
              <span style={contactLabel}>Tel</span>
              <span style={contactValue}>+44 (0) 1449 761300</span>
            </div>
            <div style={contactPair}>
              <span style={contactLabel}>Web</span>
              <span style={contactValue}>www.bickers.co.uk</span>
            </div>
          </div>
        </div>

        <aside className="quote-summary-panel" style={summaryPanel}>
          <div style={summaryHeader}>
            <div>
              <div style={summaryEyebrow}>Quote Summary</div>
              <h2 style={summaryTitle}>{booking.jobNumber || "No job number"}</h2>
            </div>
            <div style={summaryStatus}>{currentSavedQuote ? `${quote.status || "Draft"} saved` : quote.status || "Draft"}</div>
          </div>

          <div style={summaryTotalBox}>
            <span>Total Price</span>
            <strong>£{money(subtotal)}</strong>
            <small>Excludes VAT</small>
          </div>

          <div style={summaryGrid}>
            <InfoField label="Quote Date" value={quoteDate()} />
            <InfoField label="Quote No" value={quote.quoteNumber || booking.quoteNumber || "-"} />
            <InfoField label="Production Company" value={booking.client || "-"} />
            <InfoField label="Production" value={booking.production || "-"} />
            <InfoField label="Location" value={booking.location || "-"} />
            <InfoField label="Shoot Dates" value={formatBookingDates(booking) || "-"} />
            <InfoField
              label="Production Contact"
              value={
                Array.isArray(booking.additionalContacts) && booking.additionalContacts[0]?.name
                  ? booking.additionalContacts[0].name
                  : "-"
              }
            />
            <InfoField label="Bickers Contact" value={quote.bickersContact || "Adam Eastall"} />
          </div>

          <div style={summarySection}>
            <h3 style={summarySectionTitle}>Booking Summary</h3>
            <div style={bookingSummaryRows}>
              <div style={bookingSummaryRow}>
                <span>Job No</span>
                <strong>{booking.jobNumber || "-"}</strong>
              </div>
              <div style={bookingSummaryRow}>
                <span>Shoot Type</span>
                <strong>{booking.shootType || "-"}</strong>
              </div>
              <div style={bookingSummaryRow}>
                <span>Booking Days</span>
                <strong>{getBookingDateKeys(booking).length || "-"}</strong>
              </div>
              <div style={bookingSummaryRow}>
                <span>Vehicle Rental Days</span>
                <strong>{getVehicleRentalDayCount(booking) || "-"}</strong>
              </div>
              <div style={bookingSummaryRow}>
                <span>Crew</span>
                <strong>
                  {booking.allocatedCrewCount || booking.requiredCrewCount
                    ? `${booking.allocatedCrewCount || 0}/${booking.requiredCrewCount || 0}`
                    : "-"}
                </strong>
              </div>
              <div style={bookingSummaryBlock}>
                <span>Vehicles</span>
                <strong>{formatVehicleSummaryList(booking.vehicles, vehicleLookup)}</strong>
              </div>
              <div style={bookingSummaryBlock}>
                <span>Equipment</span>
                <strong>{formatSummaryList(booking.equipment)}</strong>
              </div>
              <div style={bookingSummaryBlock}>
                <span>Day Notes</span>
                {getDayNoteRows(booking).length ? (
                  <div style={dayNotesList}>
                    {getDayNoteRows(booking).map((row) => (
                      <div key={`${row.date}-${row.note}`} style={dayNoteRow}>
                        <strong>{row.date}</strong>
                        <span>{row.note}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <strong>-</strong>
                )}
              </div>
              {booking.notes ? (
                <div style={bookingSummaryBlock}>
                  <span>Booking Notes</span>
                  <strong>{booking.notes}</strong>
                </div>
              ) : null}
            </div>
          </div>

          <div style={summarySection}>
            <h3 style={summarySectionTitle}>Line Items</h3>
            {screenSections.length ? (
              <div style={summaryList}>
                {screenSections.map((section) => {
                  const sectionTotal = section.rows.reduce((sum, row) => {
                    const item = row.item;
                    if ((item.totalMode || "auto") !== "auto") return sum;
                    return sum + parseNumber(item.qty) * parseNumber(item.unitPrice);
                  }, 0);
                  return (
                    <div key={section.section} style={summaryRow}>
                      <span>{section.section}</span>
                      <strong>{section.rows.length} lines - £{money(sectionTotal)}</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={summaryEmpty}>No template loaded.</div>
            )}
          </div>

          <div style={summarySection}>
            <h3 style={summarySectionTitle}>Description</h3>
            <div style={summaryText}>{quote.templateName || "No description selected."}</div>
          </div>
        </aside>
        </div>
        <style jsx global>{`
          @media screen {
            .quote-print-page {
              min-height: calc(100vh - 72px);
              overflow: auto !important;
            }

            footer {
              display: none !important;
            }

            .quote-scale-shell {
              display: flex !important;
            }

            .quote-screen-editor {
              display: none !important;
            }

            .quote-summary-panel {
              display: block !important;
            }
          }

          @media print {
            body {
              background: #fff !important;
              margin: 0 !important;
              overflow: visible !important;
            }

            html,
            body {
              width: 210mm !important;
              min-height: 297mm !important;
              overflow: visible !important;
            }

            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            header,
            nav,
            aside,
            footer,
            .quote-print-toolbar {
              display: none !important;
            }

            * {
              scrollbar-width: none !important;
            }

            *::-webkit-scrollbar {
              display: none !important;
              width: 0 !important;
              height: 0 !important;
            }

            .quote-print-page {
              padding: 0 !important;
              background: #fff !important;
              overflow: visible !important;
            }

            .quote-print-paper {
              max-width: none !important;
              width: 194mm !important;
              min-height: 281mm !important;
              margin: 0 !important;
              box-shadow: none !important;
              border: 2px solid #000 !important;
              box-sizing: border-box !important;
              transform: none !important;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .quote-scale-shell {
              height: auto !important;
              display: block !important;
            }

            .quote-screen-editor {
              display: none !important;
            }

            .quote-summary-panel {
              display: none !important;
            }

            .quote-edit-only {
              display: none !important;
            }

            .quote-delete-row-button {
              display: none !important;
            }

            .quote-spreadsheet-input:focus {
              box-shadow: none !important;
              outline: none !important;
            }

            @page {
              size: A4 portrait;
              margin: 8mm;
            }
          }

          .quote-spreadsheet-row:hover .quote-spreadsheet-input {
            background: #f7fbff !important;
          }

          .quote-spreadsheet-input:focus {
            background: #fff !important;
            outline: 2px solid #217346 !important;
            outline-offset: -2px !important;
          }

          .quote-spreadsheet-select:focus {
            color: #111827 !important;
          }
        `}</style>
      </div>
    </HeaderSidebarLayout>
  );
}

const pageWrap = {
  minHeight: "100vh",
  background: UI.page,
  padding: "12px 18px 18px",
  color: UI.text,
  overflowX: "hidden",
};

const screenEditor = {
  maxWidth: 1600,
  margin: "0 auto",
  display: "grid",
  gap: 10,
};

const screenPanel = {
  background: "#fff",
  border: "1px solid #d7dee8",
  borderRadius: 8,
  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
  padding: 10,
};

const screenQuoteTop = {
  background: "#fff",
  border: "2px solid #000",
  borderRadius: 2,
  overflow: "hidden",
};

const screenTotal = {
  minWidth: 140,
  display: "grid",
  gap: 2,
  textAlign: "right",
  color: "#fff",
  background: "#000",
  border: "1px solid #000",
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
};

const screenHeaderGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  borderBottom: "2px solid #000",
};

const screenInfoCell = {
  borderRight: "2px solid #000",
  borderBottom: "1px solid #000",
  background: "#fff",
  minHeight: 40,
  textAlign: "center",
  overflow: "hidden",
};

const screenInfoLabel = {
  color: UI.text,
  background: "#c7c7c7",
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1,
  padding: "4px 6px",
};

const screenInfoValue = {
  color: UI.text,
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.15,
  padding: "5px 8px",
};

const screenDescriptionBar = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 150px minmax(0, 1fr)",
  gap: 0,
  alignItems: "stretch",
};

const screenFieldLabel = {
  display: "grid",
  gap: 4,
  color: UI.muted,
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  padding: "6px 8px",
};

const screenInput = {
  height: 28,
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  padding: "4px 7px",
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "none",
};

const screenSectionsStack = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  alignItems: "start",
};

const screenSectionBlock = {
  background: "#fff",
  border: "2px solid #000",
  borderRadius: 2,
  overflow: "hidden",
};

const screenSectionTitle = {
  margin: 0,
  color: UI.text,
  background: "#c7c7c7",
  borderBottom: "1px solid #000",
  padding: "5px 8px",
  fontSize: 12,
  fontWeight: 900,
  textAlign: "center",
};

const screenLinesOneCol = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 0,
};

const screenLineCard = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 54px 70px 86px 28px",
  gap: 4,
  alignItems: "center",
  background: "#fff",
  borderBottom: "1px solid #000",
  padding: 4,
  minWidth: 0,
};

const screenLineDescription = {
  minWidth: 0,
  height: 26,
  border: "1px solid #e2e8f0",
  borderRadius: 5,
  padding: "4px 6px",
  fontSize: 11.5,
  color: UI.text,
};

const screenSmallInput = {
  height: 26,
  border: "1px solid #e2e8f0",
  borderRadius: 5,
  padding: "4px 5px",
  fontSize: 11.5,
  textAlign: "center",
  color: UI.text,
};

const screenTotalSelect = {
  height: 26,
  border: "1px solid #e2e8f0",
  borderRadius: 5,
  padding: "3px 4px",
  fontSize: 11,
  color: UI.text,
  background: "#fff",
};

const screenIconButton = {
  width: 26,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #fecaca",
  borderRadius: 5,
  background: "#fff1f2",
  color: "#b91c1c",
  cursor: "pointer",
};

const screenEmpty = {
  color: UI.muted,
  fontSize: 13,
  fontWeight: 700,
};

const scaleShell = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: 18,
  maxWidth: 1280,
  margin: "0 auto",
  width: "100%",
  overflow: "visible",
};

const summaryPanel = {
  position: "sticky",
  top: 12,
  flex: "1 1 330px",
  maxWidth: 390,
  minWidth: 300,
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  boxShadow: "0 10px 30px rgba(15,23,42,0.12)",
  padding: 14,
  color: UI.text,
};

const summaryHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const summaryEyebrow = {
  color: UI.muted,
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
};

const summaryTitle = {
  margin: "2px 0 0",
  color: UI.text,
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 900,
};

const summaryStatus = {
  border: "1px solid #bbf7d0",
  borderRadius: 999,
  background: "#ecfdf3",
  color: "#166534",
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const summaryTotalBox = {
  display: "grid",
  gap: 2,
  background: "#000",
  color: "#fff",
  padding: "10px 12px",
  marginBottom: 12,
  borderRadius: 6,
  textTransform: "uppercase",
  fontSize: 11,
  fontWeight: 900,
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  border: "1px solid #000",
  marginBottom: 12,
};

const summarySection = {
  border: "1px solid #d7dee8",
  borderRadius: 6,
  overflow: "hidden",
  marginBottom: 10,
};

const summarySectionTitle = {
  margin: 0,
  background: "#c7c7c7",
  borderBottom: "1px solid #d7dee8",
  color: UI.text,
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 900,
};

const summaryList = {
  display: "grid",
};

const summaryRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  borderBottom: "1px solid #e2e8f0",
  padding: "7px 8px",
  fontSize: 12,
  lineHeight: 1.2,
};

const bookingSummaryRows = {
  display: "grid",
};

const bookingSummaryRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  borderBottom: "1px solid #e2e8f0",
  padding: "7px 8px",
  color: UI.muted,
  fontSize: 12,
  lineHeight: 1.2,
};

const bookingSummaryBlock = {
  display: "grid",
  gap: 3,
  borderBottom: "1px solid #e2e8f0",
  padding: "7px 8px",
  color: UI.muted,
  fontSize: 12,
  lineHeight: 1.25,
};

const dayNotesList = {
  display: "grid",
  gap: 2,
  color: UI.text,
};

const dayNoteRow = {
  display: "grid",
  gridTemplateColumns: "82px minmax(0, 1fr)",
  gap: 6,
  alignItems: "baseline",
  fontSize: 12,
  lineHeight: 1.25,
};

const summaryText = {
  padding: 8,
  color: UI.text,
  fontSize: 12,
  lineHeight: 1.35,
};

const summaryEmpty = {
  padding: 8,
  color: UI.muted,
  fontSize: 12,
  fontWeight: 700,
};

const toolbar = {
  display: "grid",
  gap: 10,
  maxWidth: 1280,
  margin: "0 auto 14px",
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
  padding: 10,
};

const toolbarTop = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
};

const toolbarBottom = {
  display: "grid",
  gridTemplateColumns: "190px auto 230px minmax(260px, 1fr) auto 150px auto",
  gap: 8,
  alignItems: "center",
};

const toolbarTitleBlock = {
  minWidth: 0,
};

const toolbarEyebrow = {
  color: UI.muted,
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const toolbarTitle = {
  marginTop: 1,
  color: UI.text,
  fontSize: 15,
  fontWeight: 900,
  lineHeight: 1.15,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const toolbarMeta = {
  color: UI.muted,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 800,
};

const toolbarActions = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  alignItems: "center",
};

const templateSearchWrap = {
  position: "relative",
  display: "block",
  minWidth: 0,
};

const templateSearchIcon = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: UI.muted,
  pointerEvents: "none",
};

const templateSearchInput = {
  width: "100%",
  minHeight: 36,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "7px 9px 7px 34px",
  background: "#fff",
  color: UI.text,
  fontWeight: 700,
  boxSizing: "border-box",
};

const ghostButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 36,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: UI.text,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
};

const backButton = {
  ...ghostButton,
  minWidth: 98,
  justifyContent: "center",
};

const primaryButton = {
  ...ghostButton,
  background: UI.brand,
  color: "#fff",
  border: `1px solid ${UI.brand}`,
};

const toolbarSelect = {
  minHeight: 36,
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "7px 9px",
  background: "#fff",
  color: UI.text,
  fontWeight: 700,
};

const toolbarSelectSmall = {
  ...toolbarSelect,
  width: 160,
};

const paper = {
  width: "210mm",
  height: "297mm",
  maxWidth: "none",
  margin: "0 auto",
  background: UI.paper,
  padding: 0,
  border: "2px solid #000",
  boxShadow: "0 8px 28px rgba(15,23,42,0.08)",
  overflow: "hidden",
  boxSizing: "border-box",
  transformOrigin: "top center",
};

const quoteBanner = {
  width: "100%",
  height: "28mm",
  borderBottom: "3px solid #000",
  background: "#111",
};

const quoteBannerImage = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const headerTable = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  marginBottom: 0,
};

const labelCell = {
  borderLeft: "2px solid #000",
  borderRight: "2px solid #000",
  padding: "2px 8px",
  fontSize: 12,
  lineHeight: 1,
  fontWeight: 900,
  textAlign: "center",
  background: "#bfbfbf",
};

const valueCell = {
  borderLeft: "2px solid #000",
  borderRight: "2px solid #000",
  padding: "2px 8px",
  minHeight: 18,
  fontSize: 11.5,
  lineHeight: 1.05,
  textAlign: "center",
  background: "#fff",
};

const descriptionLabel = {
  borderTop: "2px solid #000",
  borderBottom: "2px solid #000",
  padding: "2px 8px",
  fontSize: 12,
  lineHeight: 1,
  textAlign: "center",
  fontWeight: 900,
  background: "#bfbfbf",
};

const serviceInput = {
  width: "100%",
  border: "none",
  borderBottom: "2px solid #000",
  padding: "3px 8px",
  fontSize: 12.5,
  lineHeight: 1,
  fontWeight: 900,
  textAlign: "center",
  marginBottom: 0,
  boxSizing: "border-box",
};

const quoteTable = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  background: "#fff",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const descriptionHeader = {
  border: "2px solid #000",
  background: "#000",
  color: "#fff",
  padding: "4px 6px",
  textAlign: "left",
  width: "73%",
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 900,
  height: 22,
  boxSizing: "border-box",
};

const smallHeader = {
  ...descriptionHeader,
  width: "9%",
  textAlign: "center",
};

const sectionCell = {
  borderLeft: "1px solid #000",
  borderRight: "1px solid #000",
  borderTop: "1px solid #000",
  borderBottom: "1px solid #000",
  padding: "3px 8px",
  fontWeight: 900,
  textAlign: "center",
  background: "#bfbfbf",
  fontSize: 11,
  lineHeight: 1,
  height: 20,
  boxSizing: "border-box",
};

const quoteCell = {
  border: "1px solid #000",
  padding: 0,
  verticalAlign: "middle",
  height: 20,
  background: "#fff",
  boxSizing: "border-box",
};

const lineInput = {
  width: "100%",
  border: "none",
  outline: "none",
  fontSize: 10.5,
  lineHeight: "19px",
  color: UI.text,
  background: "transparent",
  padding: "0 5px",
  margin: 0,
  display: "block",
  height: 20,
  boxSizing: "border-box",
};

const qtyInput = {
  ...lineInput,
  textAlign: "center",
  color: "#0057b8",
};

const moneyInput = {
  ...lineInput,
  textAlign: "right",
  paddingRight: 7,
};

const totalSelect = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: 10.5,
  lineHeight: "19px",
  textAlign: "right",
  height: 20,
  padding: "0 5px 0 2px",
  margin: 0,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  color: UI.text,
  boxSizing: "border-box",
};

const emptyCell = {
  border: `1px solid ${UI.grid}`,
  padding: 14,
  color: UI.muted,
};

const quoteFooter = {
  display: "flex",
  gap: 0,
  alignItems: "stretch",
  justifyContent: "space-between",
  marginTop: 0,
};

const footerBlackFill = {
  flex: 1,
  minHeight: 34,
  background: "#000",
  display: "flex",
  alignItems: "center",
  paddingLeft: 8,
};

const totalRows = {
  minWidth: 220,
  background: "#000",
  color: "#fff",
};

const totalRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  borderLeft: "2px solid #fff",
  padding: "5px 8px 1px",
  fontSize: 12.5,
  lineHeight: 1,
  fontWeight: 900,
};

const vatText = {
  borderLeft: "2px solid #fff",
  padding: "2px 8px 5px",
  textAlign: "left",
  fontWeight: 900,
  fontSize: 12,
};

const notesInput = {
  width: "100%",
  minHeight: 36,
  marginTop: 0,
  border: "none",
  borderTop: "2px solid #000",
  padding: 6,
  fontSize: 11,
  boxSizing: "border-box",
};

const warningBox = {
  margin: "10px 14px 8px",
  border: "1px solid #c7c7c7",
  color: "#ff0000",
  background: "#fff",
  textAlign: "center",
  fontWeight: 900,
  fontSize: 11.5,
  padding: "3px 8px",
};

const contactFooter = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1.3fr 1.35fr",
  gap: 20,
  alignItems: "center",
  padding: "0 34px 14px",
};

const contactText = {
  fontSize: 12.5,
  lineHeight: 1.15,
};

const contactPair = {
  display: "grid",
  gridTemplateColumns: "78px 1fr",
  alignItems: "center",
  border: "1px solid #d0021b",
  minHeight: 28,
};

const contactLabel = {
  height: "100%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#c90016",
  color: "#fff",
  fontWeight: 900,
  fontSize: 12.5,
};

const contactValue = {
  textAlign: "center",
  fontWeight: 900,
  fontSize: 12,
  padding: "0 10px",
};
