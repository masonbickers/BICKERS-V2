"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc, getDoc, updateDoc, setDoc,
  collection, getDocs, query, where
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
};

const pageWrap = { padding: "40px 24px", background: UI.bg, minHeight: "100vh" };
const surface = { background: "#fff", borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const section = { ...surface, padding: 14, marginBottom: UI.gap };
const sectionTitle = { fontSize: 16, fontWeight: 900, marginBottom: 8, color: UI.text };
const grid = (cols = 3) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 });
const k = { fontSize: 12, color: UI.muted, textTransform: "uppercase", fontWeight: 800, letterSpacing: ".02em" };
const v = { fontSize: 14, color: UI.text, fontWeight: 700 };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f1f5f9", color: "#0f172a", fontSize: 12, fontWeight: 700 };

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
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [timesheets, setTimesheets] = useState([]);
  const [tsLoading, setTsLoading] = useState(true);

  // Load job
  useEffect(() => {
    const fetchJob = async () => {
      if (!id) return;
      try {
        const ref = doc(db, "bookings", id);
        const snap = await getDoc(ref);
        setJob(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [id]);

  // Load timesheets (multi-strategy)
  useEffect(() => {
    const fetchTimesheets = async () => {
      if (!id) return;
      setTsLoading(true);

      const results = [];

      // 1) top-level timesheets by bookingId
      try {
        const q1 = query(collection(db, "timesheets"), where("bookingId", "==", id));
        const s1 = await getDocs(q1);
        s1.forEach((d) => results.push({ id: d.id, ...(d.data() || {}) }));
      } catch {}

      // 2) by jobId
      try {
        const q2 = query(collection(db, "timesheets"), where("jobId", "==", id));
        const s2 = await getDocs(q2);
        s2.forEach((d) => results.push({ id: d.id, ...(d.data() || {}) }));
      } catch {}

      // 3) by jobNumber (requires job loaded)
      try {
        if (job?.jobNumber) {
          const q3 = query(collection(db, "timesheets"), where("jobNumber", "==", job.jobNumber));
          const s3 = await getDocs(q3);
          s3.forEach((d) => results.push({ id: d.id, ...(d.data() || {}) }));
        }
      } catch {}

      // 4) subcollection bookings/:id/timesheets
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
    // re-run when jobNumber resolves
  }, [id, job?.jobNumber]);

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

  const markInvoiced = async () => {
    try {
      setSaving(true);

      const bookingRef = doc(db, "bookings", id);
      await updateDoc(bookingRef, {
        status: "invoiced",
        invoicedAt: new Date().toISOString(),
      });

      const now = new Date();
      const dueISO = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const invoiceRef = doc(db, "invoiceQueue", id);

      await setDoc(
        invoiceRef,
        {
          bookingId: id,
          jobNumber: job?.jobNumber || id,
          client: job?.client || "",
          location: job?.location || "",
          dates: cleanDatesArray(job),
          status: "invoiced",
          invoiceNumber: job?.finance?.invoiceNumber || job?.invoiceNumber || "",
          invoiceDate: now.toISOString(),
          dueDate: dueISO,
          updatedAt: now.toISOString(),
        },
        { merge: true }
      );

      router.push("/finance-home");
    } catch (e) {
      alert("Failed to mark invoiced: " + (e?.message || e));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}><div style={chip}>Loading…</div></div>
      </HeaderSidebarLayout>
    );
  }
  if (!job) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}><div style={chip}>Job not found.</div></div>
      </HeaderSidebarLayout>
    );
  }

  const employees = listToString(job.employees, (e) =>
    typeof e === "string" ? e : e?.name || e?.displayName || e?.email
  );
  const vehicles = listToString(job.vehicles, (v) =>
    typeof v === "string" ? v : v?.name || v?.registration
  );
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
        {/* Back + Title */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button
            onClick={() => router.back()}
            style={{
              backgroundColor: "#e5e7eb",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ← Back
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <span style={chip}>{statusPretty}</span>
          </div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10 }}>
          Invoice Job #{job.jobNumber || job.id}
        </h1>
        <div style={{ color: UI.muted, marginBottom: 18 }}>
          Client: <strong style={{ color: UI.text }}>{job.client || "—"}</strong>
        </div>

        {/* Summary */}
        <div style={section}>
          <div style={sectionTitle}>Summary</div>
          <div style={grid(3)}>
            <div><div style={k}>Client</div><div style={v}>{job.client || "—"}</div></div>
            <div><div style={k}>Location</div><div style={v}>{job.location || "—"}</div></div>
            <div><div style={k}>Dates</div><div style={v}>{dateRangeLabel(job)}</div></div>

            <div><div style={k}>Status</div><div style={v}>{statusPretty}</div></div>
            <div><div style={k}>Employees</div><div style={v}>{employees}</div></div>
            <div><div style={k}>Vehicles</div><div style={v}>{vehicles}</div></div>

            <div><div style={k}>Equipment</div><div style={v}>{equipment}</div></div>
            <div><div style={k}>Booking Dates (detailed)</div><div style={{ fontSize: 14 }}>{renderDates}</div></div>
            <div><div style={k}>PO Number</div><div style={v}>{job?.finance?.poNumber || job?.poNumber || "—"}</div></div>
          </div>
        </div>

        {/* Notes */}
        <div style={section}>
          <div style={sectionTitle}>Notes</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ ...surface, padding: 12, borderRadius: UI.radiusSm }}>
              <div style={k}>General Notes</div>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{job.notes || job.generalNotes || "—"}</div>
            </div>
            <div style={{ ...surface, padding: 12, borderRadius: UI.radiusSm }}>
              <div style={k}>Per-Day Notes</div>
              <div style={{ fontSize: 14 }}>
                {job?.notesByDate && typeof job.notesByDate === "object" ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {Object.entries(job.notesByDate).map(([d, n]) => (
                      <li key={d} style={{ marginBottom: 6 }}>
                        <strong>{formatNotesDateKey(d)}:</strong>{" "}
                        <span style={{ whiteSpace: "pre-wrap" }}>{String(n || "")}</span>
                      </li>
                    ))}
                  </ul>
                ) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Finance */}
        <div style={section}>
          <div style={sectionTitle}>Finance</div>
          <div style={grid(4)}>
            <div><div style={k}>Invoice #</div><div style={v}>{job?.finance?.invoiceNumber || job?.invoiceNumber || "—"}</div></div>
            <div><div style={k}>Invoice Amount</div><div style={v}>{money(job?.finance?.total || job?.invoiceTotal)}</div></div>
            <div><div style={k}>Invoiced At</div><div style={v}>{fmtLong(parseDate(job?.finance?.invoicedAt) || parseDate(job?.invoicedAt))}</div></div>
            <div><div style={k}>Paid At</div><div style={v}>{fmtLong(parseDate(job?.finance?.paidAt) || parseDate(job?.paidAt))}</div></div>
            <div><div style={k}>Payment Terms</div><div style={v}>{job?.finance?.terms || job?.paymentTerms || "—"}</div></div>
            <div><div style={k}>Finance Notes</div><div style={{ fontSize: 14 }}>{job?.finance?.notes || "—"}</div></div>
          </div>
        </div>

        {/* Timesheets */}
        <div style={section}>
          <div style={sectionTitle}>Timesheets</div>

          {tsLoading ? (
            <div style={{ color: UI.muted }}>Loading timesheets…</div>
          ) : timesheets.length === 0 ? (
            <div style={{ color: UI.muted }}>No timesheets found for this job.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              {timesheets.map((ts) => {
                const docs = collectTimesheetDocs(ts);
                const first = docs[0];
                const { base, ot } = tsHours(ts);

                return (
                  <div key={ts.id} style={{ ...surface, padding: 12, borderRadius: UI.radiusSm }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.6fr 0.6fr 0.6fr 1fr", gap: 10, alignItems: "start" }}>
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
                    <div style={{ marginTop: 10 }}>
                      <div style={k}>Attachments</div>
                      {!docs.length ? (
                        <div style={{ fontSize: 13, color: UI.muted }}>No files</div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                          {/* Inline preview of the first file */}
                          {first && (
                            <div style={{ ...surface, border: UI.border, borderRadius: 10, overflow: "hidden" }}>
                              <div style={{ padding: 8, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <strong style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{first.name}</strong>
                                <a href={first.url} target="_blank" rel="noreferrer" style={{ color: UI.brand, fontWeight: 800, textDecoration: "none", fontSize: 13 }}>
                                  Open ↗
                                </a>
                              </div>
                              <div style={{ padding: 8, background: "#fafafa" }}>
                                {first.kind === "pdf" ? (
                                  <iframe src={first.url} title={first.name} style={{ width: "100%", height: 340, border: 0 }} />
                                ) : first.kind === "image" ? (
                                  <img src={first.url} alt={first.name} style={{ maxWidth: "100%", maxHeight: 340, display: "block" }} loading="lazy" />
                                ) : (
                                  <div style={{ fontSize: 13, color: UI.muted }}>
                                    File can’t be previewed.{" "}
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
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {docs.map((d, i) => (
                                <li key={d.url + i} style={{ marginBottom: 6 }}>
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
                    style={{
                      padding: 10,
                      borderBottom: "1px solid #e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
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
                      Open ↗
                    </a>
                  </div>

                  <div style={{ padding: 10, background: "#fafafa" }}>
                    {d.kind === "pdf" ? (
                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                        <iframe src={d.url} title={d.name} style={{ width: "100%", height: 420, border: 0 }} />
                      </div>
                    ) : d.kind === "image" ? (
                      <div
                        style={{
                          display: "grid",
                          placeItems: "center",
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={d.url}
                          alt={d.name}
                          style={{ maxWidth: "100%", maxHeight: 420, display: "block" }}
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

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={markInvoiced}
            disabled={saving}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: saving ? "#6b7280" : "#10b981",
              color: "#fff",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "✅ Mark as Invoiced"}
          </button>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
