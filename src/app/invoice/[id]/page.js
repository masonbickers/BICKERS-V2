"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { Fragment, useCallback, useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
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
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import {
  INVOICE_STATUSES,
  calculateInvoiceTotals,
  createInvoiceDraftFromQuote,
  getSageReadiness,
  getInvoiceIdentityDisplay,
  hydrateInvoiceDraftForEditing,
  invoiceLinesWithQuantity,
  parseInvoiceRecord,
  resolveAcceptedQuote,
  validateInvoice,
} from "../../utils/invoiceLifecycle";
import {
  createInvoiceCustomerSnapshot,
  getAccountingMappingReadiness,
} from "../../utils/accountingMappings";
import { formatVehicleList } from "@/app/utils/vehicleDisplay";
import { useVehicleLookup } from "@/app/utils/useVehicleLookup";
import { invoiceTimesheetRows } from "@/app/utils/timesheetBookingLink";

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
            setInvoice(
              hydrateInvoiceDraftForEditing(
                parseInvoiceRecord(
                  { id: invoiceSnap.id, ...savedInvoice },
                  loadedJob
                )
              )
            );
          } else {
            const acceptedQuote = resolveAcceptedQuote(loadedJob);
            if (acceptedQuote) {
              try {
                setInvoice(createInvoiceDraftFromQuote({ booking: loadedJob, quote: acceptedQuote }));
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
    getDocs(tenantCollectionQuery(db, "contacts", dataAccessState))
      .then((snapshot) =>
        setBillingCustomers(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })))
      )
      .catch(() => setBillingCustomers([]));
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
    if (!contact) return;
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
  const sageReadiness = getSageReadiness(invoice);
  const accountingReadiness = getAccountingMappingReadiness(invoice);

  const employees = listToString(job.employees, (e) =>
    typeof e === "string" ? e : e?.name || e?.displayName || e?.email
  );
  const vehicles = formatVehicleList(job.vehicles, vehicleLookup) || "—";
  const equipment = listToString(job.equipment, (x) =>
    typeof x === "string" ? x : x?.name || x?.serial || x?.assetNumber
  );
  const statusPretty = prettifyStatus(job.status || "");
  const jobDocs = collectJobDocuments(job);

  /* Timesheet table helpers */
  const tsEmployee = (ts) =>
    ts.employeeName ||
    (typeof ts.employee === "string"
      ? ts.employee
      : ts.employee?.name || ts.employee?.displayName || ts.employee?.email) ||
    initialsFromName(ts.employee) ||
    "—";

  const tsHours = (ts) => {
    const base = Number(ts.hours || ts.totalHours || 0) || 0;
    const ot   = Number(ts.overtimeHours || ts.otHours || 0) || 0;
    return { base, ot };
  };

  const tsTotalMoney = (ts) => {
    // Try explicit total first; otherwise compute (if we have rates)
    if (ts.total != null) return money(ts.total);
    const r  = Number(ts.rate || ts.dayRate || ts.hourlyRate || 0) || 0;
    const ro = Number(ts.overtimeRate || ts.otRate || 0) || 0;
    const { base, ot } = tsHours(ts);
    if (r || ro) return money(base * r + ot * ro);
    return "—";
  };

  const tsDate = (ts) => fmtLong(parseDate(ts.date || ts.workDate));

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Authoritative invoice */}
        <section className={layoutStyles.invoiceWorkspace}>
          <div className={layoutStyles.invoiceSectionHeader}>
            <div className={layoutStyles.invoiceBuilderIdentity}>
              <button type="button" onClick={() => router.push(`/job-summary/${id}`)}>← Job</button>
              <div>
                <div className={layoutStyles.invoiceWorkspaceEyebrow}>Invoice builder</div>
                <div className={layoutStyles.invoiceWorkspaceTitle}>Job #{job.jobNumber || job.id} · {job.client || "Customer"}</div>
              </div>
            </div>
            <div className={layoutStyles.invoiceHeaderActions}>
              <span className={layoutStyles.builderDate}>{fmtLong(new Date())}</span>
              <span className={layoutStyles.extracted33}>{prettifyStatus(invoice.status)}</span>
              <button onClick={() => openInvoiceDocument("view")} disabled={saving}>Print / preview</button>
              <button onClick={() => openInvoiceDocument("download")} disabled={saving}>Save PDF</button>
              {invoice.status === INVOICE_STATUSES.DRAFT ? (
                <>
                  <button onClick={saveDraft} disabled={saving}>{saving ? "Saving..." : "Save draft"}</button>
                  <button onClick={() => runLifecycleAction("approve")} disabled={saving}>Approve invoice</button>
                  <button onClick={() => runLifecycleAction("void")} disabled={saving}>Void invoice</button>
                </>
              ) : null}
              {invoice.status === INVOICE_STATUSES.APPROVED ? (
                <>
                  <button onClick={() => runLifecycleAction("return_to_draft")} disabled={saving}>Return to draft</button>
                  <button onClick={() => runLifecycleAction("prepare_for_export")} disabled={saving || invoice.sageSync?.status === "pending"}>Prepare for export</button>
                  {invoice.sageSync?.status === "pending" ? (
                    <button onClick={queueSage50Export} disabled={saving || ["claimed", "processing", "succeeded"].includes(exportJob?.status)}>
                      {exportJob ? `Sage queue: ${exportJob.status}` : "Queue for Sage 50"}
                    </button>
                  ) : null}
                  {exportJob?.status === "succeeded" && !exportJob.invoiceReconciled ? (
                    <button onClick={reconcileSage50Export} disabled={saving}>
                      Reconcile Sage result
                    </button>
                  ) : null}
                  <button onClick={() => runLifecycleAction("void")} disabled={saving}>Void invoice</button>
                </>
              ) : null}
              {invoice.status === INVOICE_STATUSES.ISSUED ? (
                <button
                  onClick={sendIssuedInvoice}
                  disabled={saving || ["sending", "sent"].includes(invoice.delivery?.status)}
                >
                  {invoice.delivery?.status === "sent"
                    ? "Invoice sent"
                    : invoice.delivery?.status === "sending"
                    ? "Sending..."
                    : invoice.delivery?.status === "failed"
                    ? "Retry sending invoice"
                    : "Send invoice"}
                </button>
              ) : null}
            </div>
          </div>

          <div className={layoutStyles.invoiceBuilderGrid}>
            <aside className={layoutStyles.invoiceBuilderSidebar}>
              <div className={layoutStyles.sidebarHeading}>
                <div><span>Invoice summary</span><strong>{invoiceIdentity.draftReference}</strong></div>
                <span className={layoutStyles.sidebarStatus}>{prettifyStatus(invoice.status)}</span>
              </div>
              <div className={layoutStyles.sidebarPanel}>
                <h3>Invoice details</h3>
                <dl>
                  <div><dt>Job</dt><dd>#{job.jobNumber || job.id}</dd></div>
                  <div><dt>Draft reference</dt><dd>{invoiceIdentity.draftReference}</dd></div>
                  <div><dt>Official invoice number</dt><dd>{invoiceIdentity.officialNumber === "Pending" ? "Pending accounting issue" : invoiceIdentity.officialNumber}</dd></div>
                  <div><dt>Sage sync</dt><dd>{String(invoice.sageSync?.status || "not_ready").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</dd></div>
                  <div>
                    <dt>Sage readiness</dt>
                    <dd title={sageReadiness.blockers.map((blocker) => blocker.message).join("\n")}>
                      {sageReadiness.ready ? "Ready" : `${sageReadiness.blockers.length} requirement${sageReadiness.blockers.length === 1 ? "" : "s"} outstanding`}
                    </dd>
                  </div>
                  <div><dt>Quote</dt><dd>{invoice.sourceQuote?.quoteNumber || "—"}</dd></div>
                  <div><dt>PO number</dt><dd>{invoice.purchaseOrderNumber || "—"}</dd></div>
                  <div><dt>Terms</dt><dd>{invoice.paymentTermsDays ?? 30} days</dd></div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>{prettifyStatus(invoice.delivery?.status || "not_sent")}</dd>
                  </div>
                  {invoice.delivery?.recipient ? (
                    <div><dt>Sent to</dt><dd>{invoice.delivery.recipient}</dd></div>
                  ) : null}
                  {invoice.delivery?.sentAt ? (
                    <div><dt>Delivered</dt><dd>{fmtLong(parseDate(invoice.delivery.sentAt))}</dd></div>
                  ) : null}
                  {invoice.delivery?.error?.message ? (
                    <div><dt>Delivery error</dt><dd title={invoice.delivery.error.message}>{invoice.delivery.error.message}</dd></div>
                  ) : null}
                  <div><dt>Saved</dt><dd>{invoice.updatedAt ? fmtLong(parseDate(invoice.updatedAt)) : "Not yet"}</dd></div>
                </dl>
              </div>
              <div className={layoutStyles.sidebarPanel}>
                <h3>Invoice totals</h3>
                <dl>
                  <div><dt>Net</dt><dd>{money(invoice.totals?.net)}</dd></div>
                  <div><dt>VAT</dt><dd>{money(invoice.totals?.tax)}</dd></div>
                  <div><dt>Total</dt><dd><strong>{money(invoice.totals?.gross)}</strong></dd></div>
                </dl>
              </div>
              <div className={layoutStyles.sidebarPanel}>
                <h3>Accounting mapping</h3>
                <label>
                  <span style={k}>Billing customer</span>
                  <select
                    value={invoice.customer?.contactId || ""}
                    disabled={invoice.status !== "draft"}
                    onChange={(event) => selectBillingCustomer(event.target.value)}
                  >
                    <option value="">Select saved customer…</option>
                    {billingCustomers.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.financeProfile?.billingLegalName || contact.name || contact.id}
                      </option>
                    ))}
                  </select>
                </label>
                <dl>
                  <div><dt>Sage customer</dt><dd>{invoice.customer?.sageCustomerId || "Not mapped"}</dd></div>
                  <div><dt>Export job</dt><dd>{exportJob?.invoiceReconciled ? "Reconciled" : exportJob?.status ? prettifyStatus(exportJob.status) : "Not queued"}</dd></div>
                  {exportJob?.result?.invoiceNumber ? <div><dt>Sage invoice</dt><dd>{exportJob.result.invoiceNumber}</dd></div> : null}
                  {invoice.status === "issued" ? <div><dt>Issued</dt><dd>{fmtLong(parseDate(invoice.issueDate || invoice.issuedAt))}</dd></div> : null}
                  <div><dt>Mapping</dt><dd>{accountingReadiness.ready ? "Complete" : `${accountingReadiness.blockers.length} outstanding`}</dd></div>
                </dl>
                {!accountingReadiness.ready ? (
                  <ul>
                    {accountingReadiness.blockers.map((blocker, index) => (
                      <li key={`${blocker.code}-${blocker.line || index}`}>{blocker.message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </aside>

          <div className={layoutStyles.invoiceDocument}>
            <div className={layoutStyles.invoiceDocumentHeader}>
              <div className={layoutStyles.invoiceBrand}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/bickers-action-logo.png" alt="Bickers Action" />
              </div>
              <div className={layoutStyles.invoiceIdentity}>
                <span>{invoiceIdentity.documentLabel.toUpperCase()}</span>
                <strong>{invoiceIdentity.draftReference}</strong>
              </div>
            </div>

            <div className={layoutStyles.invoiceParties}>
              <div className={layoutStyles.billTo}>
                <span className={layoutStyles.documentLabel}>Bill to</span>
                <label>
                  <input value={invoice.customer?.name || ""} aria-label="Customer" disabled={invoice.status !== "draft"} onChange={(e) => setInvoice((current) => ({ ...current, customer: { ...current.customer, name: e.target.value } }))} />
                </label>
                <span>{job.location || "Address not recorded"}</span>
              </div>
              <div className={layoutStyles.invoiceMetaGrid}>
                <div>
                  <div style={k}>Draft reference</div>
                  <strong>{invoiceIdentity.draftReference}</strong>
                </div>
                <div>
                  <div style={k}>Official invoice number</div>
                  <strong>{invoiceIdentity.officialNumber === "Pending" ? "Pending accounting issue" : invoiceIdentity.officialNumber}</strong>
                </div>
                <label><div style={k}>PO Number</div><input value={invoice.purchaseOrderNumber || ""} disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceField("purchaseOrderNumber", e.target.value)} /></label>
                <label><div style={k}>Payment terms</div><div className={layoutStyles.termsInput}><input type="number" min="0" value={invoice.paymentTermsDays ?? 30} disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceField("paymentTermsDays", Number(e.target.value))} /><span>days</span></div></label>
                <div><div style={k}>Job reference</div><strong>#{job.jobNumber || job.id}</strong></div>
              </div>
            </div>

            <div className={layoutStyles.invoiceSource}>
              Approved job quote <strong>{invoice.sourceQuote?.quoteNumber}</strong>
              <span>Invoice edits do not change the approved quote.</span>
            </div>

            <div className={layoutStyles.invoiceTableWrap}>
              <table className={layoutStyles.invoiceTable}>
              <colgroup>
                <col className={layoutStyles.descriptionCol} />
                <col className={layoutStyles.qtyCol} />
                <col className={layoutStyles.priceCol} />
                <col className={layoutStyles.vatRateCol} />
                <col className={layoutStyles.mappingCol} />
                <col className={layoutStyles.mappingCol} />
                <col className={layoutStyles.moneyCol} />
                <col className={layoutStyles.moneyCol} />
                <col className={layoutStyles.grossCol} />
                <col className={layoutStyles.actionCol} />
              </colgroup>
              <thead>
                <tr>
                  {["Description", "Qty", "Unit price", "VAT %", "Nominal", "Sage tax", "Net", "VAT", "Gross", ""].map((heading) => (
                    <th key={heading} className={heading === "Description" ? layoutStyles.textHeading : layoutStyles.numberHeading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, index) => {
                  const section = String(line.section || "").trim();
                  const previousSection =
                    index > 0
                      ? String(invoice.lines[index - 1]?.section || "").trim()
                      : "";
                  return (
                    <Fragment key={line.id}>
                      {section && section !== previousSection ? (
                        <tr className={layoutStyles.invoiceSectionRow}>
                          <td colSpan={10}>{section}</td>
                        </tr>
                      ) : null}
                      <tr>
                        <td><input className={layoutStyles.descriptionInput} value={line.description} disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceLine(index, "description", e.target.value)} /></td>
                        <td><input className={layoutStyles.numberInput} type="number" step="0.01" value={line.quantity} disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceLine(index, "quantity", e.target.value)} /></td>
                        <td><input className={layoutStyles.numberInput} type="number" step="0.01" value={line.unitPrice} disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceLine(index, "unitPrice", e.target.value)} /></td>
                        <td><input className={layoutStyles.numberInput} type="number" step="0.01" value={line.taxRate} disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceLine(index, "taxRate", e.target.value)} /></td>
                        <td><input className={layoutStyles.numberInput} aria-label={`Line ${index + 1} nominal code`} value={line.nominalCode || ""} disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceLine(index, "nominalCode", e.target.value)} /></td>
                        <td><input className={layoutStyles.numberInput} aria-label={`Line ${index + 1} Sage tax code`} value={line.taxCode || ""} disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceLine(index, "taxCode", e.target.value)} /></td>
                        <td className={layoutStyles.moneyCell}>{money(line.net)}</td>
                        <td className={layoutStyles.moneyCell}>{money(line.tax)}</td>
                        <td className={layoutStyles.grossCell}>{money(line.gross)}</td>
                        <td className={layoutStyles.actionCell}><button className={layoutStyles.removeButton} disabled={invoice.status !== "draft" || invoice.lines.length === 1} onClick={() => removeInvoiceLine(index)}>Remove</button></td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
              </table>
            </div>
            <div className={layoutStyles.invoiceDocumentFooter}>
              <div>
                {invoice.status === "draft" ? <button className={layoutStyles.addLineButton} onClick={addInvoiceLine}>+ Add invoice line</button> : null}
                <label className={layoutStyles.invoiceNotes}>
                  <div style={k}>Invoice notes</div>
                  <textarea value={invoice.notes || ""} placeholder="Payment details or invoice notes…" disabled={invoice.status !== "draft"} onChange={(e) => updateInvoiceField("notes", e.target.value)} />
                </label>
              </div>
              <div className={layoutStyles.invoiceTotalsPanel}>
                <div><span>Subtotal</span><strong>{money(invoice.totals?.net)}</strong></div>
                <div><span>VAT</span><strong>{money(invoice.totals?.tax)}</strong></div>
                <div><span>Total due</span><strong>{money(invoice.totals?.gross)}</strong></div>
              </div>
            </div>
          </div>

            <aside className={layoutStyles.invoiceBuilderSidebar}>
              <div className={layoutStyles.sidebarHeading}>
                <div><span>Booking summary</span><strong>#{job.jobNumber || job.id}</strong></div>
                <span className={layoutStyles.sidebarStatus}>{statusPretty}</span>
              </div>
              <div className={layoutStyles.sidebarPanel}>
                <h3>Job details</h3>
                <dl>
                  <div><dt>Customer</dt><dd>{job.client || "—"}</dd></div>
                  <div><dt>Location</dt><dd>{job.location || "—"}</dd></div>
                  <div><dt>Dates</dt><dd>{dateRangeLabel(job)}</dd></div>
                  <div><dt>Crew</dt><dd>{employees}</dd></div>
                  <div><dt>Vehicles</dt><dd>{vehicles}</dd></div>
                  <div><dt>Equipment</dt><dd>{equipment === "—" ? "None recorded" : equipment}</dd></div>
                </dl>
              </div>
              <div className={layoutStyles.sidebarPanel}>
                <h3>Day notes</h3>
                {job?.notesByDate && typeof job.notesByDate === "object" ? (
                  <ul className={layoutStyles.builderDayNotes}>
                    {Object.entries(job.notesByDate)
                      .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([date, note]) => <li key={date}><strong>{formatNotesDateKey(date)}</strong><span>{String(note || "No note")}</span></li>)}
                  </ul>
                ) : <p>No day notes recorded.</p>}
              </div>
            </aside>
          </div>
        </section>

        {/* Timesheets */}
        <div style={section}>
          <div style={sectionTitle}>Timesheets</div>

          {tsLoading ? (
            <div style={{ color: UI.muted }}>Loading timesheets…</div>
          ) : timesheets.length === 0 ? (
            <div style={{ color: UI.muted }}>No timesheets found for this job.</div>
          ) : (
            <div className={layoutStyles.extracted16}>
              {timesheets.map((ts) => {
                const docs = collectTimesheetDocs(ts);
                const first = docs[0];
                const { base, ot } = tsHours(ts);

                return (
                  <div key={ts.id} style={{ ...surface, padding: 12, borderRadius: UI.radiusSm }}>
                    <div className={layoutStyles.extracted17}>
                      <div>
                        <div style={k}>Employee</div>
                        <div style={v}>{tsEmployee(ts)}</div>
                        <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
                          {ts.employeeId ? `ID: ${ts.employeeId}` : ""}
                        </div>
                      </div>

                      <div>
                        <div style={k}>Date</div>
                        <div style={v}>{tsDate(ts)}</div>
                        {ts.startTime || ts.endTime ? (
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
                            {ts.startTime || "—"} – {ts.endTime || "—"} {ts.breakMins ? `(Break ${ts.breakMins}m)` : ""}
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <div style={k}>Hours</div>
                        <div style={v}>{base}</div>
                      </div>

                      <div>
                        <div style={k}>OT</div>
                        <div style={v}>{ot}</div>
                      </div>

                      <div>
                        <div style={k}>Total</div>
                        <div style={v}>{tsTotalMoney(ts)}</div>
                        {ts.rate || ts.overtimeRate ? (
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
                            {ts.rate ? `Rate ${money(ts.rate)}` : ""} {ts.overtimeRate ? ` • OT ${money(ts.overtimeRate)}` : ""}
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <div style={k}>Status</div>
                        <div style={v}>{prettifyStatus(ts.status || ts.approvalStatus || "—")}</div>
                        {ts.notes ? (
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: 6, whiteSpace: "pre-wrap" }}>
                            {ts.notes}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Attachments */}
                    <div className={layoutStyles.extracted18}>
                      <div style={k}>Attachments</div>
                      {!docs.length ? (
                        <div style={{ fontSize: 13, color: UI.muted }}>No files</div>
                      ) : (
                        <div className={layoutStyles.extracted19}>
                          {/* Inline preview of the first file */}
                          {first && (
                            <div style={{ ...surface, border: UI.border, borderRadius: 10, overflow: "hidden" }}>
                              <div className={layoutStyles.extracted20}>
                                <strong className={layoutStyles.extracted21}>{first.name}</strong>
                                <a href={first.url} target="_blank" rel="noreferrer" style={{ color: UI.brand, fontWeight: 800, textDecoration: "none", fontSize: 13 }}>
                                  Open
                                </a>
                              </div>
                              <div className={layoutStyles.extracted22}>
                                {first.kind === "pdf" ? (
                                  <iframe src={first.url} title={first.name} className={layoutStyles.extracted23} />
                                ) : first.kind === "image" ? (
                                  // Uploaded attachment URLs can come from Firebase Storage and are not constrained to a Next image domain.
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={first.url} alt={first.name} className={layoutStyles.extracted24} loading="lazy" />
                                ) : (
                                  <div style={{ fontSize: 13, color: UI.muted }}>
                                    File cannot be previewed.{" "}
                                    <a href={first.url} target="_blank" rel="noreferrer" style={{ color: UI.brand, fontWeight: 800, textDecoration: "none" }}>
                                      Download / Open
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* List other files */}
                          <div style={{ ...surface, padding: 8, borderRadius: 10 }}>
                            <ul className={layoutStyles.extracted25}>
                              {docs.map((d, i) => (
                                <li key={d.url + i} className={layoutStyles.extracted26}>
                                  <a href={d.url} target="_blank" rel="noreferrer" style={{ color: UI.brand, fontWeight: 700, textDecoration: "none" }}>
                                    {d.name}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Job Documents */}
        <div style={section}>
          <div style={sectionTitle}>Job Documents</div>
          {!jobDocs.length ? (
            <div style={{ color: UI.muted, fontSize: 14 }}>No documents found on this job.</div>
          ) : (
            <div style={grid(3)}>
              {jobDocs.map((d, i) => (
                <div
                  key={d.url + i}
                  style={{ ...surface, border: UI.border, borderRadius: UI.radiusSm, overflow: "hidden" }}
                >
                  <div
                    className={layoutStyles.extracted27}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 13.5,
                        color: UI.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={d.name}
                    >
                      {d.name}
                    </div>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 800, color: UI.brand, textDecoration: "none", fontSize: 13 }}
                    >
                      Open
                    </a>
                  </div>

                  <div className={layoutStyles.extracted28}>
                    {d.kind === "pdf" ? (
                      <div className={layoutStyles.extracted29}>
                        <iframe src={d.url} title={d.name} className={layoutStyles.extracted30} />
                      </div>
                    ) : d.kind === "image" ? (
                      <div
                        className={layoutStyles.extracted31}
                      >
                        {/* Uploaded attachment URLs can come from Firebase Storage and are not constrained to a Next image domain. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={d.url}
                          alt={d.name}
                          className={layoutStyles.extracted32}
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: UI.muted }}>
                        File cannot be previewed.&nbsp;
                        <a href={d.url} target="_blank" rel="noreferrer" style={{ color: UI.brand, fontWeight: 800, textDecoration: "none" }}>
                          Download / Open
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </HeaderSidebarLayout>
  );
}
