"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Copy, Lock, MoreHorizontal, Percent, Plus, RotateCcw, Save, Search, Trash2, Undo2, Unlock } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Alert, Badge, Button, Input, Modal, Select, Tabs, Textarea } from "@/app/components/ui";
import { useAuth } from "@/app/context/authContext";
import { db } from "@/app/utils/firebaseClient";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { FULL_SIZE_TRACKING_QUOTE_TEMPLATES } from "@/app/utils/quoteTemplates";
import { mergeQuoteTemplatesWithDefaults, sanitizeQuoteTemplateData } from "@/app/utils/quoteTemplateDefaults";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import { LEGACY_QUOTE_DOCUMENT_DEFAULTS, normalizeQuoteDocumentDefaults } from "@/app/utils/quoteDocumentDefaults";
import { summarizeQuoteTemplateVehicleCosts } from "@/app/utils/quoteTemplateVehicleCosts";
import {
  SHARED_RATE_GROUPS,
  SHARED_RATE_RULES,
  applySharedRateToTemplates,
  findSharedRateRuleForItem,
  isCustomSharedRateLine,
  isSharedRateLinkedLine,
  normalizeSharedRatePrice,
  nextQuoteTemplateRevision,
  sharedRateLineStatus,
  summarizeSharedRates,
} from "@/app/utils/quoteTemplateSharedRates";

const UI = UI_TOKENS;

const clone = (value) => JSON.parse(JSON.stringify(value));
const DEFAULT_QUOTE_SETTINGS = LEGACY_QUOTE_DOCUMENT_DEFAULTS;
const slugify = (value) =>
  String(value || "quote-template")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `quote-template-${Date.now()}`;

const QUOTE_SECTION_GREY = "var(--shell-muted)";
const DISCOUNT_OPTIONS = ["5%", "10%", "15%", "20%", "25%", "50%"];
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

const formatVehicleCost = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "No set cost";
  const numeric = Number(raw.replace(/[£,]/g, ""));
  return Number.isFinite(numeric) ? `£${money(numeric)}` : raw;
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
  background: "var(--color-surface)",
  color: UI.text,
  fontSize: 13,
  fontWeight: 900,
  padding: "0 12px",
  textDecoration: "none",
  cursor: "pointer",
};
const primaryButton = { ...button, background: UI.brand, borderColor: UI.brand, color: "var(--color-surface)" };
const dangerButton = { ...button, borderColor: "var(--color-danger-border)", background: "var(--color-danger-soft)", color: "var(--color-danger)" };
const smallButton = { ...button, minHeight: 30, padding: "0 9px", fontSize: 12 };
const tabButton = (active) => ({
  ...button,
  borderColor: active ? UI.brand : UI.border,
  background: active ? UI.brand : "var(--color-surface)",
  color: active ? "var(--color-white)" : UI.text,
});
const notice = {
  border: "1px solid var(--color-info-border)",
  background: "var(--color-info-soft)",
  color: "var(--color-brand)",
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
  background: "var(--color-surface)",
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
  background: "var(--color-brand-soft)",
  padding: 10,
  overflowX: "auto",
};
const previewPaper = {
  width: 760,
  minHeight: 980,
  margin: "0 auto",
  background: "var(--color-surface)",
  boxShadow: "0 16px 35px rgba(15, 23, 42, 0.16)",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "var(--color-text)",
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
  borderBottom: "3px solid var(--color-text)",
  background: "var(--shell-sidebar-bg)",
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
  borderLeft: "1px solid var(--color-text)",
  borderRight: "1px solid var(--color-text)",
  padding: "1px 8px",
  fontSize: 11.2,
  lineHeight: 1.08,
  fontWeight: 900,
  textAlign: "center",
  background: QUOTE_SECTION_GREY,
  color: "var(--color-text)",
};
const valueCell = {
  borderLeft: "1px solid var(--color-text)",
  borderRight: "1px solid var(--color-text)",
  padding: "1px 8px",
  minHeight: 16,
  fontSize: 10.5,
  lineHeight: 1.08,
  textAlign: "center",
  background: "var(--color-surface)",
  color: "var(--color-text)",
};
const descriptionLabel = {
  borderTop: "1px solid var(--color-text)",
  borderBottom: "1px solid var(--color-text)",
  padding: "1px 8px",
  fontSize: 11.2,
  lineHeight: 1,
  textAlign: "center",
  fontWeight: 900,
  background: QUOTE_SECTION_GREY,
  color: "var(--color-text)",
};
const servicePreview = {
  width: "100%",
  borderBottom: "1px solid var(--color-text)",
  padding: "1px 8px",
  fontSize: 11.4,
  lineHeight: 1.05,
  fontWeight: 900,
  textAlign: "center",
  color: "var(--color-text)",
  boxSizing: "border-box",
};
const quoteTable = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  background: "var(--color-surface)",
  fontFamily: "Arial, Helvetica, sans-serif",
};
const descriptionHeader = {
  border: "1px solid var(--color-border-strong)",
  background: "var(--shell-sidebar-bg)",
  color: "var(--color-white)",
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
  border: "1px solid var(--color-border-strong)",
  padding: "1px 8px",
  fontWeight: 900,
  textAlign: "center",
  background: QUOTE_SECTION_GREY,
  fontSize: 10.2,
  lineHeight: 1,
  height: 14,
  color: "var(--color-text)",
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
  color: "var(--color-text)",
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
  border: "1px solid var(--color-text-muted)",
  borderRadius: 3,
  background: "var(--color-surface)",
  color: "var(--color-text)",
  padding: "1px 5px",
  fontSize: 9,
  lineHeight: 1,
  fontWeight: 900,
  cursor: "pointer",
};
const quoteSectionDangerButton = {
  ...quoteSectionButton,
  border: "1px solid var(--color-danger-border)",
  background: "var(--color-danger-soft)",
  color: "var(--color-danger)",
};
const quoteCell = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--color-border-strong)",
  padding: 0,
  verticalAlign: "middle",
  height: 14,
  background: "var(--color-surface)",
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
  border: "1px solid var(--color-danger-border)",
  borderRadius: 2,
  background: "var(--color-danger-soft)",
  color: "var(--color-danger)",
  padding: 0,
  cursor: "pointer",
};
const quoteLineLockButton = {
  ...quoteLineDeleteButton,
  border: "1px solid var(--color-info-border)",
  background: "var(--color-info-soft)",
  color: "var(--color-brand)",
};
const statusPill = (kind = "shared") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 14,
  padding: "0 5px",
  borderRadius: 999,
  border: kind === "custom" ? "1px solid var(--color-warning-border)" : kind === "excluded" ? "1px solid var(--color-danger-border)" : kind === "template" ? "1px solid var(--color-border)" : "1px solid var(--color-info-border)",
  background: kind === "custom" ? "var(--color-warning-soft)" : kind === "excluded" ? "var(--color-danger-soft)" : kind === "template" ? "var(--color-surface-subtle)" : "var(--color-info-soft)",
  color: kind === "custom" ? "var(--color-warning)" : kind === "excluded" ? "var(--color-danger)" : kind === "template" ? "var(--color-text-muted)" : "var(--color-brand)",
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
  color: "var(--color-text)",
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
  background: "var(--color-danger)",
  borderColor: "var(--color-danger)",
};
const discountLineText = {
  ...lineText,
  color: "var(--color-white)",
  background: "var(--color-danger)",
  fontWeight: 900,
};
const discountQtyText = { ...discountLineText, textAlign: "center" };
const discountMoneyText = { ...discountLineText, textAlign: "right", paddingRight: 7 };
const discountTotalText = { ...totalText, color: "var(--color-white)", background: "var(--color-danger)", fontWeight: 900 };
const emptyPreviewCell = {
  border: "1px solid var(--color-border-strong)",
  padding: 14,
  color: UI.muted,
  textAlign: "center",
  fontSize: 11,
  fontWeight: 800,
};
const quotePrintSpacer = {
  flex: "1 1 auto",
  minHeight: 0,
  background: "var(--color-surface)",
};
const quoteFooter = {
  display: "flex",
  gap: 0,
  alignItems: "stretch",
  justifyContent: "space-between",
};
const footerBlackFill = { flex: 1, background: "var(--shell-sidebar-bg)", minHeight: 34 };
const totalRows = {
  width: 230,
  borderLeft: "1px solid var(--color-text)",
  borderTop: "1px solid var(--color-text)",
};
const totalRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 900,
  borderBottom: "1px solid var(--color-text)",
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

function QuoteTemplateLineEditor({
  template,
  onLineChange,
  onAddLine,
  onRemoveLine,
  onMoveLine,
  onToggleLineLock,
  onRenameSection,
  onAddDiscount,
  onRemoveDiscount,
}) {
  const [collapsed, setCollapsed] = useState({});
  const lineItems = useMemo(() => Array.isArray(template?.lineItems) ? template.lineItems : [], [template?.lineItems]);
  const sections = useMemo(() => {
    const byName = new Map();
    return lineItems.reduce((result, item, index) => {
      const name = String(item.section || "Quote lines");
      if (!byName.has(name)) {
        const section = { name, rows: [] };
        byName.set(name, section);
        result.push(section);
      }
      byName.get(name).rows.push({ item, index });
      return result;
    }, []);
  }, [lineItems]);

  if (!sections.length) {
    return <div className={layoutStyles.editorEmpty}>No lines yet. Add a section or line to start this template.</div>;
  }

  return <div className={layoutStyles.lineEditor}>
    {sections.map((section) => {
      const closed = Boolean(collapsed[section.name]);
      const hasDiscount = section.rows.some(({ item }) => isDiscountLine(item));
      return <section key={section.name} className={layoutStyles.lineSection}>
        <div className={layoutStyles.lineSectionHeader}>
          <button type="button" className={layoutStyles.sectionToggle} aria-expanded={!closed} onClick={() => setCollapsed((current) => ({ ...current, [section.name]: !closed }))}>
            {closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            <span>{section.name}</span>
            <small>{section.rows.length} line{section.rows.length === 1 ? "" : "s"}</small>
          </button>
          <div className={layoutStyles.sectionActions}>
            {isEquipmentSection(section.name) ? <Button size="sm" variant="secondary" onClick={() => hasDiscount ? onRemoveDiscount(section.name) : onAddDiscount(section.name)}>
              {hasDiscount ? <Trash2 size={13} /> : <Percent size={13} />}{hasDiscount ? "Remove discount" : "Add discount"}
            </Button> : null}
            <Button size="sm" variant="secondary" onClick={() => onAddLine(section.name)}><Plus size={13} /> Add line</Button>
          </div>
        </div>
        {!closed ? <div className={layoutStyles.lineTable}>
          <div className={layoutStyles.lineTableHead} aria-hidden="true">
            <span>Description</span><span>Qty</span><span>Unit price</span><span>Total mode</span><span>Status</span><span>Actions</span>
          </div>
          {section.rows.map(({ item, index }, sectionIndex) => {
            const status = sharedRateLineStatus(item, template.excludeFromSharedRates);
            return <div key={item.id || `${section.name}-${index}`} className={layoutStyles.lineRow} data-status={status.id}>
              <div className={layoutStyles.mobileField} data-label="Description">
                <Input value={item.description || ""} onChange={(event) => onLineChange(index, { description: event.target.value })} aria-label="Line description" />
              </div>
              <div className={layoutStyles.mobileField} data-label="Qty">
                <Input value={item.qty || ""} onChange={(event) => onLineChange(index, { qty: event.target.value })} inputMode="decimal" aria-label="Quantity" />
              </div>
              <div className={layoutStyles.mobileField} data-label="Unit price">
                {isDiscountLine(item) ? <Select value={DISCOUNT_OPTIONS.includes(item.unitPrice) ? item.unitPrice : DEFAULT_DISCOUNT} onChange={(event) => onLineChange(index, { unitPrice: event.target.value })} aria-label="Discount percentage">
                  {DISCOUNT_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </Select> : <Input value={item.unitPrice || ""} onChange={(event) => onLineChange(index, { unitPrice: event.target.value })} inputMode="decimal" aria-label="Unit price" />}
              </div>
              <div className={layoutStyles.mobileField} data-label="Total mode">
                <Select value={item.totalMode || "auto"} onChange={(event) => onLineChange(index, { totalMode: event.target.value })} aria-label="Total mode">
                  <option value="auto">Auto · {formatLineTotal(item, lineItems) || "-"}</option>
                  <option value="tbc">TBC</option><option value="production">Production</option><option value="foc">FOC</option><option value="discount">Discount</option>
                </Select>
              </div>
              <div className={layoutStyles.mobileField} data-label="Status">
                <button type="button" className={layoutStyles.statusButton} data-status={status.id} onClick={() => status.id !== "template" && onToggleLineLock(index)} disabled={status.id === "excluded" || status.id === "template"} title={status.id === "shared" ? "Mark as Custom Price" : status.id === "custom" ? "Link to Shared Rates" : status.label}>
                  {status.id === "custom" ? <Lock size={12} /> : status.id === "shared" ? <Unlock size={12} /> : null}{status.label}
                </button>
              </div>
              <div className={layoutStyles.rowActions}>
                <Button bare aria-label="Move line up" title="Move line up" disabled={sectionIndex === 0} onClick={() => onMoveLine(index, -1)}><ArrowUp size={15} /></Button>
                <Button bare aria-label="Move line down" title="Move line down" disabled={sectionIndex === section.rows.length - 1} onClick={() => onMoveLine(index, 1)}><ArrowDown size={15} /></Button>
                <Button bare aria-label="Delete line" title="Delete line" className={layoutStyles.deleteLineButton} onClick={() => onRemoveLine(index)}><Trash2 size={15} /></Button>
              </div>
            </div>;
          })}
        </div> : null}
        {!closed ? <details className={layoutStyles.sectionAdvanced}>
          <summary>Rename section</summary>
          <div><Input defaultValue={section.name} onBlur={(event) => onRenameSection(section.name, event.target.value)} aria-label="Section name" /></div>
        </details> : null}
      </section>;
    })}
  </div>;
}

function QuoteTemplatePreview({
  template,
  documentDefaults = DEFAULT_QUOTE_SETTINGS,
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
      <div className={layoutStyles.extracted1}>
        <div className={layoutStyles.extracted2}>
          <div className={layoutStyles.extracted3}>
            {/* eslint-disable-next-line @next/next/no-img-element -- This mirrors the quote page print header. */}
            <img src="/quote-carbon-header.png" alt="Bickers Action quotation" className={layoutStyles.extracted4} />
          </div>

          <table className={layoutStyles.extracted5}>
            <tbody>
              <tr>
                <td className={layoutStyles.extracted6}>Quote Date</td>
                <td className={layoutStyles.extracted7}>Job No</td>
                <td className={layoutStyles.extracted8}>Quote No</td>
              </tr>
              <tr>
                <td className={layoutStyles.extracted9}></td>
                <td className={layoutStyles.extracted10}></td>
                <td className={layoutStyles.extracted11}></td>
              </tr>
              <tr>
                <td className={layoutStyles.extracted12}>Production Company</td>
                <td className={layoutStyles.extracted13}>Production</td>
                <td className={layoutStyles.extracted14}>Production Contact</td>
              </tr>
              <tr>
                <td className={layoutStyles.extracted15}></td>
                <td className={layoutStyles.extracted16}></td>
                <td className={layoutStyles.extracted17}></td>
              </tr>
              <tr>
                <td className={layoutStyles.extracted18}>Location</td>
                <td className={layoutStyles.extracted19}>Shoot Dates</td>
                <td className={layoutStyles.extracted20}>Bickers Contact</td>
              </tr>
              <tr>
                <td className={layoutStyles.extracted21}></td>
                <td className={layoutStyles.extracted22}></td>
                <td className={layoutStyles.extracted23}></td>
              </tr>
            </tbody>
          </table>

          <div className={layoutStyles.extracted24}>Description of Services</div>
          <input
            value={template?.serviceDescription || ""}
            onChange={(event) => onTemplateChange?.({ serviceDescription: event.target.value })}
            className={layoutStyles.extracted25}
            placeholder="Description of services"
          />

          <table className={layoutStyles.extracted26}>
            <thead>
              <tr>
                <th className={layoutStyles.extracted27}>DESCRIPTION</th>
                <th className={layoutStyles.extracted28}>QTY</th>
                <th className={layoutStyles.extracted29}>UNIT PRICE</th>
                <th className={layoutStyles.extracted30}>TOTAL</th>
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
                        <td colSpan={4} className={layoutStyles.extracted31}>
                          <div className={layoutStyles.extracted32}>
                            <input
                              value={row.section}
                              onChange={(event) => onRenameSection?.(row.section, event.target.value)}
                              className={layoutStyles.extracted33}
                              title="Edit section name"
                            />
                            <div className={layoutStyles.extracted34}>
                              {canDiscount && !hasDiscount ? (
                                <button type="button" onClick={() => onAddDiscount?.(row.section)} className={layoutStyles.extracted35}>
                                  <Percent size={10} />
                                  Discount
                                </button>
                              ) : null}
                              {canDiscount && hasDiscount ? (
                                <button type="button" onClick={() => onRemoveDiscount?.(row.section)} className={layoutStyles.extracted36}>
                                  <Trash2 size={10} />
                                  Discount
                                </button>
                              ) : null}
                              <button type="button" onClick={() => onAddLine?.(row.section)} className={layoutStyles.extracted37}>
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
                  const lineStatus = sharedRateLineStatus(item, templateExcluded);
                  const sharedRateLabel = lineStatus.label;
                  const sharedRateKind = lineStatus.id;

                  return (
                    <tr key={row.key}>
                      <td style={cellStyle}>
                        <div className={layoutStyles.extracted38}>
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
                            className={layoutStyles.extracted39}
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

          <div className={layoutStyles.extracted40}></div>
          <div className={layoutStyles.extracted41}>
            <div className={layoutStyles.extracted42}></div>
            <div className={layoutStyles.extracted43}>
              <div className={layoutStyles.extracted44}>
                <span>Total Price GBP</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <div className={layoutStyles.extracted45}>{documentDefaults.vatText || "Excludes VAT"}</div>
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
  const [editorView, setEditorView] = useState("edit");
  const [revision, setRevision] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [lastSharedRateUpdate, setLastSharedRateUpdate] = useState(null);
  const [discardedLine, setDiscardedLine] = useState(null);
  const [sharedFilter, setSharedFilter] = useState("all");
  const [vehicleCostFilter, setVehicleCostFilter] = useState("same");
  const [vehicleCostSearch, setVehicleCostSearch] = useState("");
  const [collapsedRateGroups, setCollapsedRateGroups] = useState({});
  const [exceptionSummary, setExceptionSummary] = useState(null);
  const [pendingTab, setPendingTab] = useState("");
  const cleanSignatureRef = useRef("");
  const cleanWorkspaceRef = useRef(null);
  const initializedRateGroupsRef = useRef(false);

  const workspaceSignature = useMemo(() => JSON.stringify({ templates, quoteDefaults: normalizeQuoteDocumentDefaults(quoteDefaults) }), [templates, quoteDefaults]);
  const isDirty = Boolean(!loading && cleanSignatureRef.current && workspaceSignature !== cleanSignatureRef.current);

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
          ? mergeQuoteTemplatesWithDefaults(data.templates, FULL_SIZE_TRACKING_QUOTE_TEMPLATES)
          : mergeQuoteTemplatesWithDefaults([], FULL_SIZE_TRACKING_QUOTE_TEMPLATES);
        const next = clone(loaded);
        const nextDefaults = normalizeQuoteDocumentDefaults(data?.quoteDefaults || {});
        setTemplates(next);
        setSelectedId(next[0]?.id || "");
        setQuoteDefaults(nextDefaults);
        setRevision(Number(data?.revision) || 0);
        setLastSharedRateUpdate(data?.lastSharedRateUpdate || null);
        const cleanWorkspace = { templates: next, quoteDefaults: nextDefaults };
        cleanWorkspaceRef.current = clone(cleanWorkspace);
        cleanSignatureRef.current = JSON.stringify(cleanWorkspace);
        const updatedAt = data?.updatedAt?.toDate?.() || (data?.updatedAt ? new Date(data.updatedAt) : null);
        setLastSavedAt(updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toLocaleString("en-GB") : "");
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
  const vehicleCostSummary = useMemo(() => summarizeQuoteTemplateVehicleCosts(templates), [templates]);
  const visibleVehicleCostGroups = useMemo(() => {
    const needle = vehicleCostSearch.trim().toLowerCase();
    return vehicleCostSummary.priceGroups.filter((group) => {
      if (vehicleCostFilter === "same" && group.vehicleCount < 2) return false;
      if (vehicleCostFilter === "different" && !group.hasVehiclePriceDifference) return false;
      return !needle || group.vehicles.some((vehicle) =>
        `${vehicle.vehicleName} ${vehicle.templates.map((template) => template.templateName).join(" ")} ${group.unitPrice}`.toLowerCase().includes(needle)
      );
    });
  }, [vehicleCostFilter, vehicleCostSearch, vehicleCostSummary]);
  const filteredSharedRateSummaries = useMemo(() => sharedRateSummaries.filter((summary) => {
    if (sharedFilter === "attention") return summary.hasVariance;
    if (sharedFilter === "up-to-date") return !summary.hasVariance;
    if (sharedFilter === "custom") return summary.lockedLineCount > 0;
    if (sharedFilter === "excluded") return summary.excludedTemplateCount > 0;
    return true;
  }), [sharedFilter, sharedRateSummaries]);

  useEffect(() => {
    if (initializedRateGroupsRef.current || !sharedRateSummaries.length) return;
    initializedRateGroupsRef.current = true;
    setCollapsedRateGroups(Object.fromEntries(SHARED_RATE_GROUPS.map((group) => [
      group.id,
      !sharedRateSummaries.some((summary) => summary.group === group.id && summary.hasVariance),
    ])));
  }, [sharedRateSummaries]);

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

  const updateLineItem = async (index, patch) => {
    if (!selectedTemplate) return;
    const lineItems = [...(selectedTemplate.lineItems || [])];
    const currentLine = lineItems[index] || {};
    const editsSharedRateFields = ["description", "unitPrice", "totalMode"].some((field) =>
      Object.prototype.hasOwnProperty.call(patch, field)
    );
    const shouldPrompt =
      editsSharedRateFields &&
      isSharedRateLinkedLine(currentLine) &&
      !selectedTemplate.excludeFromSharedRates;
    let nextPatch = patch;
    if (shouldPrompt) {
      const markCustom = await systemDialogs.confirmSystem(
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
    const rawUnitPrice = Object.prototype.hasOwnProperty.call(draft, "unitPrice")
      ? draft.unitPrice
      : summary.suggestedUnitPrice;
    const priceResult = normalizeSharedRatePrice(rawUnitPrice);
    if (!priceResult.valid) {
      setError(priceResult.error);
      return;
    }
    const unitPrice = priceResult.value;
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
      const settingsRef = doc(db, "settings", "quoteTemplates");
      const result = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const current = snapshot.exists() ? snapshot.data() : {};
        const currentTemplates = mergeQuoteTemplatesWithDefaults(
          Array.isArray(current.templates) ? current.templates : [],
          FULL_SIZE_TRACKING_QUOTE_TEMPLATES
        );
        const nextTemplates = sanitizeQuoteTemplateData(applySharedRateToTemplates(currentTemplates, rule, {
          unitPrice: pendingSharedRate.unitPrice,
          totalMode: pendingSharedRate.totalMode,
        }));
        const nextRevision = (Number(current.revision) || 0) + 1;
        const appliedAt = new Date().toISOString();
        const appliedBy = authState.user?.email || "Unknown";
        const nextDefaults = normalizeQuoteDocumentDefaults(current.quoteDefaults || quoteDefaults);
        const storedDefaults = { ...(current.quoteDefaults || {}), ...nextDefaults };
        transaction.set(settingsRef, tenantPayload(authState, {
          templates: nextTemplates,
          quoteDefaults: storedDefaults,
          revision: nextRevision,
          lastSharedRateUpdate: { ruleId: rule.id, label: rule.label, appliedAt, appliedBy },
          updatedAt: serverTimestamp(),
          updatedBy: appliedBy,
        }), { merge: true });
        return { nextTemplates, nextDefaults, nextRevision, appliedAt, appliedBy };
      });
      setTemplates(result.nextTemplates);
      setQuoteDefaults(result.nextDefaults);
      setRevision(result.nextRevision);
      setLastSharedRateUpdate({ ruleId: rule.id, label: rule.label, appliedAt: result.appliedAt, appliedBy: result.appliedBy });
      setLastSavedAt(new Date(result.appliedAt).toLocaleString("en-GB"));
      const cleanWorkspace = { templates: result.nextTemplates, quoteDefaults: result.nextDefaults };
      cleanWorkspaceRef.current = clone(cleanWorkspace);
      cleanSignatureRef.current = JSON.stringify(cleanWorkspace);
      setGlobalDrafts((current) => ({
        ...current,
        [rule.id]: { unitPrice: pendingSharedRate.unitPrice, totalMode: pendingSharedRate.totalMode },
      }));
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
    const lineItems = [...(selectedTemplate.lineItems || [])];
    const targetSection = section || "Quote lines";
    const lastIndex = lineItems.reduce((found, item, index) => String(item.section || "Quote lines") === targetSection ? index : found, -1);
    lineItems.splice(lastIndex >= 0 ? lastIndex + 1 : lineItems.length, 0, { ...cloneLineItem(targetSection), id: `${Date.now()}-template-line` });
    updateSelected({ lineItems });
  };

  const addDiscountLine = (section) => {
    if (!selectedTemplate) return;
    const targetSection =
      section ||
      (selectedTemplate.lineItems || []).find((item) => isEquipmentSection(item.section))?.section ||
      "Equipment - Daily Rates (Optional Equipment Charged if Used or Booked)";
    if (!isEquipmentSection(targetSection)) return;
    const lineItems = [...(selectedTemplate.lineItems || [])];
    const lastIndex = lineItems.reduce((found, item, index) => String(item.section || "") === targetSection ? index : found, -1);
    lineItems.splice(lastIndex >= 0 ? lastIndex + 1 : lineItems.length, 0, {
          id: `${Date.now()}-template-discount`,
          section: targetSection,
          description: "Discount",
          qty: "",
          unitPrice: DEFAULT_DISCOUNT,
          totalMode: "discount",
        });
    updateSelected({ lineItems });
  };

  const removeDiscountLines = (section = "") => {
    if (!selectedTemplate) return;
    updateSelected({
      lineItems: (selectedTemplate.lineItems || []).filter(
        (item) => !isDiscountLine(item) || (section && String(item.section || "Quote lines") !== section)
      ),
    });
  };

  const addSection = async () => {
    const section = await systemDialogs.promptSystem("New section name:", "Manual additions");
    if (!section?.trim()) return;
    addLine(section.trim());
  };

  const removeLine = (index) => {
    if (!selectedTemplate) return;
    const removed = selectedTemplate.lineItems?.[index];
    if (removed) setDiscardedLine({ templateId: selectedTemplate.id, item: clone(removed), index });
    updateSelected({ lineItems: (selectedTemplate.lineItems || []).filter((_, itemIndex) => itemIndex !== index) });
  };

  const undoRemoveLine = () => {
    if (!discardedLine) return;
    setTemplates((current) => current.map((template) => {
      if (template.id !== discardedLine.templateId) return template;
      const lineItems = [...(template.lineItems || [])];
      lineItems.splice(Math.min(discardedLine.index, lineItems.length), 0, discardedLine.item);
      return { ...template, lineItems };
    }));
    setDiscardedLine(null);
  };

  const moveLine = (index, direction) => {
    if (!selectedTemplate) return;
    const target = index + direction;
    const lineItems = [...(selectedTemplate.lineItems || [])];
    if (target < 0 || target >= lineItems.length || String(lineItems[index]?.section || "") !== String(lineItems[target]?.section || "")) return;
    [lineItems[index], lineItems[target]] = [lineItems[target], lineItems[index]];
    updateSelected({ lineItems });
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

  const persistQuoteTemplateSettings = useCallback(async (nextTemplates, nextDefaults, successMessage) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const cleanTemplates = sanitizeQuoteTemplateData(nextTemplates.map((template) => ({
        ...template,
        lineItems: Array.isArray(template.lineItems) ? template.lineItems : [],
      })));
      const settingsRef = doc(db, "settings", "quoteTemplates");
      const nextRevision = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const currentData = snapshot.exists() ? snapshot.data() : {};
        const currentRevision = Number(currentData?.revision) || 0;
        const updatedRevision = nextQuoteTemplateRevision(revision, currentRevision);
        const normalizedDefaults = normalizeQuoteDocumentDefaults(nextDefaults);
        transaction.set(settingsRef, tenantPayload(authState, {
          templates: cleanTemplates,
          quoteDefaults: { ...(currentData.quoteDefaults || {}), ...normalizedDefaults },
          revision: updatedRevision,
          updatedAt: serverTimestamp(),
          updatedBy: authState.user?.email || "Unknown",
        }), { merge: true });
        return updatedRevision;
      });
      const normalizedDefaults = normalizeQuoteDocumentDefaults(nextDefaults);
      setTemplates(cleanTemplates);
      setQuoteDefaults(normalizedDefaults);
      setRevision(nextRevision);
      const cleanWorkspace = { templates: cleanTemplates, quoteDefaults: normalizedDefaults };
      cleanWorkspaceRef.current = clone(cleanWorkspace);
      cleanSignatureRef.current = JSON.stringify(cleanWorkspace);
      setLastSavedAt(new Date().toLocaleString("en-GB"));
      setMessage(successMessage);
      return true;
    } catch (err) {
      console.error("Failed saving quote templates:", err);
      setError(err?.code === "quote-template-conflict"
        ? "Another administrator saved Quote Templates first. Reload the page before publishing your changes."
        : "Unable to save quote template settings.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [authState, revision]);

  const handlePrimarySave = useCallback(() => persistQuoteTemplateSettings(
    templates,
    quoteDefaults,
    activeTab === "defaults" ? "Quote defaults saved." : "Quote template changes saved."
  ), [activeTab, persistQuoteTemplateSettings, quoteDefaults, templates]);

  useUnsavedChangesGuard({
    isDirty,
    message: "You have unpublished Quote Template changes.",
    saveLabel: "Save Changes & Leave",
    onSave: handlePrimarySave,
  });

  const discardChanges = () => {
    const clean = cleanWorkspaceRef.current;
    if (!clean) return;
    setTemplates(clone(clean.templates));
    setQuoteDefaults(clone(clean.quoteDefaults));
    setSelectedId((current) => clean.templates.some((template) => template.id === current) ? current : clean.templates[0]?.id || "");
    setMessage("Unpublished changes discarded.");
  };

  const requestTabChange = (nextTab) => {
    if (nextTab === "shared" && isDirty) {
      setPendingTab(nextTab);
      return;
    }
    setActiveTab(nextTab);
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

  const deleteTemplate = async () => {
    if (!selectedTemplate) return;
    const confirmed = await systemDialogs.confirmSystem(`Delete template "${selectedTemplate.serviceDescription || selectedTemplate.id}"?\n\nSave templates afterwards to publish this change.`);
    if (!confirmed) return;
    setTemplates((current) => {
      const next = current.filter((template) => template.id !== selectedTemplate.id);
      setSelectedId(next[0]?.id || "");
      return next;
    });
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap} className={layoutStyles.page}>
        <div className={layoutStyles.pageHeader}>
          <div>
            <h1>Quote Templates</h1>
            <p>Manage quote lines, shared prices and defaults used by new quotes.</p>
          </div>
          <div className={layoutStyles.headerActions}>
            <Button as={Link} href="/completed-quotes" variant="secondary">
              <ArrowLeft size={14} />
              Completed Quotes
            </Button>
          </div>
        </div>

        {message ? <Alert variant="success" className={layoutStyles.pageAlert}>{message}</Alert> : null}
        {error ? <Alert variant="danger" className={layoutStyles.pageAlert}>{error}</Alert> : null}

        <Tabs className={layoutStyles.mainTabs} value={activeTab} onChange={requestTabChange} label="Quote template administration" items={[
          { value: "templates", label: "Templates" },
          { value: "vehicles", label: "Vehicle Costs" },
          { value: "shared", label: "Shared Rates" },
          { value: "defaults", label: "Defaults" },
        ]} />

        {activeTab !== "shared" ? <div className={layoutStyles.saveBar} data-dirty={isDirty}>
          <div className={layoutStyles.saveStatus}>
            <strong>{saving ? "Saving changes…" : isDirty ? "Unsaved changes" : "All changes saved"}</strong>
            <span>{isDirty ? "Publish when you are ready." : lastSavedAt ? `Saved ${lastSavedAt} · revision ${revision}` : `Revision ${revision}`}</span>
          </div>
          <div className={layoutStyles.saveActions}>
            <Button variant="secondary" disabled={!isDirty || saving} onClick={discardChanges}><RotateCcw size={14} /> Discard</Button>
            <Button loading={saving} disabled={!isDirty} onClick={handlePrimarySave}><Save size={14} /> Save Changes</Button>
          </div>
        </div> : null}

        {activeTab === "templates" ? (
        <div className={layoutStyles.templateWorkspace}>
          <aside className={layoutStyles.templateSidebar}>
            <div className={layoutStyles.searchField}>
              <Search size={15} />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates…" aria-label="Search templates" />
            </div>
            <Select className={layoutStyles.mobileTemplateSelect} value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label="Selected template">
              {visibleTemplates.map((template) => <option key={template.id} value={template.id}>{template.serviceDescription || template.file || template.id}</option>)}
            </Select>
            <div className={layoutStyles.templateCreateActions}>
              <Button size="sm" onClick={addTemplate}><Plus size={14} /> New</Button>
              <Button size="sm" variant="secondary" onClick={duplicateTemplate} disabled={!selectedTemplate}><Copy size={14} /> Duplicate</Button>
            </div>
            <div className={layoutStyles.templateCount}>
              {loading ? "Loading..." : `${visibleTemplates.length} of ${templates.length} templates`}
            </div>
            <div className={layoutStyles.templateList}>
              {visibleTemplates.map((template) => {
                const active = template.id === selectedId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedId(template.id)}
                    className={layoutStyles.templateListItem}
                    data-active={active}
                  >
                    <strong>{template.serviceDescription || template.file || template.id}</strong>
                    <span>{template.file || template.id}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className={layoutStyles.templateEditorPanel}>
            {!selectedTemplate ? (
              <div className={layoutStyles.editorEmpty}>Select a template to edit.</div>
            ) : (
              <div className={layoutStyles.editorContent}>
                <div className={layoutStyles.editorHeader}>
                  <div>
                    <label htmlFor="template-name">Template name</label>
                    <Input id="template-name" value={selectedTemplate.serviceDescription || ""} onChange={(event) => updateSelected({ serviceDescription: event.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="template-contact">Default Bickers Contact</label>
                    <Input id="template-contact" list="template-contact-options" value={selectedTemplate.defaultBickersContact || ""} onChange={(event) => updateSelected({ defaultBickersContact: event.target.value })} placeholder={quoteDefaults.defaultBickersContact || "Adam Eastall"} />
                    <datalist id="template-contact-options"><option value="Adam Eastall" /><option value="Sophie Albrow" /></datalist>
                  </div>
                </div>
                <label className={layoutStyles.excludeToggle} data-excluded={Boolean(selectedTemplate.excludeFromSharedRates)}>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedTemplate.excludeFromSharedRates)}
                    onChange={(event) => updateSelected({ excludeFromSharedRates: event.target.checked })}
                  />
                  <span><strong>Exclude this template from Shared Rates</strong><small>{selectedTemplate.excludeFromSharedRates ? "Global rates will skip every line in this template." : "Matching lines can receive confirmed global rate updates."}</small></span>
                </label>

                <div className={layoutStyles.editorToolbar}>
                  <Tabs value={editorView} onChange={setEditorView} label="Template editor view" items={[{ value: "edit", label: "Edit Lines" }, { value: "preview", label: "Preview" }]} />
                  <div className={layoutStyles.editorActions}>
                    <Button size="sm" variant="secondary" onClick={addSection}><Plus size={14} /> Add section</Button>
                    <Button size="sm" variant="secondary" onClick={() => addLine((selectedTemplate.lineItems || [])[0]?.section || "Quote lines")}><Plus size={14} /> Add line</Button>
                    <details className={layoutStyles.dangerMenu}>
                      <summary aria-label="More template actions"><MoreHorizontal size={16} /> More</summary>
                      <div>
                        <button type="button" onClick={() => removeDiscountLines()}><Trash2 size={14} /> Remove all discounts</button>
                        <button type="button" className={layoutStyles.dangerMenuItem} onClick={deleteTemplate}><Trash2 size={14} /> Delete template</button>
                      </div>
                    </details>
                  </div>
                </div>

                {editorView === "edit" ? <QuoteTemplateLineEditor template={selectedTemplate} onLineChange={updateLineItem} onAddLine={addLine} onRemoveLine={removeLine} onMoveLine={moveLine} onToggleLineLock={toggleLineSharedRateLock} onRenameSection={renameSection} onAddDiscount={addDiscountLine} onRemoveDiscount={removeDiscountLines} /> : <fieldset disabled className={layoutStyles.previewFieldset}><QuoteTemplatePreview template={selectedTemplate} documentDefaults={quoteDefaults} /></fieldset>}

                <details className={layoutStyles.advancedDetails}>
                  <summary>Advanced details</summary>
                  <dl><div><dt>Template ID</dt><dd>{selectedTemplate.id}</dd></div><div><dt>Source file</dt><dd>{selectedTemplate.file || "None"}</dd></div></dl>
                </details>
              </div>
            )}
          </main>
        </div>
        ) : null}

        {activeTab === "vehicles" ? <main className={layoutStyles.vehicleCostsPanel}>
          <div className={layoutStyles.sectionHeading}>
            <div><h2>Vehicle Costs</h2><p>The first line in each Equipment section is treated as that template&apos;s main vehicle or unit cost.</p></div>
          </div>
          <div className={layoutStyles.vehicleCostStats}>
            <div><span>Templates with a cost</span><strong>{vehicleCostSummary.templateCount}</strong></div>
            <div><span>Named vehicles / units</span><strong>{vehicleCostSummary.uniqueVehicleCount}</strong></div>
            <div><span>Shared cost points</span><strong>{vehicleCostSummary.sharedCostCount}</strong></div>
            <div data-attention={vehicleCostSummary.varianceVehicleCount > 0}><span>Price differences</span><strong>{vehicleCostSummary.varianceVehicleCount}</strong></div>
          </div>
          <div className={layoutStyles.vehicleCostToolbar}>
            <div className={layoutStyles.searchField}>
              <Search size={15} />
              <Input value={vehicleCostSearch} onChange={(event) => setVehicleCostSearch(event.target.value)} placeholder="Search vehicle or template…" aria-label="Search vehicle costs" />
            </div>
            <div className={layoutStyles.sharedFilters} role="group" aria-label="Filter vehicle costs">
              {[["same", "Same-price groups"], ["all", "All price groups"], ["different", "Price differences"]].map(([value, text]) =>
                <Button key={value} size="sm" variant={vehicleCostFilter === value ? "primary" : "secondary"} onClick={() => setVehicleCostFilter(value)}>{text}</Button>
              )}
            </div>
          </div>
          <div className={layoutStyles.vehicleCostGroups}>
            {visibleVehicleCostGroups.map((group) => <section key={group.priceKey} className={layoutStyles.vehicleCostGroup} data-variance={group.hasVehiclePriceDifference}>
              <div className={layoutStyles.vehicleCostGroupHeader}>
                <strong>{formatVehicleCost(group.unitPrice)}</strong>
                <span>{group.vehicleCount} vehicle{group.vehicleCount === 1 ? "" : "s"} · {group.templateCount} quote template{group.templateCount === 1 ? "" : "s"}</span>
              </div>
              <div className={layoutStyles.vehicleCostGroupVehicles}>
                {group.vehicles.map((vehicle) => <article key={vehicle.vehicleKey} className={layoutStyles.vehicleCostVehicle}>
                  <div>
                    <strong>{vehicle.vehicleName}</strong>
                    {vehicle.hasVehiclePriceDifference ? <span className={layoutStyles.vehiclePriceWarning}>Also appears at another price</span> : null}
                  </div>
                  <div className={layoutStyles.vehicleTemplateLinks}>
                    {vehicle.templates.map((template) => <button key={`${template.templateId}-${template.itemIndex}`} type="button" onClick={() => { setSelectedId(template.templateId); setActiveTab("templates"); }}>{template.templateName}</button>)}
                  </div>
                </article>)}
              </div>
            </section>)}
            {!visibleVehicleCostGroups.length ? <div className={layoutStyles.editorEmpty}>No vehicle cost groups match this filter.</div> : null}
          </div>
        </main> : null}

        {activeTab === "shared" ? <main className={layoutStyles.sharedRatesPanel}>
          <div className={layoutStyles.sectionHeading}>
            <div><h2>Shared Rates</h2><p>Confirmed changes save immediately across linked templates.</p></div>
            <div className={layoutStyles.sharedSummary}><strong>{sharedRateSummaries.filter((summary) => summary.hasVariance).length}</strong> need attention</div>
          </div>
          {lastSharedRateUpdate ? <Alert variant="neutral" className={layoutStyles.lastApplied}>Last applied: <strong>{lastSharedRateUpdate.label}</strong> by {lastSharedRateUpdate.appliedBy} on {new Date(lastSharedRateUpdate.appliedAt).toLocaleString("en-GB")}</Alert> : null}
          <div className={layoutStyles.sharedFilters} role="group" aria-label="Filter shared rates">
            {[
              ["all", "All rates"], ["attention", "Needs attention"], ["up-to-date", "Up to date"], ["custom", "Custom lines"], ["excluded", "Excluded templates"],
            ].map(([value, text]) => <Button key={value} size="sm" variant={sharedFilter === value ? "primary" : "secondary"} onClick={() => setSharedFilter(value)}>{text}</Button>)}
          </div>
          <div className={layoutStyles.sharedRateGroups}>
            {SHARED_RATE_GROUPS.map((group) => {
              const groupSummaries = filteredSharedRateSummaries.filter((summary) => summary.group === group.id);
              if (!groupSummaries.length) return null;
              const closed = Boolean(collapsedRateGroups[group.id]);
              return <section key={group.id} className={layoutStyles.sharedRateGroup}>
                <button type="button" className={layoutStyles.sharedRateGroupHeader} aria-expanded={!closed} onClick={() => setCollapsedRateGroups((current) => ({ ...current, [group.id]: !closed }))}>
                  <span>{closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}{group.label}</span>
                  <small>{groupSummaries.length} rate{groupSummaries.length === 1 ? "" : "s"}</small>
                </button>
                {!closed ? <div className={layoutStyles.sharedRateRows}>{groupSummaries.map((summary) => {
                  const draft = globalDrafts[summary.id] || {};
                  const normalizedDraft = normalizeSharedRatePrice(draft.unitPrice ?? summary.suggestedUnitPrice);
                  const priceChanged = normalizedDraft.valid && normalizedDraft.value !== summary.suggestedUnitPrice;
                  const modeChanged = (draft.totalMode || summary.suggestedTotalMode) !== summary.suggestedTotalMode;
                  const canApply = summary.updateLineCount > 0 && (summary.hasVariance || priceChanged || modeChanged);
                  return <div key={summary.id} className={layoutStyles.sharedRateRow} data-variance={summary.hasVariance}>
                    <div className={layoutStyles.sharedRateIdentity}>
                      <strong>{summary.label}</strong>
                      <div><span>{summary.updateTemplateCount} linked</span>{summary.lockedLineCount ? <button type="button" onClick={() => setExceptionSummary(summary)}>{summary.lockedLineCount} custom</button> : null}{summary.excludedTemplateCount ? <button type="button" onClick={() => setExceptionSummary(summary)}>{summary.excludedTemplateCount} excluded</button> : null}</div>
                    </div>
                    <div className={layoutStyles.mobileField} data-label="Unit price"><Input value={draft.unitPrice ?? ""} onChange={(event) => updateGlobalDraft(summary.id, { unitPrice: event.target.value })} aria-label={`${summary.label} unit price`} /></div>
                    <div className={layoutStyles.sharedCurrentValues} data-variance={summary.hasVariance}>{summary.unitPrices.length > 1 ? `Prices: ${summary.unitPriceSummary}` : `£${summary.unitPriceSummary}`}<br />{summary.totalModes.length > 1 ? `Modes: ${summary.totalModeSummary}` : summary.totalModeSummary}</div>
                    <div className={layoutStyles.mobileField} data-label="Total mode"><Select value={draft.totalMode || summary.suggestedTotalMode || "tbc"} onChange={(event) => updateGlobalDraft(summary.id, { totalMode: event.target.value })} aria-label={`${summary.label} total mode`}><option value="auto">Auto total</option><option value="tbc">TBC</option><option value="production">Production</option><option value="foc">FOC</option><option value="discount">Discount</option></Select></div>
                    <Button size="sm" disabled={!canApply} onClick={() => requestApplyGlobalRate(summary.id)}>{canApply ? `Apply to ${summary.updateTemplateCount}` : "Up to date"}</Button>
                  </div>;
                })}</div> : null}
              </section>;
            })}
            {!filteredSharedRateSummaries.length ? <div className={layoutStyles.editorEmpty}>No shared rates match this filter.</div> : null}
          </div>
        </main> : null}

        {activeTab === "defaults" ? <main className={layoutStyles.defaultsPanel}>
          <div className={layoutStyles.sectionHeading}><div><h2>Defaults</h2><p>These values are copied into new quotes. Existing saved quotes keep their original wording.</p></div></div>
          <div className={layoutStyles.defaultsGrid}>
            <label><span>Global fallback Bickers Contact</span><Input list="default-contact-options" value={quoteDefaults.defaultBickersContact || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, defaultBickersContact: event.target.value }))} placeholder="Adam Eastall" /><datalist id="default-contact-options"><option value="Adam Eastall" /><option value="Sophie Albrow" /></datalist></label>
            <label><span>VAT text</span><Input value={quoteDefaults.vatText || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, vatText: event.target.value }))} /></label>
            <label className={layoutStyles.defaultsWide}><span>Quote footer approval text</span><Textarea rows={3} value={quoteDefaults.footerApprovalText || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, footerApprovalText: event.target.value }))} /></label>
            <label className={layoutStyles.defaultsWide}><span>Footer contact text</span><Textarea rows={3} value={quoteDefaults.footerInfoText || ""} onChange={(event) => setQuoteDefaults((current) => ({ ...current, footerInfoText: event.target.value }))} /></label>
          </div>
        </main> : null}

        <Modal open={Boolean(pendingSharedRate)} onClose={() => setPendingSharedRate(null)} title="Confirm Shared Rate update" description="This saves immediately across every linked template." size="xl" footer={<><Button variant="secondary" onClick={() => setPendingSharedRate(null)}>Cancel</Button><Button loading={saving} disabled={!pendingSharedRate?.updateLineCount} onClick={confirmApplyGlobalRate}>Apply to {pendingSharedRate?.updateTemplateCount || 0} templates</Button></>}>
          {pendingSharedRate ? <div className={layoutStyles.rateConfirmation}>
            <div className={layoutStyles.confirmStats}><div><span>Shared line</span><strong>{pendingSharedRate.label}</strong></div><div><span>New values</span><strong>{pendingSharedRate.unitPrice || "blank"} · {pendingSharedRate.totalMode}</strong></div><div><span>Will update</span><strong>{pendingSharedRate.updateLineCount} lines</strong></div><div><span>Skipped</span><strong>{pendingSharedRate.lockedLineCount + pendingSharedRate.excludedTemplateCount}</strong></div></div>
            <div className={layoutStyles.previewRows}>{pendingSharedRate.previewRows.map((row) => <div key={row.key} className={layoutStyles.previewRow}>
              <div><strong>{row.templateName}</strong><span>{row.description}</span></div>
              <div><span>{row.currentUnitPrice || "blank"} / {row.currentTotalMode}</span><strong>→ {row.newUnitPrice || "blank"} / {row.newTotalMode}</strong></div>
              <Badge variant={row.status === "Will update" ? "success" : row.status.includes("custom") ? "warning" : "danger"}>{row.status}</Badge>
            </div>)}</div>
          </div> : null}
        </Modal>

        <Modal open={Boolean(exceptionSummary)} onClose={() => setExceptionSummary(null)} title={`${exceptionSummary?.label || "Shared Rate"} exceptions`} description="Custom lines and excluded templates are deliberately skipped." size="lg" footer={<Button variant="secondary" onClick={() => setExceptionSummary(null)}>Close</Button>}>
          {exceptionSummary ? <div className={layoutStyles.exceptionList}>
            {[...exceptionSummary.lockedMatches, ...exceptionSummary.excludedMatches].map((match) => <div key={`${match.templateId}-${match.itemIndex}`}><strong>{match.templateName}</strong><span>{match.description}</span><Badge variant={match.lineLocked ? "warning" : "danger"}>{match.lineLocked ? "Custom Price" : "Template Excluded"}</Badge></div>)}
          </div> : null}
        </Modal>

        <Modal open={Boolean(pendingTab)} onClose={() => setPendingTab("")} title="Publish your changes first?" description="Shared Rates save immediately and cannot safely include unpublished template edits." footer={<><Button variant="secondary" onClick={() => setPendingTab("")}>Stay here</Button><Button variant="secondary" onClick={() => { discardChanges(); setActiveTab(pendingTab); setPendingTab(""); }}>Discard changes</Button><Button loading={saving} onClick={async () => { if (await handlePrimarySave()) { setActiveTab(pendingTab); setPendingTab(""); } }}>Save Changes</Button></>} />

        {discardedLine ? <div className={layoutStyles.undoToast} role="status"><span>Line removed</span><Button size="sm" variant="secondary" onClick={undoRemoveLine}><Undo2 size={14} /> Undo</Button></div> : null}
      </div>
    </HeaderSidebarLayout>
  );
}
