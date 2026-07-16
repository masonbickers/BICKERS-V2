"use client";

import layoutStyles from "./ViewMaintenanceModal.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../firebaseConfig";
import { doc, getDoc, getDocs, deleteDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getFixedJobStatusStyle } from "@/app/utils/jobStatusColors";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

/* ---------- helpers ---------- */
const toJsDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (value) => {
  const d = toJsDate(value);
  return d ? d.toLocaleDateString("en-GB") : "Not set";
};

const fmtDateRange = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) return b.bookingDates.join(", ");
  if (b.appointmentDate || b.appointmentDateISO) return fmtDate(b.appointmentDate || b.appointmentDateISO);
  if (b.startDate && b.endDate) return `${fmtDate(b.startDate)} → ${fmtDate(b.endDate)}`;
  if (b.date) return fmtDate(b.date);
  return "Not set";
};

const fmtTime = (value) => {
  const clean = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(clean) ? clean : "";
};

/* ---------- ATTACHMENTS HELPERS (same as booking modal) ---------- */
const canonicalKeyFromUrl = (url = "") => {
  try {
    const afterO = url.split("/o/")[1];
    if (afterO) return decodeURIComponent(afterO.split("?")[0]);
    return url.split("?")[0];
  } catch {
    return url || "";
  }
};

const getFilenameFromUrl = (url = "") => {
  try {
    const key = canonicalKeyFromUrl(url) || url;
    return (key.split("/").pop() || "file").trim();
  } catch {
    return "file";
  }
};

const toAttachmentList = (b = {}) => {
  const out = [];

  const add = (val, name) => {
    if (!val) return;

    if (typeof val === "string") {
      const url = val;
      out.push({ url, label: name || getFilenameFromUrl(url) });
      return;
    }

    const url =
      val.url ||
      val.href ||
      val.link ||
      val.downloadURL ||
      val.downloadUrl ||
      null;

    if (url) {
      const label = val.name || name || getFilenameFromUrl(url);
      out.push({ url, label });
      return;
    }

    if (typeof val === "object") Object.values(val).forEach((v) => add(v, name));
  };

  if (Array.isArray(b.attachments)) b.attachments.forEach((x) => add(x));
  if (Array.isArray(b.files)) b.files.forEach((x) => add(x));

  add(b.quoteUrl, "Quote");
  if (b.pdfURL && b.pdfURL !== b.quoteUrl) add(b.pdfURL);

  const seen = new Set();
  return out.filter(({ url }) => {
    const key = canonicalKeyFromUrl(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function ViewMaintenanceModal({
  id,
  collectionName = "maintenanceBookings", //  default, but dashboard can override
  onClose,
}) {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allVehicles, setAllVehicles] = useState([]);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const router = useRouter();

  // close on ESC
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // load maintenance booking (now supports either collection)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ref = doc(db, collectionName, id);
        const snap = await getDoc(ref);

        if (!mounted) return;

        if (snap.exists()) {
          setBooking({ id: snap.id, ...snap.data(), __collection: collectionName });
        } else {
          alert(`Maintenance booking not found (looked in "${collectionName}")`);
        }
      } catch (err) {
        console.error("[ViewMaintenanceModal] getDoc error:", err);
        alert("Failed to load maintenance booking.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [id, collectionName]);

  // load vehicles
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "load maintenance modal vehicles" });
      setAllVehicles([]);
      return undefined;
    }

    let mounted = true;
    (async () => {
      const snapshot = await getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState));
      if (!mounted) return;
      setAllVehicles(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
    return () => (mounted = false);
  }, [accessKey, dataAccessState]);

  // normalise vehicles
  const normalizedVehicles = useMemo(() => {
    const list = Array.isArray(booking?.vehicles) ? booking.vehicles : [];
    return list.map((v) => {
      if (v && typeof v === "object" && (v.name || v.registration)) return v;
      const needle = String(v ?? "").trim();
      const match =
        allVehicles.find((x) => x.id === needle) ||
        allVehicles.find((x) => String(x.registration ?? "").trim() === needle) ||
        allVehicles.find((x) => String(x.name ?? "").trim() === needle);
      return match || { name: needle };
    });
  }, [booking?.vehicles, allVehicles]);

  const handleDelete = async () => {
    const confirmDelete = confirm("Are you sure you want to delete this maintenance booking?");
    if (!confirmDelete) return;

    await deleteDoc(doc(db, collectionName, id));
    alert("Maintenance booking deleted");
    onClose?.();
  };

  if (loading) return null;
  if (!booking) return null;

  const showReasons = ["Lost", "Postponed", "Cancelled"].includes(booking.status);
  const reasonsText =
    Array.isArray(booking.statusReasons) && booking.statusReasons.length
      ? booking.statusReasons
          .map((r) =>
            r === "Other" && booking.statusReasonOther ? `Other: ${booking.statusReasonOther}` : r
          )
          .join(", ")
      : "—";

  const maintenanceTitle =
    booking.maintenanceType ||
    booking.type ||
    booking.title ||
    booking.client ||
    "Maintenance Details";
  const historyTrail = Array.isArray(booking.history)
    ? [...booking.history]
        .map((entry, index) => ({
          id: `${entry?.timestamp || "no-time"}-${entry?.action || "change"}-${index}`,
          action: entry?.action || "Updated",
          user: entry?.user || entry?.updatedBy || entry?.by || "Unknown",
          at: toJsDate(entry?.timestamp || entry?.updatedAt || entry?.date),
          changes: Array.isArray(entry?.changes) ? entry.changes.filter(Boolean) : [],
          note: entry?.note || entry?.description || entry?.details || "",
        }))
        .map((entry) => ({
          ...entry,
          note: entry.changes.length && entry.note === entry.changes.join("\n") ? "" : entry.note,
        }))
        .sort((a, b) => (a.at?.getTime?.() || 0) - (b.at?.getTime?.() || 0))
    : [];
  const visibleHistoryTrail = showFullHistory
    ? historyTrail
    : historyTrail.slice(Math.max(historyTrail.length - 3, 0));

  return (
    <div className={layoutStyles.extracted1} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={layoutStyles.extracted2}>
        {/* Header */}
        <div className={layoutStyles.extracted3}>
          <div>
            <div className={layoutStyles.extracted4}>Maintenance #{booking.jobNumber || booking.maintenanceJobNumber || "—"}</div>
            <h2 className={layoutStyles.extracted5}>{maintenanceTitle}</h2>
          </div>
          <span
            style={{
              ...badge,
              background: statusColor(booking.status || "Maintenance"),
              color: onStatusColor(booking.status || "Maintenance"),
            }}
          >
            {booking.status || "Maintenance"}
          </span>
        </div>

  

        <div className={layoutStyles.extracted6}>
          <Section title="Overview">
            <Field label="Type" value={maintenanceTitle || "—"} />
            <Field label="Location" value={booking.location || "—"} />
            <Field label="Date(s)" value={fmtDateRange(booking)} />
            <Field label="Time" value={fmtTime(booking.appointmentTime) || "Not set"} />
            <Field label="Contact Email" value={booking.contactEmail || "Not provided"} />
            <Field label="Contact Number" value={booking.contactNumber || "Not provided"} />
            {showReasons && <Field label="Status Reason(s)" value={reasonsText} />}
          </Section>

          <Section title="People & Kit">
            <Field
              label="Employees"
              value={
                (booking.employees || [])
                  .map((e) => (typeof e === "string" ? e : [e?.role, e?.name].filter(Boolean).join(" – ")))
                  .filter(Boolean)
                  .join(", ") || "None"
              }
            />

            <Field
              label="Vehicles"
              value={
                normalizedVehicles.length ? (
                  <div className={layoutStyles.extracted7}>
                    {normalizedVehicles.map((v, i) => {
                      const name =
                        v?.name || [v?.manufacturer, v?.model].filter(Boolean).join(" ") || String(v || "");
                      const plate = v?.registration ? ` ${String(v.registration).toUpperCase()}` : "";
                      return (
                        <span key={`${name}-${i}`} className={layoutStyles.extracted8}>
                          {name}
                          {plate && <span className={layoutStyles.extracted9}>{plate}</span>}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  "None"
                )
              }
            />

            <Field
              label="Equipment"
              value={
                Array.isArray(booking.equipment) && booking.equipment.length ? (
                  <div className={layoutStyles.extracted10}>
                    {booking.equipment.map((e, i) => (
                      <span key={`${e}-${i}`} className={layoutStyles.extracted11}>{e}</span>
                    ))}
                  </div>
                ) : (
                  "None"
                )
              }
            />
          </Section>

          {booking.notes && (
            <Section title="Notes" full>
              <div className={layoutStyles.extracted12}>{booking.notes}</div>
            </Section>
          )}

          <Section title="Modification Trail" full>
            <details className={layoutStyles.extracted13} open={historyTrail.length <= 3}>
              <summary className={layoutStyles.extracted14}>
                <span>Change history</span>
                <span className={layoutStyles.extracted15}>{historyTrail.length}</span>
              </summary>
              <div className={layoutStyles.extracted16}>
                {visibleHistoryTrail.length ? (
                  visibleHistoryTrail.map((entry) => (
                    <div key={entry.id} className={layoutStyles.extracted17}>
                      <div className={layoutStyles.extracted18}>
                        <span className={layoutStyles.extracted19}>{entry.action}</span>
                        <span className={layoutStyles.extracted20}>
                          {entry.user}
                          {entry.at ? ` • ${entry.at.toLocaleString("en-GB")}` : ""}
                        </span>
                      </div>
                      {entry.changes.length ? (
                        <div className={layoutStyles.extracted21}>
                          {entry.changes.map((change, idx) => (
                            <div key={`${entry.id}-change-${idx}`} className={layoutStyles.extracted22}>
                              {change}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {entry.note ? <div className={layoutStyles.extracted23}>{entry.note}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className={layoutStyles.extracted24}>No modification history recorded for this booking yet.</div>
                )}
                {historyTrail.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowFullHistory((prev) => !prev)}
                    className={layoutStyles.extracted25}
                  >
                    {showFullHistory ? "Show less" : `See more (${historyTrail.length - 3} older)`}
                  </button>
                ) : null}
              </div>
            </details>
          </Section>

          {(() => {
            const files = toAttachmentList(booking);
            if (!files.length) return null;
            return (
              <Section title="Attachments" full>
                <div className={layoutStyles.extracted26}>
                  {files.map((f, i) => (
                    <a
                      key={f.url || i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={layoutStyles.extracted27}
                      title={f.label}
                    >
                      {f.label}
                    </a>
                  ))}
                </div>
              </Section>
            );
          })()}
        </div>

        <div className={layoutStyles.extracted28}>
          {booking?.createdBy && (
            <div>
              Created by <b>{booking.createdBy}</b>
              {booking?.createdAt && (
                <> on {toJsDate(booking.createdAt)?.toLocaleString("en-GB") || "—"}</>
              )}
            </div>
          )}
          {booking?.lastEditedBy && (
            <div>
              Last edited by <b>{booking.lastEditedBy}</b>
              {booking?.updatedAt && (
                <> on {toJsDate(booking.updatedAt)?.toLocaleString("en-GB") || "—"}</>
              )}
            </div>
          )}
        </div>

        <div className={layoutStyles.extracted29}>
<button
  onClick={() => router.push(`/maintenance/${id}?returnTo=${encodeURIComponent("/dashboard")}`)}
  className={layoutStyles.extracted30}
>
  Edit Maintenance
</button>


          <button onClick={handleDelete} className={layoutStyles.extracted31}>
            Delete
          </button>

          <button
            onClick={() => router.push(`/maintenance/${id}?returnTo=${encodeURIComponent("/dashboard")}`)}
            className={layoutStyles.extracted32}
          >
            Open full page
          </button>

          <button onClick={onClose} className={layoutStyles.extracted33}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- tiny presentational components ---------- */
function Section({ title, children, full = false }) {
  return (
    <section style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <h3 className={layoutStyles.extracted34}>{title}</h3>
      <div className={layoutStyles.extracted35}>{children}</div>
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div className={layoutStyles.extracted36}>
      <div className={layoutStyles.extracted37}>{label}</div>
      <div className={layoutStyles.extracted38}>{value || "—"}</div>
    </div>
  );
}

const Chip = ({ good, label, title }) => (
  <span title={title} style={{ ...chip, background: good ? "var(--color-success-accent)" : "var(--color-danger)", color: "var(--color-surface)" }}>
    {label} {good ? "Yes" : "No"}
  </span>
);

const Tag = ({ children, dark, success }) => (
  <span
    style={{
      ...tag,
      background: success ? "var(--color-success-accent)" : dark ? "var(--shell-sidebar-bg)" : "var(--color-canvas)",
      color: success || dark ? "var(--color-white)" : "var(--color-text)",
      border: success || dark ? "1px solid var(--color-text)" : "1px solid var(--color-border)",
    }}
  >
    {children}
  </span>
);

/* ---------- styles ---------- */
const overlay = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 16,
  zIndex: 9999,
};

const modal = {
  background: "var(--color-surface)",
  color: "var(--color-text)",
  width: "min(900px, 96vw)",
  maxHeight: "90vh",
  overflow: "auto",
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  padding: 20,
};

const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const eyebrow = { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "var(--color-text-muted)" };
const title = { margin: 0, fontSize: 22, lineHeight: 1.2 };

const badge = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  border: "1px solid var(--color-text)",
};

const chipRow = { display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" };

const grid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
};

const sectionTitle = {
  margin: "0 0 8px 0",
  fontSize: 14,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const sectionCard = {
  background: "var(--color-surface-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: 14,
};

const fieldRow = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px dashed var(--color-border)",
};
const fieldLabel = { color: "var(--color-text-muted)", fontSize: 13 };
const fieldValue = { color: "var(--color-text)", fontSize: 14 };

const noteBox = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 12,
  lineHeight: 1.4,
};

const tagWrap = { display: "flex", gap: 8, flexWrap: "wrap" };
const tag = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  background: "var(--color-canvas)",
  border: "1px solid var(--color-border)",
  borderRadius: 999,
  fontSize: 12,
  whiteSpace: "nowrap",
};
const tagSub = { opacity: 0.7, fontSize: 11 };

const chip = { padding: "4px 8px", borderRadius: 999, fontSize: 12, border: "1px solid var(--color-text)" };

const fileBtn = {
  display: "inline-block",
  padding: "8px 12px",
  background: "var(--shell-sidebar-bg)",
  color: "var(--color-white)",
  borderRadius: 8,
  textDecoration: "none",
  border: "1px solid var(--color-text)",
};
const historyDetails = {
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  background: "var(--color-surface-subtle)",
  overflow: "hidden",
};
const historySummary = {
  listStyle: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  fontWeight: 700,
  color: "var(--color-text)",
};
const historyCount = {
  minWidth: 28,
  height: 28,
  padding: "0 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--color-border)",
  color: "var(--color-text)",
  fontSize: 12,
  fontWeight: 700,
};
const historyBody = {
  display: "grid",
  gap: 10,
  padding: "0 16px 16px",
};
const historyItem = {
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  background: "var(--color-surface)",
  padding: 12,
};
const historyTopRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};
const historyAction = {
  fontWeight: 700,
  color: "var(--color-text)",
};
const historyMeta = {
  color: "var(--color-text-muted)",
  fontSize: 12,
};
const historyNote = {
  marginTop: 8,
  color: "var(--color-text-muted)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.45,
};
const historyChanges = {
  marginTop: 8,
  display: "grid",
  gap: 6,
};
const historyChangeLine = {
  color: "var(--color-text-muted)",
  fontSize: 13,
  lineHeight: 1.4,
};
const historyEmpty = {
  color: "var(--color-text-muted)",
  fontSize: 13,
};
const historyToggleBtn = {
  justifySelf: "flex-start",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  borderRadius: 999,
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const footerMeta = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid var(--color-border)",
  color: "var(--color-text-muted)",
  fontSize: 12,
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
};

const actions = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid var(--color-border)",
};

const btn = {
  padding: "10px 14px",
  color: "var(--color-white)",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
};

function statusColor(status = "") {
  return getFixedJobStatusStyle(status).bg;
}
function onStatusColor(status = "") {
  return getFixedJobStatusStyle(status).text;
}
