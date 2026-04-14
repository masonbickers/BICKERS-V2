
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

const fmtDateTimeShort = (raw) => {
  const d = toDateSafe(raw);
  if (!d) return "Unknown time";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
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
  const keys = Object.keys(b?.notesByDate || {}).filter((k) =>
    /^\d{4}-\d{2}-\d{2}$/.test(k)
  );
  if (keys.length) return keys.sort((a, c) => new Date(a) - new Date(c));

  if (Array.isArray(b?.bookingDates) && b.bookingDates.length) {
    return [...b.bookingDates].sort((a, c) => new Date(a) - new Date(c));
  }

  const s = (b?.startDate || "").slice?.(0, 10);
  const e = (b?.endDate || "").slice?.(0, 10);
  const one =
    (b?.date || "").slice?.(0, 10) || (b?.startDate || "").slice?.(0, 10);

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

    if (typeof val === "object") {
      Object.values(val).forEach((v) => add(v, name));
    }
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
    .map((e) =>
      typeof e === "string" ? e : [e?.role, e?.name].filter(Boolean).join(" – ")
    )
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

/* ---------- hotel helpers ---------- */
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ".").trim());
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
};
const gbp = (v) =>
  `£${(Number.isFinite(v) ? v : 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getHotel = (b = {}) => {
  const hasHotel = !!b.hasHotel;

  const cost =
    typeof b.hotelCostPerNight === "number"
      ? b.hotelCostPerNight
      : num(
          b.hotelCostPerNight ??
            b.hotelCost ??
            b.hotelRate ??
            b.hotelAmount ??
            b.hotelPricePerNight ??
            0
        );

  const nights =
    typeof b.hotelNights === "number"
      ? b.hotelNights
      : int(b.hotelNights ?? b.nights ?? b.hotelQty ?? 0);

  const total =
    typeof b.hotelTotal === "number"
      ? b.hotelTotal
      : Math.round(cost * nights * 100) / 100;

  return { hasHotel, cost, nights, total };
};

const DELETE_REASON_OPTIONS = ["Cost", "Weather", "Competitor", "DNH", "Other"];

export default function ViewBookingModal({
  id,
  onClose,
  fromDeleted = false,
  deletedId = null,
}) {
  const [booking, setBooking] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);
  const [deleteReasons, setDeleteReasons] = useState([]);
  const [deleteReasonOther, setDeleteReasonOther] = useState("");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
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
  }, [id, fromDeleted, deletedId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      if (!mounted) return;
      setAllVehicles(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
    return () => (mounted = false);
  }, []);

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

  const vehicleStatusById = booking?.vehicleStatus || {};

  const vehiclesPrettyWithStatus = useMemo(() => {
    if (!normalizedVehicles.length) return [];
    return normalizedVehicles.map((v) => {
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

  const hotel = getHotel(booking || {});

  const handleDelete = async () => {
    if (!deleteReasons.length) {
      alert("Please choose at least one reason for delete.");
      return;
    }
    if (deleteReasons.includes("Other") && !deleteReasonOther.trim()) {
      alert("Please enter the 'Other' reason.");
      return;
    }

    const confirmDelete = confirm("Are you sure you want to delete this booking?");
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
        deleteReasons,
        deleteReasonOther: deleteReasons.includes("Other")
          ? deleteReasonOther.trim()
          : "",
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

      alert("Restored ");
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
  const historyTrail = Array.isArray(booking.history)
    ? [...booking.history]
        .map((entry, index) => ({
          id: `${entry?.timestamp || "no-time"}-${entry?.action || "change"}-${index}`,
          action: entry?.action || "Updated",
          user: entry?.user || entry?.updatedBy || entry?.by || "Unknown",
          at: toDateSafe(entry?.timestamp || entry?.updatedAt || entry?.date),
          changes: Array.isArray(entry?.changes)
            ? entry.changes.filter(Boolean)
            : [],
          note: entry?.note || entry?.description || entry?.details || "",
        }))
        .map((entry) => ({
          ...entry,
          note:
            entry.changes.length && entry.note === entry.changes.join("\n")
              ? ""
              : entry.note,
        }))
        .sort((a, b) => (a.at?.getTime?.() || 0) - (b.at?.getTime?.() || 0))
    : [];
  const visibleHistoryTrail = showFullHistory
    ? historyTrail
    : historyTrail.slice(Math.max(historyTrail.length - 3, 0));

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={modal}>
        {/* Header */}
        <div style={header}>
          <div>
            <div style={eyebrow}>Job #{booking.jobNumber || "—"}</div>
            <h2 style={title}>{booking.client || "Booking Details"}</h2>
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

        {/*  TOP ROW: Overview & People+Kit split 50/50 */}
        <div style={topSplit}>
          <div style={topCol}>
            <h3 style={sectionTitle}>Overview</h3>
            <div style={sectionCard}>
              <Field label="Production" value={booking.client || "—"} />
              <Field label="Location" value={booking.location || "—"} />
              <Field label="Date(s)" value={fmtDateRange(booking)} />

              <Field label="Contact Email" value={booking.contactEmail || "Not provided"} />
              <Field label="Contact Number" value={booking.contactNumber || "Not provided"} />

              {booking.hasHotel ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ ...fieldLabel, marginBottom: 6 }}>Hotel</div>
                  <div style={miniCard}>
                    <div style={{ display: "grid", gap: 6, fontSize: 13, color: "#111" }}>
                      <div>
                        <b>Cost per night:</b> {hotel.cost ? gbp(hotel.cost) : "—"}
                      </div>
                      <div>
                        <b>Nights:</b> {hotel.nights || "—"}
                      </div>
                      <div>
                        <b>Total:</b> {hotel.total ? gbp(hotel.total) : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Field label="Hotel" value="No" />
              )}

              {additionalContacts.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ ...fieldLabel, marginBottom: 6 }}>Additional Contacts</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {additionalContacts.map((c, idx) => {
                      const name = c?.name || "Contact";
                      const email = c?.email || "";
                      const phone = c?.phone || "";
                      const dept = c?.department || c?.role || "";
                      return (
                        <div key={idx} style={miniCard}>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>
                            {name}{" "}
                            {dept ? (
                              <span style={{ opacity: 0.7, fontWeight: 700 }}>({dept})</span>
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
            </div>
          </div>

          <div style={topCol}>
            <h3 style={sectionTitle}>People & Kit</h3>
            <div style={sectionCard}>
              <Field label="Employees" value={employeesPrettyText} />

              <Field
                label="Vehicles"
                value={
                  vehiclesPrettyWithStatus.length ? (
                    <div style={tagWrap}>
                      {vehiclesPrettyWithStatus.map((v, i) => (
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
            </div>
          </div>
        </div>

        {/*  REST OF CONTENT full width below */}
        <div style={belowStack}>
          {hasEmployeesByDate && dayKeys.length > 0 && (
            <Section title="Employees by Day">
              <div style={notesGrid}>
                {dayKeys.map((date) => {
                  const list = employeesByDate?.[date] || [];
                  const grouped = groupEmployeesByRole(list);
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

          {hasCallTimesByDate && dayKeys.length > 0 && (
            <Section title="Call Times by Day">
              <div style={notesGrid}>
                {dayKeys.map((d) => {
                  const pretty = toDateSafe(d)
                    ? toDateSafe(d).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })
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

          {booking.notesByDate &&
            Object.keys(booking.notesByDate).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).length >
              0 && (
              <Section title="Day Notes">
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

          {booking.notes && (
            <Section title="Notes">
              <div style={noteBox}>{booking.notes}</div>
            </Section>
          )}

          {(() => {
            const files = toAttachmentList(booking);
            if (!files.length) return null;
            return (
              <Section title="Attachments">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
        <div style={{ display: "none" }}>
          {booking?.createdBy && (
            <div>
              Created by <b>{booking.createdBy}</b>
              {booking?.createdAt && (
                <> on {toDateSafe(booking.createdAt)?.toLocaleString("en-GB") || "—"}</>
              )}
            </div>
          )}
          {booking?.lastEditedBy && (
            <div>
              Last edited by <b>{booking.lastEditedBy}</b>
              {booking?.updatedAt && (
                <> on {toDateSafe(booking.updatedAt)?.toLocaleString("en-GB") || "—"}</>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <details style={historyDetails}>
          <summary style={historySummary}>
            Modification trail
            <span style={historyCount}>{historyTrail.length}</span>
          </summary>
          <div style={historyBody}>
            {visibleHistoryTrail.length ? (
              visibleHistoryTrail.map((entry) => (
                <div key={entry.id} style={historyItem}>
                  <div style={historyTopRow}>
                    <span style={historyAction}>{entry.action}</span>
                    <span style={historyMeta}>
                      {entry.user}
                      {" • "}
                      {fmtDateTimeShort(entry.at)}
                    </span>
                  </div>
                  {entry.changes.length ? (
                    <div style={historyChanges}>
                      {entry.changes.map((change, idx) => (
                        <div key={`${entry.id}-change-${idx}`} style={historyChangeLine}>
                          {change}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {entry.note ? <div style={historyNote}>{entry.note}</div> : null}
                </div>
              ))
            ) : (
              <div style={historyEmpty}>No modification history recorded for this job.</div>
            )}
            {historyTrail.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowFullHistory((prev) => !prev)}
                style={historyToggleBtn}
              >
                {showFullHistory ? "Show less" : `See more (${historyTrail.length - 3} older)`}
              </button>
            ) : null}
          </div>
        </details>

        {!fromDeleted && (
          <details style={deleteDetails}>
            <summary style={deleteSummary}>Delete options</summary>
            <div style={deleteBody}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
                Reason for delete (required)
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {DELETE_REASON_OPTIONS.map((r) => (
                  <label
                    key={r}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                  >
                    <input
                      type="checkbox"
                      checked={deleteReasons.includes(r)}
                      onChange={() =>
                        setDeleteReasons((prev) =>
                          prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
                        )
                      }
                    />
                    {r}
                  </label>
                ))}
              </div>
              {deleteReasons.includes("Other") && (
                <input
                  type="text"
                  placeholder="Other reason..."
                  value={deleteReasonOther}
                  onChange={(e) => setDeleteReasonOther(e.target.value)}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    padding: "7px 9px",
                    fontSize: 12,
                  }}
                />
              )}
            </div>
          </details>
        )}

        <div style={footerMeta}>
          {booking?.createdBy && (
            <div>
              Created by <b>{booking.createdBy}</b>
              {booking?.createdAt && (
                <> on {toDateSafe(booking.createdAt)?.toLocaleString("en-GB") || "â€”"}</>
              )}
            </div>
          )}
          {booking?.lastEditedBy && (
            <div>
              Last edited by <b>{booking.lastEditedBy}</b>
              {booking?.updatedAt && (
                <> on {toDateSafe(booking.updatedAt)?.toLocaleString("en-GB") || "â€”"}</>
              )}
            </div>
          )}
        </div>

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
                onClick={() => router.push(`/edit-booking/${id}`)}
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
  <span
    title={title}
    style={{ ...chip, background: good ? "#22c55e" : "#ef4444", color: "#fff" }}
  >
    {label} {good ? "Yes" : "No"}
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
  width: "min(1240px, 98vw)",
  maxHeight: "94vh",
  overflow: "auto",
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  padding: 16,
};

const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 8,
};

const eyebrow = {
  fontSize: 12,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#6b7280",
};
const title = { margin: 0, fontSize: 20, lineHeight: 1.15 };

const badge = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  border: "1px solid #111",
};

const chipRow = { display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 12px" };

/*  NEW: top split layout */
const topSplit = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  alignItems: "start",
};
const topCol = { minWidth: 0 }; // prevents overflow

/*  NEW: below stack */
const belowStack = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const sectionTitle = {
  margin: "0 0 6px 0",
  fontSize: 12,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
const sectionCard = {
  background: "#fafafa",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 10,
};

const fieldRow = {
  display: "grid",
  gridTemplateColumns: "118px 1fr",
  gap: 8,
  padding: "5px 0",
  borderBottom: "1px dashed #e5e7eb",
};
const fieldLabel = { color: "#6b7280", fontSize: 12 };
const fieldValue = { color: "#111", fontSize: 13 };

const notesGrid = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 6,
};
const noteCard = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 };
const noteDate = { fontWeight: 800, fontSize: 12, marginBottom: 4 };
const noteText = { fontSize: 12, color: "#111" };

const noteBox = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
  lineHeight: 1.4,
  fontSize: 12,
};

const tagWrap = { display: "flex", gap: 6, flexWrap: "wrap" };
const tagPill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 7px",
  background: "#f3f4f6",
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  fontSize: 11,
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

const chip = { padding: "3px 7px", borderRadius: 999, fontSize: 11, border: "1px solid #111" };

const tag = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 7px",
  background: "#f3f4f6",
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  fontSize: 11,
  whiteSpace: "nowrap",
};

const fileBtn = {
  display: "inline-block",
  padding: "4px 8px",
  background: "#fff",
  color: "#111",
  borderRadius: 999,
  textDecoration: "none",
  border: "1px solid #d1d5db",
  fontSize: 11,
};

const historyDetails = {
  marginTop: 12,
  paddingTop: 8,
  borderTop: "1px solid #e5e7eb",
};

const historySummary = {
  cursor: "pointer",
  listStyle: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "4px 0",
  fontSize: 12,
  fontWeight: 700,
  color: "#111827",
};

const historyCount = {
  minWidth: 20,
  padding: "1px 6px",
  borderRadius: 999,
  background: "#e5e7eb",
  color: "#111827",
  fontSize: 11,
  textAlign: "center",
};

const historyBody = {
  display: "grid",
  gap: 8,
  padding: "6px 0 0",
};

const historyItem = {
  padding: "2px 0",
};

const historyTopRow = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const historyAction = {
  fontSize: 12,
  fontWeight: 700,
  color: "#111827",
};

const historyMeta = {
  fontSize: 12,
  color: "#6b7280",
};

const historyNote = {
  marginTop: 4,
  fontSize: 12,
  color: "#111827",
  whiteSpace: "pre-wrap",
};

const historyChanges = {
  marginTop: 4,
  display: "grid",
  gap: 2,
};

const historyChangeLine = {
  fontSize: 12,
  color: "#111827",
};

const historyEmpty = {
  fontSize: 12,
  color: "#6b7280",
};

const historyToggleBtn = {
  marginTop: 4,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "#2563eb",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  textAlign: "left",
};

const deleteDetails = {
  marginTop: 10,
  paddingTop: 8,
  borderTop: "1px solid #e5e7eb",
};

const deleteSummary = {
  cursor: "pointer",
  listStyle: "none",
  padding: "4px 0",
  fontSize: 12,
  fontWeight: 700,
  color: "#111827",
};

const deleteBody = {
  padding: "6px 0 0",
};

const footerMeta = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #e5e7eb",
  color: "#6b7280",
  fontSize: 11,
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const actions = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #e5e7eb",
  flexWrap: "wrap",
};

const btn = {
  padding: "8px 12px",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
};

const miniCard = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 8,
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
