"use client";

import { useEffect, useMemo, useState } from "react";
import { db, auth } from "../../../firebaseConfig";
import {
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

/* ---------- helpers ---------- */
const toDateSafe = (v) => {
  try {
    if (!v) return null;
    if (v?.toDate && typeof v.toDate === "function") return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
};

const fmtGB = (d) => {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const fmtDate = (iso) => {
  const d = toDateSafe(iso);
  return d ? fmtGB(d) : "—";
};

const fmtDateRange = (b) => {
  if (!b) return "—";
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) {
    return b.bookingDates
      .map((x) => {
        const d = toDateSafe(x);
        return d ? fmtGB(d) : String(x);
      })
      .join(", ");
  }
  if (b.startDate && b.endDate) return `${fmtDate(b.startDate)} → ${fmtDate(b.endDate)}`;
  if (b.date) return fmtDate(b.date);
  if (b.startDate) return fmtDate(b.startDate);
  return "—";
};

const listBookingDaysYMD = (b) => {
  const keys = Object.keys(b?.notesByDate || {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (keys.length) return keys.sort((a, c) => new Date(a) - new Date(c));
  if (Array.isArray(b?.bookingDates) && b.bookingDates.length) {
    return [...b.bookingDates].sort((a, c) => new Date(a) - new Date(c));
  }
  const s = (b?.startDate || "").slice?.(0, 10);
  const e = (b?.endDate || "").slice?.(0, 10);
  const one = (b?.date || "").slice?.(0, 10) || (b?.startDate || "").slice?.(0, 10);
  if (s && e) {
    const out = [];
    let cur = new Date(`${s}T00:00:00Z`);
    const end = new Date(`${e}T00:00:00Z`);
    while (cur <= end) {
      out.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }
  return one ? [one] : [];
};

/* ---------- ATTACHMENTS HELPERS ---------- */
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

/* ---------- employees helpers ---------- */
const prettyEmployees = (list) =>
  (Array.isArray(list) ? list : [])
    .map((e) => (typeof e === "string" ? e : [e?.role, e?.name].filter(Boolean).join(" – ")))
    .filter(Boolean)
    .join(", ") || "None";

const groupEmployeesByRole = (list) => {
  const arr = Array.isArray(list) ? list : [];
  const map = {};
  arr.forEach((e) => {
    const role = (typeof e === "string" ? "Employee" : e?.role) || "Employee";
    const name = typeof e === "string" ? e : e?.name;
    const key = String(role || "Employee");
    if (!name) return;
    if (!map[key]) map[key] = [];
    map[key].push(String(name));
  });
  Object.keys(map).forEach((k) => {
    map[k] = Array.from(new Set(map[k])).sort((a, b) => a.localeCompare(b));
  });
  return map;
};

/* ---------- vehicles helpers (u-crane focused) ---------- */
const isUCraneVehicle = (v) => {
  const cat = String(v?.category || "").toLowerCase();
  const name = String(v?.name || "").toLowerCase();
  return cat.includes("u-crane") || name.includes("u-crane");
};

export default function ViewUCraneBookingModal({
  id,
  onClose,
  fromDeleted = false,
  deletedId = null,
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

  // load booking (normal OR deleted)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setBooking(null);

        if (fromDeleted) {
          const delRef = doc(db, "deletedBookings", String(deletedId || id));
          const delSnap = await getDoc(delRef);

          if (!mounted) return;

          if (!delSnap.exists()) {
            alert("Deleted booking not found");
            onClose?.();
            return;
          }

          const raw = delSnap.data() || {};
          const payload = raw.data || raw.payload || raw.booking || raw || {};

          setBooking({
            id: raw.originalId || id,
            __deletedDocId: delSnap.id,
            __deletedMeta: {
              deletedAt: raw.deletedAt || null,
              deletedBy: raw.deletedBy || "",
              originalCollection: raw.originalCollection || "bookings",
              originalId: raw.originalId || id,
            },
            ...payload,
          });

          return;
        }

        const ref = doc(db, "bookings", String(id));
        const snap = await getDoc(ref);

        if (!mounted) return;

        if (snap.exists()) setBooking({ id: snap.id, ...snap.data() });
        else alert("Booking not found");
      } catch (e) {
        console.error("Load booking failed:", e);
        alert("Failed to load booking. Check console.");
      }
    })();

    return () => (mounted = false);
  }, [id, fromDeleted, deletedId, onClose]);

  // load vehicles (for nicer name/plate display)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      if (!mounted) return;
      setAllVehicles(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
    return () => (mounted = false);
  }, []);

  // normalize vehicles stored as strings/ids/objects
  const normalizedVehicles = useMemo(() => {
    const list = Array.isArray(booking?.vehicles) ? booking.vehicles : [];
    return list.map((v) => {
      if (v && typeof v === "object" && (v.name || v.registration || v.id)) return v;

      const needle = String(v ?? "").trim();
      const match =
        allVehicles.find((x) => x.id === needle) ||
        allVehicles.find((x) => String(x.registration ?? "").trim() === needle) ||
        allVehicles.find((x) => String(x.name ?? "").trim() === needle);

      return match || { id: needle, name: needle };
    });
  }, [booking?.vehicles, allVehicles]);

  // show vehicle statuses when vehicles are stored as IDs
  const vehicleStatusById = booking?.vehicleStatus || {};

  // ✅ filter down to U-Crane related vehicles only (so this modal is “u-crane bookings”)
  const uCraneVehiclesPrettyWithStatus = useMemo(() => {
    const only = (normalizedVehicles || []).filter(isUCraneVehicle);
    if (!only.length) return [];

    return only.map((v) => {
      const vid = v?.id || v?.vehicleId || "";
      const status = (vid && vehicleStatusById?.[vid]) || booking?.status || "";
      const name =
        v?.name || [v?.manufacturer, v?.model].filter(Boolean).join(" ") || String(vid || "");
      const plate = v?.registration ? String(v.registration).toUpperCase() : "";
      return { id: vid || `${name}-${plate}`, name, plate, status };
    });
  }, [normalizedVehicles, vehicleStatusById, booking?.status]);

  const dayKeys = useMemo(() => listBookingDaysYMD(booking), [booking]);

  const employeesByDate = booking?.employeesByDate || {};
  const hasEmployeesByDate = useMemo(() => {
    return (
      !!employeesByDate &&
      Object.keys(employeesByDate).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    );
  }, [employeesByDate]);

  const callTimesByDate = booking?.callTimesByDate || {};
  const hasCallTimesByDate = useMemo(() => {
    return (
      !!callTimesByDate &&
      Object.keys(callTimesByDate).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    );
  }, [callTimesByDate]);

  // ✅ delete (store copy -> delete original)
  const handleDelete = async () => {
    const confirmDelete = confirm("Are you sure you want to delete this U-Crane booking?");
    if (!confirmDelete) return;

    try {
      const bookingRef = doc(db, "bookings", String(id));
      const snap = await getDoc(bookingRef);

      if (!snap.exists()) {
        alert("Booking not found (already deleted?)");
        onClose?.();
        return;
      }

      const data = snap.data();

      await setDoc(doc(db, "deletedBookings", String(id)), {
        originalCollection: "bookings",
        originalId: String(id),
        deletedAt: serverTimestamp(),
        deletedBy: auth?.currentUser?.email || "",
        data,
      });

      await deleteDoc(bookingRef);

      alert("Booking deleted (stored in Deleted Bookings)");
      onClose?.();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Delete failed. Check console.");
    }
  };

  // ✅ restore (deleted -> bookings)
  const handleRestore = async () => {
    if (!fromDeleted) return;

    const ok = confirm("Restore this booking back into Bookings?");
    if (!ok) return;

    try {
      const originalId = booking?.__deletedMeta?.originalId || booking?.id || id;

      const { __deletedDocId, __deletedMeta, ...clean } = booking || {};

      await setDoc(
        doc(db, "bookings", String(originalId)),
        {
          ...clean,
          restoredAt: serverTimestamp(),
          restoredBy: auth?.currentUser?.email || "",
        },
        { merge: true }
      );

      const delDocId = booking?.__deletedDocId || deletedId || id;
      await deleteDoc(doc(db, "deletedBookings", String(delDocId)));

      alert("Restored ✅");
      onClose?.();
    } catch (e) {
      console.error("Restore failed:", e);
      alert("Restore failed. Check console.");
    }
  };

  if (!booking) return null;

  const employeesPrettyText = prettyEmployees(booking.employees || []);

  const showReasons = ["Lost", "Postponed", "Cancelled"].includes(booking.status);
  const reasonsText =
    Array.isArray(booking.statusReasons) && booking.statusReasons.length
      ? booking.statusReasons
          .map((r) =>
            r === "Other" && booking.statusReasonOther ? `Other: ${booking.statusReasonOther}` : r
          )
          .join(", ")
      : "—";

  const additionalContacts = Array.isArray(booking.additionalContacts)
    ? booking.additionalContacts
    : [];

  // Simple “is U-Crane booking” hint (optional)
  const isLikelyUCraneBooking =
    (Array.isArray(booking.vehicles) && booking.vehicles.some((v) => String(v).toLowerCase().includes("u-crane"))) ||
    uCraneVehiclesPrettyWithStatus.length > 0;

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={modal}>
        {/* Header */}
        <div style={header}>
          <div>
            <div style={eyebrow}>
              U-Crane Booking • Job #{booking.jobNumber || "—"}
              {!isLikelyUCraneBooking && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "#ef4444", fontWeight: 800 }}>
                  (No U-Crane vehicle found)
                </span>
              )}
            </div>
            <h2 style={title}>{booking.client || "U-Crane Booking Details"}</h2>
            {fromDeleted && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
                Deleted {fmtGB(toDateSafe(booking?.__deletedMeta?.deletedAt))}{" "}
                {booking?.__deletedMeta?.deletedBy ? `by ${booking.__deletedMeta.deletedBy}` : ""}
              </div>
            )}
          </div>
          <span
            style={{
              ...badge,
              background: statusColor(booking.status),
              color: onStatusColor(booking.status),
            }}
          >
            {booking.status || "—"}
          </span>
        </div>

        {/* Quick chips */}
        <div style={chipRow}>
          <Chip good={!!booking.hasHS} label="HS" />
          <Chip good={!!booking.hasRiskAssessment} label="RA" />
          <Chip good={!!booking.hasHotel} label="Hotel" />
          <Chip
            good={!!booking.hasRiggingAddress}
            label="Rigging"
            title={booking.riggingAddress || ""}
          />
          {booking.callTime && <Tag dark>Call: {booking.callTime}</Tag>}
          {booking.isCrewed && <Tag success>CREWED</Tag>}
          {booking.shootType && <Tag>{booking.shootType}</Tag>}
        </div>

        {/* Content grid */}
        <div style={grid}>
          <Section title="Overview">
            <Field label="Production" value={booking.client || "—"} />
            <Field label="Location" value={booking.location || "—"} />
            <Field label="Date(s)" value={fmtDateRange(booking)} />

            <Field label="Contact Email" value={booking.contactEmail || "Not provided"} />
            <Field label="Contact Number" value={booking.contactNumber || "Not provided"} />

            {additionalContacts.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ ...fieldLabel, marginBottom: 6 }}>Additional Contacts</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {additionalContacts.map((c, idx) => {
                    const name = c?.name || "Contact";
                    const email = c?.email || "";
                    const phone = c?.phone || "";
                    const role = c?.role || "";
                    return (
                      <div key={idx} style={miniCard}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>
                          {name}{" "}
                          {role ? (
                            <span style={{ opacity: 0.7, fontWeight: 700 }}>({role})</span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 13, color: "#111" }}>
                          {email ? <div>Email: {email}</div> : null}
                          {phone ? <div>Phone: {phone}</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {showReasons && <Field label="Status Reason(s)" value={reasonsText} />}
          </Section>

          <Section title="People & U-Crane Kit">
            <Field label="Crew" value={employeesPrettyText} />

            {/* U-Crane vehicle list WITH status pills */}
            <Field
              label="U-Crane Vehicles"
              value={
                uCraneVehiclesPrettyWithStatus.length ? (
                  <div style={tagWrap}>
                    {uCraneVehiclesPrettyWithStatus.map((v, i) => (
                      <span key={`${v.id}-${i}`} style={tagPill}>
                        {v.name}
                        {v.plate && <span style={tagSub}>{v.plate}</span>}
                        {v.status && <span style={tagStatus}>{v.status}</span>}
                      </span>
                    ))}
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
                      <span key={`${e}-${i}`} style={tagPill}>
                        {e}
                      </span>
                    ))}
                  </div>
                ) : (
                  "None"
                )
              }
            />
          </Section>

          {/* Employees by day (full width) */}
          {hasEmployeesByDate && dayKeys.length > 0 && (
            <Section title="Crew by Day" full>
              <div style={notesGrid}>
                {dayKeys.map((date) => {
                  const list = employeesByDate?.[date] || [];
                  const grouped = groupEmployeesByRole(list);
                  const d = toDateSafe(date);
                  const pretty = d
                    ? d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
                    : date;

                  return (
                    <div key={date} style={noteCard}>
                      <div style={noteDate}>{pretty}</div>

                      {Object.keys(grouped).length ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          {Object.entries(grouped).map(([role, names]) => (
                            <div key={role} style={{ fontSize: 13 }}>
                              <div style={{ fontWeight: 800, marginBottom: 2 }}>{role}</div>
                              <div style={{ color: "#111" }}>{names.join(", ")}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#6b7280" }}>No one assigned.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Call times by day (full width) */}
          {hasCallTimesByDate && dayKeys.length > 0 && (
            <Section title="Call Times by Day" full>
              <div style={notesGrid}>
                {dayKeys.map((d) => {
                  const pretty = toDateSafe(d)
                    ? toDateSafe(d).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
                    : d;
                  return (
                    <div key={d} style={noteCard}>
                      <div style={noteDate}>{pretty}</div>
                      <div style={noteText}>{callTimesByDate?.[d] || "—"}</div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Day notes (full width) */}
          {booking.notesByDate &&
            Object.keys(booking.notesByDate).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).length > 0 && (
              <Section title="Day Notes" full>
                <div style={notesGrid}>
                  {Object.keys(booking.notesByDate)
                    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                    .sort((a, b) => new Date(a) - new Date(b))
                    .map((date) => {
                      const note = booking.notesByDate[date] || "—";
                      const other = booking.notesByDate[`${date}-other`];
                      const mins = booking.notesByDate[`${date}-travelMins`];

                      const final =
                        note === "Other" && other
                          ? `${note} — ${other}`
                          : note === "Travel Time" && mins
                          ? `Travel Time — ${mins} mins`
                          : note;

                      const d = toDateSafe(date);
                      const pretty = d
                        ? d.toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                          })
                        : date;

                      return (
                        <div key={date} style={noteCard}>
                          <div style={noteDate}>{pretty}</div>
                          <div style={noteText}>{final}</div>
                        </div>
                      );
                    })}
                </div>
              </Section>
            )}

          {/* Free-form notes (full width) */}
          {booking.notes && (
            <Section title="Notes" full>
              <div style={noteBox}>{booking.notes}</div>
            </Section>
          )}

          {/* Attachments (full width) */}
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

        {/* Footer meta */}
        <div style={footerMeta}>
          {booking?.createdBy && (
            <div>
              Created by <b>{booking.createdBy}</b>
              {booking?.createdAt && <> on {toDateSafe(booking.createdAt)?.toLocaleString("en-GB") || "—"}</>}
            </div>
          )}
          {booking?.lastEditedBy && (
            <div>
              Last edited by <b>{booking.lastEditedBy}</b>
              {booking?.updatedAt && <> on {toDateSafe(booking.updatedAt)?.toLocaleString("en-GB") || "—"}</>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={actions}>
          {fromDeleted ? (
            <>
              <button onClick={handleRestore} style={{ ...btn, background: "#111827" }}>
                Restore
              </button>
              <button onClick={onClose} style={{ ...btn, background: "#6c757d" }}>
                Close
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => router.push(`/u-crane-edit/${id}`)}
                style={{ ...btn, background: "#0d6efd" }}
              >
                Edit
              </button>
              <button onClick={handleDelete} style={{ ...btn, background: "#dc3545" }}>
                Delete
              </button>
              <button onClick={onClose} style={{ ...btn, background: "#6c757d" }}>
                Close
              </button>
            </>
          )}
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
      ...tagPill,
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
const sectionCard = { background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 };

const fieldRow = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px dashed #e5e7eb",
};
const fieldLabel = { color: "#6b7280", fontSize: 13 };
const fieldValue = { color: "#111", fontSize: 14 };

const notesGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 };
const noteCard = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 };
const noteDate = { fontWeight: 800, fontSize: 13, marginBottom: 6 };
const noteText = { fontSize: 14, color: "#111" };

const noteBox = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, lineHeight: 1.4 };

const tagWrap = { display: "flex", gap: 8, flexWrap: "wrap" };
const tagPill = {
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
const tagStatus = {
  marginLeft: 6,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 11,
  fontWeight: 800,
};

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

const miniCard = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 10,
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
    Enquiry: "#e5e7eb",
  };
  return map[status] || "#e5e7eb";
}
function onStatusColor(status = "") {
  return ["Confirmed", "DNH", "Holiday"].includes(status) ? "#111" : "#fff";
}
