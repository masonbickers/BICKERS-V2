"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import "./CompletionReviewDialog.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Home,
  RotateCcw,
  Search,
} from "lucide-react";
import { db, storage } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import CompletionReviewDialog from "./CompletionReviewDialog";
import { OperationsHeaderActions, OperationsPage, OperationsPageHeader } from "@/app/components/OperationsPage";
import { Button, Checkbox, Input, Select } from "@/app/components/ui";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { useSessionScroll, useSessionState } from "@/app/utils/useSessionState";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { getFixedJobStatusStyle } from "@/app/utils/jobStatusColors";
import {
  buildInitialLifecycle,
  buildInitialStatusHistory,
  buildNextLifecycle,
  buildNextStatusHistory,
  buildSynchronizedVehicleStatus,
} from "@/app/utils/bookingLifecycle";
import { buildCompletionAttachmentPatch } from "@/app/utils/completionReviewAttachments";

const UI = UI_TOKENS;

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const titleMd = { fontWeight: 800, fontSize: 17, margin: 0, color: UI.text, letterSpacing: 0 };
const cardHint = { color: UI.muted, fontSize: 12.5, marginTop: 4, lineHeight: 1.4 };
const sectionHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  margin: "8px 0 5px",
  flexWrap: "wrap",
};
const toolbar = {
  ...surface,
  padding: 12,
  display: "grid",
  gridTemplateColumns: "minmax(240px, 1fr) minmax(150px, 1fr) 130px 122px 122px auto auto",
  gap: 8,
  alignItems: "center",
  marginBottom: 16,
};
const btn = (kind = "ghost") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 28,
  padding: "4px 8px",
  borderRadius: UI.radiusSm,
  border: kind === "primary" ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
  background: kind === "primary" ? UI.brand : "var(--color-surface)",
  color: kind === "primary" ? "var(--color-white)" : UI.text,
  fontWeight: 850,
  fontSize: 12,
  textDecoration: "none",
  boxShadow: kind === "primary" ? "0 8px 18px rgba(31,75,122,0.16)" : UI.shadowSm,
  whiteSpace: "nowrap",
  cursor: "pointer",
});
const chip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "3px 8px",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: UI.brandBorder,
    background: UI.brandSoft,
    color: UI.text,
    fontSize: 11.5,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  if (kind === "green") return { ...base, borderColor: UI.greenBorder, background: UI.greenSoft, color: UI.green };
  if (kind === "amber") return { ...base, borderColor: UI.amberBorder, background: UI.amberSoft, color: UI.amber };
  if (kind === "red") return { ...base, borderColor: UI.redBorder, background: UI.redSoft, color: "var(--color-danger)" };
  if (kind === "purple") return { ...base, borderColor: UI.purpleBorder, background: UI.purpleSoft, color: "var(--color-accent)" };
  return base;
};
const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});
const tableWrap = { ...surface, overflow: "auto" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5, tableLayout: "fixed" };
const th = {
  textAlign: "left",
  padding: "5px 8px",
  borderBottom: "1px solid var(--color-border)",
  position: "sticky",
  top: 0,
  background: "var(--color-surface-subtle)",
  zIndex: 1,
  color: UI.muted,
  fontSize: 10.5,
  fontWeight: 900,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const td = {
  padding: "5px 8px",
  borderBottom: "1px solid var(--color-surface-hover)",
  verticalAlign: "middle",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const nowrap = { whiteSpace: "nowrap" };
const focusCss = `
  input:focus, select:focus, button:focus, a:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: var(--color-info-border) !important;
  }
  @media (max-width: 1180px) {
    .review-toolbar { grid-template-columns: 1fr 1fr !important; }
    .review-search { grid-column: 1 / -1; }
  }
  @media (max-width: 720px) {
    .review-toolbar { grid-template-columns: 1fr !important; }
  }
`;

const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const normaliseDates = (job) => {
  const arr = [];
  if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
    for (const d of job.bookingDates) {
      const pd = parseDate(d);
      if (pd) arr.push(pd);
    }
  } else if (job.date) {
    const pd = parseDate(job.date);
    if (pd) arr.push(pd);
  }
  return arr;
};

const isFourDigitJob = (job) => /^\d{4}(?:\.\d+)?$/.test(String(job.jobNumber ?? "").trim());
const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "-");

const isPaid = (job) => {
  const s = String(job.status || "").toLowerCase();
  const inv = String(job.invoiceStatus || "").toLowerCase();
  return s === "paid" || s === "settled" || inv.includes("paid");
};

const prettifyStatus = (raw) => {
  const s = String(raw || "").toLowerCase().trim();
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

const statusColors = (label) => {
  return getFixedJobStatusStyle(label);
};

const StatusBadge = ({ value }) => {
  const c = statusColors(value);
  return (
    <span
      style={{
        padding: "5px 9px",
        fontSize: 11.5,
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontWeight: 900,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {value}
    </span>
  );
};

const getCheckBadgeState = (isComplete) =>
  isComplete
    ? { label: "Yes", tone: "green" }
    : { label: "No", tone: "red" };

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} to ${sunday.toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "short", year: "numeric" }
  )}`;
}

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export default function ReviewQueuePage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingJobId, setSavingJobId] = useState("");
  const [completionJobId, setCompletionJobId] = useState("");
  const [completionSaving, setCompletionSaving] = useState(false);
  const [completionProgress, setCompletionProgress] = useState(0);
  const [completionError, setCompletionError] = useState("");
  const [clientFilter, setClientFilter] = useSessionState("review-queue:clientFilter", "all");
  const [search, setSearch] = useSessionState("review-queue:search", "");
  const [statusFilter, setStatusFilter] = useSessionState("review-queue:statusFilter", "all");
  const [fromDate, setFromDate] = useSessionState("review-queue:fromDate", "");
  const [toDate, setToDate] = useSessionState("review-queue:toDate", "");
  const [overdueOnly, setOverdueOnly] = useSessionState("review-queue:overdueOnly", false);
  const searchRef = useRef(null);
  useSessionScroll("review-queue");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load review queue bookings" });
      setBookings([]);
      setLoading(false);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  const jobs4 = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  const beforeToday = useCallback(
    (j) => {
      const ds = normaliseDates(j).sort((a, b) => a - b);
      if (!ds.length) return false;
      const lastMid = new Date(ds[ds.length - 1]);
      lastMid.setHours(0, 0, 0, 0);
      return lastMid.getTime() < todayMidnight.getTime();
    },
    [todayMidnight]
  );

  const queue = useMemo(() => {
    return jobs4
      .filter((j) => {
        const s = String(j.status || "").toLowerCase();
        const ready = /ready\s*to\s*invoice/.test(s);
        const completeish = s === "confirmed" || s === "complete" || s === "completed";
        // Finance-ready jobs remain visible here as a record of the handoff
        // while also appearing in /finance-queue.
        return ((completeish && beforeToday(j)) || ready) && !isPaid(j);
      })
      .sort((a, b) => {
        const da = normaliseDates(a).sort((x, y) => y - x)[0]?.getTime() || 0;
        const db = normaliseDates(b).sort((x, y) => y - x)[0]?.getTime() || 0;
        return db - da;
      });
  }, [jobs4, beforeToday]);

  const productionCompanies = useMemo(
    () => ["all", ...Array.from(new Set(queue.map((j) => j.client).filter(Boolean))).sort()],
    [queue]
  );

  const statusOptions = useMemo(
    () => ["all", "Ready to Invoice", "Confirmed", "Complete", "Action Required"],
    []
  );

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    const from = fromDate ? startOfDay(new Date(fromDate)) : null;
    const to = toDate ? endOfDay(new Date(toDate)) : null;

    return queue.filter((j) => {
      if (clientFilter !== "all" && (j.client || "") !== clientFilter) return false;
      if (statusFilter !== "all" && prettifyStatus(j.status) !== statusFilter) return false;
      if (overdueOnly && !beforeToday(j)) return false;

      if (from || to) {
        const ds = normaliseDates(j);
        if (!ds.length) return false;
        const minT = Math.min(...ds.map((d) => d.getTime()));
        const maxT = Math.max(...ds.map((d) => d.getTime()));
        if (from && maxT < from.getTime()) return false;
        if (to && minT > to.getTime()) return false;
      }

      if (!s) return true;
      return (
        String(j.jobNumber || "").toLowerCase().includes(s) ||
        String(j.production || "").toLowerCase().includes(s) ||
        String(j.client || "").toLowerCase().includes(s) ||
        String(j.location || "").toLowerCase().includes(s) ||
        String(j.notes || "").toLowerCase().includes(s)
      );
    });
  }, [queue, clientFilter, statusFilter, overdueOnly, fromDate, toDate, search, beforeToday]);

  const { weekGroups, weekKeys, noDate } = useMemo(() => {
    const groups = {};
    const noDateJobs = [];
    for (const j of filtered) {
      const ds = normaliseDates(j).sort((a, b) => a - b);
      if (!ds.length) {
        noDateJobs.push(j);
        continue;
      }
      const mondayKey = getMonday(ds[0]).getTime();
      if (!groups[mondayKey]) groups[mondayKey] = [];
      groups[mondayKey].push(j);
    }
    const keys = Object.keys(groups)
      .map((k) => Number(k))
      .sort((a, b) => b - a);
    return { weekGroups: groups, weekKeys: keys, noDate: noDateJobs };
  }, [filtered]);

  const captureScrollPositions = () => {
    if (typeof window === "undefined") return () => {};
    const targets = Array.from(
      new Set([
        document.querySelector(".app-shell-content"),
        document.scrollingElement || document.documentElement,
      ].filter(Boolean))
    ).map((target) => ({
      target,
      left: target.scrollLeft || 0,
      top: target.scrollTop || 0,
    }));

    return () => {
      targets.forEach(({ target, left, top }) => {
        target.scrollLeft = left;
        target.scrollTop = top;
      });
    };
  };

  const restoreScrollAfterRender = (restoreScroll) => {
    restoreScroll();
    requestAnimationFrame(restoreScroll);
    window.setTimeout(restoreScroll, 80);
  };

  const setQuickStatus = async (job, nextStatus, { localPatch = {}, serverPatch = {} } = {}) => {
    if (!job?.id || savingJobId) return false;
    const restoreScroll = captureScrollPositions();
    const previousBookings = bookings;
    const nowIso = new Date().toISOString();
    const previousStatus = job.status || "Confirmed";
    const actor = {
      email: dataAccessState.user?.email || "Unknown",
      uid: dataAccessState.user?.uid || "",
    };
    const baseStatusHistory = Array.isArray(job.statusHistory) && job.statusHistory.length
      ? job.statusHistory
      : buildInitialStatusHistory(previousStatus, job.createdAt || nowIso, actor);
    const statusHistory = buildNextStatusHistory(
      baseStatusHistory,
      previousStatus,
      nextStatus,
      nowIso,
      actor
    );
    const lifecycleBase = job.lifecycle && typeof job.lifecycle === "object"
      ? job.lifecycle
      : buildInitialLifecycle(previousStatus, job.createdAt || nowIso);
    const lifecycle = buildNextLifecycle(lifecycleBase, previousStatus, nextStatus, nowIso);
    const shouldSyncVehicleStatus = ["Complete", "Ready to Invoice"].includes(nextStatus);
    const vehicleStatus = shouldSyncVehicleStatus
      ? buildSynchronizedVehicleStatus(job, nextStatus)
      : job.vehicleStatus;
    const optimisticPatch = {
      ...localPatch,
      status: nextStatus,
      updatedAt: nowIso,
      statusChangedAt: nowIso,
      statusHistory,
      lifecycle,
      readyToInvoice: nextStatus === "Ready to Invoice",
      ...(shouldSyncVehicleStatus ? { vehicleStatus } : {}),
    };

    setSavingJobId(job.id);
    setBookings((current) => current.map((item) => (item.id === job.id ? { ...item, ...optimisticPatch } : item)));
    restoreScrollAfterRender(restoreScroll);

    try {
      await updateDoc(
        doc(db, "bookings", job.id),
        tenantPayload(dataAccessState, {
          ...serverPatch,
          status: nextStatus,
          updatedAt: serverTimestamp(),
          statusChangedAt: nowIso,
          statusHistory,
          lifecycle,
          lastEditedBy: actor.email,
          lastEditedByUid: actor.uid,
          readyToInvoice: nextStatus === "Ready to Invoice",
          ...(shouldSyncVehicleStatus ? { vehicleStatus } : {}),
        })
      );
      return true;
    } catch (error) {
      console.error("Failed to update review queue status:", error);
      setBookings(previousBookings);
      systemDialogs.showSystemNotification("Could not update the job status. Please try again.");
      return false;
    } finally {
      setSavingJobId("");
      restoreScrollAfterRender(restoreScroll);
    }
  };

  const completionJob = useMemo(
    () => bookings.find((job) => job.id === completionJobId) || null,
    [bookings, completionJobId]
  );

  const openCompletionDialog = useCallback((job) => {
    setCompletionError("");
    setCompletionProgress(0);
    setCompletionJobId(job.id);
  }, []);

  const closeCompletionDialog = useCallback(() => {
    if (completionSaving) return;
    setCompletionJobId("");
    setCompletionError("");
    setCompletionProgress(0);
  }, [completionSaving]);

  const uploadCompletionPdf = async (job, file) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `job_attachments/${job.id}/${Date.now()}_${safeName}`;
    const uploadRef = storageRef(storage, path);
    const task = uploadBytesResumable(uploadRef, file, { contentType: file.type || "application/pdf" });

    await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snapshot) => {
          const progress = snapshot.totalBytes
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;
          setCompletionProgress(progress);
        },
        reject,
        resolve
      );
    });

    const url = await getDownloadURL(task.snapshot.ref);
    return {
      name: file.name,
      size: file.size,
      type: file.type || "application/pdf",
      url,
      storagePath: path,
      uploadedAt: new Date().toISOString(),
    };
  };

  const completeJobWithDetails = async ({ fields, file, removedAttachmentIndexes = [] }) => {
    const job = completionJob;
    if (!job || completionSaving) return;

    if (file && file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setCompletionError("Please attach a PDF file.");
      return;
    }

    setCompletionSaving(true);
    setCompletionError("");
    setCompletionProgress(0);

    try {
      const details = {
        generalNotes: fields.generalNotes,
        po: fields.po.trim(),
        invoiceContactName: fields.invoiceContactName.trim(),
        invoiceContactEmail: fields.invoiceContactEmail.trim(),
        invoiceContactPhone: fields.invoiceContactPhone.trim(),
      };
      let attachment = null;
      if (file) attachment = await uploadCompletionPdf(job, file);

      const existingAttachments = Array.isArray(job.attachments) ? job.attachments : [];
      const attachmentPatch = buildCompletionAttachmentPatch(
        existingAttachments,
        removedAttachmentIndexes,
        attachment
      );
      const localPatch = {
        ...details,
        ...(attachmentPatch.changed
          ? { attachments: attachmentPatch.attachments, pdfUrl: attachmentPatch.pdfUrl }
          : {}),
      };
      const serverPatch = {
        ...details,
        ...(attachmentPatch.changed
          ? { attachments: attachmentPatch.attachments, pdfUrl: attachmentPatch.pdfUrl }
          : {}),
      };

      const saved = await setQuickStatus(job, "Complete", { localPatch, serverPatch });
      if (saved !== false) setCompletionJobId("");
    } catch (error) {
      console.error("Failed to complete job review:", error);
      setCompletionError(error?.message || "Could not save the completion details. Please try again.");
    } finally {
      setCompletionSaving(false);
      setCompletionProgress(0);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setClientFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setOverdueOnly(false);
    if (searchRef.current) searchRef.current.focus();
  };

  const DatesCell = ({ job }) => {
    const ds = normaliseDates(job).sort((a, b) => a - b);
    const first = ds[0] ?? null;
    const last = ds[ds.length - 1] ?? null;
    const label = first && last ? `${fmtShort(first)} to ${fmtShort(last)}` : first ? fmtShort(first) : "TBC";
    return <>{label}</>;
  };

  const SectionTable = ({ jobs, title }) => (
    <section className={layoutStyles.extracted1}>
      <div className={layoutStyles.extracted2}>
        <div>
          <h2 style={titleMd}>{title}</h2>
        </div>
        <span style={chip()}>
          {jobs.length} job{jobs.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={tableWrap}>
        <table className={layoutStyles.extracted3} aria-label={title}>
          <colgroup>
            <col className={layoutStyles.extracted4} />
            <col className={layoutStyles.extracted5} />
            <col className={layoutStyles.extracted6} />
            <col />
            <col className={layoutStyles.extracted7} />
            <col className={layoutStyles.extracted8} />
            <col className={layoutStyles.extracted9} />
            <col className={layoutStyles.extracted10} />
            <col className={layoutStyles.extracted11} />
            <col className={layoutStyles.extracted12} />
          </colgroup>
          <thead>
            <tr>
              <th style={th}>Job #</th>
              <th style={th}>Production</th>
              <th style={th}>Production Company</th>
              <th style={th}>Location</th>
              <th style={th}>Notes</th>
              <th style={th}>PO</th>
              <th style={th}>Quote</th>
              <th style={th}>Dates</th>
              <th style={th}>Status</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const pretty = prettifyStatus(j.status);
              const notesState = getCheckBadgeState(String(j?.generalNotes || "").trim().length > 0);
              const poState = getCheckBadgeState(String(j?.po || "").trim().length > 0);
              const quoteState = getCheckBadgeState(
                String(j?.acceptedQuoteNumber || j?.quoteNumber || "").trim().length > 0 ||
                  (Array.isArray(j?.quoteVersions) && j.quoteVersions.length > 0) ||
                  Boolean(j?.quote && typeof j.quote === "object") ||
                  String(j?.pdfUrl || "").trim().length > 0 ||
                  (Array.isArray(j?.attachments) && j.attachments.length > 0)
              );
              const href = `/job-numbers/${j.id}#job-${j.id}`;

              return (
                <tr key={j.id}>
                  <td className={layoutStyles.extracted13}>
                    <Link href={href} style={{ textDecoration: "none", color: UI.text, fontWeight: 900 }}>
                      #{j.jobNumber || j.id}
                    </Link>
                  </td>
                  <td className={layoutStyles.extracted14} title={j.production || ""}>{j.production || "-"}</td>
                  <td className={layoutStyles.extracted15} title={j.client || ""}>{j.client || "-"}</td>
                  <td className={layoutStyles.extracted16} title={j.location || ""}>{j.location || "-"}</td>
                  <td className={layoutStyles.extracted17}><span style={chip(notesState.tone)}>{notesState.label}</span></td>
                  <td className={layoutStyles.extracted18}><span style={chip(poState.tone)}>{poState.label}</span></td>
                  <td className={layoutStyles.extracted19}><span style={chip(quoteState.tone)}>{quoteState.label}</span></td>
                  <td className={layoutStyles.extracted20}><DatesCell job={j} /></td>
                  <td className={layoutStyles.extracted21}><StatusBadge value={pretty} /></td>
                  <td className={layoutStyles.extracted22}>
                    <div className={layoutStyles.extracted23}>
                      {["Complete", "Ready for invoicing", "Needs Action"].map((option) => {
                        const nextStatus =
                          option === "Complete"
                            ? "Complete"
                            : option === "Ready for invoicing"
                            ? "Ready to Invoice"
                            : "Action Required";
                        const currentStatus = prettifyStatus(j.status);
                        const isActive = currentStatus === nextStatus;

                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() =>
                              nextStatus === "Complete"
                                ? openCompletionDialog(j)
                                : setQuickStatus(j, nextStatus)
                            }
                            disabled={savingJobId === j.id}
                            style={{
                              ...btn(isActive ? "primary" : "ghost"),
                              minHeight: 24,
                              padding: "3px 7px",
                              fontSize: 11,
                              boxShadow: "none",
                              opacity: savingJobId === j.id ? 0.6 : 1,
                            }}
                          >
                            {option}
                          </button>
                        );
                      })}
                      <Link href={href} style={{ ...btn(), minHeight: 24, padding: "3px 7px", fontSize: 11, boxShadow: "none" }}>
                        Details <ChevronRight size={12} />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <OperationsPage>
        <OperationsPageHeader
          title="Review Queue"
          subtitle="Complete the operational review, then send the job to Finance with ‘Ready for invoicing’."
          actions={<OperationsHeaderActions>
            <Button as={Link} href="/job-home" variant="secondary">
              <Home size={14} />
              Jobs Sheets
            </Button>
            <div style={chip()}>
              <ClipboardList size={13} /> {loading ? "Loading..." : `${filtered.length} jobs`}
            </div>
          </OperationsHeaderActions>}
        />

        <div className="review-toolbar" style={toolbar}>
          <div className={`review-search ${layoutStyles.extracted26}`} >
            <Search size={14} style={{ position: "absolute", left: 9, top: 7, color: UI.muted }} aria-hidden />
            <Input
              ref={searchRef}
              type="text"
              placeholder="Search by job #, production, production company, location or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 29 }}
              aria-label="Search review queue"
            />
          </div>

          <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            {productionCompanies.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Production Company: All" : c}
              </option>
            ))}
          </Select>

          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Status: All" : s}
              </option>
            ))}
          </Select>

          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date" />

          <Checkbox label="Overdue" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />

          <Button variant="secondary" type="button" onClick={resetFilters}>
            <RotateCcw size={13} />
            Reset
          </Button>
        </div>

        {loading ? (
          <div style={{ ...surface, padding: 14, color: UI.muted }}>Loading jobs...</div>
        ) : filtered.length === 0 ? (
          <div style={{ ...surface, padding: 14, color: UI.muted }}>Nothing to review.</div>
        ) : (
          <>
            {weekKeys.map((mondayTS) => {
              const monday = new Date(Number(mondayTS));
              const jobs = weekGroups[mondayTS] || [];
              return (
                <SectionTable
                  key={mondayTS}
                  jobs={jobs}
                  title={formatWeekRange(monday)}
                />
              );
            })}

            {noDate.length > 0 && <SectionTable jobs={noDate} title="No Dates" />}
          </>
        )}
        <CompletionReviewDialog
          job={completionJob}
          open={Boolean(completionJob)}
          saving={completionSaving}
          uploadProgress={completionProgress}
          error={completionError}
          onClose={closeCompletionDialog}
          onConfirm={completeJobWithDetails}
        />
      </OperationsPage>
    </HeaderSidebarLayout>
  );
}
