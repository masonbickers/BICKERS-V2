
"use client";

import layoutStyles from "./ViewBookingModal.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/app/utils/firebaseClient";
import {
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { cacheBookingForEdit } from "@/app/utils/editBookingCache";
import RouteLoadingOverlay from "./RouteLoadingOverlay";
import { getFixedJobStatusStyle } from "@/app/utils/jobStatusColors";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

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
  if (!d) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const fmtDate = (iso) => {
  const d = toDateSafe(iso);
  return d ? fmtGB(d) : "-";
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
  if (!b) return "-";
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) {
    return b.bookingDates
      .map((x) => {
        const d = toDateSafe(x);
        return d ? fmtGB(d) : String(x);
      })
      .join(", ");
  }
  if (b.startDate && b.endDate) return `${fmtDate(b.startDate)} to ${fmtDate(b.endDate)}`;
  if (b.date) return fmtDate(b.date);
  if (b.startDate) return fmtDate(b.startDate);
  return "-";
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

const hasSavedQuote = (quote = {}) =>
  Boolean(
    quote &&
      typeof quote === "object" &&
      (quote.savedAt ||
        quote.updatedAt ||
        quote.quoteNumber ||
        quote.templateId ||
        quote.templateName ||
        (Array.isArray(quote.lineItems) && quote.lineItems.length))
  );

const quoteSavedTime = (quote = {}) =>
  toDateSafe(quote.savedAt || quote.updatedAt || quote.createdAt)?.getTime?.() || 0;

const latestQuoteEntry = (b = {}) => {
  const versions = Array.isArray(b.quoteVersions)
    ? b.quoteVersions.filter((entry) => entry && typeof entry === "object")
    : [];
  const entries = versions.length ? versions : hasSavedQuote(b.quote) ? [b.quote] : [];
  return entries.reduce((latest, entry) => {
    if (!latest) return entry;
    return quoteSavedTime(entry) >= quoteSavedTime(latest) ? entry : latest;
  }, null);
};

const quoteStatusSummary = (b = {}) => {
  const quote = latestQuoteEntry(b);
  const quoteNumber = String(quote?.quoteNumber || b.quoteNumber || "").trim();
  const hasNumber = Boolean(quoteNumber || (Array.isArray(b.quoteNumbers) && b.quoteNumbers.length));
  const hasQuoteFile = Boolean(b.quoteUrl || b.pdfURL || b.pdfUrl);
  const saved = Boolean(quote);
  const rawStatus = String(quote?.status || "").trim();
  const status = rawStatus || (saved ? "Draft" : hasQuoteFile ? "Attached" : "Not started");
  const done = status.toLowerCase() === "accepted";

  if (done) return { label: "Done", detail: "Accepted", tone: "green" };
  if (saved) return { label: status, detail: quoteNumber || "Saved quote", tone: status === "Sent" ? "blue" : "amber" };
  if (hasQuoteFile) return { label: "Attached", detail: "File uploaded", tone: "blue" };
  if (hasNumber) return { label: "Not done", detail: "Quote number only", tone: "red" };
  return { label: "Not started", detail: "No quote yet", tone: "red" };
};

const getViewableQuoteNumber = (b = {}) => {
  const latestQuote = latestQuoteEntry(b);
  return String(
    b.acceptedQuoteNumber ||
      latestQuote?.quoteNumber ||
      b.quoteNumber ||
      (Array.isArray(b.quoteNumbers) ? b.quoteNumbers.at(-1) : "") ||
      ""
  ).trim();
};

/* ---------- employees helpers ---------- */
const prettyEmployees = (list) =>
  (Array.isArray(list) ? list : [])
    .map((e) =>
      typeof e === "string" ? e : [e?.role, e?.name].filter(Boolean).join(" - ")
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
  `GBP ${(Number.isFinite(v) ? v : 0).toLocaleString("en-GB", {
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
  initialBooking = null,
  initialVehicles = [],
  onEdit = null,
}) {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [booking, setBooking] = useState(initialBooking);
  const [allVehicles, setAllVehicles] = useState(initialVehicles);
  const [deleteReasons, setDeleteReasons] = useState([]);
  const [deleteReasonOther, setDeleteReasonOther] = useState("");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editProgress, setEditProgress] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  const handleEdit = () => {
    if (editLoading) return;

    setEditLoading(true);
    setEditProgress(8);

    try {
      const bookingForCache = booking?.id ? booking : { ...(booking || {}), id };
      cacheBookingForEdit(bookingForCache);

      setTimeout(() => {
        try {
          if (typeof onEdit === "function") {
            onEdit(bookingForCache);
            return;
          }
          const returnTo =
            typeof window !== "undefined"
              ? `${pathname || "/dashboard"}${window.location.search || ""}`
              : pathname || "/dashboard";
          router.push(`/edit-booking/${id}?returnTo=${encodeURIComponent(returnTo)}`);
        } catch (error) {
          console.error("Open edit booking failed:", error);
          setEditLoading(false);
          setEditProgress(0);
          alert("Failed to open edit page. Please try again.");
        }
      }, 80);
    } catch (error) {
      console.error("Prepare edit booking failed:", error);
      setEditLoading(false);
      setEditProgress(0);
      alert("Failed to open edit page. Please try again.");
    }
  };

  useEffect(() => {
    if (!editLoading) return undefined;

    const timer = setInterval(() => {
      setEditProgress((current) => {
        if (current >= 95) return current;
        const step = current < 45 ? 9 : current < 75 ? 5 : 2;
        return Math.min(95, current + step);
      });
    }, 320);

    return () => clearInterval(timer);
  }, [editLoading]);

  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && !editLoading && onClose?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose, editLoading]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!fromDeleted && String(initialBooking?.id || "") === String(id || "")) {
          setBooking(initialBooking);
          return;
        }

        const gate = resolveDataAccess(dataAccessState);
        if (gate.checking) return;
        if (!gate.allowed) {
          reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load booking modal" });
          return;
        }

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
        alert(`Failed to load booking${e?.code ? ` (${e.code})` : ""}. Check console.`);
      }
    })();

    return () => (mounted = false);
  }, [accessKey, dataAccessState, id, fromDeleted, deletedId, initialBooking, onClose]);

  useEffect(() => {
    if (initialVehicles.length) {
      setAllVehicles(initialVehicles);
      return undefined;
    }
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "load booking modal vehicles" });
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
  }, [accessKey, dataAccessState, initialVehicles]);

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

  const vehicleStatusById = useMemo(
    () => booking?.vehicleStatus || {},
    [booking?.vehicleStatus]
  );

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

  const employeesByDate = useMemo(
    () => booking?.employeesByDate || {},
    [booking?.employeesByDate]
  );
  const hasEmployeesByDate = useMemo(() => {
    return (
      !!employeesByDate &&
      Object.keys(employeesByDate).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    );
  }, [employeesByDate]);

  const callTimesByDate = useMemo(
    () => booking?.callTimesByDate || {},
    [booking?.callTimesByDate]
  );
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

      await setDoc(doc(db, "deletedBookings", String(id)), tenantPayload(dataAccessState, {
        originalCollection: "bookings",
        originalId: String(id),
        deletedAt: serverTimestamp(),
        deletedBy: auth?.currentUser?.email || "",
        deleteReasons,
        deleteReasonOther: deleteReasons.includes("Other")
          ? deleteReasonOther.trim()
          : "",
        data,
      }));

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
        tenantPayload(dataAccessState, {
          ...clean,
          restoredAt: serverTimestamp(),
          restoredBy: auth?.currentUser?.email || "",
        }),
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
  const quoteStatus = quoteStatusSummary(booking);
  const viewableQuoteNumber = getViewableQuoteNumber(booking);
  const canViewQuote = !fromDeleted && Boolean(booking?.id && (viewableQuoteNumber || latestQuoteEntry(booking)));
  const quoteViewHref = canViewQuote
    ? `/quote-view/${booking.id}${viewableQuoteNumber ? `?quote=${encodeURIComponent(viewableQuoteNumber)}` : ""}`
    : "";

  const showReasons = ["Lost", "Postponed", "Cancelled"].includes(booking.status);
  const reasonsText =
    Array.isArray(booking.statusReasons) && booking.statusReasons.length
      ? booking.statusReasons
          .map((r) =>
            r === "Other" && booking.statusReasonOther ? `Other: ${booking.statusReasonOther}` : r
          )
          .join(", ")
      : "-";

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
    <div
      className={layoutStyles.extracted1}
      onClick={(e) => e.target === e.currentTarget && !editLoading && onClose?.()}
    >
      <div className={layoutStyles.extracted2}>
        {/* Header */}
        <div className={layoutStyles.extracted3}>
          <div>
            <div className={layoutStyles.extracted4}>Job #{booking.jobNumber || "-"}</div>
            <h2 className={layoutStyles.extracted5}>{booking.client || "Booking Details"}</h2>
            {fromDeleted && (
              <div className={layoutStyles.extracted6}>
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
            {booking.status || "-"}
          </span>
        </div>

        {/* Quick chips */}
        <div className={layoutStyles.extracted7}>
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
        <div className={layoutStyles.extracted8}>
          <div className={layoutStyles.extracted9}>
            <h3 className={layoutStyles.extracted10}>Overview</h3>
            <div className={layoutStyles.extracted11}>
              <Field label="Production Company" value={booking.client || booking.productionCompany || "-"} />
              <Field label="Production" value={booking.production || "-"} />
              <Field
                label="Quote Number"
                value={
                  <div className={layoutStyles.extracted12}>
                    <span>{String(booking.quoteNumber || viewableQuoteNumber || "").trim() || "-"}</span>
                    {canViewQuote ? (
                      <button
                        type="button"
                        onClick={() => router.push(quoteViewHref)}
                        className={layoutStyles.extracted13}
                      >
                        View quote
                      </button>
                    ) : null}
                  </div>
                }
              />
              <Field label="Quote Status" value={<QuoteStatusPill summary={quoteStatus} />} />
              <Field label="Location" value={booking.location || "-"} />
              <Field label="Date(s)" value={fmtDateRange(booking)} />

              <Field label="Contact Email" value={booking.contactEmail || "Not provided"} />
              <Field label="Contact Number" value={booking.contactNumber || "Not provided"} />

              {booking.hasHotel ? (
                <div className={layoutStyles.extracted14}>
                  <div className={layoutStyles.extracted15}>Hotel</div>
                  <div className={layoutStyles.extracted16}>
                    <div className={layoutStyles.extracted17}>
                      <div>
                        <b>Cost per night:</b> {hotel.cost ? gbp(hotel.cost) : "-"}
                      </div>
                      <div>
                        <b>Nights:</b> {hotel.nights || "-"}
                      </div>
                      <div>
                        <b>Total:</b> {hotel.total ? gbp(hotel.total) : "-"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Field label="Hotel" value="No" />
              )}

              {additionalContacts.length > 0 && (
                <div className={layoutStyles.extracted18}>
                  <div className={layoutStyles.extracted19}>Additional Contacts</div>
                  <div className={layoutStyles.extracted20}>
                    {additionalContacts.map((c, idx) => {
                      const name = c?.name || "Contact";
                      const email = c?.email || "";
                      const phone = c?.phone || "";
                      const dept = c?.department || c?.role || "";
                      return (
                        <div key={idx} className={layoutStyles.extracted21}>
                          <div className={layoutStyles.extracted22}>
                            {name}{" "}
                            {dept ? (
                              <span className={layoutStyles.extracted23}>({dept})</span>
                            ) : null}
                          </div>
                          <div className={layoutStyles.extracted24}>
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

          <div className={layoutStyles.extracted25}>
            <h3 className={layoutStyles.extracted26}>People & Kit</h3>
            <div className={layoutStyles.extracted27}>
              <Field label="Employees" value={employeesPrettyText} />

              <Field
                label="Vehicles"
                value={
                  vehiclesPrettyWithStatus.length ? (
                    <div className={layoutStyles.extracted28}>
                      {vehiclesPrettyWithStatus.map((v, i) => (
                        <span key={`${v.id}-${i}`} className={layoutStyles.extracted29}>
                          {v.name}
                          {v.plate && <span className={layoutStyles.extracted30}>{v.plate}</span>}
                          {v.status && <span className={layoutStyles.extracted31}>{v.status}</span>}
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
                    <div className={layoutStyles.extracted32}>
                      {booking.equipment.map((e, i) => (
                        <span key={`${e}-${i}`} className={layoutStyles.extracted33}>
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
        <div className={layoutStyles.extracted34}>
          {hasEmployeesByDate && dayKeys.length > 0 && (
            <Section title="Employees by Day">
              <div className={layoutStyles.extracted35}>
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
                    <div key={date} className={layoutStyles.extracted36}>
                      <div className={layoutStyles.extracted37}>{pretty}</div>

                      {Object.keys(grouped).length ? (
                        <div className={layoutStyles.extracted38}>
                          {Object.entries(grouped).map(([role, names]) => (
                            <div key={role} className={layoutStyles.extracted39}>
                              <div className={layoutStyles.extracted40}>{role}</div>
                              <div className={layoutStyles.extracted41}>{names.join(", ")}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={layoutStyles.extracted42}>No one assigned.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {hasCallTimesByDate && dayKeys.length > 0 && (
            <Section title="Call Times by Day">
              <div className={layoutStyles.extracted43}>
                {dayKeys.map((d) => {
                  const pretty = toDateSafe(d)
                    ? toDateSafe(d).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })
                    : d;
                  return (
                    <div key={d} className={layoutStyles.extracted44}>
                      <div className={layoutStyles.extracted45}>{pretty}</div>
                      <div className={layoutStyles.extracted46}>{callTimesByDate?.[d] || "-"}</div>
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
                <div className={layoutStyles.extracted47}>
                  {Object.keys(booking.notesByDate)
                    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                    .sort((a, b) => new Date(a) - new Date(b))
                    .map((date) => {
                      const note = booking.notesByDate[date] || "-";
                      const other = booking.notesByDate[`${date}-other`];
                      const mins = booking.notesByDate[`${date}-travelMins`];

                      const final =
                        note === "Other" && other
                          ? `${note} - ${other}`
                          : note === "Travel Time" && mins
                          ? `Travel Time - ${mins} mins`
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
                        <div key={date} className={layoutStyles.extracted48}>
                          <div className={layoutStyles.extracted49}>{pretty}</div>
                          <div className={layoutStyles.extracted50}>{final}</div>
                        </div>
                      );
                    })}
                </div>
              </Section>
            )}

          {booking.notes && (
            <Section title="Notes">
              <div className={layoutStyles.extracted51}>{booking.notes}</div>
            </Section>
          )}

          {(() => {
            const files = toAttachmentList(booking);
            if (!files.length) return null;
            return (
              <Section title="Attachments">
                <div className={layoutStyles.extracted52}>
                  {files.map((f, i) => (
                    <a
                      key={f.url || i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={layoutStyles.extracted53}
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
        <div className={layoutStyles.extracted54}>
          {booking?.createdBy && (
            <div>
              Created by <b>{booking.createdBy}</b>
              {booking?.createdAt && (
                <> on {toDateSafe(booking.createdAt)?.toLocaleString("en-GB") || "-"}</>
              )}
            </div>
          )}
          {booking?.lastEditedBy && (
            <div>
              Last edited by <b>{booking.lastEditedBy}</b>
              {booking?.updatedAt && (
                <> on {toDateSafe(booking.updatedAt)?.toLocaleString("en-GB") || "-"}</>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <details className={layoutStyles.extracted55}>
          <summary className={layoutStyles.extracted56}>
            Modification trail
            <span className={layoutStyles.extracted57}>{historyTrail.length}</span>
          </summary>
          <div className={layoutStyles.extracted58}>
            {visibleHistoryTrail.length ? (
              visibleHistoryTrail.map((entry) => (
                <div key={entry.id} className={layoutStyles.extracted59}>
                  <div className={layoutStyles.extracted60}>
                    <span className={layoutStyles.extracted61}>{entry.action}</span>
                    <span className={layoutStyles.extracted62}>
                      {entry.user}
                      {" | "}
                      {fmtDateTimeShort(entry.at)}
                    </span>
                  </div>
                  {entry.changes.length ? (
                    <div className={layoutStyles.extracted63}>
                      {entry.changes.map((change, idx) => (
                        <div key={`${entry.id}-change-${idx}`} className={layoutStyles.extracted64}>
                          {change}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {entry.note ? <div className={layoutStyles.extracted65}>{entry.note}</div> : null}
                </div>
              ))
            ) : (
              <div className={layoutStyles.extracted66}>No modification history recorded for this job.</div>
            )}
            {historyTrail.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowFullHistory((prev) => !prev)}
                className={layoutStyles.extracted67}
              >
                {showFullHistory ? "Show less" : `See more (${historyTrail.length - 3} older)`}
              </button>
            ) : null}
          </div>
        </details>

        {!fromDeleted && (
          <details className={layoutStyles.extracted68}>
            <summary className={layoutStyles.extracted69}>Delete options</summary>
            <div className={layoutStyles.extracted70}>
              <div className={layoutStyles.extracted71}>
                Reason for delete (required)
              </div>
              <div className={layoutStyles.extracted72}>
                {DELETE_REASON_OPTIONS.map((r) => (
                  <label
                    key={r}
                    className={layoutStyles.extracted73}
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
                  className={layoutStyles.extracted74}
                />
              )}
            </div>
          </details>
        )}

        <div className={layoutStyles.extracted75}>
          {booking?.createdBy && (
            <div>
              Created by <b>{booking.createdBy}</b>
              {booking?.createdAt && (
                <> on {toDateSafe(booking.createdAt)?.toLocaleString("en-GB") || "-"}</>
              )}
            </div>
          )}
          {booking?.lastEditedBy && (
            <div>
              Last edited by <b>{booking.lastEditedBy}</b>
              {booking?.updatedAt && (
                <> on {toDateSafe(booking.updatedAt)?.toLocaleString("en-GB") || "-"}</>
              )}
            </div>
          )}
        </div>

        <div className={layoutStyles.extracted76}>
          {fromDeleted ? (
            <>
              <button onClick={handleRestore} className={layoutStyles.extracted77}>
                Restore
              </button>
              <button onClick={onClose} className={layoutStyles.extracted78}>
                Close
              </button>
            </>
          ) : (
            <>
              {canViewQuote ? (
                <button
                  onClick={() => router.push(quoteViewHref)}
                  disabled={editLoading}
                  style={{
                    ...btn,
                    background: "var(--color-brand)",
                    cursor: editLoading ? "not-allowed" : "pointer",
                    opacity: editLoading ? 0.58 : 1,
                  }}
                >
                  View Quote
                </button>
              ) : null}
              <button
                onClick={handleEdit}
                disabled={editLoading}
                style={{
                  ...btn,
                  background: "var(--color-info)",
                  cursor: editLoading ? "wait" : "pointer",
                  opacity: editLoading ? 0.82 : 1,
                }}
              >
                {editLoading ? `Opening ${editProgress}%` : "Edit"}
              </button>
              <button
                onClick={handleDelete}
                disabled={editLoading}
                style={{
                  ...btn,
                  background: "var(--color-danger)",
                  cursor: editLoading ? "not-allowed" : "pointer",
                  opacity: editLoading ? 0.58 : 1,
                }}
              >
                Delete
              </button>
              <button
                onClick={onClose}
                disabled={editLoading}
                style={{
                  ...btn,
                  background: "var(--color-text-muted)",
                  cursor: editLoading ? "not-allowed" : "pointer",
                  opacity: editLoading ? 0.58 : 1,
                }}
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>

      {editLoading && (
        <RouteLoadingOverlay
          progress={editProgress}
          title="Opening edit page"
          hint="Preparing booking details..."
        />
      )}
    </div>
  );
}

/* ---------- tiny presentational components ---------- */
function Section({ title, children, full = false }) {
  return (
    <section style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <h3 className={layoutStyles.extracted79}>{title}</h3>
      <div className={layoutStyles.extracted80}>{children}</div>
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div className={layoutStyles.extracted81}>
      <div className={layoutStyles.extracted82}>{label}</div>
      <div className={layoutStyles.extracted83}>{value || "-"}</div>
    </div>
  );
}

function QuoteStatusPill({ summary }) {
  const tone = quoteStatusTone(summary?.tone);
  return (
    <span style={{ ...quoteStatusPill, ...tone }}>
      <span>{summary?.label || "Not started"}</span>
      {summary?.detail ? <span className={layoutStyles.extracted84}>{summary.detail}</span> : null}
    </span>
  );
}

const Chip = ({ good, label, title }) => (
  <span
    title={title}
    style={{
      ...chip,
      background: good ? "var(--color-success-soft)" : "var(--color-accent-soft)",
      color: good ? "var(--color-success)" : "var(--color-danger)",
      borderColor: good ? "var(--color-success-border)" : "var(--color-danger-border)",
    }}
  >
    {label} {good ? "Yes" : "No"}
  </span>
);

const Tag = ({ children, dark, success }) => (
  <span
    style={{
      ...tag,
      background: success ? "var(--color-success-soft)" : dark ? "var(--color-info-soft)" : "var(--color-surface-subtle)",
      color: success ? "var(--color-success)" : dark ? "var(--color-brand)" : "var(--color-text-muted)",
      border: success ? "1px solid var(--color-success-border)" : dark ? "1px solid var(--color-info-border)" : "1px solid var(--color-border)",
    }}
  >
    {children}
  </span>
);

/* ---------- styles ---------- */
const overlay = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15,23,42,0.58)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 16,
  zIndex: 9999,
};

const modal = {
  background: "var(--color-surface-subtle)",
  color: "var(--color-text)",
  width: "min(1240px, 98vw)",
  maxHeight: "94vh",
  overflow: "auto",
  borderRadius: 14,
  border: "1px solid rgba(226,232,240,0.95)",
  boxShadow: "0 24px 70px rgba(15,23,42,0.32)",
  padding: 12,
};

const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 7,
  paddingBottom: 7,
  borderBottom: "1px solid var(--color-border)",
};

const eyebrow = {
  fontSize: 11,
  letterSpacing: 0,
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  fontWeight: 800,
};
const title = { margin: 0, fontSize: 19, lineHeight: 1.08, color: "var(--color-text)", fontWeight: 900 };

const badge = {
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 900,
  border: "1px solid rgba(15,23,42,0.18)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
};

const chipRow = { display: "flex", gap: 5, flexWrap: "wrap", margin: "6px 0 9px" };

/*  NEW: top split layout */
const topSplit = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  alignItems: "start",
};
const topCol = { minWidth: 0 }; // prevents overflow

/*  NEW: below stack */
const belowStack = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
  alignItems: "start",
};

const sectionTitle = {
  margin: "0 0 4px 0",
  fontSize: 11.5,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: 0,
  fontWeight: 900,
};
const sectionCard = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 9,
  padding: 8,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};
const compactSectionCard = {
  background: "color-mix(in srgb, var(--color-surface) 62%, transparent)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 6,
  boxShadow: "none",
};

const fieldRow = {
  display: "grid",
  gridTemplateColumns: "118px 1fr",
  gap: 8,
  padding: "3px 0",
  borderBottom: "1px solid var(--color-brand-soft)",
};
const fieldLabel = { color: "var(--color-text-muted)", fontSize: 11.5, fontWeight: 700 };
const fieldValue = { color: "var(--color-text)", fontSize: 12.5, fontWeight: 600 };

const quoteNumberActionRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  minWidth: 0,
};

const viewQuoteButton = {
  border: "1px solid var(--color-border-strong)",
  borderRadius: 999,
  background: "var(--color-surface)",
  color: "var(--color-brand)",
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  lineHeight: 1.35,
};

const quoteStatusPill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  maxWidth: "100%",
  borderRadius: 999,
  padding: "2px 7px",
  border: "1px solid",
  fontSize: 11.5,
  fontWeight: 900,
  lineHeight: 1.25,
};
const quoteStatusDetail = {
  opacity: 0.78,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const quoteStatusTone = (tone) => {
  if (tone === "green") return { background: "var(--color-success-soft)", color: "var(--color-success)", borderColor: "var(--color-success-border)" };
  if (tone === "blue") return { background: "var(--color-info-soft)", color: "var(--color-brand)", borderColor: "var(--color-info-border)" };
  if (tone === "amber") return { background: "var(--color-accent-soft)", color: "var(--color-warning)", borderColor: "var(--color-warning-border)" };
  return { background: "var(--color-accent-soft)", color: "var(--color-danger)", borderColor: "var(--color-danger-border)" };
};

const notesGrid = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 5,
};
const noteCard = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 7,
  padding: "6px 8px",
};
const noteDate = { fontWeight: 900, fontSize: 11.5, marginBottom: 2, color: "var(--color-text)" };
const noteText = { fontSize: 12, color: "var(--color-text-muted)" };

const noteBox = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 7,
  padding: "6px 8px",
  lineHeight: 1.4,
  fontSize: 12,
};

const tagWrap = { display: "flex", gap: 6, flexWrap: "wrap" };
const tagPill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "2px 6px",
  background: "var(--color-surface-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: 999,
  fontSize: 10.5,
  whiteSpace: "nowrap",
  color: "var(--color-text)",
  fontWeight: 700,
};
const tagSub = { opacity: 0.7, fontSize: 11 };
const tagStatus = {
  marginLeft: 6,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-surface)",
  fontSize: 11,
  fontWeight: 800,
};

const chip = { padding: "2px 7px", borderRadius: 999, fontSize: 10.5, border: "1px solid var(--color-border-strong)", fontWeight: 800 };

const tag = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "2px 7px",
  background: "var(--color-surface-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: 999,
  fontSize: 10.5,
  whiteSpace: "nowrap",
  fontWeight: 800,
};

const fileBtn = {
  display: "inline-block",
  padding: "3px 7px",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  borderRadius: 999,
  textDecoration: "none",
  border: "1px solid var(--color-border-strong)",
  fontSize: 10.5,
};

const historyDetails = {
  marginTop: 9,
  paddingTop: 6,
  borderTop: "1px solid var(--color-border)",
};

const historySummary = {
  cursor: "pointer",
  listStyle: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "3px 0",
  fontSize: 12,
  fontWeight: 800,
  color: "var(--color-text)",
};

const historyCount = {
  minWidth: 20,
  padding: "1px 6px",
  borderRadius: 999,
  background: "var(--color-border)",
  color: "var(--color-text-muted)",
  fontSize: 11,
  textAlign: "center",
};

const historyBody = {
  display: "grid",
  gap: 6,
  padding: "5px 0 0",
};

const historyItem = {
  padding: "6px 7px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
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
  fontWeight: 800,
  color: "var(--color-text)",
};

const historyMeta = {
  fontSize: 12,
  color: "var(--color-text-muted)",
};

const historyNote = {
  marginTop: 4,
  fontSize: 12,
  color: "var(--color-text-muted)",
  whiteSpace: "pre-wrap",
};

const historyChanges = {
  marginTop: 4,
  display: "grid",
  gap: 2,
};

const historyChangeLine = {
  fontSize: 12,
  color: "var(--color-text-muted)",
};

const historyEmpty = {
  fontSize: 12,
  color: "var(--color-text-muted)",
};

const historyToggleBtn = {
  marginTop: 4,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "var(--color-brand)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  textAlign: "left",
};

const deleteDetails = {
  marginTop: 8,
  paddingTop: 6,
  borderTop: "1px solid var(--color-border)",
};

const deleteSummary = {
  cursor: "pointer",
  listStyle: "none",
  padding: "3px 0",
  fontSize: 12,
  fontWeight: 800,
  color: "var(--color-text)",
};

const deleteBody = {
  padding: "6px 0 0",
};

const footerMeta = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: "1px solid var(--color-border)",
  color: "var(--color-text-muted)",
  fontSize: 11,
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const actions = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 8,
  paddingTop: 8,
  borderTop: "1px solid var(--color-border)",
  flexWrap: "wrap",
};

const btn = {
  padding: "7px 11px",
  color: "var(--color-white)",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 12,
  boxShadow: "0 1px 2px rgba(15,23,42,0.16)",
};

const miniCard = {
  background: "var(--color-surface-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 7,
};

function statusColor(status = "") {
  return getFixedJobStatusStyle(status).bg;
}
function onStatusColor(status = "") {
  return getFixedJobStatusStyle(status).text;
}
