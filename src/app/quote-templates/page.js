"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, Copy, Lock, Percent, Plus, Save, Search, Trash2, Unlock } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { db } from "@/app/utils/firebaseClient";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { FULL_SIZE_TRACKING_QUOTE_TEMPLATES } from "@/app/utils/quoteTemplates";

const UI = {
  bg: "var(--legacy-color-f3f6f9)",
  panel: "var(--legacy-color-ffffff)",
  border: "var(--legacy-color-d8e2ee)",
  text: "var(--legacy-color-061426)",
  muted: "var(--legacy-color-586b82)",
  brand: "var(--legacy-color-1f4b7a)",
  red: "var(--legacy-color-b91c1c)",
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const DEFAULT_QUOTE_SETTINGS = {
  defaultBickersContact: "",
  defaultSourceFile: "",
  footerApprovalText: "ALL TRACKING ACTIVITY ON A PUBLIC HIGHWAY MUST HAVE THE APPROVAL OF THE POLICE & LOCAL AUTHORITY",
  footerInfoText: "For more information,\nplease contact us",
  vatText: "Excludes VAT",
  paymentDefaults: "",
};
const slugify = (value) =>
  String(value || "quote-template")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `quote-template-${Date.now()}`;

const QUOTE_SECTION_GREY = "var(--legacy-color-bfbfbf)";
const DISCOUNT_OPTIONS = ["5%", "10%", "15%", "20%", "50%"];
const DEFAULT_DISCOUNT = "10%";

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

const formatLineTotal = (item = {}, lineItems = []) => {
  if (isDiscountLine(item)) return money(getDiscountAmount(item, lineItems));
  if (item.totalMode === "tbc") return "TBC";
  if (item.totalMode === "production") return "Production";
  if (item.totalMode === "foc") return "FOC";
  return money(getLineAutoTotal(item));
};

const getGroupedPreviewRows = (lineItems = []) => {
  const rows = [];
  let currentSection = null;
  lineItems.forEach((item, index) => {
    const section = item.section || "Quote lines";
    if (section !== currentSection) {
      rows.push({ type: "section", section, key: `section-${section}-${index}` });
      currentSection = section;
    }
    rows.push({ type: "line", item, index, key: item.id || `line-${index}` });
  });
  return rows;
};

const normalizeSharedRateText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const SHARED_RATE_RULES = [
  { id: "five_k_generator", label: "5K Generator", match: /5k generator/ },
  { id: "driver_day", label: "Driver/Technician per 10hr day", match: /services? of driver.*technician.*10hr/ },
  { id: "basic_riggers", label: "Basic Riggers Scaffolding Kit", match: /basic riggers scaffolding kit/ },
  { id: "pre_rigging", label: "Pre-Rigging & Additional Equipment", match: /pre rigging.*(additional equipment|prep|prep work)|pre rigging and prep work charged/ },
  { id: "overtime_1_5", label: "Overtime charged @ 1.5T", match: /overtime charged.*1 5t/ },
  { id: "sunday_bank_holiday", label: "Sunday and Bank Holiday double time", match: /sunday.*bank holiday.*double time|double time.*sundays.*bank holidays/ },
  { id: "turnaround", label: "Turnaround Day After Night Work", match: /turnaround day after night work/ },
  { id: "late_working", label: "Late working 22:00-23:59", match: /supplementary charge for late working/ },
  { id: "saturday", label: "Saturday working supplement", match: /supplementary charge applies for saturday working/ },
  { id: "commercials_weekend_night", label: "Commercials weekend/night APA", match: /commercials.*(sundays|night work).*(saturday|saturdays).*1 5t/ },
  { id: "recce_charge", label: "Recce charge per man", match: /recce charge per man/ },
  { id: "tracking_travel_days", label: "Tracking vehicle and crew travel days", match: /tracking vehicle and crew travel days/ },
  { id: "tracking_travel_time", label: "Tracking vehicle and crew travel time", match: /tracking vehicle and crew travel time/ },
  { id: "overnight_meal", label: "Overnight Meal Allowance", match: /overnight.*meal allowance|overnights meal allowance/ },
  { id: "breakfast_lunch", label: "Breakfast/Lunch not supplied", match: /breakfast lunch not supplied on location per man/ },
  { id: "recce_travel_time", label: "Recce travel time/day", match: /recce travel time travel day/ },
  { id: "recce_mileage", label: "Recce mileage", match: /recce mileage/ },
  { id: "london_home_counties", label: "London/Home Counties fixed travel", match: /london and home counties fixed travel charge/ },
  { id: "congestion_ulez", label: "London Congestion/ULEZ", match: /london congestion ulez charge/ },
  { id: "clean_air", label: "Clean air zone charge", match: /clean air zone charge/ },
];

const findSharedRateRuleForItem = (item = {}) => {
  const sharedRateId = String(item.sharedRateId || "").trim();
  if (sharedRateId) {
    const byId = SHARED_RATE_RULES.find((rule) => rule.id === sharedRateId);
    if (byId) return byId;
  }
  const description = normalizeSharedRateText(item.description);
  return SHARED_RATE_RULES.find((rule) => rule.match.test(description)) || null;
};

const itemMatchesSharedRateRule = (item = {}, rule) => {
  if (!rule) return false;
  if (String(item.sharedRateId || "").trim() === rule.id) return true;
  return rule.match.test(normalizeSharedRateText(item.description));
};

const isCustomSharedRateLine = (item = {}) => Boolean(item.isCustomPrice || item.lockedSharedRate);

const isSharedRateLinkedLine = (item = {}) =>
  !isCustomSharedRateLine(item) && item.usesSharedRate !== false && Boolean(findSharedRateRuleForItem(item));

const countValues = (values) =>
  values.reduce((map, value) => {
    const key = String(value ?? "");
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());

const mostCommonValue = (values, fallback = "") => {
  const counts = Array.from(countValues(values).entries()).sort((a, b) => b[1] - a[1]);
  return counts[0]?.[0] ?? fallback;
};

const formatValueCounts = (values) =>
  Array.from(countValues(values).entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([value, count]) => `${value || "blank"} (${count})`)
    .join(", ");

const summarizeSharedRates = (templates = []) =>
  SHARED_RATE_RULES.map((rule) => {
    const matches = [];
    templates.forEach((template) => {
      (template.lineItems || []).forEach((item, itemIndex) => {
        if (itemMatchesSharedRateRule(item, rule)) {
          const templateExcluded = Boolean(template.excludeFromSharedRates);
          const lineLocked = isCustomSharedRateLine(item);
          matches.push({
            templateId: template.id,
            templateName: template.serviceDescription || template.file || template.id,
            templateExcluded,
            lineLocked,
            willUpdate: !templateExcluded && !lineLocked,
            itemIndex,
            description: item.description || "",
            sharedRateId: item.sharedRateId || rule.id,
            unitPrice: String(item.unitPrice ?? ""),
            totalMode: String(item.totalMode || "auto"),
          });
        }
      });
    });
    const updateMatches = matches.filter((match) => match.willUpdate);
    const excludedMatches = matches.filter((match) => match.templateExcluded);
    const lockedMatches = matches.filter((match) => !match.templateExcluded && match.lineLocked);
    const unitPrices = matches.map((match) => match.unitPrice);
    const totalModes = matches.map((match) => match.totalMode);
    return {
      ...rule,
      matches,
      updateMatches,
      excludedMatches,
      lockedMatches,
      occurrenceCount: matches.length,
      templateCount: new Set(matches.map((match) => match.templateId)).size,
      updateLineCount: updateMatches.length,
      updateTemplateCount: new Set(updateMatches.map((match) => match.templateId)).size,
      excludedTemplateCount: new Set(excludedMatches.map((match) => match.templateId)).size,
      lockedLineCount: lockedMatches.length,
      unitPrices: Array.from(new Set(unitPrices)),
      totalModes: Array.from(new Set(totalModes)),
      suggestedUnitPrice: mostCommonValue(unitPrices),
      suggestedTotalMode: mostCommonValue(totalModes, "tbc"),
      unitPriceSummary: formatValueCounts(unitPrices),
      totalModeSummary: formatValueCounts(totalModes),
    };
  }).filter((summary) => summary.occurrenceCount);

const pageWrap = { minHeight: "100vh", background: UI.bg, color: UI.text, padding: "12px 14px 24px" };
const surface = {
  background: UI.panel,
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.05)",
};
const button = {
  minHeight: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "var(--legacy-color-fff)",
  color: UI.text,
  fontSize: 13,
  fontWeight: 900,
  padding: "0 12px",
  textDecoration: "none",
  cursor: "pointer",
};
const primaryButton = { ...button, background: UI.brand, borderColor: UI.brand, color: "var(--legacy-color-fff)" };
const dangerButton = { ...button, borderColor: "var(--legacy-color-fecdd3)", background: "var(--legacy-color-fff1f2)", color: UI.red };
const smallButton = { ...button, minHeight: 30, padding: "0 9px", fontSize: 12 };
const tabButton = (active) => ({
  ...button,
  borderColor: active ? UI.brand : UI.border,
  background: active ? UI.brand : "var(--legacy-color-fff)",
  color: active ? "var(--legacy-color-fff)" : UI.text,
});
const notice = {
  border: "1px solid var(--legacy-color-bfdbfe)",
  background: "var(--legacy-color-eff6ff)",
  color: "var(--legacy-color-1e3a8a)",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 12,
  fontWeight: 900,
};
const input = {
  width: "100%",
  minHeight: 36,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "var(--legacy-color-fff)",
  color: UI.text,
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 10px",
  boxSizing: "border-box",
  outline: "none",
};
const compactInput = { ...input, minHeight: 30, padding: "5px 8px", fontSize: 12 };
const label = { display: "block", color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase", marginBottom: 4 };
const previewShell = {
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  background: "var(--legacy-color-e5ebf2)",
  padding: 10,
  overflowX: "auto",
};
const previewPaper = {
  width: 760,
  minHeight: 980,
  margin: "0 auto",
  background: "var(--legacy-color-fff)",
  boxShadow: "0 16px 35px rgba(15, 23, 42, 0.16)",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "var(--legacy-color-000)",
};
const previewFrame = {
  minHeight: 980,
  display: "flex",
  flexDirection: "column",
};
const quoteBanner = {
  width: "100%",
  height: 106,
  flex: "0 0 auto",
  borderBottom: "3px solid var(--legacy-color-000)",
  background: "var(--legacy-color-111)",
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
};
const labelCell = {
  borderLeft: "1px solid var(--legacy-color-000)",
  borderRight: "1px solid var(--legacy-color-000)",
  padding: "1px 8px",
  fontSize: 11.2,
  lineHeight: 1.08,
  fontWeight: 900,
  textAlign: "center",
  background: QUOTE_SECTION_GREY,
  color: "var(--legacy-color-000)",
};
const valueCell = {
  borderLeft: "1px solid var(--legacy-color-000)",
  borderRight: "1px solid var(--legacy-color-000)",
  padding: "1px 8px",
  minHeight: 16,
  fontSize: 10.5,
  lineHeight: 1.08,
  textAlign: "center",
  background: "var(--legacy-color-fff)",
  color: "var(--legacy-color-000)",
};
const descriptionLabel = {
  borderTop: "1px solid var(--legacy-color-000)",
  borderBottom: "1px solid var(--legacy-color-000)",
  padding: "1px 8px",
  fontSize: 11.2,
  lineHeight: 1,
  textAlign: "center",
  fontWeight: 900,
  background: QUOTE_SECTION_GREY,
  color: "var(--legacy-color-000)",
};
const servicePreview = {
  width: "100%",
  borderBottom: "1px solid var(--legacy-color-000)",
  padding: "1px 8px",
  fontSize: 11.4,
  lineHeight: 1.05,
  fontWeight: 900,
  textAlign: "center",
  color: "var(--legacy-color-000)",
  boxSizing: "border-box",
};
const quoteTable = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  background: "var(--legacy-color-fff)",
  fontFamily: "Arial, Helvetica, sans-serif",
};
const descriptionHeader = {
  border: "1px solid var(--legacy-color-000)",
  background: "var(--legacy-color-000)",
  color: "var(--legacy-color-fff)",
  padding: "2px 6px",
  textAlign: "left",
  width: "74.1%",
  fontSize: 10.5,
  lineHeight: 1,
  fontWeight: 900,
  height: 19,
  boxSizing: "border-box",
};
const qtyHeader = { ...descriptionHeader, width: "4.25%", textAlign: "center" };
const unitPriceHeader = { ...descriptionHeader, width: "10.25%", textAlign: "center" };
const totalHeader = { ...descriptionHeader, width: "11.4%", textAlign: "center" };
const sectionCell = {
  border: "1px solid var(--legacy-color-000)",
  padding: "1px 8px",
  fontWeight: 900,
  textAlign: "center",
  background: QUOTE_SECTION_GREY,
  fontSize: 10.2,
  lineHeight: 1,
  height: 14,
  color: "var(--legacy-color-000)",
  boxSizing: "border-box",
};
const sectionCellInner = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 6,
  minHeight: 18,
};
const sectionTitleInput = {
  gridColumn: 2,
  minWidth: 260,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--legacy-color-000)",
  textAlign: "center",
  fontSize: 10.2,
  lineHeight: 1,
  fontWeight: 900,
  padding: 0,
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
  border: "1px solid var(--legacy-color-64748b)",
  borderRadius: 3,
  background: "var(--legacy-color-fff)",
  color: "var(--legacy-color-111827)",
  padding: "1px 5px",
  fontSize: 9,
  lineHeight: 1,
  fontWeight: 900,
  cursor: "pointer",
};
const quoteSectionDangerButton = {
  ...quoteSectionButton,
  border: "1px solid var(--legacy-color-fecaca)",
  background: "var(--legacy-color-fff7f7)",
  color: "var(--legacy-color-b91c1c)",
};
const quoteCell = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--legacy-color-000)",
  padding: 0,
  verticalAlign: "middle",
  height: 14,
  background: "var(--legacy-color-fff)",
  boxSizing: "border-box",
};
const quoteLineDescriptionWrap = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto 18px 18px",
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
  border: "1px solid var(--legacy-color-fecaca)",
  borderRadius: 2,
  background: "var(--legacy-color-fff7f7)",
  color: "var(--legacy-color-b91c1c)",
  padding: 0,
  cursor: "pointer",
};
const quoteLineLockButton = {
  ...quoteLineDeleteButton,
  border: "1px solid var(--legacy-color-bfdbfe)",
  background: "var(--legacy-color-eff6ff)",
  color: "var(--legacy-color-1d4ed8)",
};
const statusPill = (kind = "shared") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 14,
  padding: "0 5px",
  borderRadius: 999,
  border: kind === "custom" ? "1px solid var(--legacy-color-fbbf24)" : kind === "excluded" ? "1px solid var(--legacy-color-fecaca)" : "1px solid var(--legacy-color-bfdbfe)",
  background: kind === "custom" ? "var(--legacy-color-fffbeb)" : kind === "excluded" ? "var(--legacy-color-fff1f2)" : "var(--legacy-color-eff6ff)",
  color: kind === "custom" ? "var(--legacy-color-92400e)" : kind === "excluded" ? "var(--legacy-color-b91c1c)" : "var(--legacy-color-1d4ed8)",
  fontSize: 8.5,
  lineHeight: 1,
  fontWeight: 900,
  whiteSpace: "nowrap",
});
const lineText = {
  width: "100%",
  border: "none",
  outline: "none",
  fontSize: 10,
  lineHeight: "13px",
  color: "var(--legacy-color-000)",
  background: "transparent",
  padding: "0 5px",
  margin: 0,
  display: "block",
  height: 14,
  boxSizing: "border-box",
};
const qtyText = { ...lineText, textAlign: "center" };
const moneyText = { ...lineText, textAlign: "right", paddingRight: 7 };
const totalText = { ...lineText, textAlign: "right", padding: "0 5px 0 2px" };
const discountQuoteCell = {
  ...quoteCell,
  background: "var(--legacy-color-ff0000)",
  borderColor: "var(--legacy-color-ff0000)",
};
const discountLineText = {
  ...lineText,
  color: "var(--legacy-color-fff)",
  background: "var(--legacy-color-ff0000)",
  fontWeight: 900,
};
const discountQtyText = { ...discountLineText, textAlign: "center" };
const discountMoneyText = { ...discountLineText, textAlign: "right", paddingRight: 7 };
const discountTotalText = { ...totalText, color: "var(--legacy-color-fff)", background: "var(--legacy-color-ff0000)", fontWeight: 900 };
const emptyPreviewCell = {
  border: "1px solid var(--legacy-color-000)",
  padding: 14,
  color: UI.muted,
  textAlign: "center",
  fontSize: 11,
  fontWeight: 800,
};
const quotePrintSpacer = {
  flex: "1 1 auto",
  minHeight: 0,
  background: "var(--legacy-color-fff)",
};
const quoteFooter = {
  display: "flex",
  gap: 0,
  alignItems: "stretch",
  justifyContent: "space-between",
};
const footerBlackFill = { flex: 1, background: "var(--legacy-color-000)", minHeight: 34 };
const totalRows = {
  width: 230,
  borderLeft: "1px solid var(--legacy-color-000)",
  borderTop: "1px solid var(--legacy-color-000)",
};
const totalRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 900,
  borderBottom: "1px solid var(--legacy-color-000)",
};
const vatText = {
  padding: "3px 8px",
  fontSize: 10.5,
  fontWeight: 900,
  textAlign: "right",
};

const cloneLineItem = (section = "Equipment - Daily Rates (Optional Equipment Charged if Used or Booked)") => ({
  section,
  description: "",
  qty: "",
  unitPrice: "",
  totalMode: "auto",
});

function QuoteTemplatePreview({
  template,
  onTemplateChange,
  onLineChange,
  onAddLine,
  onRemoveLine,
  onToggleLineLock,
  onRenameSection,
  onAddDiscount,
  onRemoveDiscount,
}) {
  const lineItems = useMemo(() => (Array.isArray(template?.lineItems) ? template.lineItems : []), [template?.lineItems]);
  const groupedRows = useMemo(() => getGroupedPreviewRows(lineItems), [lineItems]);
  const subtotal = useMemo(() => calculateSubtotal(lineItems), [lineItems]);
  const templateExcluded = Boolean(template?.excludeFromSharedRates);

  return (
    <section style={previewShell}>
      <div style={previewPaper}>
        <div style={previewFrame}>
          <div style={quoteBanner}>
            {/* eslint-disable-next-line @next/next/no-img-element -- This mirrors the quote page print header. */}
            <img src="/quote-carbon-header.png" alt="Bickers Action quotation" style={quoteBannerImage} />
          </div>

          <table style={headerTable}>
            <tbody>
              <tr>
                <td style={labelCell}>Quote Date</td>
                <td style={labelCell}>Job No</td>
                <td style={labelCell}>Quote No</td>
              </tr>
              <tr>
                <td style={valueCell}></td>
                <td style={valueCell}></td>
                <td style={valueCell}></td>
              </tr>
              <tr>
                <td style={labelCell}>Production Company</td>
                <td style={labelCell}>Production</td>
                <td style={labelCell}>Production Contact</td>
              </tr>
              <tr>
                <td style={valueCell}></td>
                <td style={valueCell}></td>
                <td style={valueCell}></td>
              </tr>
              <tr>
                <td style={labelCell}>Location</td>
                <td style={labelCell}>Shoot Dates</td>
                <td style={labelCell}>Bickers Contact</td>
              </tr>
              <tr>
                <td style={valueCell}></td>
                <td style={valueCell}></td>
                <td style={valueCell}></td>
              </tr>
            </tbody>
          </table>

          <div style={descriptionLabel}>Description of Services</div>
          <input
            value={template?.serviceDescription || ""}
            onChange={(event) => onTemplateChange?.({ serviceDescription: event.target.value })}
            style={{ ...servicePreview, border: "none", borderBottom: "1px solid var(--legacy-color-000)", outline: "none" }}
            placeholder="Description of services"
          />

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
                    const hasDiscount = lineItems.some(
                      (item) => String(item.section || "Quote lines") === row.section && isDiscountLine(item)
                    );
                    const canDiscount = isEquipmentSection(row.section);
                    return (
                      <tr key={row.key}>
                        <td colSpan={4} style={sectionCell}>
                          <div style={sectionCellInner}>
                            <input
                              value={row.section}
                              onChange={(event) => onRenameSection?.(row.section, event.target.value)}
                              style={sectionTitleInput}
                              title="Edit section name"
                            />
                            <div style={quoteSectionActions}>
                              {canDiscount && !hasDiscount ? (
                                <button type="button" onClick={() => onAddDiscount?.(row.section)} style={quoteSectionButton}>
                                  <Percent size={10} />
                                  Discount
                                </button>
                              ) : null}
                              {canDiscount && hasDiscount ? (
                                <button type="button" onClick={() => onRemoveDiscount?.(row.section)} style={quoteSectionDangerButton}>
                                  <Trash2 size={10} />
                                  Discount
                                </button>
                              ) : null}
                              <button type="button" onClick={() => onAddLine?.(row.section)} style={quoteSectionButton}>
                                <Plus size={10} />
                                Line
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const item = row.item || {};
                  const isDiscount = isDiscountLine(item);
                  const customPrice = isCustomSharedRateLine(item);
                  const sharedLinked = isSharedRateLinkedLine(item);
                  const cellStyle = isDiscount ? discountQuoteCell : quoteCell;
                  const descriptionStyle = isDiscount ? discountLineText : lineText;
                  const qtyStyle = isDiscount ? discountQtyText : qtyText;
                  const unitStyle = isDiscount ? discountMoneyText : moneyText;
                  const totalStyle = isDiscount ? discountTotalText : totalText;
                  const unitValue = isDiscount
                    ? DISCOUNT_OPTIONS.includes(item.unitPrice)
                      ? item.unitPrice
                      : DEFAULT_DISCOUNT
                    : item.unitPrice || "";
                  const sharedRateLabel = templateExcluded
                    ? "Template Excluded"
                    : customPrice
                      ? "Custom Price"
                      : sharedLinked
                        ? "Shared Rate"
                        : "Shared Rate";
                  const sharedRateKind = templateExcluded ? "excluded" : customPrice ? "custom" : "shared";

                  return (
                    <tr key={row.key}>
                      <td style={cellStyle}>
                        <div style={quoteLineDescriptionWrap}>
                          <input
                            value={item.description || ""}
                            onChange={(event) => onLineChange?.(row.index, { description: event.target.value })}
                            style={descriptionStyle}
                            placeholder={customPrice ? "Custom Price" : "Line description"}
                            title={`${sharedRateLabel}: ${
                              templateExcluded
                                ? "skipped because this template is excluded"
                                : customPrice
                                  ? "skipped by Shared Rates"
                                  : "can update when matching Shared Rates are applied"
                            }`}
                          />
                          <span style={statusPill(sharedRateKind)}>{sharedRateLabel}</span>
                          <button
                            type="button"
                            onClick={() => onToggleLineLock?.(row.index)}
                            style={customPrice ? quoteLineLockButton : quoteLineDeleteButton}
                            title={customPrice ? "Custom Price - click to link to Shared Rates" : "Shared Rate - click to mark as Custom Price"}
                          >
                            {customPrice ? <Lock size={11} /> : <Unlock size={11} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveLine?.(row.index)}
                            style={quoteLineDeleteButton}
                            title="Delete line"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <input
                          value={item.qty || ""}
                          onChange={(event) => onLineChange?.(row.index, { qty: event.target.value })}
                          style={qtyStyle}
                          placeholder="Qty"
                        />
                      </td>
                      <td style={cellStyle}>
                        {isDiscount ? (
                          <select
                            value={unitValue}
                            onChange={(event) => onLineChange?.(row.index, { unitPrice: event.target.value })}
                            style={{ ...unitStyle, appearance: "none" }}
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
                            onChange={(event) => onLineChange?.(row.index, { unitPrice: event.target.value })}
                            style={unitStyle}
                            placeholder="Unit"
                          />
                        )}
                      </td>
                      <td style={cellStyle}>
                        <select
                          value={item.totalMode || "auto"}
                          onChange={(event) => onLineChange?.(row.index, { totalMode: event.target.value })}
                          style={{ ...totalStyle, appearance: "none" }}
                        >
                          <option value="auto">{formatLineTotal(item, lineItems) || "-"}</option>
                          <option value="tbc">TBC</option>
                          <option value="production">Production</option>
                          <option value="foc">FOC</option>
                          <option value="discount">Discount</option>
                        </select>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} style={emptyPreviewCell}>
                    No template lines loaded.
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
                <span>Total Price GBP</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <div style={vatText}>Excludes VAT</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function QuoteTemplatesPage() {
  const rawAuthState = useAuth();
  const authState = useMemo(() => rawAuthState || {}, [rawAuthState]);
  const accessKey = dataAccessKey(authState);
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeTab, setActiveTab] = useState("templates");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [globalDrafts, setGlobalDrafts] = useState({});
  const [quoteDefaults, setQuoteDefaults] = useState(DEFAULT_QUOTE_SETTINGS);
  const [pendingSharedRate, setPendingSharedRate] = useState(null);

  useEffect(() => {
    const load = async () => {
      const gate = resolveDataAccess(authState);
      if (gate.checking) return;
      if (reportDataAccessBlocked(gate, { collectionName: "settings", operation: "load quote templates" })) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "settings", "quoteTemplates"));
        const data = snap.exists() ? snap.data() : {};
        const loaded = Array.isArray(data?.templates)
          ? data.templates
          : FULL_SIZE_TRACKING_QUOTE_TEMPLATES;
        const next = clone(loaded);
        setTemplates(next);
        setSelectedId(next[0]?.id || "");
        setQuoteDefaults({ ...DEFAULT_QUOTE_SETTINGS, ...(data?.quoteDefaults || {}) });
      } catch (err) {
        console.error("Failed loading quote templates:", err);
        setError("Unable to load quote templates.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accessKey, authState]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) || null,
    [selectedId, templates]
  );

  useEffect(() => {
    setError("");
    setMessage("");
  }, [selectedTemplate?.id]);

  const visibleTemplates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((template) =>
      `${template.id || ""} ${template.file || ""} ${template.serviceDescription || ""}`.toLowerCase().includes(needle)
    );
  }, [search, templates]);

  const sharedRateSummaries = useMemo(() => summarizeSharedRates(templates), [templates]);

  useEffect(() => {
    setGlobalDrafts((current) => {
      let changed = false;
      const next = { ...current };
      sharedRateSummaries.forEach((summary) => {
        if (!next[summary.id]) {
          next[summary.id] = {
            unitPrice: summary.suggestedUnitPrice,
            totalMode: summary.suggestedTotalMode,
          };
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [sharedRateSummaries]);

  const updateSelected = (patch) => {
    setTemplates((current) =>
      current.map((template) => (template.id === selectedId ? { ...template, ...patch } : template))
    );
  };
  const updateSelectedId = (value) => {
    const nextId = slugify(value);
    setTemplates((current) =>
      current.map((template) => (template.id === selectedId ? { ...template, id: nextId } : template))
    );
    setSelectedId(nextId);
  };

  const updateLineItem = (index, patch) => {
    if (!selectedTemplate) return;
    const lineItems = [...(selectedTemplate.lineItems || [])];
    const currentLine = lineItems[index] || {};
    const editsSharedRateFields = ["description", "qty", "unitPrice", "totalMode"].some((field) =>
      Object.prototype.hasOwnProperty.call(patch, field)
    );
    const shouldPrompt =
      editsSharedRateFields &&
      isSharedRateLinkedLine(currentLine) &&
      !selectedTemplate.excludeFromSharedRates;
    let nextPatch = patch;
    if (shouldPrompt) {
      const markCustom = window.confirm(
        "This line is linked to Shared Rates.\n\nChoose OK to mark it as Custom Price so future Shared Rates will skip it.\nChoose Cancel to keep it linked to Shared Rates."
      );
      if (markCustom) {
        nextPatch = { ...patch, isCustomPrice: true, lockedSharedRate: true, usesSharedRate: false };
      } else {
        const rule = findSharedRateRuleForItem(currentLine);
        nextPatch = { ...patch, sharedRateId: currentLine.sharedRateId || rule?.id || "", usesSharedRate: true };
      }
    }
    lineItems[index] = { ...currentLine, ...nextPatch };
    updateSelected({ lineItems });
  };

  const toggleLineSharedRateLock = (index) => {
    if (!selectedTemplate) return;
    const lineItems = [...(selectedTemplate.lineItems || [])];
    lineItems[index] = {
      ...(lineItems[index] || {}),
      isCustomPrice: !isCustomSharedRateLine(lineItems[index] || {}),
      lockedSharedRate: !isCustomSharedRateLine(lineItems[index] || {}),
      usesSharedRate: isCustomSharedRateLine(lineItems[index] || {}),
    };
    updateSelected({ lineItems });
  };

  const updateGlobalDraft = (ruleId, patch) => {
    setGlobalDrafts((current) => ({
      ...current,
      [ruleId]: {
        ...(current[ruleId] || {}),
        ...patch,
      },
    }));
  };

  const requestApplyGlobalRate = (ruleId) => {
    const summary = sharedRateSummaries.find((item) => item.id === ruleId);
    const rule = SHARED_RATE_RULES.find((item) => item.id === ruleId);
    if (!summary || !rule) return;
    const draft = globalDrafts[ruleId] || {};
    const unitPrice = Object.prototype.hasOwnProperty.call(draft, "unitPrice")
      ? draft.unitPrice
      : summary.suggestedUnitPrice;
    const totalMode = draft.totalMode || summary.suggestedTotalMode || "tbc";
    setPendingSharedRate({
      ruleId,
      label: summary.label,
      unitPrice,
      totalMode,
      occurrenceCount: summary.occurrenceCount,
      templateCount: summary.templateCount,
      updateLineCount: summary.updateLineCount,
      updateTemplateCount: summary.updateTemplateCount,
      excludedTemplateCount: summary.excludedTemplateCount,
      lockedLineCount: summary.lockedLineCount,
      affectedTemplates: Array.from(new Set(summary.updateMatches.map((match) => match.templateName))).sort(),
      excludedTemplates: Array.from(new Set(summary.excludedMatches.map((match) => match.templateName))).sort(),
      lockedLines: summary.lockedMatches.map((match) => `${match.templateName}: ${match.description || summary.label}`),
      previewRows: summary.matches.map((match) => ({
        key: `${match.templateId}-${match.itemIndex}`,
        templateName: match.templateName,
        description: match.description || summary.label,
        currentUnitPrice: match.unitPrice,
        newUnitPrice: match.willUpdate ? unitPrice : match.unitPrice,
        currentTotalMode: match.totalMode,
        newTotalMode: match.willUpdate ? totalMode : match.totalMode,
        status: match.templateExcluded
          ? "Skipped excluded template"
          : match.lineLocked
            ? "Skipped custom line"
            : "Will update",
      })),
    });
  };

  const confirmApplyGlobalRate = async () => {
    if (!pendingSharedRate) return;
    const rule = SHARED_RATE_RULES.find((item) => item.id === pendingSharedRate.ruleId);
    if (!rule) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextTemplates = templates.map((template) => ({
        ...template,
        lineItems: (template.lineItems || []).map((item) =>
          !template.excludeFromSharedRates &&
          !isCustomSharedRateLine(item) &&
          itemMatchesSharedRateRule(item, rule)
            ? {
                ...item,
                sharedRateId: rule.id,
                usesSharedRate: true,
                isCustomPrice: false,
                lockedSharedRate: false,
                unitPrice: pendingSharedRate.unitPrice,
                totalMode: pendingSharedRate.totalMode,
              }
            : item
        ),
      }));
      await setDoc(
        doc(db, "settings", "quoteTemplates"),
        tenantPayload(authState, {
          templates: nextTemplates,
          quoteDefaults,
          updatedAt: serverTimestamp(),
          updatedBy: authState.user?.email || "Unknown",
        }),
        { merge: true }
      );
      setTemplates(nextTemplates);
      setMessage(`Applied ${pendingSharedRate.label} to ${pendingSharedRate.updateLineCount} line${pendingSharedRate.updateLineCount === 1 ? "" : "s"} across ${pendingSharedRate.updateTemplateCount} template${pendingSharedRate.updateTemplateCount === 1 ? "" : "s"}.`);
      setPendingSharedRate(null);
    } catch (err) {
      console.error("Failed applying shared rate:", err);
      setError("Unable to apply shared rate.");
    } finally {
      setSaving(false);
    }
  };

  const addLine = (section) => {
    if (!selectedTemplate) return;
    updateSelected({ lineItems: [...(selectedTemplate.lineItems || []), cloneLineItem(section)] });
  };

  const addDiscountLine = (section) => {
    if (!selectedTemplate) return;
    const targetSection =
      section ||
      (selectedTemplate.lineItems || []).find((item) => isEquipmentSection(item.section))?.section ||
      "Equipment - Daily Rates (Optional Equipment Charged if Used or Booked)";
    if (!isEquipmentSection(targetSection)) return;
    updateSelected({
      lineItems: [
        ...(selectedTemplate.lineItems || []),
        {
          section: targetSection,
          description: "Discount",
          qty: "",
          unitPrice: DEFAULT_DISCOUNT,
          totalMode: "discount",
        },
      ],
    });
  };

  const removeDiscountLines = (section = "") => {
    if (!selectedTemplate) return;
    updateSelected({
      lineItems: (selectedTemplate.lineItems || []).filter(
        (item) => !isDiscountLine(item) || (section && String(item.section || "Quote lines") !== section)
      ),
    });
  };

  const addSection = () => {
    const section = window.prompt("New section name:", "Manual additions");
    if (!section?.trim()) return;
    addLine(section.trim());
  };

  const removeLine = (index) => {
    if (!selectedTemplate) return;
    updateSelected({ lineItems: (selectedTemplate.lineItems || []).filter((_, itemIndex) => itemIndex !== index) });
  };

  const renameSection = (oldSection, nextSection) => {
    const clean = String(nextSection || "").trim();
    if (!selectedTemplate || !clean) return;
    updateSelected({
      lineItems: (selectedTemplate.lineItems || []).map((item) =>
        String(item.section || "Quote lines") === oldSection ? { ...item, section: clean } : item
      ),
    });
  };

  const persistQuoteTemplateSettings = async (nextTemplates, nextDefaults, successMessage) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const cleanTemplates = nextTemplates.map((template) => ({
        ...template,
        lineItems: Array.isArray(template.lineItems) ? template.lineItems : [],
      }));
      await setDoc(
        doc(db, "settings", "quoteTemplates"),
        tenantPayload(authState, {
          templates: cleanTemplates,
          quoteDefaults: nextDefaults,
          updatedAt: serverTimestamp(),
          updatedBy: authState.user?.email || "Unknown",
        }),
        { merge: true }
      );
      setTemplates(cleanTemplates);
      setQuoteDefaults(nextDefaults);
      setMessage(successMessage);
    } catch (err) {
      console.error("Failed saving quote templates:", err);
      setError("Unable to save quote template settings.");
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedTemplate = async () => {
    await persistQuoteTemplateSettings(templates, quoteDefaults, "Selected template saved.");
  };

  const saveDefaults = async () => {
    await persistQuoteTemplateSettings(templates, quoteDefaults, "Quote defaults saved.");
  };

  const handlePrimarySave = () => {
    if (activeTab === "defaults") return saveDefaults();
    return saveSelectedTemplate();
  };

  const addTemplate = () => {
    const id = slugify(`new-template-${Date.now()}`);
    const template = {
      id,
      file: "New Quote Template.xls",
      serviceDescription: "New Quote Template",
      defaultBickersContact: "",
      lineItems: [],
    };
    setTemplates((current) => [template, ...current]);
    setSelectedId(id);
  };

  const duplicateTemplate = () => {
    if (!selectedTemplate) return;
    const id = slugify(`${selectedTemplate.id || selectedTemplate.serviceDescription}-copy-${Date.now()}`);
    const copy = {
      ...clone(selectedTemplate),
      id,
      file: selectedTemplate.file ? `${selectedTemplate.file} copy` : "Quote Template Copy.xls",
      serviceDescription: `${selectedTemplate.serviceDescription || "Quote Template"} Copy`,
    };
    setTemplates((current) => [copy, ...current]);
    setSelectedId(id);
  };

  const deleteTemplate = () => {
    if (!selectedTemplate) return;
    const confirmed = window.confirm(`Delete template "${selectedTemplate.serviceDescription || selectedTemplate.id}"?\n\nSave templates afterwards to publish this change.`);
    if (!confirmed) return;
    setTemplates((current) => {
      const next = current.filter((template) => template.id !== selectedTemplate.id);
      setSelectedId(next[0]?.id || "");
      return next;
    });
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Quote Templates</h1>
            <div style={{ color: UI.muted, fontSize: 13, marginTop: 4 }}>
              View and edit the templates used by the quote builder.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/completed-quotes" style={button}>
              <ArrowLeft size={14} />
              Completed Quotes
            </Link>
            {activeTab !== "shared" ? (
              <button type="button" onClick={handlePrimarySave} disabled={saving} style={{ ...primaryButton, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.75 : 1 }}>
                <Save size={14} />
                {saving ? "Saving..." : activeTab === "defaults" ? "Save Defaults" : "Save Template"}
              </button>
            ) : null}
          </div>
        </div>

        {message ? <div style={{ ...surface, padding: 10, marginBottom: 10, color: "var(--legacy-color-166534)", fontWeight: 800 }}>{message}</div> : null}
        {error ? <div style={{ ...surface, padding: 10, marginBottom: 10, color: UI.red, fontWeight: 800 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button type="button" onClick={() => setActiveTab("templates")} style={tabButton(activeTab === "templates")}>
            Templates
          </button>
          <button type="button" onClick={() => setActiveTab("shared")} style={tabButton(activeTab === "shared")}>
            Shared Rates
          </button>
          <button type="button" onClick={() => setActiveTab("defaults")} style={tabButton(activeTab === "defaults")}>
            Defaults / Settings
          </button>
        </div>

        {activeTab === "templates" ? (
        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
          <aside style={{ ...surface, padding: 10 }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates..." style={{ ...input, paddingLeft: 34 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button type="button" onClick={addTemplate} style={button}><Plus size={14} /> New</button>
              <button type="button" onClick={duplicateTemplate} disabled={!selectedTemplate} style={button}><Copy size={14} /> Duplicate</button>
            </div>
            <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
              {loading ? "Loading..." : `${visibleTemplates.length} of ${templates.length} templates`}
            </div>
            <div style={{ display: "grid", gap: 6, maxHeight: "calc(100vh - 245px)", overflowY: "auto" }}>
              {visibleTemplates.map((template) => {
                const active = template.id === selectedId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedId(template.id)}
                    style={{
                      textAlign: "left",
                      padding: 9,
                      borderRadius: 8,
                      border: `1px solid ${active ? UI.brand : UI.border}`,
                      background: active ? "var(--legacy-color-edf3f8)" : "var(--legacy-color-fff)",
                      color: UI.text,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{template.serviceDescription || template.file || template.id}</div>
                    <div style={{ color: UI.muted, fontSize: 11, marginTop: 2 }}>{template.file || template.id}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main style={{ ...surface, padding: 12 }}>
            {!selectedTemplate ? (
              <div style={{ color: UI.muted, fontWeight: 800 }}>Select a template to edit.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={notice}>Template-only change. Editing selected template only. Changes here will not update other templates.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <div>
                    <label style={label}>Template ID</label>
                    <input value={selectedTemplate.id || ""} onChange={(event) => updateSelectedId(event.target.value)} style={input} />
                  </div>
                  <div>
                    <label style={label}>Source File</label>
                    <input value={selectedTemplate.file || ""} onChange={(event) => updateSelected({ file: event.target.value })} style={input} />
                  </div>
                </div>
                <div>
                  <label style={label}>Default Bickers Contact</label>
                  <input value={selectedTemplate.defaultBickersContact || ""} onChange={(event) => updateSelected({ defaultBickersContact: event.target.value })} style={input} />
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: `1px solid ${selectedTemplate.excludeFromSharedRates ? "var(--legacy-color-fbbf24)" : UI.border}`,
                    background: selectedTemplate.excludeFromSharedRates ? "var(--legacy-color-fffbeb)" : "var(--legacy-color-fff)",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 13,
                    fontWeight: 900,
                    color: UI.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selectedTemplate.excludeFromSharedRates)}
                    onChange={(event) => updateSelected({ excludeFromSharedRates: event.target.checked })}
                  />
                  Exclude this template from Shared Rates updates
                  {selectedTemplate.excludeFromSharedRates ? (
                    <span style={{ color: "var(--legacy-color-92400e)", fontSize: 12 }}>Excluded from Shared Rates</span>
                  ) : (
                    <span style={{ color: UI.muted, fontSize: 12 }}>Template can receive Shared Rate updates</span>
                  )}
                </label>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <label style={{ ...label, marginBottom: 2 }}>Quote Template Editor</label>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 700 }}>
                      Edit lines directly on the quote layout.
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: "var(--legacy-color-1d4ed8)" }}>Shared Rate = can update globally</span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: "var(--legacy-color-92400e)" }}>Custom Price = skipped by Shared Rates</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={addSection} style={button}>
                      <Plus size={14} />
                      Add section
                    </button>
                    <button type="button" onClick={() => addLine((selectedTemplate.lineItems || [])[0]?.section || "Quote lines")} style={button}>
                      <Plus size={14} />
                      Add line
                    </button>
                    <button type="button" onClick={() => removeDiscountLines()} style={dangerButton}>
                      <Trash2 size={14} />
                      Remove all discounts
                    </button>
                    <button type="button" onClick={deleteTemplate} style={dangerButton}>
                      <Trash2 size={14} />
                      Delete Template
                    </button>
                  </div>
                </div>
                <QuoteTemplatePreview
                  template={selectedTemplate}
                  onTemplateChange={updateSelected}
                  onLineChange={updateLineItem}
                  onAddLine={addLine}
                  onRemoveLine={removeLine}
                  onToggleLineLock={toggleLineSharedRateLock}
                  onRenameSection={renameSection}
                  onAddDiscount={addDiscountLine}
                  onRemoveDiscount={removeDiscountLines}
                />
              </div>
            )}
          </main>
        </div>
        ) : null}

        {activeTab === "shared" ? (
          <main style={{ ...surface, padding: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={notice}>Global shared rate update. Applying a row here can update multiple templates.</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Shared Rates</h2>
                  <div style={{ color: UI.muted, fontSize: 12, fontWeight: 700, marginTop: 3 }}>
                    Manage repeated line descriptions across all quote templates.
                  </div>
                </div>
                <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900 }}>
                  {sharedRateSummaries.filter((summary) => summary.unitPrices.length > 1 || summary.totalModes.length > 1).length} with variance
                </div>
              </div>

              <div style={{ display: "grid", gap: 6, overflowX: "auto" }}>
                <div style={{ minWidth: 980, display: "grid", gridTemplateColumns: "minmax(230px, 1.2fr) 90px 110px minmax(220px, 1fr) 130px 118px", gap: 6, alignItems: "center", color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase", padding: "0 2px" }}>
                  <div>Shared line</div>
                  <div>Templates</div>
                  <div>Unit Price</div>
                  <div>Current values</div>
                  <div>Total Mode</div>
                  <div>Action</div>
                </div>
                {sharedRateSummaries.map((summary) => {
                  const draft = globalDrafts[summary.id] || {};
                  const hasVariance = summary.unitPrices.length > 1 || summary.totalModes.length > 1;
                  return (
                    <div
                      key={summary.id}
                      style={{
                        minWidth: 980,
                        display: "grid",
                        gridTemplateColumns: "minmax(230px, 1.2fr) 90px 110px minmax(220px, 1fr) 130px 118px",
                        gap: 6,
                        alignItems: "center",
                        padding: 6,
                        border: `1px solid ${hasVariance ? "var(--legacy-color-fbbf24)" : UI.border}`,
                        borderRadius: 8,
                        background: hasVariance ? "var(--legacy-color-fffbeb)" : "var(--legacy-color-f8fafc)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900 }}>{summary.label}</div>
                        <div style={{ color: UI.muted, fontSize: 11, marginTop: 1 }}>
                          {summary.updateLineCount} update / {summary.excludedTemplateCount} templates excluded / {summary.lockedLineCount} custom
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 900 }}>{summary.updateTemplateCount}/{summary.templateCount}</div>
                      <input
                        value={draft.unitPrice ?? ""}
                        onChange={(event) => updateGlobalDraft(summary.id, { unitPrice: event.target.value })}
                        style={compactInput}
                        placeholder="Unit"
                      />
                      <div style={{ color: hasVariance ? "var(--legacy-color-92400e)" : UI.muted, fontSize: 11, fontWeight: 800, lineHeight: 1.35 }}>
                        {summary.unitPrices.length > 1 ? `Varies: ${summary.unitPriceSummary}` : `Unit: ${summary.unitPriceSummary}`}
                        <br />
                        {summary.totalModes.length > 1 ? `Modes vary: ${summary.totalModeSummary}` : `Mode: ${summary.totalModeSummary}`}
                      </div>
                      <select
                        value={draft.totalMode || summary.suggestedTotalMode || "tbc"}
                        onChange={(event) => updateGlobalDraft(summary.id, { totalMode: event.target.value })}
                        style={compactInput}
                      >
                        <option value="auto">Auto total</option>
                        <option value="tbc">TBC</option>
                        <option value="production">Production</option>
                        <option value="foc">FOC</option>
                        <option value="discount">Discount</option>
                      </select>
                      <button type="button" onClick={() => requestApplyGlobalRate(summary.id)} disabled={!summary.updateLineCount} style={{ ...primaryButton, opacity: summary.updateLineCount ? 1 : 0.55, cursor: summary.updateLineCount ? "pointer" : "not-allowed" }}>
                        Apply Shared Rate
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </main>
        ) : null}

        {activeTab === "defaults" ? (
          <main style={{ ...surface, padding: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={notice}>Quote-wide defaults. These settings are separate from individual template line items.</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Defaults / Settings</h2>
                <div style={{ color: UI.muted, fontSize: 12, fontWeight: 700, marginTop: 3 }}>
                  General defaults for quote creation and footer wording.
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <div>
                  <label style={label}>Global fallback Bickers Contact</label>
                  <input value={quoteDefaults.defaultBickersContact || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, defaultBickersContact: event.target.value }))} style={input} />
                </div>
                <div>
                  <label style={label}>Default Source File</label>
                  <input value={quoteDefaults.defaultSourceFile || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, defaultSourceFile: event.target.value }))} style={input} />
                </div>
              </div>
              <div>
                <label style={label}>Quote Footer Approval Text</label>
                <textarea value={quoteDefaults.footerApprovalText || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, footerApprovalText: event.target.value }))} style={{ ...input, minHeight: 70, resize: "vertical" }} />
              </div>
              <div>
                <label style={label}>Footer Contact Text</label>
                <textarea value={quoteDefaults.footerInfoText || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, footerInfoText: event.target.value }))} style={{ ...input, minHeight: 70, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <div>
                  <label style={label}>VAT Text</label>
                  <input value={quoteDefaults.vatText || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, vatText: event.target.value }))} style={input} />
                </div>
                <div>
                  <label style={label}>Payment Defaults</label>
                  <input value={quoteDefaults.paymentDefaults || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, paymentDefaults: event.target.value }))} style={input} />
                </div>
              </div>
              <div>
                <button type="button" onClick={saveDefaults} disabled={saving} style={{ ...primaryButton, opacity: saving ? 0.75 : 1 }}>
                  <Save size={14} />
                  {saving ? "Saving..." : "Save Defaults"}
                </button>
              </div>
            </div>
          </main>
        ) : null}

        {pendingSharedRate ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 60,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "rgba(15, 23, 42, 0.45)",
            }}
            onClick={() => setPendingSharedRate(null)}
          >
            <div style={{ ...surface, width: "min(620px, 100%)", padding: 16 }} onClick={(event) => event.stopPropagation()}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Confirm Global Shared Rate Update</div>
              <div style={{ color: UI.muted, fontSize: 13, fontWeight: 700, lineHeight: 1.45, marginBottom: 12 }}>
                Found <strong>{pendingSharedRate.occurrenceCount}</strong> matching line{pendingSharedRate.occurrenceCount === 1 ? "" : "s"} across{" "}
                <strong>{pendingSharedRate.templateCount}</strong> template{pendingSharedRate.templateCount === 1 ? "" : "s"}.
              </div>
              <div style={{ ...notice, marginBottom: 12 }}>Global shared rate update. This affects multiple templates and saves immediately.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={label}>Shared Line</label>
                  <div style={{ fontWeight: 900 }}>{pendingSharedRate.label}</div>
                </div>
                <div>
                  <label style={label}>New Values</label>
                  <div style={{ fontWeight: 900 }}>{pendingSharedRate.unitPrice || "blank"} / {pendingSharedRate.totalMode}</div>
                </div>
                <div>
                  <label style={label}>Will Update</label>
                  <div style={{ fontWeight: 900 }}>{pendingSharedRate.updateLineCount} lines / {pendingSharedRate.updateTemplateCount} templates</div>
                </div>
                <div>
                  <label style={label}>Skipped</label>
                  <div style={{ fontWeight: 900 }}>{pendingSharedRate.excludedTemplateCount} templates / {pendingSharedRate.lockedLineCount} custom lines</div>
                </div>
              </div>
              <label style={label}>Preview Affected Lines</label>
              <div style={{ maxHeight: 280, overflow: "auto", border: `1px solid ${UI.border}`, borderRadius: 8, marginBottom: 14, background: "var(--legacy-color-f8fafc)" }}>
                <div
                  style={{
                    minWidth: 860,
                    display: "grid",
                    gridTemplateColumns: "1.1fr 1.3fr 90px 90px 105px 105px 145px",
                    gap: 0,
                    padding: 7,
                    background: "var(--legacy-color-e5e7eb)",
                    color: UI.text,
                    fontSize: 10.5,
                    fontWeight: 900,
                    textTransform: "uppercase",
                  }}
                >
                  <div>Template</div>
                  <div>Line description</div>
                  <div>Current unit</div>
                  <div>New unit</div>
                  <div>Current mode</div>
                  <div>New mode</div>
                  <div>Status</div>
                </div>
                {(pendingSharedRate.previewRows || []).map((row) => {
                  const statusKind = row.status === "Will update" ? "shared" : row.status.includes("custom") ? "custom" : "excluded";
                  return (
                    <div
                      key={row.key}
                      style={{
                        minWidth: 860,
                        display: "grid",
                        gridTemplateColumns: "1.1fr 1.3fr 90px 90px 105px 105px 145px",
                        gap: 0,
                        padding: 7,
                        borderTop: `1px solid ${UI.border}`,
                        alignItems: "center",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      <div>{row.templateName}</div>
                      <div>{row.description}</div>
                      <div>{row.currentUnitPrice || "blank"}</div>
                      <div>{row.newUnitPrice || "blank"}</div>
                      <div>{row.currentTotalMode}</div>
                      <div>{row.newTotalMode}</div>
                      <div><span style={statusPill(statusKind)}>{row.status}</span></div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setPendingSharedRate(null)} style={button}>Cancel</button>
                <button type="button" onClick={confirmApplyGlobalRate} disabled={saving || !pendingSharedRate.updateLineCount} style={{ ...primaryButton, opacity: saving || !pendingSharedRate.updateLineCount ? 0.75 : 1 }}>
                  {saving ? "Applying..." : "Apply Shared Rate"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </HeaderSidebarLayout>
  );
}
