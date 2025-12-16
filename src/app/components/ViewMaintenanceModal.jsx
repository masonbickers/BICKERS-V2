"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../../firebaseConfig";
import { doc, getDoc, getDocs, deleteDoc, collection } from "firebase/firestore";
import { useRouter } from "next/navigation";

/* ---------- helpers ---------- */
const fmtDate = (iso) => (iso ? new Date(iso).toDateString() : "Not set");
const fmtDateRange = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) return b.bookingDates.join(", ");
  if (b.startDate && b.endDate) return `${fmtDate(b.startDate)} → ${fmtDate(b.endDate)}`;
  if (b.date) return fmtDate(b.date);
  return "Not set";
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
  collectionName = "maintenanceBookings", // ✅ default, but dashboard can override
  onClose,
}) {
  const [booking, setBooking] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);
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
      }
    })();
    return () => (mounted = false);
  }, [id, collectionName]);

  // load vehicles
  useEffect(() => {
    let mounted = true;
    (async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      if (!mounted) return;
      setAllVehicles(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
    return () => (mounted = false);
  }, []);

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

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={modal}>
        {/* Header */}
        <div style={header}>
          <div>
            <div style={eyebrow}>Maintenance #{booking.jobNumber || booking.maintenanceJobNumber || "—"}</div>
            <h2 style={title}>{maintenanceTitle}</h2>
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

  

        <div style={grid}>
          <Section title="Overview">
            <Field label="Type" value={maintenanceTitle || "—"} />
            <Field label="Location" value={booking.location || "—"} />
            <Field label="Date(s)" value={fmtDateRange(booking)} />
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
                  <div style={tagWrap}>
                    {normalizedVehicles.map((v, i) => {
                      const name =
                        v?.name || [v?.manufacturer, v?.model].filter(Boolean).join(" ") || String(v || "");
                      const plate = v?.registration ? ` ${String(v.registration).toUpperCase()}` : "";
                      return (
                        <span key={`${name}-${i}`} style={tag}>
                          {name}
                          {plate && <span style={tagSub}>{plate}</span>}
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
                  <div style={tagWrap}>
                    {booking.equipment.map((e, i) => (
                      <span key={`${e}-${i}`} style={tag}>{e}</span>
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
              <div style={noteBox}>{booking.notes}</div>
            </Section>
          )}

          {(() => {
            const files = toAttachmentList(booking);
            if (!files.length) return null;
            return (
              <Section title="Attachments" full>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {files.map((f, i) => (
                    <a
                      key={f.url || i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={fileBtn}
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

        <div style={footerMeta}>
          {booking?.createdBy && (
            <div>
              Created by <b>{booking.createdBy}</b>
              {booking?.createdAt && <> on {new Date(booking.createdAt).toLocaleString("en-GB")}</>}
            </div>
          )}
          {booking?.lastEditedBy && (
            <div>
              Last edited by <b>{booking.lastEditedBy}</b>
              {booking?.updatedAt && <> on {new Date(booking.updatedAt).toLocaleString("en-GB")}</>}
            </div>
          )}
        </div>

        <div style={actions}>
<button
  onClick={() => router.push(`/maintenance/${id}`)}
  style={{ ...btn, background: "#0d6efd" }}
>
  Edit Maintenance
</button>


          <button onClick={handleDelete} style={{ ...btn, background: "#dc3545" }}>
            Delete
          </button>

          <button onClick={() => router.push(`/maintenance/${id}`)} style={{ ...btn, background: "#111" }}>
            Open full page
          </button>

          <button onClick={onClose} style={{ ...btn, background: "#6c757d" }}>
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
      <h3 style={sectionTitle}>{title}</h3>
      <div style={sectionCard}>{children}</div>
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div style={fieldRow}>
      <div style={fieldLabel}>{label}</div>
      <div style={fieldValue}>{value || "—"}</div>
    </div>
  );
}

const Chip = ({ good, label, title }) => (
  <span title={title} style={{ ...chip, background: good ? "#22c55e" : "#ef4444", color: "#fff" }}>
    {label} {good ? "✓" : "✗"}
  </span>
);

const Tag = ({ children, dark, success }) => (
  <span
    style={{
      ...tag,
      background: success ? "#22c55e" : dark ? "#111" : "#f3f4f6",
      color: success || dark ? "#fff" : "#111",
      border: success || dark ? "1px solid #111" : "1px solid #e5e7eb",
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
  background: "#fff",
  color: "#111",
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

const eyebrow = { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#6b7280" };
const title = { margin: 0, fontSize: 22, lineHeight: 1.2 };

const badge = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  border: "1px solid #111",
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
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const sectionCard = {
  background: "#fafafa",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 14,
};

const fieldRow = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px dashed #e5e7eb",
};
const fieldLabel = { color: "#6b7280", fontSize: 13 };
const fieldValue = { color: "#111", fontSize: 14 };

const noteBox = {
  background: "#fff",
  border: "1px solid #e5e7eb",
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
  background: "#f3f4f6",
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  fontSize: 12,
  whiteSpace: "nowrap",
};
const tagSub = { opacity: 0.7, fontSize: 11 };

const chip = { padding: "4px 8px", borderRadius: 999, fontSize: 12, border: "1px solid #111" };

const fileBtn = {
  display: "inline-block",
  padding: "8px 12px",
  background: "#111",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
  border: "1px solid #111",
};

const footerMeta = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid #e5e7eb",
  color: "#6b7280",
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
  borderTop: "1px solid #e5e7eb",
};

const btn = {
  padding: "10px 14px",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
};

function statusColor(status = "") {
  const map = {
    Confirmed: "#fde047",
    "First Pencil": "#93c5fd",
    "Second Pencil": "#ef4444",
    DNH: "#c2c2c2",
    Complete: "#22c55e",
    "Action Required": "#ff7b00",
    Holiday: "#d1d5db",
    Maintenance: "#fb923c",
    Lost: "#ef4444",
    Postponed: "#f59e0b",
    Cancelled: "#ef4444",
  };
  return map[status] || "#e5e7eb";
}
function onStatusColor(status = "") {
  return ["Confirmed", "DNH", "Holiday", "Maintenance"].includes(status) ? "#111" : "#fff";
}
