"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { Fragment, useCallback, useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import {
  Check,
  CircleMinus,
  Copy,
  FileText,
  MoreHorizontal,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  doc, getDoc,
  collection, getDocs
} from "firebase/firestore";
import { auth, db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  SINGLE_COMPANY_ID,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import {
  INVOICE_STATUSES,
  calculateInvoiceTotals,
  createInvoiceDraftFromQuote,
  duplicateInvoiceLineForEditing,
  excludeInvoiceLineForEditing,
  getInvoiceApprovalReadiness,
  getInvoiceIdentityDisplay,
  hydrateInvoiceDraftForEditing,
  invoiceLinesWithQuantity,
  parseInvoiceRecord,
  restoreInvoiceLineFromQuote,
  resolveAcceptedQuote,
  validateInvoice,
} from "../../utils/invoiceLifecycle";
import {
  createInvoiceCustomerSnapshot,
  getAccountingMappingReadiness,
} from "../../utils/accountingMappings";
import { formatVehicleList } from "@/app/utils/vehicleDisplay";
import { useVehicleLookup } from "@/app/utils/useVehicleLookup";
import {
  formatTimesheetHours,
  invoiceTimesheetRows,
} from "@/app/utils/timesheetBookingLink";
import { mergeContactFinanceProfile } from "@/app/utils/contactFinanceProfiles";

/* ───────────────────────────────────────────
   Mini design system
─────────────────────────────────────────── */
const UI = UI_TOKENS;

const pageWrap = { padding: "20px 24px 28px", background: UI.bg, minHeight: "100vh" };
const surface = { background: "var(--color-surface)", borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const section = { ...surface, padding: 14, marginBottom: UI.gap };
const sectionTitle = { fontSize: 16, fontWeight: 900, marginBottom: 8, color: UI.text };
const grid = (cols = 3) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 });
const k = { fontSize: 12, color: UI.muted, textTransform: "uppercase", fontWeight: 800, letterSpacing: ".02em" };
const v = { fontSize: 14, color: UI.text, fontWeight: 700 };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-surface-hover)", color: "var(--shell-sidebar-bg)", fontSize: 12, fontWeight: 700 };

/* ───────────────────────────────────────────
   Helpers
─────────────────────────────────────────── */
const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate(); // Firestore Timestamp
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
};

const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");
const fmtLong  = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const prettifyStatus = (raw) => {
  const s = (raw || "").toLowerCase().trim();
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  return s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC";
};

const listToString = (items, pick = (x) => x) =>
  Array.isArray(items) ? items.map(pick).filter(Boolean).join(", ") || "—" : "—";

const money = (n) =>
  n == null
    ? "—"
    : typeof n === "number"
    ? `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : n;

const normaliseDates = (job) => {
  const arr = [];
  if (Array.isArray(job?.bookingDates) && job.bookingDates.length) {
    for (const d of job.bookingDates) {
      const pd = parseDate(d);
      if (pd) arr.push(pd);
    }
  } else if (job?.date) {
    const pd = parseDate(job.date);
    if (pd) arr.push(pd);
  }
  return arr;
};

const dateRangeLabel = (job) => {
  const ds = normaliseDates(job).sort((a, b) => a - b);
  if (!ds.length) return "TBC";
  const first = ds[0], last = ds[ds.length - 1];
  return first && last ? `${fmtShort(first)} – ${fmtShort(last)}` : fmtShort(first);
};

const initialsFromName = (name) => {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
};

/* Documents (job) */
function collectJobDocuments(job) {
  if (!job) return [];
  const docs = [];
  const push = (url, name) => {
    if (!url) return;
    const u = String(url);
    const lower = u.toLowerCase();
    const kind = lower.endsWith(".pdf") ? "pdf" : lower.match(/\.(png|jpe?g|gif|webp|bmp|svg)$/) ? "image" : "file";
    docs.push({ url: u, name: name || inferName(u), kind });
  };
  const inferName = (u) => {
    try { return decodeURIComponent(new URL(u).pathname.split("/").pop() || "document"); }
    catch { return u.split("?")[0].split("/").pop() || "document"; }
  };

  // Common fields
  push(job.pdfURL || job.pdfUrl, "Attachment");
  push(job.poUrl || job.poURL, "Purchase Order");
  push(job.callSheetUrl, "Call Sheet");
  push(job.riskAssessmentUrl, "Risk Assessment");

  // Finance docs
  if (job.finance) {
    push(job.finance.invoicePdfUrl || job.finance.invoiceUrl, "Invoice");
    push(job.finance.poUrl, "Finance PO");
    if (Array.isArray(job.finance.documents)) {
      job.finance.documents.forEach((d, i) => push(d?.url || d, d?.name || `Finance Doc ${i + 1}`));
    }
  }

  // Arrays
  ["documents", "uploads", "specSheets", "attachments"].forEach((key) => {
    const arr = job[key];
    if (Array.isArray(arr)) {
      arr.forEach((d, i) => {
        if (typeof d === "string") push(d, `${key.slice(0, -1)} ${i + 1}`);
        else push(d?.url, d?.name || `${key.slice(0, -1)} ${i + 1}`);
      });
    }
  });

  // Map-like {name:url}
  if (job.docs && typeof job.docs === "object") {
    Object.entries(job.docs).forEach(([name, url]) => push(url, name));
  }

  // dedupe
  const seen = new Set();
  return docs.filter((d) => (seen.has(d.url) ? false : seen.add(d.url)));
}

/* Documents (timesheet) */
function collectTimesheetDocs(ts) {
  const out = [];
  const push = (url, name) => {
    if (!url) return;
    const u = String(url);
    const lower = u.toLowerCase();
    const kind = lower.endsWith(".pdf") ? "pdf" : lower.match(/\.(png|jpe?g|gif|webp|bmp|svg)$/) ? "image" : "file";
    out.push({ url: u, name: name || inferName(u), kind });
  };
  const inferName = (u) => {
    try { return decodeURIComponent(new URL(u).pathname.split("/").pop() || "document"); }
    catch { return u.split("?")[0].split("/").pop() || "document"; }
  };

  push(ts.pdfURL || ts.pdfUrl || ts.attachmentUrl, "Timesheet");
  if (Array.isArray(ts.attachments)) {
    ts.attachments.forEach((d, i) => push(d?.url || d, d?.name || `Attachment ${i + 1}`));
  }
  if (ts.docs && typeof ts.docs === "object") {
    Object.entries(ts.docs).forEach(([name, url]) => push(url, name));
  }

  const seen = new Set();
  return out.filter((d) => (seen.has(d.url) ? false : seen.add(d.url)));
}

const invoiceDraftSignature = (invoice = {}) => JSON.stringify({
  currency: invoice.currency || "GBP",
  customer: invoice.customer || {},
  purchaseOrderNumber: invoice.purchaseOrderNumber || "",
  paymentTermsDays: Number(invoice.paymentTermsDays ?? 30),
  lines: Array.isArray(invoice.lines) ? invoice.lines : [],
  notes: invoice.notes || "",
  internalFinanceNotes: invoice.internalFinanceNotes || "",
});

const billingAddressLines = (customer = {}) => {
  if (typeof customer.address === "string") return [customer.address].filter(Boolean);
  return [
    customer.address?.line1,
    customer.address?.line2,
    customer.address?.city,
    customer.address?.county,
    customer.address?.postcode,
    customer.billingCountry,
  ].filter(Boolean);
};

function InvoiceDrawer({ title, eyebrow, open, onClose, children, wide = false }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;
  return createPortal(
    <div className={layoutStyles.drawerLayer} role="presentation">
      <button className={layoutStyles.drawerBackdrop} type="button" aria-label={`Dismiss ${title}`} onClick={onClose} />
      <section className={`${layoutStyles.drawer} ${wide ? layoutStyles.drawerWide : ""}`} role="dialog" aria-modal="true" aria-labelledby="invoice-drawer-title">
        <header className={layoutStyles.drawerHeader}>
          <div>
            {eyebrow ? <span>{eyebrow}</span> : null}
            <h2 id="invoice-drawer-title">{title}</h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className={layoutStyles.drawerBody}>{children}</div>
      </section>
    </div>,
    document.body
  );
}

/* ───────────────────────────────────────────
   Page
─────────────────────────────────────────── */
export default function InvoiceJobPage() {
  const { id } = useParams();
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const vehicleLookup = useVehicleLookup(dataAccessState);
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [job, setJob] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [invoiceLoadError, setInvoiceLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportJob, setExportJob] = useState(null);
  const [billingCustomers, setBillingCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [activeDrawer, setActiveDrawer] = useState("");
  const [accountingFocusIndex, setAccountingFocusIndex] = useState(null);
  const [savedDraftSignature, setSavedDraftSignature] = useState("");
  const customerSelectRef = useRef(null);
  const poInputRef = useRef(null);
  const lineInputRefs = useRef(new Map());
  const lineDescriptionRefs = useRef(new Map());
  const drawerTriggerRef = useRef(null);

  const [timesheets, setTimesheets] = useState([]);
  const [tsLoading, setTsLoading] = useState(true);

  // Load job
  useEffect(() => {
    const fetchJob = async () => {
      if (!id) return;
      try {
        const ref = doc(db, "bookings", id);
        const snap = await getDoc(ref);
        const loadedJob = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setJob(loadedJob);
        if (loadedJob) {
          const invoiceSnap = await getDoc(doc(db, "invoiceQueue", id));
          if (invoiceSnap.exists() && invoiceSnap.data()?.schemaVersion) {
            const savedInvoice = invoiceSnap.data();
            const loadedInvoice = hydrateInvoiceDraftForEditing(
              parseInvoiceRecord(
                { id: invoiceSnap.id, ...savedInvoice },
                loadedJob
              )
            );
            setInvoice(loadedInvoice);
            setSavedDraftSignature(invoiceDraftSignature(loadedInvoice));
          } else {
            const acceptedQuote = resolveAcceptedQuote(loadedJob);
            if (acceptedQuote) {
              try {
                const draft = createInvoiceDraftFromQuote({ booking: loadedJob, quote: acceptedQuote });
                setInvoice(draft);
                setSavedDraftSignature("");
                setInvoiceLoadError("");
              } catch (error) {
                setInvoice(null);
                setInvoiceLoadError(error?.message || "The approved job quote could not be converted into an invoice.");
              }
            } else {
              setInvoice(null);
              setInvoiceLoadError("Save a quote for the completed job before creating its invoice.");
            }
          }
        }
      } catch (error) {
        console.error("Invoice page failed to load", error);
        setInvoice(null);
        setInvoiceLoadError(error?.message || "The invoice could not be loaded.");
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [id]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking || !gate.allowed) return;
    const loadBillingCustomers = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Finance session unavailable.");
        const [snapshot, profileResponse] = await Promise.all([
          getDocs(tenantCollectionQuery(db, "contacts", dataAccessState)),
          fetch(`/api/finance/contact-profiles?companyId=${encodeURIComponent(gate.companyId || SINGLE_COMPANY_ID)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
        ]);
        if (!profileResponse.ok) throw new Error("Customer finance profiles could not be loaded.");
        const body = await profileResponse.json();
        const profiles = new Map((body.profiles || []).map((profile) => [profile.contactId || profile.id, profile]));
        setBillingCustomers(snapshot.docs.map((item) => {
          const contact = { id: item.id, ...(item.data() || {}) };
          return mergeContactFinanceProfile(contact, profiles.get(item.id));
        }).sort((a, b) => {
          const aName = a.financeProfile?.billingLegalName || a.name || a.id;
          const bName = b.financeProfile?.billingLegalName || b.name || b.id;
          return String(aName).localeCompare(String(bName), "en-GB");
        }));
      } catch {
        setBillingCustomers([]);
      }
    };
    loadBillingCustomers();
  }, [accessKey, dataAccessState]);

  const loadExportJobStatus = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token || !id) return;
    const response = await fetch(
      `/api/integrations/sage50/export-jobs?invoiceId=${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!response.ok) return;
    const data = await response.json();
    setExportJob(Array.isArray(data.jobs) ? data.jobs[0] || null : null);
  }, [id]);

  useEffect(() => {
    if (!invoice?.bookingId) return;
    loadExportJobStatus().catch(() => {});
  }, [invoice?.bookingId, invoice?.sageSync?.status, loadExportJobStatus]);

  // Load only timesheets linked to this persisted booking identity.
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "timesheets", operation: "Load invoice timesheets" })) return;

    const fetchTimesheets = async () => {
      if (!id) return;
      setTsLoading(true);

      const results = [];
      try {
        const snapshot = await getDocs(
          tenantCollectionQuery(db, "timesheets", dataAccessState)
        );
        const allTimesheets = snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() || {}),
        }));
        results.push(...invoiceTimesheetRows(allTimesheets, id));
      } catch {}

      // Legacy booking subcollection records are inherently booking-scoped.
      try {
        const sub = await getDocs(collection(db, "bookings", id, "timesheets"));
        sub.forEach((d) => results.push({ id: d.id, ...(d.data() || {}) }));
      } catch {}

      // de-dupe by a composite key (date + employee + id)
      const key = (t) =>
        `${t.id}|${t.employeeId || t.employee || ""}|${t.date || t.workDate || ""}`;
      const seen = new Set();
      const deduped = results.filter((t) => (seen.has(key(t)) ? false : seen.add(key(t))));

      // sort by date descending
      deduped.sort((a, b) => {
        const da = parseDate(a.date || a.workDate)?.getTime() || 0;
        const db = parseDate(b.date || b.workDate)?.getTime() || 0;
        return db - da;
      });

      setTimesheets(deduped);
      setTsLoading(false);
    };

    fetchTimesheets();
  }, [accessKey, dataAccessState, id]);

  // Render helpers
  const renderDates = useMemo(() => {
    if (!job) return "—";
    if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
      return (
        <div>
          {job.bookingDates.map((d, i) => (
            <div key={i}>
              {parseDate(d)?.toLocaleDateString("en-GB", {
                weekday: "short",
                day: "2-digit",
                month: "short",
                year: "numeric",
              }) || "TBC"}
            </div>
          ))}
        </div>
      );
    }
    const one = parseDate(job?.date);
    return <div>{one ? one.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "TBC"}</div>;
  }, [job]);

  const formatNotesDateKey = (key) => {
    const d = new Date(key);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    return key;
  };

  const cleanDatesArray = (j) => {
    const arr =
      Array.isArray(j?.bookingDates) && j.bookingDates.length
        ? j.bookingDates
        : j?.date
        ? [j.date]
        : [];
    return arr
      .map((d) => parseDate(d))
      .filter(Boolean)
      .map((d) => d.toISOString());
  };

  const updateInvoiceField = (field, value) => {
    setInvoice((current) => ({ ...current, [field]: value }));
  };

  const updateInvoiceLine = (index, field, value) => {
    setInvoice((current) => {
      const lines = current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      );
      const totals = calculateInvoiceTotals(lines);
      return {
        ...current,
        lines: totals.lines,
        totals: { net: totals.net, tax: totals.tax, gross: totals.gross },
      };
    });
  };

  const selectBillingCustomer = (contactId) => {
    const contact = billingCustomers.find((item) => item.id === contactId);
    if (!contact) {
      setInvoice((current) => ({ ...current, customer: { ...current.customer, contactId: null } }));
      return;
    }
    const customer = createInvoiceCustomerSnapshot(contact, invoice.customer);
    setInvoice((current) => ({
      ...current,
      customer,
      currency: contact.financeProfile?.defaultCurrency || current.currency || "GBP",
      paymentTermsDays:
        contact.financeProfile?.defaultPaymentTerms ?? current.paymentTermsDays ?? 30,
    }));
  };

  const addInvoiceLine = () => {
    setInvoice((current) => {
      const lines = [
        ...current.lines,
        {
          id: `line-${Date.now()}`,
          sourceLineId: "",
          section: "Additional charges",
          description: "",
          quantity: 1,
          unitPrice: 0,
          taxRate: 20,
          nominalCode: "",
          taxCode: "",
          notes: "",
        },
      ];
      const totals = calculateInvoiceTotals(lines);
      return { ...current, lines: totals.lines, totals: { net: totals.net, tax: totals.tax, gross: totals.gross } };
    });
  };

  const removeInvoiceLine = (index) => {
    setInvoice((current) => {
      const lines = current.lines.filter((_, lineIndex) => lineIndex !== index);
      const totals = calculateInvoiceTotals(lines);
      return { ...current, lines: totals.lines, totals: { net: totals.net, tax: totals.tax, gross: totals.gross } };
    });
  };

  const excludeInvoiceLine = (index) => {
    setInvoice((current) => {
      const lines = excludeInvoiceLineForEditing(current.lines, index);
      const totals = calculateInvoiceTotals(lines);
      return { ...current, lines: totals.lines, totals: { net: totals.net, tax: totals.tax, gross: totals.gross } };
    });
  };

  const duplicateInvoiceLine = (index) => {
    setInvoice((current) => {
      const lines = duplicateInvoiceLineForEditing(current.lines, index);
      const totals = calculateInvoiceTotals(lines);
      return { ...current, lines: totals.lines, totals: { net: totals.net, tax: totals.tax, gross: totals.gross } };
    });
  };

  const restoreInvoiceLine = (index) => {
    setInvoice((current) => {
      const lines = restoreInvoiceLineFromQuote(
        current.lines,
        index,
        current.sourceQuote?.snapshot?.lineItems || []
      );
      const totals = calculateInvoiceTotals(lines);
      return { ...current, lines: totals.lines, totals: { net: totals.net, tax: totals.tax, gross: totals.gross } };
    });
  };

  const openDrawer = (name, trigger = null) => {
    drawerTriggerRef.current = trigger || document.activeElement;
    setActiveDrawer(name);
  };

  const closeDrawer = useCallback(() => {
    setActiveDrawer("");
    setAccountingFocusIndex(null);
    requestAnimationFrame(() => drawerTriggerRef.current?.focus?.());
  }, []);

  useEffect(() => {
    if (activeDrawer !== "accounting" || accountingFocusIndex == null) return;
    requestAnimationFrame(() => {
      const nominal = lineInputRefs.current.get(`${accountingFocusIndex}:nominalCode`);
      const tax = lineInputRefs.current.get(`${accountingFocusIndex}:taxCode`);
      (nominal && !nominal.value ? nominal : tax || nominal)?.focus();
    });
  }, [accountingFocusIndex, activeDrawer]);

  const persistInvoice = async (nextInvoice, successMessage) => {
    const errors = validateInvoice(nextInvoice);
    if (errors.length) {
      systemDialogs.showSystemNotification(errors.join("\n"));
      return false;
    }
    setSaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again before saving this invoice.");
      const response = await fetch(`/api/invoices/${encodeURIComponent(id)}/lifecycle`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "save_draft",
          expectedUpdatedAt: invoice.updatedAt || "",
          invoice: {
            ...nextInvoice,
            draftReference: invoice.draftReference,
            invoiceNumber: nextInvoice.invoiceNumber || null,
            dates: cleanDatesArray(job),
            client: nextInvoice.customer?.name || job?.client || "",
            location: job?.location || "",
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.invoice) {
        throw new Error(data.error || "Invoice draft could not be saved.");
      }
      const payload = hydrateInvoiceDraftForEditing(
        parseInvoiceRecord(data.invoice, job)
      );
      setInvoice(payload);
      setSavedDraftSignature(invoiceDraftSignature(payload));
      if (successMessage) systemDialogs.showSystemNotification(successMessage);
      return payload;
    } catch (e) {
      systemDialogs.showSystemNotification("Failed to save invoice: " + (e?.message || e));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    const totals = calculateInvoiceTotals(
      invoiceLinesWithQuantity(invoice.lines)
    );
    return persistInvoice(
      { ...invoice, lines: totals.lines, totals: { net: totals.net, tax: totals.tax, gross: totals.gross } },
      "Invoice draft saved."
    );
  };

  const openInvoiceDocument = async (action = "view") => {
    const printableLines = invoiceLinesWithQuantity(invoice.lines);
    const totals = calculateInvoiceTotals(printableLines);
    const currentInvoice = {
      ...invoice,
      lines: totals.lines,
      totals: { net: totals.net, tax: totals.tax, gross: totals.gross },
    };
    const saved =
      invoice.status === INVOICE_STATUSES.DRAFT
        ? await persistInvoice(currentInvoice, "")
        : invoice;
    if (saved) {
      router.push(`/invoice-view/${id}${action === "download" ? "?action=download" : ""}`);
    }
  };

  const runLifecycleAction = async (action) => {
    try {
      setSaving(true);
      let currentInvoice = invoice;
      if (action === "approve" && invoice.status === INVOICE_STATUSES.DRAFT) {
        const saved = await saveDraft();
        if (!saved) return;
        currentInvoice = saved;
      }
      const needsReason = ["return_to_draft", "void"].includes(action);
      const reason = needsReason
        ? await systemDialogs.promptSystem(
            action === "void"
              ? "Reason for voiding this invoice:"
              : "Reason for returning this invoice to draft:",
            ""
          ) || ""
        : "";
      if (needsReason && !reason.trim()) return;
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again before changing invoice status.");
      const response = await fetch(`/api/invoices/${encodeURIComponent(id)}/lifecycle`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          reason,
          expectedUpdatedAt: currentInvoice.updatedAt || "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.invoice) {
        throw new Error(data.error || "Invoice lifecycle action failed.");
      }
      setInvoice(parseInvoiceRecord(data.invoice, job));
      systemDialogs.showSystemNotification(
        action === "approve"
          ? "Invoice approved."
          : action === "return_to_draft"
          ? "Invoice returned to draft."
          : action === "prepare_for_export"
          ? "Invoice prepared for accounting export."
          : "Invoice voided."
      );
    } catch (error) {
      systemDialogs.showSystemNotification(error?.message || String(error));
    } finally {
      setSaving(false);
    }
  };

  const queueSage50Export = async () => {
    try {
      setSaving(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again before queueing this invoice.");
      const response = await fetch("/api/integrations/sage50/export-jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoiceId: id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.job) throw new Error(data.error || "Invoice could not be queued.");
      setExportJob(data.job);
      systemDialogs.showSystemNotification(data.created ? "Invoice queued for the Sage 50 connector." : "This invoice is already queued.");
    } catch (error) {
      systemDialogs.showSystemNotification(error?.message || String(error));
    } finally {
      setSaving(false);
    }
  };

  const reconcileSage50Export = async () => {
    if (!exportJob?.queueJobId) return;
    try {
      setSaving(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again before reconciling this invoice.");
      const response = await fetch(
        `/api/integrations/sage50/export-jobs/${encodeURIComponent(exportJob.queueJobId)}/reconcile`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.invoice) {
        throw new Error(data.error || "Sage 50 result could not be reconciled.");
      }
      setInvoice(parseInvoiceRecord(data.invoice, job));
      await loadExportJobStatus();
      systemDialogs.showSystemNotification(data.idempotent ? "Invoice was already reconciled." : "Invoice issued from the confirmed Sage 50 result.");
    } catch (error) {
      systemDialogs.showSystemNotification(error?.message || String(error));
    } finally {
      setSaving(false);
    }
  };

  const sendIssuedInvoice = async () => {
    const recipient = String(invoice.issuedSnapshot?.customer?.email || "").trim();
    if (!recipient) {
      systemDialogs.showSystemNotification("The issued customer snapshot does not contain an accounts-payable email.");
      return;
    }
    if (
      !await systemDialogs.confirmSystem(
        `${invoice.delivery?.status === "failed" ? "Retry delivery" : "Send invoice"} ${invoice.invoiceNumber} to ${recipient}?`
      )
    ) return;
    try {
      setSaving(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again before sending this invoice.");
      const response = await fetch(`/api/invoices/${encodeURIComponent(id)}/delivery`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.delivery) {
        throw new Error(data.error || "Invoice delivery failed.");
      }
      setInvoice((current) => ({ ...current, delivery: data.delivery }));
      systemDialogs.showSystemNotification(data.idempotent ? "This invoice was already delivered." : "Issued invoice sent.");
    } catch (error) {
      systemDialogs.showSystemNotification(error?.message || String(error));
      const invoiceSnap = await getDoc(doc(db, "invoiceQueue", id)).catch(() => null);
      if (invoiceSnap?.exists()) {
        setInvoice(parseInvoiceRecord({ id: invoiceSnap.id, ...invoiceSnap.data() }, job));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}><div className={layoutStyles.extracted1}>Loading…</div></div>
      </HeaderSidebarLayout>
    );
  }
  if (!job) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}><div className={layoutStyles.extracted2}>Job not found.</div></div>
      </HeaderSidebarLayout>
    );
  }
  if (!invoice) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={section}>
            <div style={sectionTitle}>Invoice cannot be created yet</div>
            <p style={{ color: UI.muted }}>
              {invoiceLoadError || "Save the approved job quote first. It becomes the immutable source for the invoice draft."}
            </p>
            <button onClick={() => router.push(`/quote/${id}`)}>Open quotes</button>
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  const invoiceIdentity = getInvoiceIdentityDisplay(invoice);
  const accountingReadiness = getAccountingMappingReadiness(invoice);
  const approvalReadiness = getInvoiceApprovalReadiness(invoice);
  const isDraft = invoice.status === INVOICE_STATUSES.DRAFT;
  const isDirty = isDraft && invoiceDraftSignature(invoice) !== savedDraftSignature;
  const indexedInvoiceLines = invoice.lines.map((line, index) => ({ line, index }));
  const activeLines = indexedInvoiceLines.filter(({ line }) => Number(line.quantity || 0) > 0 || !line.sourceLineId);
  const excludedLines = indexedInvoiceLines.filter(({ line }) => Boolean(line.sourceLineId) && Number(line.quantity || 0) <= 0);
  const jobDocs = collectJobDocuments(job);
  const employees = listToString(job.employees, (employee) =>
    typeof employee === "string" ? employee : employee?.name || employee?.displayName || employee?.email
  );
  const vehicles = formatVehicleList(job.vehicles, vehicleLookup) || "—";
  const equipment = listToString(job.equipment, (item) =>
    typeof item === "string" ? item : item?.name || item?.serial || item?.assetNumber
  );
  const customerBlockerCodes = new Set([
    "customer_contact_missing",
    "sage_customer_missing",
    "sage_customer_mapping_unconfirmed",
    "billing_legal_name_missing",
    "billing_country_missing",
  ]);
  const customerBlockers = approvalReadiness.blockers.filter((blocker) => customerBlockerCodes.has(blocker.code));
  const poBlocker = approvalReadiness.blockers.find((blocker) => blocker.code === "purchase_order_missing");
  const accountingBlockers = approvalReadiness.blockers.filter((blocker) => ["nominal_code_missing", "tax_code_missing"].includes(blocker.code));
  const activeLineIndexesMissingAccounting = [...new Set(accountingBlockers.map((blocker) => blocker.line - 1))];
  const lineValidationBlocker = approvalReadiness.blockers.find((blocker) =>
    blocker.code === "invoice_lines_missing" ||
    (!["nominal_code_missing", "tax_code_missing"].includes(blocker.code) && /line \d+/i.test(blocker.message))
  );
  const filteredBillingCustomers = billingCustomers.filter((contact) => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      contact.financeProfile?.billingLegalName,
      contact.financeProfile?.billingTradingName,
      contact.name,
      contact.email,
      contact.id,
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
  const addressLines = billingAddressLines(invoice.customer);
  const quoteLines = Array.isArray(invoice.sourceQuote?.snapshot?.lineItems)
    ? invoice.sourceQuote.snapshot.lineItems
    : [];

  const focusReadinessBlocker = (blocker) => {
    if (!blocker) return;
    if (blocker.code === "purchase_order_missing") {
      poInputRef.current?.focus();
      return;
    }
    if (customerBlockerCodes.has(blocker.code)) {
      customerSelectRef.current?.focus();
      return;
    }
    if (["nominal_code_missing", "tax_code_missing"].includes(blocker.code)) {
      setAccountingFocusIndex(blocker.line - 1);
      openDrawer("accounting");
      return;
    }
    const lineMatch = blocker.message?.match(/Line (\d+)/i);
    if (lineMatch) {
      lineDescriptionRefs.current.get(Number(lineMatch[1]) - 1)?.focus();
    }
  };

  const tsEmployee = (timesheet) =>
    timesheet.employeeName ||
    (typeof timesheet.employee === "string"
      ? timesheet.employee
      : timesheet.employee?.name || timesheet.employee?.displayName || timesheet.employee?.email) ||
    initialsFromName(timesheet.employee) ||
    "—";
  const tsHours = (timesheet) => ({
    base: formatTimesheetHours(timesheet.hours ?? timesheet.totalHours ?? 0),
    ot: formatTimesheetHours(timesheet.overtimeHours ?? timesheet.otHours ?? 0),
  });

  return (
    <HeaderSidebarLayout>
      <div className={layoutStyles.pageWrap}>
        <section className={layoutStyles.invoiceWorkspace}>
          <header className={layoutStyles.builderToolbar}>
            <div className={layoutStyles.invoiceBuilderIdentity}>
              <button type="button" onClick={() => router.push(`/job-summary/${id}`)}>← Finance</button>
              <div>
                <span className={layoutStyles.invoiceWorkspaceEyebrow}>Invoice builder</span>
                <h1 className={layoutStyles.invoiceWorkspaceTitle}>{invoiceIdentity.draftReference} · Job #{job.jobNumber || job.id}</h1>
                <p>{invoice.customer?.name || job.client || "Customer"}</p>
              </div>
            </div>
            <div className={layoutStyles.invoiceHeaderActions}>
              <span className={`${layoutStyles.saveState} ${isDirty ? layoutStyles.unsavedState : ""}`}>
                {saving ? "Saving…" : isDirty ? "Unsaved changes" : invoice.updatedAt ? `Saved ${fmtLong(parseDate(invoice.updatedAt))}` : "Not saved"}
              </span>
              <span className={layoutStyles.statusChip}>{prettifyStatus(invoice.status)}</span>
              <button type="button" onClick={() => openInvoiceDocument("view")} disabled={saving}>Preview invoice</button>
              {isDraft ? (
                <>
                  <button type="button" onClick={saveDraft} disabled={saving || !isDirty}>{saving ? "Saving…" : "Save draft"}</button>
                  <button
                    type="button"
                    className={layoutStyles.primaryAction}
                    onClick={() => runLifecycleAction("approve")}
                    disabled={saving || !approvalReadiness.ready}
                    title={approvalReadiness.ready ? "Approve invoice" : approvalReadiness.blockers.map((blocker) => blocker.message).join("\n")}
                  >Approve invoice</button>
                  <details className={layoutStyles.moreActions}>
                    <summary>More actions</summary>
                    <div>
                      <button type="button" onClick={() => openInvoiceDocument("download")} disabled={saving}>Save PDF</button>
                      <button type="button" className={layoutStyles.dangerAction} onClick={() => runLifecycleAction("void")} disabled={saving}>Void invoice</button>
                    </div>
                  </details>
                </>
              ) : null}
              {invoice.status === INVOICE_STATUSES.APPROVED ? (
                <>
                  <button type="button" onClick={() => runLifecycleAction("return_to_draft")} disabled={saving}>Return to draft</button>
                  <button type="button" className={layoutStyles.primaryAction} onClick={() => runLifecycleAction("prepare_for_export")} disabled={saving || invoice.sageSync?.status === "pending"}>Prepare for export</button>
                  {invoice.sageSync?.status === "pending" ? (
                    <button type="button" onClick={queueSage50Export} disabled={saving || ["claimed", "processing", "succeeded"].includes(exportJob?.status)}>
                      {exportJob ? `Sage queue: ${exportJob.status}` : "Queue for Sage 50"}
                    </button>
                  ) : null}
                  {exportJob?.status === "succeeded" && !exportJob.invoiceReconciled ? <button type="button" onClick={reconcileSage50Export} disabled={saving}>Reconcile Sage result</button> : null}
                  <details className={layoutStyles.moreActions}>
                    <summary>More actions</summary>
                    <div>
                      <button type="button" onClick={() => openInvoiceDocument("download")} disabled={saving}>Save PDF</button>
                      <button type="button" className={layoutStyles.dangerAction} onClick={() => runLifecycleAction("void")} disabled={saving}>Void invoice</button>
                    </div>
                  </details>
                </>
              ) : null}
              {invoice.status === INVOICE_STATUSES.ISSUED ? (
                <button type="button" className={layoutStyles.primaryAction} onClick={sendIssuedInvoice} disabled={saving || ["sending", "sent"].includes(invoice.delivery?.status)}>
                  {invoice.delivery?.status === "sent" ? "Invoice sent" : invoice.delivery?.status === "sending" ? "Sending…" : invoice.delivery?.status === "failed" ? "Retry sending invoice" : "Send invoice"}
                </button>
              ) : null}
            </div>
          </header>

          {invoice.delivery?.status === "failed" ? (
            <div className={layoutStyles.deliveryError} role="alert">
              <strong>Delivery error</strong>
              <span>{invoice.delivery?.error?.message || "Invoice delivery failed. Retry when ready."}</span>
            </div>
          ) : null}

          <div className={layoutStyles.builderGrid}>
            <main className={layoutStyles.builderMain}>
              <section className={layoutStyles.formCard} aria-labelledby="invoice-details-heading">
                <div className={layoutStyles.cardHeader}>
                  <div><span>Billing</span><h2 id="invoice-details-heading">Invoice details</h2></div>
                  <span className={layoutStyles.sourceBadge}>From quote {invoice.sourceQuote?.quoteNumber || "—"}</span>
                </div>
                <div className={layoutStyles.customerGrid}>
                  <div className={layoutStyles.customerSelector}>
                    <label htmlFor="billing-customer-search">Billing customer</label>
                    <div className={layoutStyles.searchField}><Search size={15} aria-hidden="true" /><input id="billing-customer-search" value={customerSearch} disabled={!isDraft} placeholder="Search saved customers…" onChange={(event) => setCustomerSearch(event.target.value)} /></div>
                    <select ref={customerSelectRef} aria-label="Billing customer" value={invoice.customer?.contactId || ""} disabled={!isDraft} onChange={(event) => selectBillingCustomer(event.target.value)}>
                      <option value="">Select saved customer…</option>
                      {filteredBillingCustomers.map((contact) => <option key={contact.id} value={contact.id}>{contact.financeProfile?.billingLegalName || contact.name || contact.id}</option>)}
                    </select>
                  </div>
                  <div className={layoutStyles.billingSnapshot}>
                    <span>Billing snapshot</span>
                    <strong>{invoice.customer?.name || "No billing customer selected"}</strong>
                    {invoice.customer?.contactName ? <p>{invoice.customer.contactName}</p> : null}
                    {addressLines.length ? <p>{addressLines.join(" · ")}</p> : <p>Billing address not recorded</p>}
                    {invoice.customer?.email ? <p>{invoice.customer.email}</p> : null}
                    <div className={layoutStyles.snapshotMeta}><span>Sage: {invoice.customer?.sageCustomerId || "Not mapped"}</span><span>PO: {invoice.customer?.poRequirement === "required" ? "Required" : "Optional"}</span></div>
                  </div>
                </div>
                <div className={layoutStyles.detailFields}>
                  <label><span>PO number {invoice.customer?.poRequirement === "required" ? "*" : ""}</span><input ref={poInputRef} value={invoice.purchaseOrderNumber || ""} disabled={!isDraft} placeholder={invoice.customer?.poRequirement === "required" ? "Required by customer" : "Optional"} onChange={(event) => updateInvoiceField("purchaseOrderNumber", event.target.value)} /></label>
                  <label><span>Payment terms</span><div className={layoutStyles.termsInput}><input type="number" min="0" value={invoice.paymentTermsDays ?? 30} disabled={!isDraft} onChange={(event) => updateInvoiceField("paymentTermsDays", Number(event.target.value))} /><span>days</span></div></label>
                  <div className={layoutStyles.readOnlyField}><span>Invoice date</span><strong>{invoice.issueDate ? fmtLong(parseDate(invoice.issueDate)) : "Assigned when issued by Sage"}</strong></div>
                  <div className={layoutStyles.readOnlyField}><span>Official number</span><strong>{invoiceIdentity.officialNumber === "Pending" ? "Assigned by Sage" : invoiceIdentity.officialNumber}</strong></div>
                </div>
              </section>

              <section className={layoutStyles.formCard} aria-labelledby="invoice-lines-heading">
                <div className={layoutStyles.cardHeader}>
                  <div><span>Charges</span><h2 id="invoice-lines-heading">Invoice lines</h2></div>
                  <div className={layoutStyles.cardHeaderActions}>
                    <button type="button" onClick={(event) => openDrawer("accounting", event.currentTarget)}><Settings2 size={15} aria-hidden="true" /> Accounting details</button>
                    {excludedLines.length ? <button type="button" onClick={(event) => openDrawer("excluded", event.currentTarget)}>Excluded items ({excludedLines.length})</button> : null}
                  </div>
                </div>
                <div className={layoutStyles.simpleTableWrap}>
                  <table className={layoutStyles.simpleInvoiceTable}>
                    <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>VAT</th><th>Total</th><th><span className={layoutStyles.srOnly}>Actions</span></th></tr></thead>
                    <tbody>
                      {activeLines.map(({ line, index }, activeIndex) => {
                        const sectionName = String(line.section || "").trim();
                        const previousSection = activeIndex > 0 ? String(activeLines[activeIndex - 1].line.section || "").trim() : "";
                        const presetTax = [0, 5, 20].includes(Number(line.taxRate)) ? String(Number(line.taxRate)) : "custom";
                        return (
                          <Fragment key={line.id}>
                            {sectionName && sectionName !== previousSection ? <tr className={layoutStyles.invoiceSectionRow}><td colSpan={6}>{sectionName}</td></tr> : null}
                            <tr className={layoutStyles.invoiceLineRow}>
                              <td data-label="Description"><input ref={(node) => node ? lineDescriptionRefs.current.set(index, node) : lineDescriptionRefs.current.delete(index)} className={layoutStyles.descriptionInput} aria-label={`Line ${index + 1} description`} value={line.description} disabled={!isDraft} onChange={(event) => updateInvoiceLine(index, "description", event.target.value)} />{line.notes ? <small>{line.notes}</small> : null}</td>
                              <td data-label="Qty"><input className={layoutStyles.numberInput} aria-label={`Line ${index + 1} quantity`} type="number" min="0" step="0.01" value={line.quantity} disabled={!isDraft} onChange={(event) => updateInvoiceLine(index, "quantity", event.target.value)} /></td>
                              <td data-label="Unit price"><input className={layoutStyles.numberInput} type="number" step="0.01" value={line.unitPrice} aria-label={`Line ${index + 1} unit price in pounds`} disabled={!isDraft} onChange={(event) => updateInvoiceLine(index, "unitPrice", event.target.value)} /></td>
                              <td data-label="VAT"><div className={layoutStyles.vatControl}><select aria-label={`Line ${index + 1} VAT rate`} value={presetTax} disabled={!isDraft} onChange={(event) => event.target.value !== "custom" && updateInvoiceLine(index, "taxRate", Number(event.target.value))}><option value="20">20%</option><option value="5">5%</option><option value="0">0%</option><option value="custom">Custom</option></select>{presetTax === "custom" ? <input className={layoutStyles.numberInput} aria-label={`Line ${index + 1} custom VAT rate`} type="number" min="0" step="0.01" value={line.taxRate} disabled={!isDraft} onChange={(event) => updateInvoiceLine(index, "taxRate", event.target.value)} /> : null}</div></td>
                              <td data-label="Total" className={layoutStyles.grossCell}>{money(line.gross)}</td>
                              <td className={layoutStyles.actionCell}>
                                <details className={layoutStyles.rowActions}><summary aria-label={`Actions for line ${index + 1}`}><MoreHorizontal size={18} aria-hidden="true" /></summary><div>
                                  <button type="button" disabled={!isDraft} onClick={() => duplicateInvoiceLine(index)}><Copy size={14} aria-hidden="true" /> Duplicate</button>
                                  <button type="button" onClick={(event) => { setAccountingFocusIndex(index); openDrawer("accounting", event.currentTarget); }}><Settings2 size={14} aria-hidden="true" /> Accounting</button>
                                  {line.sourceLineId ? <button type="button" disabled={!isDraft} onClick={() => excludeInvoiceLine(index)}><CircleMinus size={14} aria-hidden="true" /> Exclude</button> : <button type="button" disabled={!isDraft || activeLines.length === 1} onClick={() => removeInvoiceLine(index)}><Trash2 size={14} aria-hidden="true" /> Delete</button>}
                                </div></details>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className={layoutStyles.linesFooter}>{isDraft ? <button type="button" className={layoutStyles.addLineButton} onClick={addInvoiceLine}>+ Add invoice line</button> : <span>Invoice lines are locked.</span>}<span>{activeLines.length} active line{activeLines.length === 1 ? "" : "s"}</span></div>
              </section>

              <section className={layoutStyles.formCard} aria-labelledby="invoice-notes-heading">
                <div className={layoutStyles.cardHeader}><div><span>Notes</span><h2 id="invoice-notes-heading">Invoice notes</h2></div></div>
                <div className={layoutStyles.notesGrid}>
                  <label><span>Customer-facing invoice note</span><small>Shown on the invoice preview and issued PDF.</small><textarea value={invoice.notes || ""} disabled={!isDraft} placeholder="Payment details or invoice notes…" onChange={(event) => updateInvoiceField("notes", event.target.value)} /></label>
                  <label><span>Internal finance note</span><small>Visible to finance staff only. Never included on the customer invoice.</small><textarea value={invoice.internalFinanceNotes || ""} disabled={!isDraft} placeholder="Internal approval or accounting context…" onChange={(event) => updateInvoiceField("internalFinanceNotes", event.target.value)} /></label>
                </div>
              </section>

              <section className={layoutStyles.evidenceBar} aria-label="Supporting evidence">
                <div><span>Supporting evidence</span><strong>Review without leaving the invoice</strong></div>
                <div>
                  <button type="button" onClick={(event) => openDrawer("quote", event.currentTarget)}><FileText size={15} aria-hidden="true" /> Accepted quote</button>
                  <button type="button" onClick={(event) => openDrawer("timesheets", event.currentTarget)}>Timesheets ({tsLoading ? "…" : timesheets.length})</button>
                  <button type="button" onClick={(event) => openDrawer("documents", event.currentTarget)}>Job documents ({jobDocs.length})</button>
                </div>
              </section>
            </main>

            <aside className={layoutStyles.reviewSidebar} aria-label="Invoice review">
              <section className={layoutStyles.reviewCard}>
                <span className={layoutStyles.reviewEyebrow}>Invoice summary</span>
                <div className={layoutStyles.reviewTotals}><div><span>Net</span><strong>{money(invoice.totals?.net)}</strong></div><div><span>VAT</span><strong>{money(invoice.totals?.tax)}</strong></div><div><span>Total due</span><strong>{money(invoice.totals?.gross)}</strong></div></div>
                <p className={layoutStyles.dueHint}>{invoice.issueDate ? `Due ${fmtLong(new Date(parseDate(invoice.issueDate).getTime() + Number(invoice.paymentTermsDays || 30) * 86400000))}` : `Due ${Number(invoice.paymentTermsDays || 30)} days after Sage issues the invoice.`}</p>
              </section>
              <section className={layoutStyles.reviewCard}>
                <div className={layoutStyles.readinessHeader}><div><span className={layoutStyles.reviewEyebrow}>Approval</span><h2>{approvalReadiness.ready ? "Ready to approve" : "Action needed"}</h2></div><span className={`${layoutStyles.readinessCount} ${approvalReadiness.ready ? layoutStyles.readyCount : ""}`}>{approvalReadiness.ready ? "Ready" : `${approvalReadiness.blockers.length} outstanding`}</span></div>
                <div className={layoutStyles.checklist}>
                  <button type="button" className={!customerBlockers.length ? layoutStyles.checkComplete : ""} onClick={() => customerBlockers.length && focusReadinessBlocker(customerBlockers[0])}><span>{!customerBlockers.length ? <Check size={14} /> : "!"}</span><div><strong>Billing customer</strong><small>{!customerBlockers.length ? "Customer and Sage mapping complete" : customerBlockers[0].message}</small></div></button>
                  <button type="button" className={!poBlocker ? layoutStyles.checkComplete : ""} onClick={() => poBlocker && focusReadinessBlocker(poBlocker)}><span>{!poBlocker ? <Check size={14} /> : "!"}</span><div><strong>Purchase order</strong><small>{poBlocker ? poBlocker.message : invoice.purchaseOrderNumber ? `PO ${invoice.purchaseOrderNumber}` : "Optional for this customer"}</small></div></button>
                  <button type="button" className={!lineValidationBlocker ? layoutStyles.checkComplete : ""} onClick={() => lineValidationBlocker && focusReadinessBlocker(lineValidationBlocker)}><span>{!lineValidationBlocker ? <Check size={14} /> : "!"}</span><div><strong>Invoice lines</strong><small>{lineValidationBlocker?.message || `${activeLines.length} active line${activeLines.length === 1 ? "" : "s"}`}</small></div></button>
                  <button type="button" className={!accountingBlockers.length ? layoutStyles.checkComplete : ""} onClick={(event) => { setAccountingFocusIndex(activeLineIndexesMissingAccounting[0] ?? null); openDrawer("accounting", event.currentTarget); }}><span>{!accountingBlockers.length ? <Check size={14} /> : "!"}</span><div><strong>Accounting mapping</strong><small>{accountingBlockers.length ? `${activeLineIndexesMissingAccounting.length} line${activeLineIndexesMissingAccounting.length === 1 ? "" : "s"} need codes` : "All active lines mapped"}</small></div></button>
                </div>
              </section>
              <section className={layoutStyles.reviewCard}>
                <button type="button" className={layoutStyles.accountingButton} onClick={(event) => openDrawer("accounting", event.currentTarget)}><Settings2 size={16} aria-hidden="true" /><span><strong>Accounting details</strong><small>{accountingReadiness.ready ? "Mappings complete" : `${accountingReadiness.blockers.length} fields outstanding`}</small></span><span>›</span></button>
              </section>
              <details className={layoutStyles.jobReference}>
                <summary><span>Job reference</span><strong>#{job.jobNumber || job.id}</strong></summary>
                <dl><div><dt>Status</dt><dd>{prettifyStatus(job.status)}</dd></div><div><dt>Location</dt><dd>{job.location || "—"}</dd></div><div><dt>Dates</dt><dd>{dateRangeLabel(job)}</dd></div><div><dt>Crew</dt><dd>{employees}</dd></div><div><dt>Vehicles</dt><dd>{vehicles}</dd></div><div><dt>Equipment</dt><dd>{equipment === "—" ? "None recorded" : equipment}</dd></div></dl>
                {job?.notesByDate && typeof job.notesByDate === "object" ? <ul className={layoutStyles.builderDayNotes}>{Object.entries(job.notesByDate).filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort(([a], [b]) => a.localeCompare(b)).map(([date, note]) => <li key={date}><strong>{formatNotesDateKey(date)}</strong><span>{String(note || "No note")}</span></li>)}</ul> : null}
              </details>
            </aside>
          </div>
        </section>

        <InvoiceDrawer title="Accounting details" eyebrow="Active invoice lines" open={activeDrawer === "accounting"} onClose={closeDrawer} wide>
          <p className={layoutStyles.drawerIntro}>Nominal and Sage tax codes are required for every active invoice line before approval.</p>
          <div className={layoutStyles.accountingList}>{activeLines.map(({ line, index }) => <section key={line.id} className={layoutStyles.accountingRow}><div><span>Line {index + 1}{line.section ? ` · ${line.section}` : ""}</span><strong>{line.description || "Untitled invoice line"}</strong><small>{money(line.net)} net · VAT {Number(line.taxRate)}%</small></div><label><span>Nominal code</span><input ref={(node) => node ? lineInputRefs.current.set(`${index}:nominalCode`, node) : lineInputRefs.current.delete(`${index}:nominalCode`)} value={line.nominalCode || ""} disabled={!isDraft} placeholder="e.g. 4000" onChange={(event) => updateInvoiceLine(index, "nominalCode", event.target.value)} /></label><label><span>Sage tax code</span><input ref={(node) => node ? lineInputRefs.current.set(`${index}:taxCode`, node) : lineInputRefs.current.delete(`${index}:taxCode`)} value={line.taxCode || ""} disabled={!isDraft} placeholder="e.g. T1" onChange={(event) => updateInvoiceLine(index, "taxCode", event.target.value)} /></label></section>)}</div>
        </InvoiceDrawer>

        <InvoiceDrawer title={`Excluded items (${excludedLines.length})`} eyebrow="Accepted quote" open={activeDrawer === "excluded"} onClose={closeDrawer}>
          {excludedLines.length ? <div className={layoutStyles.drawerList}>{excludedLines.map(({ line, index }) => <div key={line.id} className={layoutStyles.drawerListItem}><div><span>{line.section || "Quoted item"}</span><strong>{line.description}</strong></div><button type="button" disabled={!isDraft} onClick={() => restoreInvoiceLine(index)}><RotateCcw size={14} aria-hidden="true" /> Restore</button></div>)}</div> : <p className={layoutStyles.emptyState}>No quoted lines are excluded.</p>}
        </InvoiceDrawer>

        <InvoiceDrawer title="Accepted quote" eyebrow={invoice.sourceQuote?.quoteNumber || "Quote snapshot"} open={activeDrawer === "quote"} onClose={closeDrawer} wide>
          <div className={layoutStyles.quoteSummary}><div><span>Quote number</span><strong>{invoice.sourceQuote?.quoteNumber || "—"}</strong></div><div><span>Accepted</span><strong>{fmtLong(parseDate(invoice.sourceQuote?.acceptedAt))}</strong></div><div><span>Saved</span><strong>{fmtLong(parseDate(invoice.sourceQuote?.savedAt))}</strong></div><div><span>Quoted subtotal</span><strong>{money(invoice.sourceQuote?.snapshot?.subtotal)}</strong></div></div>
          {invoice.sourceQuote?.snapshot?.notes ? <div className={layoutStyles.quoteNotes}><span>Quote notes</span><p>{invoice.sourceQuote.snapshot.notes}</p></div> : null}
          <div className={layoutStyles.drawerTableWrap}><table className={layoutStyles.drawerTable}><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>{quoteLines.map((line, index) => <tr key={line.id || index}><td>{line.description || "—"}</td><td>{line.qty ?? line.quantity ?? "—"}</td><td>{money(line.unitPrice)}</td></tr>)}</tbody></table></div>
        </InvoiceDrawer>

        <InvoiceDrawer title={`Timesheets (${timesheets.length})`} eyebrow={`Job #${job.jobNumber || job.id}`} open={activeDrawer === "timesheets"} onClose={closeDrawer} wide>
          {tsLoading ? <p className={layoutStyles.emptyState}>Loading timesheets…</p> : timesheets.length ? <div className={layoutStyles.timesheetList}>{timesheets.map((timesheet) => { const hours = tsHours(timesheet); const docs = collectTimesheetDocs(timesheet); return <section key={timesheet.id} className={layoutStyles.timesheetCard}><div><span>{fmtLong(parseDate(timesheet.date || timesheet.workDate))}</span><strong>{tsEmployee(timesheet)}</strong><small>{prettifyStatus(timesheet.status || timesheet.approvalStatus || "—")}</small></div><dl><div><dt>Hours</dt><dd>{hours.base}</dd></div><div><dt>OT</dt><dd>{hours.ot}</dd></div></dl>{timesheet.notes ? <p>{timesheet.notes}</p> : null}{docs.length ? <div className={layoutStyles.fileLinks}>{docs.map((document) => <a key={document.url} href={document.url} target="_blank" rel="noreferrer">{document.name}</a>)}</div> : <small>No attachments</small>}</section>; })}</div> : <p className={layoutStyles.emptyState}>No timesheets found for this job.</p>}
        </InvoiceDrawer>

        <InvoiceDrawer title={`Job documents (${jobDocs.length})`} eyebrow={`Job #${job.jobNumber || job.id}`} open={activeDrawer === "documents"} onClose={closeDrawer}>
          {jobDocs.length ? <div className={layoutStyles.drawerList}>{jobDocs.map((document) => <div key={document.url} className={layoutStyles.drawerListItem}><div><span>{prettifyStatus(document.kind)}</span><strong>{document.name}</strong></div><a href={document.url} target="_blank" rel="noreferrer">Open</a></div>)}</div> : <p className={layoutStyles.emptyState}>No documents found on this job.</p>}
        </InvoiceDrawer>
      </div>
    </HeaderSidebarLayout>
  );
}
