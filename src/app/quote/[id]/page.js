"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Percent, Plus, Printer, Save, Search, Trash2, Wand2 } from "lucide-react";
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
  page: "#ffffff",
  paper: "#ffffff",
  text: "#111827",
  muted: "#5f6f82",
  border: "#111827",
  grid: "#9ca3af",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
};

const QUOTE_SECTION_GREY = "#bfbfbf";
const DISCOUNT_OPTIONS = ["5%", "10%", "15%", "20%", "50%"];
const DEFAULT_DISCOUNT = "10%";

const emptyQuote = {
  status: "Draft",
  templateId: "",
  templateFile: "",
  templateName: "",
  quoteName: "",
  lineItems: [],
  notes: "",
};

const compact = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseNumber = (value) => {
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "").trim();
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
  const existing = publicQuoteNumber(quote.quoteNumber || booking.quoteNumber || "");
  const match = existing.match(/^(.*?)-\d+$/);
  return match?.[1] || "";
};

const formatQuoteNumberForVersion = (booking = {}, quote = {}, version = 1) => {
  const suffix = String(Math.max(1, Number(version) || 1)).padStart(3, "0");
  const base = getQuoteNumberBase(booking, quote);
  return base ? `${base}-${suffix}` : suffix;
};

const getVersionFromQuoteNumber = (quoteNumber = "") => {
  const text = publicQuoteNumber(quoteNumber);
  const match = text.match(/(?:^|-)(\d{1,4})$/);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isInteger(version) && version > 0 ? version : null;
};

const splitQuoteRevision = (quoteNumber = "") => {
  const text = String(quoteNumber || "").trim();
  const match = text.match(/^(.+)\.(\d+)$/);
  return {
    base: (match ? match[1] : text).trim(),
    revision: match?.[2] ? Number(match[2]) : 0,
  };
};

const publicQuoteNumber = (quoteNumber = "") => splitQuoteRevision(quoteNumber).base;

const quoteRevisionLabel = (quoteNumber = "") => {
  const revision = splitQuoteRevision(quoteNumber).revision;
  return revision > 0 ? `Rev ${revision}` : "Original";
};

const displayQuoteNumber = (quoteNumber = "", booking = {}) => {
  const text = publicQuoteNumber(quoteNumber);
  if (!text) return "";
  const jobNumber = String(booking.jobNumber || "").trim();
  if (jobNumber) {
    const escapedJobNumber = jobNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const jobPrefixMatch = text.match(new RegExp(`^Q?${escapedJobNumber}[-_\\s]+(.+)$`, "i"));
    if (jobPrefixMatch?.[1]) return jobPrefixMatch[1];
  }
  const suffixMatch = text.match(/^[A-Z]?\d+[-_\s]+(.+)$/i);
  return suffixMatch?.[1] || text;
};

const normalizeQuoteNumberInput = (value = "", booking = {}, quote = {}) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/[A-Za-z]/.test(text) || /[-_\s.]/.test(text)) return text;
  const base = getQuoteNumberBase(booking, quote);
  return base ? `${base}-${text.padStart(3, "0")}` : text.padStart(3, "0");
};

const quoteNumberKey = (quoteNumber = "", booking = {}, quote = {}) => {
  const fullQuoteNumber = normalizeQuoteNumberInput(quoteNumber, booking, {
    ...quote,
    quoteNumber: quoteNumber || quote.quoteNumber,
  });
  return fullQuoteNumber.toLowerCase();
};

const publicQuoteNumberKey = (quoteNumber = "", booking = {}, quote = {}) =>
  quoteNumberKey(publicQuoteNumber(quoteNumber), booking, {
    ...quote,
    quoteNumber: publicQuoteNumber(quoteNumber || quote.quoteNumber),
  });

const nextRevisionQuoteNumber = (baseQuoteNumber = "", quoteVersions = [], booking = {}, quote = {}) => {
  const baseNumber = publicQuoteNumber(normalizeQuoteNumberInput(baseQuoteNumber, booking, quote));
  const baseKey = publicQuoteNumberKey(baseNumber, booking, quote);
  const matchingRevisions = quoteVersions
    .filter((entry) => publicQuoteNumberKey(entry.quoteNumber, booking, entry) === baseKey)
    .map((entry) => splitQuoteRevision(entry.quoteNumber).revision);
  if (!matchingRevisions.length) return baseNumber;
  return `${baseNumber}.${Math.max(...matchingRevisions) + 1}`;
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

const getRemainingQuoteNumbers = (quoteVersions = []) =>
  normalizeQuoteNumbers(quoteVersions.map((entry) => publicQuoteNumber(entry?.quoteNumber)));

const latestQuoteVersion = (quoteVersions = []) =>
  quoteVersions.reduce((latest, entry) => {
    if (!latest) return entry;
    const latestTime = new Date(latest.savedAt || latest.updatedAt || latest.createdAt || 0).getTime() || 0;
    const entryTime = new Date(entry.savedAt || entry.updatedAt || entry.createdAt || 0).getTime() || 0;
    if (entryTime !== latestTime) return entryTime > latestTime ? entry : latest;
    return (Number(entry.version) || 0) >= (Number(latest.version) || 0) ? entry : latest;
  }, null);

const cloneTemplateItem = (item, index) => ({
  id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
  section: item.section || "",
  description: item.description || "",
  qty: "",
  unitPrice: item.unitPrice || "",
  totalMode: item.totalMode || "auto",
  originalTotalMode: item.totalMode || "auto",
  sourceRow: item.sourceRow || null,
});

const isDiscountLine = (item = {}) =>
  item.totalMode === "discount" || compact(`${item.section} ${item.description}`).includes("discount");

const isEquipmentSection = (section = "") => compact(section).includes("equipment");

const getLineAutoTotal = (item = {}) => parseNumber(item.qty) * parseNumber(item.unitPrice);

const getDiscountBase = (discountItem = {}, lineItems = []) => {
  const discountSection = String(discountItem.section || "");
  return lineItems.reduce((sum, item) => {
    if (item === discountItem || isDiscountLine(item)) return sum;
    if (item.totalMode && item.totalMode !== "auto") return sum;
    if (discountSection && String(item.section || "") !== discountSection) return sum;
    return sum + getLineAutoTotal(item);
  }, 0);
};

const getDiscountAmount = (item = {}, lineItems = []) => {
  const savedValue = String(item.unitPrice ?? "").trim();
  const rawValue = DISCOUNT_OPTIONS.includes(savedValue) ? savedValue : DEFAULT_DISCOUNT;
  const discountValue = parseNumber(rawValue);
  if (!discountValue) return 0;
  if (rawValue.includes("%")) return (getDiscountBase(item, lineItems) * discountValue) / 100;
  return discountValue;
};

const calculateSubtotal = (lineItems = []) =>
  lineItems.reduce((sum, item) => {
    if (isDiscountLine(item)) return sum - getDiscountAmount(item, lineItems);
    if (item.totalMode && item.totalMode !== "auto") return sum;
    return sum + getLineAutoTotal(item);
  }, 0);

const canAutoCalculateLine = (item = {}) =>
  String(item.qty || "").trim() && parseNumber(item.unitPrice) > 0;

const formatLineTotal = (item = {}, lineItems = []) => {
  if (isDiscountLine(item)) return money(getDiscountAmount(item, lineItems));
  if (item.totalMode === "tbc") return "TBC";
  if (item.totalMode === "production") return "Production";
  if (item.totalMode === "foc") return "FOC";
  return money(getLineAutoTotal(item));
};

const quoteDisplayName = (quote = {}) => {
  const name = String(quote.quoteName || quote.displayName || "").trim();
  if (name) return name;
  return String(quote.templateName || quote.templateFile || "").trim();
};

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
  quoteName: quoteDisplayName(quote),
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

const quoteFromRequestedNumber = (booking = {}, requestedQuoteNumber = "") => {
  const target = String(requestedQuoteNumber || "").trim().toLowerCase();
  if (!target) return normalizeQuote(booking);
  const versions = normalizeQuoteVersions(booking);
  const savedQuote =
    versions.find((entry) => String(entry.quoteNumber || "").trim().toLowerCase() === target) ||
    versions
      .filter(
        (entry) =>
          publicQuoteNumberKey(entry.quoteNumber, booking, entry) ===
          publicQuoteNumberKey(requestedQuoteNumber, booking, { quoteNumber: requestedQuoteNumber })
      )
      .sort((a, b) => splitQuoteRevision(b.quoteNumber).revision - splitQuoteRevision(a.quoteNumber).revision)[0];
  if (savedQuote) return hydrateQuote(booking, savedQuote);
  return buildBlankQuote(booking, requestedQuoteNumber);
};

const buildBlankQuote = (booking = {}, quoteNumber = "") =>
  hydrateQuote(booking, {
    ...emptyQuote,
    quoteNumber: quoteNumber || getNextQuoteNumber(booking, {}),
    createdAt: new Date().toISOString(),
  });

const SectionBreak = ({ children, canDiscount = false, hasDiscount = false, onAddLine, onAddDiscount, onRemoveDiscount, readOnly = false }) => (
  <tr>
    <td colSpan={4} style={sectionCell}>
      <div style={sectionCellInner}>
        <span style={sectionCellTitle}>{children}</span>
        {!readOnly ? (
          <span className="quote-section-actions" style={quoteSectionActions}>
            <button type="button" onClick={onAddLine} style={quoteSectionButton}>
              <Plus size={12} />
              Line
            </button>
            {canDiscount ? (
              <button type="button" onClick={onAddDiscount} style={quoteSectionButton}>
                <Percent size={12} />
                Discount
              </button>
            ) : null}
            {canDiscount && hasDiscount ? (
              <button type="button" onClick={onRemoveDiscount} style={quoteSectionDangerButton}>
                <Trash2 size={12} />
                Discount
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const bookingId = params?.id;
  const requestedQuoteNumber = searchParams.get("quote") || "";
  const requestedAction = searchParams.get("action") || "";
  const isViewMode = pathname?.startsWith("/quote-view") || searchParams.get("view") === "1";
  const isEmbedded = searchParams.get("embed") === "1";
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
  const [deleting, setDeleting] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [vehicleLookup, setVehicleLookup] = useState({ byId: {}, byReg: {}, byName: {} });
  const pageRef = useRef(null);
  const handledActionRef = useRef("");

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
        setQuote(quoteFromRequestedNumber(data || {}, requestedQuoteNumber));
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
  }, [accessKey, bookingId, dataAccessState, requestedQuoteNumber]);

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

  useEffect(() => {
    if (loading || !booking?.id) return;
    if (!["print", "download"].includes(requestedAction)) return;
    const quoteNumberForTitle = publicQuoteNumber(String(quote.quoteNumber || booking.quoteNumber || booking.jobNumber || "quote").trim());
    const actionKey = `${requestedAction}:${quoteNumberForTitle}`;
    if (handledActionRef.current === actionKey) return;
    handledActionRef.current = actionKey;

    const previousTitle = document.title;
    document.title = `${quoteNumberForTitle} - Bickers Quote`;
    const timer = window.setTimeout(() => {
      if (requestedAction === "download") {
        window.alert("Choose 'Save as PDF' in the print dialog to download this quote.");
      }
      window.print();
      window.setTimeout(() => {
        document.title = previousTitle;
      }, 500);
    }, 450);

    return () => {
      window.clearTimeout(timer);
      document.title = previousTitle;
    };
  }, [booking, loading, quote.quoteNumber, requestedAction]);

  const suggestedTemplate = useMemo(() => findSuggestedTemplate(booking || {}), [booking]);
  const subtotal = useMemo(() => calculateSubtotal(quote.lineItems), [quote.lineItems]);
  const hasDiscountLine = useMemo(() => quote.lineItems.some((item) => isDiscountLine(item)), [quote.lineItems]);
  const savedQuotes = useMemo(() => normalizeQuoteVersions(booking || {}), [booking]);
  const quoteNumberOptions = useMemo(() => getBookingQuoteNumbers(booking || {}), [booking]);
  const currentQuoteNumber = String(quote.quoteNumber || "").trim();
  const quoteSelectOptions = useMemo(() => {
    const map = new Map();
    normalizeQuoteNumbers([
      currentQuoteNumber,
      ...quoteNumberOptions,
      ...savedQuotes.map((entry) => entry.quoteNumber),
    ]).forEach((quoteNumberOption) => {
      const key = quoteNumberKey(quoteNumberOption, booking || {}, { quoteNumber: quoteNumberOption });
      if (!map.has(key)) map.set(key, quoteNumberOption);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aVersion = getVersionFromQuoteNumber(a) || 0;
      const bVersion = getVersionFromQuoteNumber(b) || 0;
      return aVersion - bVersion || String(a).localeCompare(String(b));
    });
  }, [booking, currentQuoteNumber, quoteNumberOptions, savedQuotes]);
  const currentSavedQuote = savedQuotes.find(
    (entry) => quoteNumberKey(entry.quoteNumber, booking || {}, entry) === quoteNumberKey(currentQuoteNumber, booking || {}, quote)
  );
  const currentQuoteKey = quoteNumberKey(currentQuoteNumber, booking || {}, quote);
  const quoteOptionLabels = useMemo(() => {
    const savedKeys = new Set(
      savedQuotes.map((entry) => quoteNumberKey(entry.quoteNumber, booking || {}, entry))
    );
    return Object.fromEntries(
      quoteSelectOptions.map((quoteNumberOption) => {
        const optionKey = quoteNumberKey(quoteNumberOption, booking || {}, { quoteNumber: quoteNumberOption });
        const displayNumber = displayQuoteNumber(quoteNumberOption, booking || {});
        const jobNumber = String(booking?.jobNumber || "").trim();
        const reference = jobNumber && displayNumber ? `#${jobNumber}-${displayNumber}` : displayNumber || quoteNumberOption;
        const savedQuote = savedQuotes.find(
          (entry) => quoteNumberKey(entry.quoteNumber, booking || {}, entry) === optionKey
        );
        const name = quoteDisplayName(savedQuote || {});
        const state = optionKey === currentQuoteKey ? "current" : savedKeys.has(optionKey) ? "saved" : "new";
        return [quoteNumberOption, `${reference} - ${quoteRevisionLabel(quoteNumberOption)}${name ? ` - ${name}` : ""} - ${state}`];
      })
    );
  }, [booking, currentQuoteKey, quoteSelectOptions, savedQuotes]);
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
      quoteName: quote.quoteName || template.serviceDescription,
      lineItems: template.lineItems.map(cloneTemplateItem),
      createdAt: quote.createdAt || new Date().toISOString(),
      quoteNumber: buildInitialQuoteNumber(booking || {}, quote),
    });
  };

  const loadQuoteNumber = (quoteNumber) => {
    const nextQuoteNumber = String(quoteNumber || "").trim();
    if (!nextQuoteNumber) return;
    const savedQuote =
      savedQuotes.find(
        (entry) => String(entry.quoteNumber || "").trim().toLowerCase() === nextQuoteNumber.toLowerCase()
      ) ||
      savedQuotes
        .filter(
          (entry) =>
            publicQuoteNumberKey(entry.quoteNumber, booking || {}, entry) ===
            publicQuoteNumberKey(nextQuoteNumber, booking || {}, { quoteNumber: nextQuoteNumber })
        )
        .sort((a, b) => splitQuoteRevision(b.quoteNumber).revision - splitQuoteRevision(a.quoteNumber).revision)[0];
    setQuote(savedQuote ? hydrateQuote(booking || {}, savedQuote) : buildBlankQuote(booking || {}, nextQuoteNumber));
  };

  const createNewQuote = () => {
    if (!booking?.id) return;
    const defaultQuoteNumber = getNextQuoteNumber(booking, quote);
    const quoteNumberInput = window.prompt("New quote number:", displayQuoteNumber(defaultQuoteNumber, booking));
    if (quoteNumberInput === null) return;
    const nextQuoteNumber = normalizeQuoteNumberInput(quoteNumberInput, booking, {
      ...quote,
      quoteNumber: defaultQuoteNumber,
    });
    if (!nextQuoteNumber) {
      alert("Please enter a quote number.");
      return;
    }
    const quoteNumberExists = savedQuotes.some(
      (entry) => publicQuoteNumberKey(entry.quoteNumber, booking, entry) === publicQuoteNumberKey(nextQuoteNumber, booking, { ...quote, quoteNumber: nextQuoteNumber })
    );
    if (quoteNumberExists) {
      alert(`${displayQuoteNumber(nextQuoteNumber, booking)} already exists. Open the existing quote from the quote list instead.`);
      return;
    }
    loadQuoteNumber(nextQuoteNumber);
  };

  const duplicateCurrentQuote = () => {
    if (!booking?.id) return;
    const defaultQuoteNumber = getNextQuoteNumber(booking, quote);
    const quoteNumberInput = window.prompt("Duplicate as quote number:", displayQuoteNumber(defaultQuoteNumber, booking));
    if (quoteNumberInput === null) return;
    const nextQuoteNumber = normalizeQuoteNumberInput(quoteNumberInput, booking, {
      ...quote,
      quoteNumber: defaultQuoteNumber,
    });
    if (!nextQuoteNumber) {
      alert("Please enter a quote number.");
      return;
    }
    const quoteNumberExists = savedQuotes.some(
      (entry) => publicQuoteNumberKey(entry.quoteNumber, booking, entry) === publicQuoteNumberKey(nextQuoteNumber, booking, { ...quote, quoteNumber: nextQuoteNumber })
    );
    if (quoteNumberExists) {
      alert(`${displayQuoteNumber(nextQuoteNumber, booking)} already exists. Please choose a different quote number.`);
      return;
    }
    setQuote({
      ...quote,
      quoteNumber: nextQuoteNumber,
      quoteName: `${quoteDisplayName(quote) || "Quote"} copy`,
      status: "Draft",
      version: getVersionFromQuoteNumber(nextQuoteNumber) || getNextQuoteVersion(booking),
      savedAt: "",
      savedBy: "",
      updatedAt: "",
      updatedBy: "",
      createdAt: new Date().toISOString(),
    });
  };

  const updateLineItem = (index, patch) => {
    updateQuote({
      lineItems: quote.lineItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const nextItem = { ...item, ...patch };
        if (patch.totalMode === "discount") {
          if (!isEquipmentSection(nextItem.section)) return item;
          if (!String(nextItem.description || "").trim()) nextItem.description = "Discount";
          if (!String(nextItem.qty || "").trim()) nextItem.qty = "Less";
          if (!DISCOUNT_OPTIONS.includes(String(nextItem.unitPrice || "").trim())) nextItem.unitPrice = DEFAULT_DISCOUNT;
          nextItem.originalTotalMode = "discount";
        }
        const valueChanged = Object.prototype.hasOwnProperty.call(patch, "qty") ||
          Object.prototype.hasOwnProperty.call(patch, "unitPrice");
        const quantityCleared = Object.prototype.hasOwnProperty.call(patch, "qty") &&
          !String(nextItem.qty || "").trim();
        if ((item.totalMode || "auto") === "tbc" && valueChanged && canAutoCalculateLine(nextItem)) {
          nextItem.totalMode = "auto";
        } else if (
          quantityCleared &&
          (item.originalTotalMode === "tbc" || item.autoCalculatedFromTbc)
        ) {
          nextItem.totalMode = "tbc";
          nextItem.autoCalculatedFromTbc = false;
        }
        if ((item.totalMode || "auto") === "tbc" && nextItem.totalMode === "auto") {
          nextItem.autoCalculatedFromTbc = true;
        }
        return nextItem;
      }),
    });
  };

  const getSectionInsertIndex = (section = "") => {
    const lastIndex = quote.lineItems.reduce(
      (foundIndex, item, index) => (String(item.section || "Quote lines") === section ? index : foundIndex),
      -1
    );
    return lastIndex >= 0 ? lastIndex + 1 : quote.lineItems.length;
  };

  const addLine = (section = "Manual additions") => {
    const nextLineItems = [...quote.lineItems];
    nextLineItems.splice(getSectionInsertIndex(section), 0, {
      id: `${Date.now()}-manual`,
      section,
      description: "",
      qty: "",
      unitPrice: "",
      totalMode: "auto",
    });
    updateQuote({ lineItems: nextLineItems });
  };

  const addDiscountLine = (section = "") => {
    const targetSection =
      section ||
      quote.lineItems.find((item) => isEquipmentSection(item.section))?.section ||
      "Equipment - Daily Rates";
    if (!isEquipmentSection(targetSection)) return;
    const nextLineItems = [...quote.lineItems];
    nextLineItems.splice(getSectionInsertIndex(targetSection), 0, {
      id: `${Date.now()}-equipment-discount`,
      section: targetSection,
      description: "Discount",
      qty: "Less",
      unitPrice: DEFAULT_DISCOUNT,
      totalMode: "discount",
      originalTotalMode: "discount",
    });
    updateQuote({ lineItems: nextLineItems });
  };

  const removeLine = (index) => {
    updateQuote({ lineItems: quote.lineItems.filter((_, itemIndex) => itemIndex !== index) });
  };

  const removeDiscountLines = (section = "") => {
    updateQuote({
      lineItems: quote.lineItems.filter(
        (item) => !isDiscountLine(item) || (section && String(item.section || "Quote lines") !== section)
      ),
    });
  };

  const moveLine = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= quote.lineItems.length) return;
    const nextLineItems = [...quote.lineItems];
    const movedItem = { ...nextLineItems[index] };
    const targetItem = nextLineItems[targetIndex];
    if (targetItem && String(movedItem.section || "") !== String(targetItem.section || "")) {
      movedItem.section = targetItem.section || "Quote lines";
    }
    nextLineItems[index] = targetItem;
    nextLineItems[targetIndex] = movedItem;
    updateQuote({ lineItems: nextLineItems });
  };

  const saveQuote = async () => {
    if (!booking?.id) return;
    const suggestedQuoteNumber = publicQuoteNumber(String(quote.quoteNumber || "").trim() || getNextQuoteNumber(booking, quote));
    const quoteNumberInput = window.prompt("Save quote number:", displayQuoteNumber(suggestedQuoteNumber, booking));
    if (quoteNumberInput === null) return;
    const quoteNumberBaseContext = { ...quote, quoteNumber: suggestedQuoteNumber };
    const requestedPublicQuoteNumber = publicQuoteNumber(normalizeQuoteNumberInput(quoteNumberInput, booking, quoteNumberBaseContext));
    if (!requestedPublicQuoteNumber) {
      alert("Please enter a quote number.");
      return;
    }
    const existingVersions = normalizeQuoteVersions(booking);
    const nextQuoteNumber = nextRevisionQuoteNumber(requestedPublicQuoteNumber, existingVersions, booking, {
      ...quote,
      quoteNumber: requestedPublicQuoteNumber,
    });
    const quoteVersion =
      getVersionFromQuoteNumber(nextQuoteNumber) || getNextQuoteVersion(booking);
    const nextQuoteNumberKey = quoteNumberKey(nextQuoteNumber, booking, { ...quote, quoteNumber: nextQuoteNumber });
    setSaving(true);
    const nowIso = new Date().toISOString();
    const quotePayload = {
      ...quote,
      version: quoteVersion,
      quoteNumber: nextQuoteNumber,
      quoteName: quoteDisplayName(quote),
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
        (entry) => quoteNumberKey(entry.quoteNumber, booking, entry) !== nextQuoteNumberKey
      ),
      quotePayload,
    ].sort((a, b) => (Number(a.version) || 0) - (Number(b.version) || 0));
    const quoteNumbers = normalizeQuoteNumbers([...getBookingQuoteNumbers(booking), nextQuoteNumber]);
    const acceptedQuotePatch =
      quotePayload.status === "Accepted"
        ? {
            acceptedQuoteNumber: quotePayload.quoteNumber,
            acceptedQuoteName: quotePayload.quoteName,
          }
        : {};
    try {
      await updateDoc(
        doc(db, "bookings", booking.id),
        tenantPayload(dataAccessState, {
          quote: quotePayload,
          quoteVersions,
          quoteVersion,
          quoteNumber: quotePayload.quoteNumber,
          quoteNumbers,
          ...acceptedQuotePatch,
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
        ...acceptedQuotePatch,
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

  const cancelDraftQuote = () => {
    if (saving || deleting) return;
    const draftNumber = displayQuoteNumber(quote.quoteNumber || requestedQuoteNumber, booking);
    const confirmed = window.confirm(
      `Cancel this draft quote${draftNumber ? ` (${draftNumber})` : ""}?\n\nThis draft has not been saved to Firestore, so it will be removed from this screen.`
    );
    if (!confirmed) return;
    alert("Draft quote cancelled.");
    router.push("/completed-quotes");
  };

  const deleteCurrentQuote = async () => {
    if (!booking?.id || deleting) return;
    const quoteNumberToDelete = String(quote.quoteNumber || requestedQuoteNumber || "").trim();
    const savedQuoteToDelete = savedQuotes.find(
      (entry) => quoteNumberKey(entry.quoteNumber, booking || {}, entry) === quoteNumberKey(quoteNumberToDelete, booking || {}, quote)
    );

    if (!savedQuoteToDelete) {
      cancelDraftQuote();
      return;
    }

    const displayNumber = displayQuoteNumber(savedQuoteToDelete.quoteNumber || quoteNumberToDelete, booking);
    const confirmed = window.confirm(
      `Delete quote ${displayNumber || savedQuoteToDelete.quoteNumber || "this quote"}?\n\nThis quote will be permanently removed from Firestore, including the quote builder data linked to this booking. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    const deleteKey = quoteNumberKey(savedQuoteToDelete.quoteNumber, booking || {}, savedQuoteToDelete);
    const remainingQuoteVersions = savedQuotes.filter(
      (entry) => quoteNumberKey(entry.quoteNumber, booking || {}, entry) !== deleteKey
    );
    const nextQuote = latestQuoteVersion(remainingQuoteVersions);
    const remainingQuoteNumbers = getRemainingQuoteNumbers(remainingQuoteVersions);
    const deletedAcceptedQuote =
      publicQuoteNumber(savedQuoteToDelete.quoteNumber).toLowerCase() ===
      publicQuoteNumber(booking.acceptedQuoteNumber || "").toLowerCase();
    const nowIso = new Date().toISOString();

    // TODO: delete associated Storage files/PDFs/generated docs when quote assets get their own storage metadata.
    const patch = {
      quoteVersions: remainingQuoteVersions,
      quoteNumbers: remainingQuoteNumbers,
      quote: nextQuote || null,
      quoteNumber: nextQuote?.quoteNumber || remainingQuoteNumbers[0] || "",
      quoteVersion: nextQuote ? getVersionFromQuoteNumber(nextQuote.quoteNumber) || Number(nextQuote.version || 0) : 0,
      updatedAt: nowIso,
      lastEditedBy: authAccess.user?.email || "Unknown",
      lastEditedByUid: authAccess.user?.uid || "",
    };

    if (deletedAcceptedQuote) {
      patch.acceptedQuoteNumber = "";
      patch.acceptedQuoteName = "";
    }

    try {
      await updateDoc(doc(db, "bookings", booking.id), tenantPayload(dataAccessState, patch));
      alert(`Quote ${displayNumber || savedQuoteToDelete.quoteNumber} deleted successfully.`);
      router.push("/completed-quotes");
    } catch (err) {
      if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "delete quote" })) {
        console.error("Failed deleting quote:", err);
        alert("Failed to delete quote. Please try again.");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    const loadingContent = <div style={pageWrap}>Loading quote...</div>;
    return isEmbedded ? loadingContent : <HeaderSidebarLayout>{loadingContent}</HeaderSidebarLayout>;
  }

  if (!booking) {
    const notFoundContent = <div style={pageWrap}>Booking not found.</div>;
    return isEmbedded ? notFoundContent : <HeaderSidebarLayout>{notFoundContent}</HeaderSidebarLayout>;
  }

  const discountSections = new Set(
    quote.lineItems
      .filter((item) => isDiscountLine(item))
      .map((item) => String(item.section || ""))
  );
  const groupedRows = [];
  let lastSection = "";
  quote.lineItems.forEach((item, index) => {
    const section = item.section || "";
    if (section && section !== lastSection) {
      groupedRows.push({
        type: "section",
        section,
        hasDiscount: discountSections.has(section),
        key: `section-${index}-${section}`,
      });
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
  const visibleQuoteNumber = displayQuoteNumber(quote.quoteNumber || booking.quoteNumber, booking);
  const versionBadgeText = visibleQuoteNumber ? `Version ${visibleQuoteNumber}` : "Version";
  const currentQuoteName = quoteDisplayName(quote);
  const quoteEditHref = `/quote/${booking.id || bookingId}${
    quote.quoteNumber || requestedQuoteNumber ? `?quote=${encodeURIComponent(quote.quoteNumber || requestedQuoteNumber)}` : ""
  }`;
  const quoteSummaryHeader = (
    <>
      <div style={summaryHeader}>
        <div>
          <div style={summaryEyebrow}>Quote Summary</div>
          <h2 style={summaryTitle}>{booking.jobNumber || "No job number"}</h2>
        </div>
        <div style={summaryStatus}>{currentSavedQuote ? `${quote.status || "Draft"} saved` : quote.status || "Draft"}</div>
      </div>
    </>
  );

  const quotePageContent = (
      <div ref={pageRef} className="quote-print-page" style={isEmbedded ? embeddedPageWrap : pageWrap}>
        {isViewMode ? (
          <div className="quote-print-toolbar" style={isEmbedded ? embeddedViewToolbar : viewToolbar}>
            <div style={toolbarTop}>
              <button type="button" onClick={() => router.push(`/edit-booking/${booking.id}`)} style={backButton}>
                <ArrowLeft size={16} />
                Booking
              </button>
              <div style={toolbarTitleBlock}>
                <div style={toolbarEyebrow}>Quote View</div>
                <div style={toolbarTitle}>
                  {booking.jobNumber || "New quote"} - {currentQuoteName || booking.client || "No quote name"}
                </div>
              </div>
              <div style={toolbarActions}>
                <button type="button" onClick={() => window.print()} style={ghostButton}>
                  <Printer size={16} />
                  Print
                </button>
                <button
                  type="button"
                  onClick={deleteCurrentQuote}
                  disabled={deleting}
                  style={{ ...dangerGhostButton, cursor: deleting ? "wait" : "pointer", opacity: deleting ? 0.7 : 1 }}
                >
                  <Trash2 size={16} />
                  {deleting ? "Deleting..." : "Delete Quote"}
                </button>
                <button type="button" onClick={() => router.push(quoteEditHref)} style={primaryButton}>
                  <Pencil size={16} />
                  Edit quote
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="quote-print-toolbar" style={toolbar}>
          <div style={toolbarTop}>
            <button type="button" onClick={() => router.push(`/edit-booking/${booking.id}`)} style={backButton}>
              <ArrowLeft size={16} />
              Booking
            </button>
            <div style={toolbarTitleBlock}>
              <div style={toolbarEyebrow}>Quote Builder</div>
              <div style={toolbarTitle}>
                {booking.jobNumber || "New quote"} - {currentQuoteName || booking.client || "No quote name"}
              </div>
            </div>
            <div style={toolbarMeta}>{quoteDate()}</div>
          </div>

          <div style={toolbarBottom}>
            <div style={toolbarQuoteGroup}>
              <div style={toolbarVersionBadge}>{versionBadgeText}</div>
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
                      {quoteOptionLabels[quoteNumberOption] || `${quoteNumberOption}${isSaved ? " - saved" : " - new"}`}
                    </option>
                  );
                })}
              </select>
              <button type="button" onClick={createNewQuote} style={ghostButton}>
                <Plus size={16} />
                New quote
              </button>
              <button type="button" onClick={duplicateCurrentQuote} style={ghostButton}>
                <Plus size={16} />
                Duplicate
              </button>
            </div>
            <input
              value={quote.quoteName || ""}
              onChange={(event) => updateQuote({ quoteName: event.target.value })}
              style={quoteNameInput}
              placeholder="Quote name, e.g. Sprinter No.1 - Video Pursuit"
              title="Quote name"
            />
            <div style={toolbarTemplateGroup}>
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
            </div>
            <div style={toolbarStatusGroup}>
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
            </div>
            <div style={toolbarActions}>
              <button type="button" onClick={() => window.print()} style={ghostButton}>
                <Printer size={16} />
                Print
              </button>
              <button type="button" onClick={() => addLine()} disabled={deleting} style={ghostButton}>
                <Plus size={16} />
                Add line
              </button>
              {hasDiscountLine ? (
                <button type="button" onClick={() => removeDiscountLines()} disabled={deleting} style={dangerGhostButton}>
                  <Trash2 size={16} />
                  Remove all discounts
                </button>
              ) : null}
              <button
                type="button"
                onClick={currentSavedQuote ? deleteCurrentQuote : cancelDraftQuote}
                disabled={deleting || saving}
                style={{ ...dangerGhostButton, cursor: deleting || saving ? "not-allowed" : "pointer", opacity: deleting || saving ? 0.7 : 1 }}
              >
                <Trash2 size={16} />
                {deleting ? "Deleting..." : currentSavedQuote ? "Delete Quote" : "Cancel draft"}
              </button>
              <button type="button" onClick={saveQuote} disabled={saving || deleting} style={primaryButton}>
                <Save size={16} />
                {saving ? "Saving..." : "Save Quote"}
              </button>
            </div>
          </div>
        </div>
        )}

        {!isViewMode ? (
        <div className="quote-screen-editor" style={screenEditor}>
          <section style={screenQuoteTop}>
            <div style={screenHeaderGrid}>
              <InfoField label="Quote Date" value={quoteDate()} />
              <InfoField label="Job No" value={booking.jobNumber || "-"} />
              <InfoField label="Quote No" value={visibleQuoteNumber || "-"} />
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
              {screenSections.map((section) => {
                const sectionHasDiscount = section.rows.some((row) => isDiscountLine(row.item));
                const canDiscountSection = isEquipmentSection(section.section);
                return (
                <section key={section.section} style={screenSectionBlock}>
                  <div style={screenSectionHeader}>
                    <h3 style={screenSectionTitle}>{section.section}</h3>
                    <div style={screenSectionActions}>
                      <button type="button" onClick={() => addLine(section.section)} style={screenSectionButton}>
                        <Plus size={13} />
                        Line
                      </button>
                      {canDiscountSection ? (
                        <button type="button" onClick={() => addDiscountLine(section.section)} style={screenSectionButton}>
                          <Percent size={13} />
                          Discount
                        </button>
                      ) : null}
                      {canDiscountSection && sectionHasDiscount ? (
                        <button
                          type="button"
                          onClick={() => removeDiscountLines(section.section)}
                          style={screenSectionDangerButton}
                        >
                          <Trash2 size={13} />
                          Discount
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div style={screenLinesOneCol}>
                    {section.rows.map((row) => {
                      const item = row.item;
                      const isDiscount = isDiscountLine(item);
                      const canDiscountLine = isDiscount || isEquipmentSection(item.section);
                      const total =
                        item.totalMode === "tbc"
                          ? "TBC"
                          : item.totalMode === "production"
                          ? "Production"
                          : `£${money(getLineAutoTotal(item))}`;
                      const displayTotal =
                        isDiscount
                          ? `Less £${formatLineTotal(item, quote.lineItems)}`
                          : item.totalMode === "foc"
                          ? "FOC"
                          : item.totalMode === "auto" || !item.totalMode
                          ? `£${formatLineTotal(item, quote.lineItems)}`
                          : total;

                      return (
                        <div key={row.key} style={isDiscount ? screenDiscountLineCard : screenLineCard}>
                          <input
                            value={item.description || ""}
                            onChange={(event) => updateLineItem(row.index, { description: event.target.value })}
                            style={isDiscount ? screenDiscountLineDescription : screenLineDescription}
                          />
                          <input
                            value={item.qty || ""}
                            onChange={(event) => updateLineItem(row.index, { qty: event.target.value })}
                            style={isDiscount ? screenDiscountSmallInput : screenSmallInput}
                            placeholder="Qty"
                          />
                          {isDiscount ? (
                            <select
                              value={DISCOUNT_OPTIONS.includes(item.unitPrice) ? item.unitPrice : DEFAULT_DISCOUNT}
                              onChange={(event) => updateLineItem(row.index, { unitPrice: event.target.value })}
                              style={screenDiscountSmallInput}
                              title="Discount percentage"
                            >
                              {DISCOUNT_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={item.unitPrice || ""}
                              onChange={(event) => updateLineItem(row.index, { unitPrice: event.target.value })}
                              style={screenSmallInput}
                              placeholder="Unit"
                            />
                          )}
                          <select
                            value={item.totalMode || "auto"}
                            onChange={(event) => updateLineItem(row.index, { totalMode: event.target.value })}
                            style={isDiscount ? screenDiscountTotalSelect : screenTotalSelect}
                            title={displayTotal}
                          >
                            <option value="auto">{displayTotal || "-"}</option>
                            {canDiscountLine ? (
                              <option value="discount">{isDiscount ? displayTotal || "Discount" : "Discount"}</option>
                            ) : null}
                            <option value="tbc">TBC</option>
                            <option value="production">Production</option>
                            <option value="foc">FOC</option>
                          </select>
                          <div style={screenRowActions}>
                            <button
                              type="button"
                              onClick={() => moveLine(row.index, -1)}
                              style={screenMoveButton}
                              title="Move line up"
                              disabled={row.index === 0}
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLine(row.index, 1)}
                              style={screenMoveButton}
                              title="Move line down"
                              disabled={row.index === quote.lineItems.length - 1}
                            >
                              <ArrowDown size={13} />
                            </button>
                            <button type="button" onClick={() => removeLine(row.index)} style={screenIconButton} title="Remove line">
                            <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
              })}
            </div>
          ) : (
            <section style={screenPanel}>
              <div style={screenEmpty}>Select a quote template to load line items.</div>
            </section>
          )}
        </div>
        ) : null}

        <div
          className="quote-scale-shell"
          style={isViewMode ? (isEmbedded ? embeddedViewScaleShell : viewScaleShell) : scaleShell}
        >
        {!isViewMode ? (
        <aside className="quote-summary-panel quote-summary-panel-left" style={leftSummaryPanel}>
          {quoteSummaryHeader}

          <div style={summarySection}>
            <h3 style={summarySectionTitle}>Quote Version</h3>
            <div style={bookingSummaryRows}>
              <div style={bookingSummaryRow}>
                <span>Version</span>
                <strong>{visibleQuoteNumber || "-"}</strong>
              </div>
              <div style={bookingSummaryRow}>
                <span>Reference</span>
                <strong>
                  {booking.jobNumber && visibleQuoteNumber
                    ? `#${booking.jobNumber}-${visibleQuoteNumber}`
                    : booking.jobNumber || visibleQuoteNumber || "-"}
                </strong>
              </div>
              <div style={bookingSummaryRow}>
                <span>Status</span>
                <strong>{quote.status || "Draft"}</strong>
              </div>
              <div style={bookingSummaryBlock}>
                <span>Name</span>
                <strong>{currentQuoteName || "-"}</strong>
              </div>
              <div style={bookingSummaryRow}>
                <span>Saved</span>
                <strong>{currentSavedQuote ? "Yes" : "Not yet"}</strong>
              </div>
            </div>
          </div>
        </aside>
        ) : null}

        <div
          className="quote-print-paper"
          style={paper}
        >
          <div className="quote-print-frame" style={isEmbedded ? embeddedPrintFrame : printFrame}>
          <div style={quoteBanner}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Raw img is more reliable in browser print/PDF preview. */}
            <img
              src="/quote-carbon-header.png"
              alt="Bickers Action quotation"
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
                <td style={valueCell}>{visibleQuoteNumber}</td>
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
          {isViewMode ? (
            <div style={serviceInput}>{quote.templateName || ""}</div>
          ) : (
            <input
              value={quote.templateName || ""}
              onChange={(event) => updateQuote({ templateName: event.target.value })}
              style={serviceInput}
              placeholder="Description of services"
            />
          )}

          <table style={quoteTable}>
            <thead>
              <tr>
                <th style={descriptionHeader}>DESCRIPTION</th>
                <th style={qtyHeader}>QTY</th>
                <th style={unitPriceHeader}>UNIT PRICE</th>
                <th style={totalHeader}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.length ? (
                groupedRows.map((row) => {
                  if (row.type === "section") {
                    const canDiscountSection = isEquipmentSection(row.section);
                    return (
                      <SectionBreak
                        key={row.key}
                        canDiscount={canDiscountSection}
                        hasDiscount={canDiscountSection && row.hasDiscount}
                        onAddLine={() => addLine(row.section)}
                        onAddDiscount={() => addDiscountLine(row.section)}
                        onRemoveDiscount={() => removeDiscountLines(row.section)}
                        readOnly={isViewMode}
                      >
                        {row.section}
                      </SectionBreak>
                    );
                  }
                  const item = row.item;
                  const total = formatLineTotal(item, quote.lineItems);
                  const isDiscount = isDiscountLine(item);
                  const canDiscountLine = isDiscount || isEquipmentSection(item.section);
                  const cellStyle = isDiscount ? discountQuoteCell : quoteCell;
                  const inputStyle = isDiscount ? discountLineInput : lineInput;
                  const qtyStyle = isDiscount ? discountQtyInput : qtyInput;
                  const moneyStyle = isDiscount ? discountMoneyInput : moneyInput;
                  const selectStyle = isDiscount ? discountTotalSelect : totalSelect;
                  return (
                    <tr key={row.key} className="quote-spreadsheet-row">
                      <td style={cellStyle}>
                        <div style={quoteLineDescriptionWrap}>
                          {isViewMode ? (
                            <div className={isDiscount ? "quote-discount-input" : ""} style={inputStyle}>
                              {item.description || ""}
                            </div>
                          ) : (
                            <>
                              <input
                                className={`quote-spreadsheet-input${isDiscount ? " quote-discount-input" : ""}`}
                                value={item.description || ""}
                                onChange={(event) => updateLineItem(row.index, { description: event.target.value })}
                                style={inputStyle}
                              />
                              <button
                                type="button"
                                onClick={() => removeLine(row.index)}
                                className="quote-line-actions"
                                style={quoteLineDeleteButton}
                                title="Delete line"
                              >
                                <Trash2 size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        {isViewMode ? (
                          <div className={isDiscount ? "quote-discount-input" : ""} style={qtyStyle}>
                            {item.qty || ""}
                          </div>
                        ) : (
                          <input
                            className={`quote-spreadsheet-input${isDiscount ? " quote-discount-input" : ""}`}
                            value={item.qty || ""}
                            onChange={(event) => updateLineItem(row.index, { qty: event.target.value })}
                            style={qtyStyle}
                          />
                        )}
                      </td>
                      <td style={cellStyle}>
                        {isViewMode ? (
                          <div className={isDiscount ? "quote-discount-input" : ""} style={moneyStyle}>
                            {isDiscount ? (DISCOUNT_OPTIONS.includes(item.unitPrice) ? item.unitPrice : DEFAULT_DISCOUNT) : item.unitPrice || ""}
                          </div>
                        ) : isDiscount ? (
                          <select
                            className="quote-spreadsheet-input quote-spreadsheet-select quote-discount-input"
                            value={DISCOUNT_OPTIONS.includes(item.unitPrice) ? item.unitPrice : DEFAULT_DISCOUNT}
                            onChange={(event) => updateLineItem(row.index, { unitPrice: event.target.value })}
                            style={discountMoneyInput}
                            title="Discount percentage"
                          >
                            {DISCOUNT_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="quote-spreadsheet-input"
                            value={item.unitPrice || ""}
                            onChange={(event) => updateLineItem(row.index, { unitPrice: event.target.value })}
                            style={moneyStyle}
                          />
                        )}
                      </td>
                      <td style={cellStyle}>
                        {isViewMode ? (
                          <div className={isDiscount ? "quote-discount-input" : ""} style={selectStyle}>
                            {total || "-"}
                          </div>
                        ) : (
                          <select
                            className={`quote-spreadsheet-input quote-spreadsheet-select${isDiscount ? " quote-discount-input" : ""}`}
                            value={item.totalMode || "auto"}
                            onChange={(event) => updateLineItem(row.index, { totalMode: event.target.value })}
                            style={selectStyle}
                          >
                            <option value="auto">{total || "-"}</option>
                            {canDiscountLine ? (
                              <option value="discount">{isDiscount ? total || "Discount" : "Discount"}</option>
                            ) : null}
                            <option value="tbc">TBC</option>
                            <option value="production">Production</option>
                            <option value="foc">FOC</option>
                          </select>
                        )}
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

          <div style={quotePrintSpacer}></div>

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
            isViewMode ? (
              <div style={notesInput}>{quote.notes || ""}</div>
            ) : (
              <textarea
                value={quote.notes || ""}
                onChange={(event) => updateQuote({ notes: event.target.value })}
                style={notesInput}
                placeholder="Quote notes..."
              />
            )
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
        </div>

        {!isViewMode ? (
        <aside className="quote-summary-panel" style={summaryPanel}>
          {quoteSummaryHeader}

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
                  const sectionTotal = calculateSubtotal(section.rows.map((row) => row.item));
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
        ) : null}
        </div>
        <style jsx global>{`
          @media screen {
            html,
            body {
              background: #fff !important;
            }

            .quote-print-page {
              min-height: calc(100vh - 72px);
              overflow: auto !important;
              background: #fff !important;
            }

            footer {
              display: none !important;
            }

            .quote-scale-shell {
              display: flex !important;
              background: #fff !important;
            }

            .quote-scale-shell .quote-print-paper {
              zoom: 1.08;
              box-shadow: none !important;
            }

            .quote-screen-editor {
              display: none !important;
            }

            .quote-summary-panel {
              display: block !important;
            }

            @media (max-width: 1450px) {
              .quote-print-toolbar {
                max-width: calc(100vw - 32px) !important;
              }

              .quote-scale-shell {
                flex-wrap: wrap !important;
              }

              .quote-summary-panel-left {
                order: -1 !important;
                position: static !important;
                max-width: 1180px !important;
                width: 100% !important;
                flex-basis: 100% !important;
              }
            }

            @media (max-width: 1200px) {
              .quote-print-toolbar {
                max-width: calc(100vw - 32px) !important;
              }

              .quote-summary-panel {
                position: static !important;
                max-width: calc(100vw - 32px) !important;
                width: 100% !important;
                flex-basis: 100% !important;
              }
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
              height: 297mm !important;
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
            .quote-print-toolbar,
            .quote-section-actions,
            .quote-line-actions {
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
              width: 210mm !important;
              height: 297mm !important;
              min-height: 297mm !important;
              margin: 0 !important;
              display: block !important;
              box-shadow: none !important;
              border: none !important;
              color: #000 !important;
              box-sizing: border-box !important;
              transform: none !important;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .quote-print-frame {
              width: 182mm !important;
              height: 259mm !important;
              margin: 19mm auto 0 !important;
              border: 1px solid #000 !important;
              background: #fff !important;
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
              overflow: hidden !important;
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

            .quote-print-paper input,
            .quote-print-paper textarea,
            .quote-print-paper select {
              appearance: none !important;
              -webkit-appearance: none !important;
              background: transparent !important;
              border-radius: 0 !important;
              box-shadow: none !important;
            }

            .quote-print-paper table,
            .quote-print-paper tr,
            .quote-print-paper td,
            .quote-print-paper th {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            @page {
              size: A4 portrait;
              margin: 0;
            }
          }

          .quote-spreadsheet-row:hover .quote-spreadsheet-input {
            background: #f7fbff !important;
          }

          .quote-spreadsheet-row:hover .quote-discount-input,
          .quote-discount-input:hover,
          .quote-discount-input:focus {
            background: #ff0000 !important;
            color: #fff !important;
          }

          .quote-print-paper table tr > :first-child {
            border-left-width: 0 !important;
          }

          .quote-print-paper table tr > :last-child {
            border-right-width: 0 !important;
          }

          .quote-spreadsheet-input:focus {
            background: #fff !important;
            outline: 2px solid #217346 !important;
            outline-offset: -2px !important;
          }

          .quote-spreadsheet-select:focus {
            color: #000 !important;
          }

          .quote-spreadsheet-select.quote-discount-input:focus {
            color: #fff !important;
          }
        `}</style>
      </div>
  );

  return isEmbedded ? quotePageContent : <HeaderSidebarLayout>{quotePageContent}</HeaderSidebarLayout>;
}

const pageWrap = {
  minHeight: "100vh",
  background: UI.page,
  padding: "12px 18px 18px",
  color: UI.text,
  overflowX: "hidden",
};

const embeddedPageWrap = {
  ...pageWrap,
  minHeight: "auto",
  padding: "2px 0 0",
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

const screenSectionHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  background: "#c7c7c7",
  borderBottom: "1px solid #000",
  padding: "5px 8px",
};

const screenSectionTitle = {
  margin: 0,
  color: UI.text,
  fontSize: 12,
  fontWeight: 900,
  minWidth: 0,
};

const screenSectionActions = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 4,
  flexWrap: "wrap",
};

const screenSectionButton = {
  minHeight: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  border: "1px solid #94a3b8",
  borderRadius: 4,
  background: "#fff",
  color: UI.text,
  padding: "3px 6px",
  fontSize: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const screenSectionDangerButton = {
  ...screenSectionButton,
  border: "1px solid #fecaca",
  background: "#fff7f7",
  color: "#b91c1c",
};

const screenLinesOneCol = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 0,
};

const screenLineCard = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 54px 70px 86px 84px",
  gap: 4,
  alignItems: "center",
  background: "#fff",
  borderBottom: "1px solid #000",
  padding: 4,
  minWidth: 0,
};

const screenDiscountLineCard = {
  ...screenLineCard,
  background: "#ff0000",
  borderBottom: "1px solid #b40000",
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

const screenDiscountLineDescription = {
  ...screenLineDescription,
  background: "#ff0000",
  border: "1px solid #ff0000",
  color: "#fff",
  fontWeight: 900,
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

const screenDiscountSmallInput = {
  ...screenSmallInput,
  background: "#ff0000",
  border: "1px solid #ff0000",
  color: "#fff",
  fontWeight: 900,
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

const screenDiscountTotalSelect = {
  ...screenTotalSelect,
  background: "#ff0000",
  border: "1px solid #ff0000",
  color: "#fff",
  fontWeight: 900,
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
  justifyContent: "center",
  alignItems: "flex-start",
  gap: 18,
  maxWidth: 1680,
  margin: "0 auto",
  width: "100%",
  overflow: "visible",
};

const viewScaleShell = {
  ...scaleShell,
  maxWidth: 980,
  gap: 0,
};

const embeddedViewScaleShell = {
  ...viewScaleShell,
  maxWidth: 812,
};

const summaryPanel = {
  position: "sticky",
  top: 12,
  flex: "0 0 330px",
  maxWidth: 330,
  minWidth: 300,
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  boxShadow: "0 10px 30px rgba(15,23,42,0.12)",
  padding: 14,
  color: UI.text,
};

const leftSummaryPanel = {
  ...summaryPanel,
  flex: "0 0 300px",
  maxWidth: 300,
  minWidth: 280,
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
  maxWidth: 1680,
  margin: "0 auto 14px",
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
  padding: 10,
};

const viewToolbar = {
  ...toolbar,
  maxWidth: 980,
  margin: "0 auto 12px",
};

const embeddedViewToolbar = {
  ...viewToolbar,
  maxWidth: "100%",
  margin: "0 auto 2px",
  padding: 6,
  boxShadow: "none",
};

const toolbarTop = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
};

const toolbarBottom = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const toolbarQuoteGroup = {
  display: "flex",
  flex: "1 1 360px",
  minWidth: 340,
  gap: 8,
  alignItems: "center",
};

const toolbarVersionBadge = {
  minHeight: 36,
  minWidth: 92,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: UI.brandSoft,
  color: UI.brand,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const quoteNameInput = {
  minHeight: 36,
  flex: "1 1 280px",
  minWidth: 240,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "7px 10px",
  background: "#fff",
  color: UI.text,
  fontWeight: 800,
  boxSizing: "border-box",
};

const toolbarTemplateGroup = {
  display: "grid",
  gridTemplateColumns: "minmax(190px, 0.7fr) minmax(260px, 1fr) auto",
  flex: "999 1 560px",
  minWidth: 420,
  gap: 8,
  alignItems: "center",
};

const toolbarStatusGroup = {
  display: "flex",
  flex: "0 0 auto",
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
  flex: "0 0 auto",
  flexWrap: "wrap",
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
  minWidth: "max-content",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: UI.text,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
};

const screenRowActions = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 2,
};

const screenMoveButton = {
  ...screenIconButton,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: UI.text,
};

const dangerGhostButton = {
  ...ghostButton,
  border: "1px solid #fecaca",
  background: "#fff7f7",
  color: "#b91c1c",
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
  border: "none",
  boxShadow: "none",
  overflow: "hidden",
  boxSizing: "border-box",
  transformOrigin: "top center",
};

const printFrame = {
  width: "182mm",
  height: "259mm",
  margin: "19mm auto 0",
  background: "#fff",
  border: "1px solid #000",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const embeddedPrintFrame = {
  ...printFrame,
  margin: "2mm auto 0",
};

const quoteBanner = {
  width: "100%",
  height: "28mm",
  flex: "0 0 auto",
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
  borderLeft: "1px solid #000",
  borderRight: "1px solid #000",
  padding: "1px 8px",
  fontSize: 11.2,
  lineHeight: 1.08,
  fontWeight: 900,
  textAlign: "center",
  background: QUOTE_SECTION_GREY,
  color: "#000",
};

const valueCell = {
  borderLeft: "1px solid #000",
  borderRight: "1px solid #000",
  padding: "1px 8px",
  minHeight: 16,
  fontSize: 10.5,
  lineHeight: 1.08,
  textAlign: "center",
  background: "#fff",
  color: "#000",
};

const descriptionLabel = {
  borderTop: "1px solid #000",
  borderBottom: "1px solid #000",
  padding: "1px 8px",
  fontSize: 11.2,
  lineHeight: 1,
  textAlign: "center",
  fontWeight: 900,
  background: QUOTE_SECTION_GREY,
  color: "#000",
};

const serviceInput = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid #000",
  padding: "1px 8px",
  fontSize: 11.4,
  lineHeight: 1.05,
  fontWeight: 900,
  textAlign: "center",
  color: "#000",
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
  border: "1px solid #000",
  background: "#000",
  color: "#fff",
  padding: "2px 6px",
  textAlign: "left",
  width: "74.1%",
  fontSize: 10.5,
  lineHeight: 1,
  fontWeight: 900,
  height: 19,
  boxSizing: "border-box",
};

const qtyHeader = {
  ...descriptionHeader,
  width: "4.25%",
  textAlign: "center",
};

const unitPriceHeader = {
  ...descriptionHeader,
  width: "10.25%",
  textAlign: "center",
};

const totalHeader = {
  ...descriptionHeader,
  width: "11.4%",
  textAlign: "center",
};

const sectionCell = {
  borderLeft: "1px solid #000",
  borderRight: "1px solid #000",
  borderTop: "1px solid #000",
  borderBottom: "1px solid #000",
  padding: "1px 8px",
  fontWeight: 900,
  textAlign: "center",
  background: QUOTE_SECTION_GREY,
  fontSize: 10.2,
  lineHeight: 1,
  height: 14,
  color: "#000",
  boxSizing: "border-box",
};

const sectionCellInner = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 6,
  minHeight: 18,
};

const sectionCellTitle = {
  gridColumn: 2,
  textAlign: "center",
};

const quoteSectionActions = {
  gridColumn: 3,
  display: "inline-flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 3,
};

const quoteSectionButton = {
  minHeight: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  border: "1px solid #64748b",
  borderRadius: 3,
  background: "#fff",
  color: "#111827",
  padding: "1px 5px",
  fontSize: 9,
  lineHeight: 1,
  fontWeight: 900,
  cursor: "pointer",
};

const quoteSectionDangerButton = {
  ...quoteSectionButton,
  border: "1px solid #fecaca",
  background: "#fff7f7",
  color: "#b91c1c",
};

const quoteCell = {
  border: "1px solid #000",
  padding: 0,
  verticalAlign: "middle",
  height: 14,
  background: "#fff",
  boxSizing: "border-box",
};

const lineInput = {
  width: "100%",
  border: "none",
  outline: "none",
  fontSize: 10,
  lineHeight: "13px",
  color: "#000",
  background: "transparent",
  padding: "0 5px",
  margin: 0,
  display: "block",
  height: 14,
  boxSizing: "border-box",
};

const quoteLineDescriptionWrap = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 18px",
  alignItems: "center",
  minWidth: 0,
  height: "100%",
};

const quoteLineDeleteButton = {
  width: 16,
  height: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #fecaca",
  borderRadius: 2,
  background: "#fff7f7",
  color: "#b91c1c",
  padding: 0,
  cursor: "pointer",
};

const qtyInput = {
  ...lineInput,
  textAlign: "center",
  color: "#000",
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
  fontSize: 10,
  lineHeight: "13px",
  textAlign: "right",
  height: 14,
  padding: "0 5px 0 2px",
  margin: 0,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  color: "#000",
  boxSizing: "border-box",
};

const discountQuoteCell = {
  ...quoteCell,
  background: "#ff0000",
  borderColor: "#ff0000",
};

const discountLineInput = {
  ...lineInput,
  color: "#fff",
  background: "#ff0000",
  fontWeight: 900,
};

const discountQtyInput = {
  ...discountLineInput,
  textAlign: "center",
};

const discountMoneyInput = {
  ...discountLineInput,
  textAlign: "right",
  paddingRight: 7,
};

const discountTotalSelect = {
  ...totalSelect,
  color: "#fff",
  background: "#ff0000",
  fontWeight: 900,
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

const quotePrintSpacer = {
  flex: "1 1 auto",
  minHeight: 0,
  background: "#fff",
};

const footerBlackFill = {
  flex: 1,
  minHeight: 27,
  background: "#000",
  display: "flex",
  alignItems: "center",
  paddingLeft: 8,
};

const totalRows = {
  minWidth: 210,
  background: "#000",
  color: "#fff",
};

const totalRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  borderLeft: "2px solid #fff",
  padding: "3px 8px 1px",
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 900,
};

const vatText = {
  borderLeft: "2px solid #fff",
  padding: "1px 8px 3px",
  textAlign: "left",
  fontWeight: 900,
  fontSize: 10.8,
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
  margin: "6px 14px 5px",
  border: "1px solid #c7c7c7",
  color: "#ff0000",
  background: "#fff",
  textAlign: "center",
  fontWeight: 900,
  fontSize: 9.8,
  padding: "2px 8px",
};

const contactFooter = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1.3fr 1.35fr",
  gap: 14,
  alignItems: "center",
  padding: "0 30px 9px",
};

const contactText = {
  fontSize: 10.5,
  lineHeight: 1.15,
};

const contactPair = {
  display: "grid",
  gridTemplateColumns: "78px 1fr",
  alignItems: "center",
  border: "1px solid #d0021b",
  minHeight: 22,
};

const contactLabel = {
  height: "100%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#c90016",
  color: "#fff",
  fontWeight: 900,
  fontSize: 10.5,
};

const contactValue = {
  textAlign: "center",
  fontWeight: 900,
  fontSize: 10.2,
  padding: "0 10px",
};
