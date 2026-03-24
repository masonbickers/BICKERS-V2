"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
  query as fsQuery,
  where,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

/* -------------------------------------------------------------------------- */
/*                               HELPERS                                      */
/* -------------------------------------------------------------------------- */

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const LUNCH_DEDUCT_HRS = 0.5;
const UI = {
  radius: 18,
  radiusSm: 12,
  bg: "#edf3f8",
  panel: "#ffffff",
  panelTint: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  ink: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  border: "1px solid #dbe2ea",
  shadowSm: "0 12px 32px rgba(15,23,42,0.07)",
};

const payAdviceCell = {
  border: "1px solid #cbd5e1",
  padding: "6px 5px",
  textAlign: "center",
  color: "#0f172a",
  background: "#ffffff",
};

const payAdviceInput = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  textAlign: "center",
  fontSize: 11.5,
  color: "#0f172a",
  padding: 0,
};

/* Parse Date / Timestamp / String */
function parseDateFlexible(raw) {
  if (!raw) return null;
  if (typeof raw?.toDate === "function") return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === "object" && raw.seconds) return new Date(raw.seconds * 1000);
  if (typeof raw === "string") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/* HH:mm → minutes */
function toMinutes(val) {
  if (!val) return null;
  if (typeof val === "string") {
    const m = val.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return +m[1] * 60 + +m[2];
  }
  return null;
}

/* diff in hours (supports overnight) */
function diffHours(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return 0;

  let d = (e - s) / 60;
  if (d < 0) d += 24;
  return Math.max(0, d);
}

/* Convert numeric hours to "X hrs Y min" */
function formatHoursLabel(hours) {
  const totalMinutes = Math.round((hours || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  const hPart = h > 0 ? `${h} hr${h !== 1 ? "s" : ""}` : "";
  const mPart = m > 0 ? `${m} min` : "";

  if (!hPart && !mPart) return "0 hrs";
  return [hPart, mPart].filter(Boolean).join(" ");
}

/* yard segments extraction (your schema saves yardSegments for yard mode) */
function extractYardSegments(entry) {
  if (Array.isArray(entry?.yardSegments)) return entry.yardSegments;

  // Fallbacks (older schema)
  if (entry?.leaveTime && entry?.arriveBack)
    return [{ start: entry.leaveTime, end: entry.arriveBack }];

  if (entry?.start && entry?.end) return [{ start: entry.start, end: entry.end }];

  return [];
}

/*  Determine whether yard lunch should be deducted (fix) */
function shouldDeductYardLunch(entry) {
  if (!entry) return true;

  if (entry?.managerLunchDeduct === true) return true;
  if (entry?.managerLunchDeduct === false) return false;

  // If you ever add an explicit override in schema, honour it.
  if (entry?.yardLunchDeduct === false) return false;

  // Common patterns across apps:
  // - yardLunchSup / lunchSup often means "lunch supplement claimed" / "no lunch provided"
  //   → do NOT deduct lunch from hours.
  if (entry?.yardLunchSup === true) return false;
  if (entry?.lunchSup === true) return false;

  // Some schemas use an explicit "noLunch/skipLunch" meaning lunch not taken
  if (entry?.noLunch === true) return false;
  if (entry?.skipLunch === true) return false;

  // Some schemas use "lunchTaken" / "lunch" to mean lunch was taken
  // - if explicitly false, do NOT deduct
  if (entry?.lunchTaken === false) return false;
  if (entry?.lunch === false) return false;

  // - if explicitly true, deduct
  if (entry?.lunchTaken === true) return true;
  if (entry?.lunch === true) return true;

  // Default behaviour (matches your previous intent):
  // Deduct lunch unless the user explicitly indicates no lunch / lunch supplement.
  return true;
}

/* Calculate yard day hours */
function computeYardHours(entry) {
  const segs = extractYardSegments(entry);
  let total = 0;
  segs.forEach((s) => (total += diffHours(s.start, s.end)));

  //  FIX: only deduct lunch when the data indicates lunch should be deducted
  if (total > 0 && shouldDeductYardLunch(entry)) total -= LUNCH_DEDUCT_HRS;

  return Math.max(0, total);
}

/* Travel hours */
function computeTravelHours(entry) {
  // In mobile: travel is leaveTime -> arriveTime
  return diffHours(entry.leaveTime, entry.arriveTime);
}

function computeWaitingAllowanceHours(entry) {
  const arrive = entry?.arriveTime;
  const call = entry?.callTime;
  if (!arrive || !call) return 0;

  const preCallHrs = getPrecallHours(entry);
  const callMinutes = toMinutes(call);
  const arriveMinutes = toMinutes(arrive);
  if (callMinutes == null || arriveMinutes == null) return 0;

  let targetMinutes = callMinutes - Math.round(preCallHrs * 60);
  while (targetMinutes < 0) targetMinutes += 24 * 60;

  let diffMinutes = targetMinutes - arriveMinutes;
  if (diffMinutes < 0) diffMinutes += 24 * 60;

  return Math.min(Math.max(0, diffMinutes / 60), 1);
}

function computeHotelTravelExemptionHours(entry) {
  return entry?.overnight ? 0.5 : 0;
}

function getPrecallHours(entry) {
  const value = Number(entry?.precallDuration);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / 60;
}

function computeOnSetBreakdown(entry) {
  const travelToHrs = computeTravelHours(entry);
  const preCallHrs = getPrecallHours(entry);
  const callToWrapHrs =
    entry?.callTime && entry?.wrapTime ? diffHours(entry.callTime, entry.wrapTime) : 0;
  const travelBackHrs =
    entry?.wrapTime && entry?.arriveBack ? diffHours(entry.wrapTime, entry.arriveBack) : 0;

  if (entry?.callTime) {
    const callToFinishHrs = entry?.arriveBack
      ? diffHours(entry.callTime, entry.arriveBack)
      : entry?.wrapTime
      ? diffHours(entry.callTime, entry.wrapTime)
      : 0;

    const onSetPaidHrs = 10;
    const extraAfterTenHrs = Math.max(0, callToFinishHrs - onSetPaidHrs);

    return {
      travelToHrs,
      preCallHrs,
      onSetBlockHrs: callToWrapHrs,
      onSetPaidHrs,
      travelBackHrs,
      extraAfterTenHrs,
      totalHrs: travelToHrs + preCallHrs + onSetPaidHrs + extraAfterTenHrs,
    };
  }

  const fallbackWindowHrs =
    entry?.leaveTime && entry?.arriveBack ? diffHours(entry.leaveTime, entry.arriveBack) : 0;
  const legacyOnSetHrs = callToWrapHrs || fallbackWindowHrs;

  return {
    travelToHrs,
    preCallHrs,
    onSetBlockHrs: legacyOnSetHrs,
    onSetPaidHrs: legacyOnSetHrs,
    travelBackHrs,
    extraAfterTenHrs: travelBackHrs,
    totalHrs: Math.max(0, legacyOnSetHrs + preCallHrs),
  };
}

/* On-set hours (match mobile's intention: call->wrap (+precall) OR leave->arriveBack fallback) */
function computeOnSetHours(entry) {
  return computeOnSetBreakdown(entry).totalHrs;
}

function isCancellationDay(entry) {
  if (!entry) return false;

  if (entry.cancellationDay === true) return true;
  if (entry.cancelDay === true) return true;
  if (entry.cancelledDay === true) return true;
  if (entry.canceledDay === true) return true;

  const rawType = String(entry.type || entry.mode || entry.dayType || "").toLowerCase();
  return rawType.includes("cancel");
}

/*  TURNAROUND DETECTION (matches how mobile saves it) */
function isTurnaroundDay(entry) {
  if (!entry) return false;

  // Your mobile code: yard day uses isTurnaround boolean (only meaningful on mode === "yard")
  if (entry.isTurnaround === true && String(entry.mode || "yard").toLowerCase() === "yard")
    return true;

  // Backwards compatibility (in case older docs used other keys)
  if (entry.turnaround === true) return true;
  if (entry.turnaroundDay === true) return true;

  return false;
}

/*  Turnaround hours: 0 unless user added yardSegments */
function computeTurnaroundHours(entry) {
  const segs = extractYardSegments(entry);
  if (!segs || segs.length === 0) return 0;

  // If they manually added blocks on a turnaround day, count them (and don’t force lunch deduction)
  let total = 0;
  segs.forEach((s) => (total += diffHours(s.start, s.end)));
  return Math.max(0, total);
}

/* Determine day mode (mirror mobile: uses entry.mode + isTurnaround flag) */
function detectMode(entry, isWeekend) {
  if (!entry) return isWeekend ? "off" : "missing";

  const rawMode = String(entry.mode || "yard").toLowerCase();

  // Bank holiday / holiday / off saved by locks on mobile
  if (rawMode === "holiday") return "holiday";
  if (rawMode === "bankholiday") return "bankholiday";
  if (rawMode === "off") return "off";

  //  Turnaround is a yard-day flag, not a mode
  if (rawMode === "yard" && isTurnaroundDay(entry)) return "turnaround";

  if (rawMode === "travel") return "travel";
  if (rawMode === "onset") return "onset";
  if (rawMode === "yard") return "yard";

  return "yard";
}

/* Normalize days structure to Monday..Sunday */
function normaliseDays(daysObj) {
  const out = {};
  DAYS.forEach((d) => (out[d] = daysObj?.[d] ?? null));
  return out;
}

/* Format Pre-Call minutes */
function formatPrecallMinutes(min) {
  const value = Number(min);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 60) return `${value} min`;
  const hrs = Math.floor(value / 60);
  const rem = value % 60;
  if (rem === 0) return `${hrs} hr${hrs > 1 ? "s" : ""}`;
  return `${hrs} hr${hrs > 1 ? "s" : ""} ${rem} min`;
}

function formatShortDate(value) {
  const d = parseDateFlexible(value);
  if (!d) return "-";
  return d.toLocaleDateString("en-GB");
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function printElementById(elementId, title) {
  if (typeof window === "undefined") return;

  const printRoot = document.getElementById(elementId);
  if (!printRoot) {
    window.print();
    return;
  }

  const printWindow = window.open("", "_blank", "width=1400,height=900");
  if (!printWindow) return;

  const printHtml = printRoot.outerHTML;

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #0f172a;
            font-family: Arial, sans-serif;
          }
          body { padding: 10px; }
          h1, h2, h3, p, div, span, li, strong, button, td, th {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #timesheet-print-root,
          #pay-advice-print-root {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 100% !important;
            max-width: 100% !important;
            overflow: visible !important;
          }
          #timesheet-print-root > div:nth-of-type(2) {
            display: grid !important;
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 6px !important;
            overflow: visible !important;
            padding-bottom: 0 !important;
          }
          #timesheet-print-root > div:nth-of-type(2) > div {
            min-width: 0 !important;
            padding: 8px !important;
            border-radius: 8px !important;
            font-size: 10px !important;
            break-inside: avoid;
          }
          #timesheet-print-root > div:nth-of-type(2) > div button {
            display: none !important;
          }
          #timesheet-print-root > div:nth-of-type(3) {
            gap: 6px !important;
            margin-top: 8px !important;
          }
          #timesheet-print-root > div:nth-of-type(3) > div {
            border-radius: 8px !important;
          }
          #timesheet-print-root ul {
            margin-top: 2px !important;
            margin-bottom: 0 !important;
            padding-left: 14px !important;
          }
          #timesheet-print-root li {
            margin-bottom: 1px !important;
          }
          #timesheet-print-root [style*="font-size: 24px"] {
            font-size: 18px !important;
          }
          #timesheet-print-root [style*="font-size: 15"] {
            font-size: 12px !important;
          }
          #timesheet-print-root [style*="font-size: 14"] {
            font-size: 11px !important;
          }
          #timesheet-print-root [style*="font-size: 13"] {
            font-size: 10px !important;
          }
          #pay-advice-print-root table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 10px;
          }
          #pay-advice-print-root th,
          #pay-advice-print-root td {
            border: 1px solid #111827;
            padding: 4px 5px;
            vertical-align: middle;
            text-align: center;
            word-break: break-word;
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        </style>
      </head>
      <body>${printHtml}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 150);
  };
}

/* Expand a holiday start/end into an array of Y-M-D strings */
function eachDateYMD(startRaw, endRaw) {
  const start = parseDateFlexible(startRaw);
  const end = parseDateFlexible(endRaw || startRaw);
  if (!start || !end) return [];

  const out = [];
  let cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDt = new Date(end);
  endDt.setHours(0, 0, 0, 0);

  while (cur <= endDt) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                               PAGE                                         */
/* -------------------------------------------------------------------------- */

export default function TimesheetDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [timesheet, setTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);

  const [jobsByDay, setJobsByDay] = useState({});
  const [vehicleLookup, setVehicleLookup] = useState({});
  const [holidaysByDate, setHolidaysByDate] = useState({});

  // manager actions
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [queryDay, setQueryDay] = useState("");
  const [queryField, setQueryField] = useState("overall");
  const [queryNote, setQueryNote] = useState("");
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [querySuccess, setQuerySuccess] = useState("");
  const [queries, setQueries] = useState([]);
  const [lunchSavingDay, setLunchSavingDay] = useState("");
  const [payAdviceEdits, setPayAdviceEdits] = useState({});
  const [payAdviceRateEdits, setPayAdviceRateEdits] = useState({});
  const [payAdviceSaving, setPayAdviceSaving] = useState(false);
  const [payAdviceMessage, setPayAdviceMessage] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [employeePayrollRates, setEmployeePayrollRates] = useState(null);
  const [globalPayrollRates, setGlobalPayrollRates] = useState(null);

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged?.((u) => {
      setUserEmail((u?.email || "").toLowerCase());
    });
    return () => unsub?.();
  }, []);

  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail), [userEmail]);

  /* ----------------------- Load timesheet ----------------------- */
  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const ref = doc(db, "timesheets", id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setTimesheet({ id: snap.id, ...snap.data() });
        } else {
          setTimesheet(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  /* ----------------------- Derived flag: approved? ----------------------- */
  const isApproved =
    String(timesheet?.status || "").toLowerCase() === "approved" || timesheet?.approved === true;

  /* ----------------------- Load holidays for this timesheet ----------------------- */
  useEffect(() => {
    if (!timesheet) return;

    (async () => {
      try {
        const snap = await getDocs(collection(db, "holidays"));
        const map = {};

        snap.docs.forEach((d) => {
          const h = d.data();

          const status = String(h.status || "").toLowerCase();
          if (h.deleted === true || h.isDeleted === true || status === "deleted") return;

          const matchesName = timesheet.employeeName && h.employee === timesheet.employeeName;
          const matchesCode = timesheet.employeeCode && h.employeeCode === timesheet.employeeCode;

          if (!matchesName && !matchesCode) return;

          const dates = eachDateYMD(h.startDate, h.endDate);
          dates.forEach((ymd) => {
            if (!ymd) return;
            if (!map[ymd]) map[ymd] = [];
            map[ymd].push({ id: d.id, ...h });
          });
        });

        setHolidaysByDate(map);
      } catch (e) {
        console.error("Error loading holidays for timesheet:", e);
        setHolidaysByDate({});
      }
    })();
  }, [timesheet]);

  /* ----------------------- Load jobs + vehicles based on snapshot ----------------------- */
  useEffect(() => {
    if (!timesheet) return;

    (async () => {
      try {
        const snapshot = timesheet.jobSnapshot || {};
        const jobMap = {};
        DAYS.forEach((d) => (jobMap[d] = []));

        const allBookingIds = new Set();

        if (snapshot.byDay) {
          DAYS.forEach((day) => {
            const arr = Array.isArray(snapshot.byDay[day]) ? snapshot.byDay[day] : [];
            jobMap[day] = arr;
            arr.forEach((j) => {
              if (j.bookingId) allBookingIds.add(j.bookingId);
            });
          });
        } else if (timesheet.days) {
          DAYS.forEach((day) => {
            const entry = timesheet.days[day];
            const arr = Array.isArray(entry?.jobs) ? entry.jobs : [];
            jobMap[day] = arr;
            arr.forEach((j) => {
              if (j.bookingId) allBookingIds.add(j.bookingId);
            });
          });
        }

        const bookingDetailsById = {};
        const usedVehicleKeys = new Set();

        for (const bookingId of allBookingIds) {
          try {
            const bSnap = await getDoc(doc(db, "bookings", bookingId));
            if (bSnap.exists()) {
              const data = { id: bSnap.id, ...bSnap.data() };
              bookingDetailsById[bookingId] = data;

              if (Array.isArray(data.vehicles)) {
                data.vehicles.forEach((v) => {
                  if (v != null && String(v).trim()) usedVehicleKeys.add(String(v));
                });
              }
            }
          } catch (e) {
            console.error("Error loading booking", bookingId, e);
          }
        }

        const lookup = {};
        if (usedVehicleKeys.size > 0) {
          const vs = await getDocs(collection(db, "vehicles"));
          vs.docs.forEach((d) => {
            const v = d.data() || {};
            const name = String(v.name || "").trim();
            const reg = String(v.registration || "").trim() || "No Reg";
            const docId = d.id;

            lookup[docId] = { name: name || docId, registration: reg };
            if (name) lookup[name] = { name, registration: reg };
          });
        }

        const mergedJobMap = {};
        DAYS.forEach((day) => {
          const arr = jobMap[day] || [];
          mergedJobMap[day] = arr.map((j) => {
            const b = j.bookingId && bookingDetailsById[j.bookingId];
            if (!b) return j;
            return {
              ...j,
              jobNumber: j.jobNumber || b.jobNumber || "",
              client: j.client || b.client || "",
              location: j.location || b.location || "",
              vehicles: Array.isArray(b.vehicles) ? b.vehicles : [],
              booking: b,
            };
          });
        });

        setJobsByDay(mergedJobMap);
        setVehicleLookup(lookup);
      } catch (err) {
        console.error("Error building jobsByDay from snapshot:", err);
        setJobsByDay({});
        setVehicleLookup({});
      }
    })();
  }, [timesheet]);

  /* ----------------------- Load existing queries for this timesheet ----------------------- */
  useEffect(() => {
    if (!timesheet?.id) return;

    (async () => {
      try {
        const q = fsQuery(collection(db, "timesheetQueries"), where("timesheetId", "==", timesheet.id));
        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setQueries(rows);
      } catch (err) {
        console.error("Error loading timesheet queries:", err);
        setQueries([]);
      }
    })();
  }, [timesheet?.id]);

  /* ------------------------------ PRINT ----------------------------------- */
  const handlePrint = () => {
    printElementById("timesheet-print-root", "Timesheet Print");
  };

  const handlePrintPayAdvice = () => {
    printElementById("pay-advice-print-root", "Weekly Pay Advice");
  };

  const handleLunchDeductionToggle = async (day, checked) => {
    if (!timesheet?.id || !day) return;

    setLunchSavingDay(day);
    try {
      const existingDays = normaliseDays(timesheet.days);
      const currentEntry = existingDays?.[day] || {};
      const nextEntry = {
        ...currentEntry,
        managerLunchDeduct: checked,
      };
      const nextDays = {
        ...existingDays,
        [day]: nextEntry,
      };

      await updateDoc(doc(db, "timesheets", timesheet.id), {
        days: nextDays,
        updatedAt: serverTimestamp(),
      });

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              days: nextDays,
            }
          : prev
      );
    } catch (err) {
      console.error("Error updating lunch deduction override:", err);
      setApproveError("Failed to update lunch deduction. Please try again.");
    } finally {
      setLunchSavingDay("");
    }
  };

  useEffect(() => {
    setPayAdviceEdits(timesheet?.payAdviceOverrides?.rows || {});
    setPayAdviceRateEdits(timesheet?.payAdviceOverrides?.rates || {});
    setPayAdviceMessage("");
  }, [timesheet?.id, timesheet?.payAdviceOverrides]);

  useEffect(() => {
    if (!timesheet) return;

    (async () => {
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "payrollRates"));
        setGlobalPayrollRates(settingsSnap.exists() ? settingsSnap.data() || {} : null);

        const snap = await getDocs(collection(db, "employees"));
        const employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const match = employees.find((emp) => {
          const code = String(emp.employeeCode || emp.code || "").trim().toLowerCase();
          const name = String(emp.name || emp.fullName || "").trim().toLowerCase();
          return (
            (timesheet.employeeCode && code && code === String(timesheet.employeeCode).trim().toLowerCase()) ||
            (timesheet.employeeName && name && name === String(timesheet.employeeName).trim().toLowerCase())
          );
        });
        setEmployeePayrollRates(match?.payrollRates || null);
      } catch (err) {
        console.error("Error loading employee payroll rates:", err);
        setEmployeePayrollRates(null);
        setGlobalPayrollRates(null);
      }
    })();
  }, [timesheet]);

  /* ------------------------------ APPROVE --------------------------------- */
  const handleApprove = async () => {
    if (!timesheet?.id) return;
    setApproving(true);
    setApproveError("");

    try {
      const ref = doc(db, "timesheets", timesheet.id);
      await updateDoc(ref, {
        status: "approved",
        approvedAt: serverTimestamp(),
      });

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              status: "approved",
              approvedAt: new Date(),
            }
          : prev
      );

      try {
        const q = fsQuery(collection(db, "timesheetQueries"), where("timesheetId", "==", timesheet.id));
        const snap = await getDocs(q);

        await Promise.all(
          snap.docs.map((docSnap) =>
            updateDoc(docSnap.ref, {
              status: "closed",
              closedAt: serverTimestamp(),
            })
          )
        );

        const snap2 = await getDocs(q);
        setQueries(snap2.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (qErr) {
        console.error("Error closing timesheet queries on approve:", qErr);
      }
    } catch (err) {
      console.error("Error approving timesheet:", err);
      setApproveError("Failed to approve timesheet. Please try again.");
    } finally {
      setApproving(false);
    }
  };

  /* ------------------------------ QUERY ----------------------------------- */
  const handleSubmitQuery = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (!timesheet?.id) return;

    setQueryError("");
    setQuerySuccess("");

    if (isApproved) {
      setQueryError("This timesheet has been approved. You can no longer send new queries.");
      return;
    }

    if (!queryDay) {
      setQueryError("Please select a day.");
      return;
    }
    if (!queryNote.trim()) {
      setQueryError("Please enter a note describing the issue.");
      return;
    }

    setQuerySubmitting(true);
    try {
      await addDoc(collection(db, "timesheetQueries"), {
        timesheetId: timesheet.id,
        employeeName: timesheet.employeeName || "",
        employeeCode: timesheet.employeeCode || "",
        weekStart: timesheet.weekStart || null,
        day: queryDay,
        field: queryField || "overall",
        note: queryNote.trim(),
        status: "open",
        createdAt: serverTimestamp(),
        createdByRole: "manager",
      });

      const q = fsQuery(collection(db, "timesheetQueries"), where("timesheetId", "==", timesheet.id));
      const snap = await getDocs(q);
      setQueries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setQuerySuccess("Query sent to employee.");
      setQueryNote("");
    } catch (err) {
      console.error("Error creating timesheet query:", err);
      setQueryError("Failed to send query. Please try again.");
    } finally {
      setQuerySubmitting(false);
    }
  };

  /* ----------------------- Vehicle display resolver ----------------------- */
  const resolveVehicle = (key) => {
    const raw = String(key ?? "").trim();
    if (!raw) return { name: "Vehicle", registration: "No Reg" };
    const found = vehicleLookup[raw];
    if (found) return found;
    return { name: raw, registration: "No Reg" };
  };

  const weekStartDate = useMemo(() => parseDateFlexible(timesheet?.weekStart), [timesheet?.weekStart]);

  const dayMap = useMemo(() => normaliseDays(timesheet?.days), [timesheet?.days]);

  //  Build a stable 7-day render model + weekly total
  const { dayCards, weeklyTotal } = useMemo(() => {
    let total = 0;

    const cards = DAYS.map((day) => {
      const entry = dayMap?.[day] ?? null;
      const isWeekend = day === "Saturday" || day === "Sunday";

      const rawJobs = jobsByDay?.[day] || [];
      const jobsToday = Array.isArray(rawJobs) ? rawJobs : [];
      const hasJobs = jobsToday.length > 0;

      // calendar date for this day (used to show holidays)
      let ymdForDay = null;
      if (weekStartDate) {
        const dayIndex = DAYS.indexOf(day);
        const dt = new Date(weekStartDate);
        dt.setDate(dt.getDate() + dayIndex);
        dt.setHours(0, 0, 0, 0);
        ymdForDay = dt.toISOString().slice(0, 10);
      }

      const holidayDocsForDay = ymdForDay ? holidaysByDate?.[ymdForDay] || [] : [];
      const hasLiveHoliday = holidayDocsForDay.length > 0;

      const paidStatuses = Array.from(
        new Set(
          holidayDocsForDay
            .map((h) => String(h.paidStatus || h.leaveType || "").trim())
            .filter(Boolean)
        )
      );

      let paidLabel = null;
      if (paidStatuses.length === 1) paidLabel = paidStatuses[0];
      else if (paidStatuses.length > 1) paidLabel = paidStatuses.join(" / ");

      const entryExists = !!entry;

      let mode = detectMode(entry, isWeekend);

      if (isWeekend && hasLiveHoliday && (paidLabel || mode === "holiday")) {
        paidLabel = "Unpaid";
      }

      // If there is NO LIVE HOLIDAY, don't honour old "holiday" mode on the timesheet
      if ((mode === "holiday" || mode === "bankholiday") && !hasLiveHoliday) {
        // Keep bankholiday if the timesheet explicitly says it (mobile locks it),
        // but if your system relies on holiday collection only, you can remove this.
        // For now, leave as-is if saved.
      }

      let dayHours = 0;
      if (entryExists) {
        if (mode === "yard") dayHours = computeYardHours(entry);
        if (mode === "travel") dayHours = computeTravelHours(entry);
        if (mode === "onset") dayHours = computeOnSetHours(entry);

        //  Turnaround: label as Turnaround Day, default 0 hours unless blocks exist
        if (mode === "turnaround") dayHours = computeTurnaroundHours(entry);

        if (mode === "holiday" || mode === "bankholiday" || mode === "off") dayHours = 0;
      }

      total += dayHours;

      const dayTotalLabel = formatHoursLabel(dayHours);
      const precallLabel = entryExists ? formatPrecallMinutes(entry?.precallDuration) : "";
      const onSetBreakdown = entryExists ? computeOnSetBreakdown(entry) : null;
      const travelToHrs = onSetBreakdown?.travelToHrs || 0;
      const preCallHrs = onSetBreakdown?.preCallHrs || 0;
      const onSetBlockHrs = onSetBreakdown?.onSetBlockHrs || 0;
      const onSetPaidHrs = onSetBreakdown?.onSetPaidHrs || 0;
      const travelBackHrs = onSetBreakdown?.travelBackHrs || 0;
      const extraAfterTenHrs = onSetBreakdown?.extraAfterTenHrs || 0;

      // Turnaround job (how mobile saves it)
      const turnaroundJob = entryExists ? entry?.turnaroundJob || null : null;
      const hasTurnaroundJob = !!turnaroundJob?.bookingId;

      // Yard segments for UI (turnaround might have none)
      const yardSegs = entryExists ? extractYardSegments(entry) : [];

      //  For UI label: whether lunch was deducted on yard day
      const yardLunchDeducted =
        entryExists && mode === "yard" && yardSegs.length > 0 && shouldDeductYardLunch(entry);

      return {
        day,
        entry,
        entryExists,
        jobsToday,
        hasJobs,
        mode,
        hasLiveHoliday,
        paidLabel,
        dayTotalLabel,
        precallLabel,
        travelToHrs,
        preCallHrs,
        onSetBlockHrs,
        onSetPaidHrs,
        travelBackHrs,
        extraAfterTenHrs,
        yardSegs,
        turnaroundJob,
        hasTurnaroundJob,
        yardLunchDeducted,
      };
    });

    return { dayCards: cards, weeklyTotal: total };
  }, [dayMap, jobsByDay, holidaysByDate, weekStartDate]);

  const payAdvice = useMemo(() => {
    const baseRates = {
      workshopRate: Number(employeePayrollRates?.workshopRate || 0),
      overtimeRate: Number(employeePayrollRates?.overtimeRate || 0),
      travelRate: Number((globalPayrollRates?.travelRate ?? employeePayrollRates?.travelRate) || 0),
      sundayRate: Number(employeePayrollRates?.sundayRate || 0),
      onSetRate: Number(employeePayrollRates?.onSetRate || 0),
      onSetOvertimeRate: Number(employeePayrollRates?.onSetOvertimeRate || 0),
      weekendSupplementRate: Number(employeePayrollRates?.weekendSupplementRate || 0),
      overnightRate: Number((globalPayrollRates?.overnightRate ?? employeePayrollRates?.overnightRate) || 0),
      travelMealRate: Number((globalPayrollRates?.travelMealRate ?? employeePayrollRates?.travelMealRate) || 0),
    };
    const rates = {
      ...baseRates,
      ...Object.fromEntries(
        Object.entries(payAdviceRateEdits || {}).map(([key, value]) => [key, Number(value || 0)])
      ),
    };

    const rows = dayCards.map((card, index) => {
      const entry = card.entry || {};
      const dt = weekStartDate ? new Date(weekStartDate) : null;
      if (dt) {
        dt.setDate(dt.getDate() + index);
      }

      const primaryJob = Array.isArray(card.jobsToday) && card.jobsToday.length ? card.jobsToday[0] : null;
      const workshopHrs = card.mode === "yard" ? computeYardHours(entry) : 0;
      const isTurnaroundPayDay = card.mode === "turnaround";
      const isCancellationPayDay = isCancellationDay(entry);
      const actualTravelToHrs = card.travelToHrs || 0;
      const preCallHrs = card.preCallHrs || 0;
      const waitingAllowanceHrs = card.mode === "onset" ? computeWaitingAllowanceHours(entry) : 0;
      const callElapsedToWrap =
        entry?.callTime && entry?.wrapTime ? diffHours(entry.callTime, entry.wrapTime) : 0;
      const callElapsedToBack =
        entry?.callTime && entry?.arriveBack ? diffHours(entry.callTime, entry.arriveBack) : 0;
      const wrapOvertimeHrs = card.mode === "onset" ? Math.max(0, callElapsedToWrap - 10) : 0;
      const rawTravelAfterTenHrs =
        card.mode === "onset" ? Math.max(0, callElapsedToBack - Math.max(10, callElapsedToWrap || 0)) : 0;
      const travelAfterTenHrs =
        card.mode === "onset"
          ? Math.max(0, rawTravelAfterTenHrs - computeHotelTravelExemptionHours(entry))
          : 0;
      const travelHrs =
        card.mode === "travel"
          ? computeTravelHours(entry)
          : card.mode === "onset"
          ? actualTravelToHrs + waitingAllowanceHrs + travelAfterTenHrs
          : 0;
      const onSetHrs = card.mode === "onset" || isTurnaroundPayDay || isCancellationPayDay ? 10 : 0;
      const onSetOvertimeHrs = card.mode === "onset" ? wrapOvertimeHrs + preCallHrs : 0;
      const payableDayTotalHrs =
        card.mode === "onset"
          ? actualTravelToHrs + waitingAllowanceHrs + preCallHrs + onSetHrs + wrapOvertimeHrs + travelAfterTenHrs
          : isTurnaroundPayDay || isCancellationPayDay
          ? onSetHrs
          : workshopHrs + travelHrs;
      const sundayHrs = card.day === "Sunday" && card.mode === "travel" ? travelHrs : 0;
      const overnightUnits = entry?.overnight ? 1 : 0;
      const travelMealUnits = card.mode === "travel" && (entry?.travelLunchSup || entry?.mealSup) ? 1 : 0;
      const hasWorkedDay = payableDayTotalHrs > 0;
      const weekendSupplementUnits = hasWorkedDay
        ? card.day === "Saturday"
          ? 0.5
          : card.day === "Sunday"
          ? 1
          : 0
        : 0;

      const baseRow = {
        day: card.day,
        dateLabel: dt ? formatShortDate(dt) : "-",
        jobName: primaryJob?.jobNumber
          ? `#${primaryJob.jobNumber}${primaryJob.client ? ` - ${primaryJob.client}` : ""}`
          : primaryJob?.client || primaryJob?.title || "-",
        workshopHrs,
        overtimeHrs: card.mode === "yard" ? Math.max(0, workshopHrs - 8.5) : 0,
        travelHrs,
        sundayHrs,
        onSetHrs,
        onSetOvertimeHrs,
        weekendSupplementUnits,
        overnightUnits,
        travelMealUnits,
        preCallHrs: 0,
        dailyTotalHrs: payableDayTotalHrs,
      };

      const override = payAdviceEdits?.[card.day] || {};
      const mergedRow = {
        ...baseRow,
        ...override,
      };

      const monetaryTotal =
        (Number(mergedRow.workshopHrs) || 0) * rates.workshopRate +
        (Number(mergedRow.overtimeHrs) || 0) * rates.overtimeRate +
        (Number(mergedRow.travelHrs) || 0) * rates.travelRate +
        (Number(mergedRow.sundayHrs) || 0) * rates.sundayRate +
        (Number(mergedRow.onSetHrs) || 0) * rates.onSetRate +
        (Number(mergedRow.onSetOvertimeHrs) || 0) * rates.onSetOvertimeRate +
        (Number(mergedRow.weekendSupplementUnits) || 0) * rates.weekendSupplementRate +
        (Number(mergedRow.overnightUnits) || 0) * rates.overnightRate +
        (Number(mergedRow.travelMealUnits) || 0) * rates.travelMealRate;

      return {
        ...mergedRow,
        totalMonetary: Number(monetaryTotal.toFixed(2)),
      };
    });

    const totalFor = (key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);

    return {
      rows,
      totals: {
        workshopHrs: totalFor("workshopHrs"),
        overtimeHrs: totalFor("overtimeHrs"),
        travelHrs: totalFor("travelHrs"),
        sundayHrs: totalFor("sundayHrs"),
        onSetHrs: totalFor("onSetHrs"),
        onSetOvertimeHrs: totalFor("onSetOvertimeHrs"),
        weekendSupplementUnits: totalFor("weekendSupplementUnits"),
        overnightUnits: totalFor("overnightUnits"),
        travelMealUnits: totalFor("travelMealUnits"),
        preCallHrs: 0,
        dailyTotalHrs: totalFor("dailyTotalHrs"),
        workshopAmount: Number((totalFor("workshopHrs") * rates.workshopRate).toFixed(2)),
        overtimeAmount: Number((totalFor("overtimeHrs") * rates.overtimeRate).toFixed(2)),
        travelAmount: Number((totalFor("travelHrs") * rates.travelRate).toFixed(2)),
        sundayAmount: Number((totalFor("sundayHrs") * rates.sundayRate).toFixed(2)),
        onSetAmount: Number((totalFor("onSetHrs") * rates.onSetRate).toFixed(2)),
        onSetOvertimeAmount: Number((totalFor("onSetOvertimeHrs") * rates.onSetOvertimeRate).toFixed(2)),
        weekendSupplementAmount: Number(
          (totalFor("weekendSupplementUnits") * rates.weekendSupplementRate).toFixed(2)
        ),
        overnightAmount: Number((totalFor("overnightUnits") * rates.overnightRate).toFixed(2)),
        travelMealAmount: Number((totalFor("travelMealUnits") * rates.travelMealRate).toFixed(2)),
        totalMonetary: totalFor("totalMonetary"),
      },
      rates,
    };
  }, [dayCards, weekStartDate, payAdviceEdits, employeePayrollRates, globalPayrollRates, payAdviceRateEdits]);

  const handlePayAdviceFieldChange = (day, field, value) => {
    setPayAdviceEdits((prev) => ({
      ...prev,
      [day]: {
        ...(prev?.[day] || {}),
        [field]:
          field === "jobName" || field === "dateLabel" || value === ""
            ? value
            : Number(value),
      },
    }));
    setPayAdviceMessage("");
  };

  const handlePayAdviceRateChange = (field, value) => {
    setPayAdviceRateEdits((prev) => ({
      ...prev,
      [field]: value === "" ? "" : Number(value),
    }));
    setPayAdviceMessage("");
  };

  const handleSavePayAdvice = async () => {
    if (!timesheet?.id) return;
    setPayAdviceSaving(true);
    setPayAdviceMessage("");
    try {
      await updateDoc(doc(db, "timesheets", timesheet.id), {
        payAdviceOverrides: {
          rows: payAdviceEdits,
          rates: payAdviceRateEdits,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: serverTimestamp(),
      });

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              payAdviceOverrides: {
                rows: payAdviceEdits,
                rates: payAdviceRateEdits,
                updatedAt: new Date().toISOString(),
              },
            }
          : prev
      );
      setPayAdviceMessage("Pay advice saved.");
    } catch (err) {
      console.error("Error saving pay advice overrides:", err);
      setPayAdviceMessage("Failed to save pay advice.");
    } finally {
      setPayAdviceSaving(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                   RENDER                                   */
  /* -------------------------------------------------------------------------- */

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={{ padding: 28, color: UI.muted }}>Loading...</div>
      </HeaderSidebarLayout>
    );
  }

  if (!timesheet) {
    return (
      <HeaderSidebarLayout>
        <div style={{ padding: 28 }}>
          <h1>No timesheet found</h1>
        </div>
      </HeaderSidebarLayout>
    );
  }

  let statusLabel = "Draft (not submitted)";
  let badgeBg = "#fed7aa";
  let badgeBorder = "#fdba74";
  let badgeColor = "#7c2d12";

  if (timesheet.submitted && !isApproved) {
    statusLabel = "Submitted";
    badgeBg = "#bbf7d0";
    badgeBorder = "#86efac";
    badgeColor = "#052e16";
  }
  if (isApproved) {
    statusLabel = "Approved";
    badgeBg = "#dcfce7";
    badgeBorder = "#22c55e";
    badgeColor = "#14532d";
  }

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          padding: "22px 18px 34px",
          minHeight: "100vh",
          backgroundColor: UI.bg,
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        {/* Controls (not printed) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              background: "#ffffff",
              border: UI.border,
              borderRadius: 999,
              color: UI.brand,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 12px",
            }}
          >
            ← Back
          </button>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={handlePrint}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${UI.brand}`,
                backgroundColor: UI.brand,
                color: "#fff",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
               Print Timesheet
            </button>

            <button
              onClick={handlePrintPayAdvice}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${UI.brandBorder}`,
                backgroundColor: "#ffffff",
                color: UI.brand,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Print Pay Advice
            </button>

            <button
              onClick={handleApprove}
              disabled={approving || isApproved}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #16a34a",
                backgroundColor: isApproved ? "#bbf7d0" : "#16a34a",
                color: isApproved ? "#166534" : "#ecfdf5",
                fontWeight: 700,
                fontSize: 12,
                cursor: approving || isApproved ? "default" : "pointer",
                opacity: approving ? 0.7 : 1,
              }}
            >
              {isApproved ? "Approved" : approving ? "Approving…" : "Yes Approve"}
            </button>
          </div>
        </div>

        {approveError && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 10px",
              borderRadius: 10,
              backgroundColor: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#991b1b",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {approveError}
          </div>
        )}

        {/* Printable content */}
        <div
          id="timesheet-print-root"
          style={{
            flex: 1,
            background: UI.panelTint,
            borderRadius: UI.radius,
            border: UI.border,
            boxShadow: UI.shadowSm,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 12,
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, marginBottom: 4, color: UI.ink }}>
                Timesheet — {timesheet.employeeName || timesheet.employeeCode}
              </h1>
              <p style={{ color: UI.muted, margin: 0, fontSize: 13 }}>
                Week starting{" "}
                <strong>
                  {parseDateFlexible(timesheet.weekStart)?.toLocaleDateString("en-GB")}
                </strong>
              </p>
            </div>

            <div style={{ textAlign: "right", fontSize: 12 }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid",
                  fontSize: 11,
                  fontWeight: 800,
                  backgroundColor: badgeBg,
                  borderColor: badgeBorder,
                  color: badgeColor,
                  marginBottom: 4,
                }}
              >
                {statusLabel}
              </div>
              {timesheet.submittedAt && (
                <div style={{ color: UI.muted, marginTop: 4 }}>
                  Submitted: {parseDateFlexible(timesheet.submittedAt)?.toLocaleString("en-GB")}
                </div>
              )}
              {timesheet.approvedAt && (
                <div style={{ color: "#15803d", marginTop: 2 }}>
                  Approved: {parseDateFlexible(timesheet.approvedAt)?.toLocaleString("en-GB")}
                </div>
              )}
            </div>
          </div>

          {/* 7-day grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(220px, 1fr))",
              gap: 10,
              alignItems: "stretch",
              fontSize: 13,
              overflowX: "auto",
              paddingBottom: 4,
            }}
          >
            {dayCards.map((card) => {
              const {
                day,
                entry,
                entryExists,
                jobsToday,
                mode,
                hasLiveHoliday,
                paidLabel,
                dayTotalLabel,
                precallLabel,
                travelToHrs,
                preCallHrs,
                onSetBlockHrs,
                onSetPaidHrs,
                travelBackHrs,
                extraAfterTenHrs,
                yardSegs,
                turnaroundJob,
                hasTurnaroundJob,
                yardLunchDeducted,
              } = card;

              const isHolidayCard = mode === "holiday" || mode === "bankholiday";
              const isOffCard = mode === "off";
              const isMissingCard = mode === "missing";

              const isTurnaroundCard = mode === "turnaround";
              const hasTimeBlocks = Array.isArray(yardSegs) && yardSegs.length > 0;

              return (
                <div
                  key={day}
                  style={{
                    background: "#f8fbfd",
                    padding: 12,
                    borderRadius: 14,
                    border: UI.border,
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    boxSizing: "border-box",
                    fontSize: 14,
                    minWidth: 220,
                  }}
                >
                  {/* Day header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 5,
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 800, color: UI.ink }}>{day}</div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isApproved) return;
                        setQueryDay(day);
                      }}
                      disabled={isApproved}
                      title={
                        isApproved
                          ? "Timesheet approved – queries are read-only."
                          : "Raise a query for this day"
                      }
                      style={{
                        fontSize: 10.5,
                        padding: "3px 8px",
                        borderRadius: 999,
                        border: `1px dashed ${UI.brandBorder}`,
                        background: "#ffffff",
                        color: UI.brand,
                        cursor: isApproved ? "not-allowed" : "pointer",
                        opacity: isApproved ? 0.5 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Query Query
                    </button>
                  </div>

                  {isMissingCard && (
                    <div style={{ color: UI.muted, fontSize: 12, marginBottom: 6 }}>
                      No entry submitted.
                    </div>
                  )}

                  {/*  TURNAROUND (matches mobile save schema) */}
                  {isTurnaroundCard && (
                    <div
                      style={{
                        background: "#f3e8ff",
                        border: "1px solid #c4b5fd",
                        color: "#6d28d9",
                        padding: "7px 9px",
                        borderRadius: 10,
                        fontWeight: 900,
                        marginBottom: 8,
                      }}
                    >
                      Turnaround Day
                      <div
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "#6b7280",
                          marginTop: 2,
                        }}
                      >
                        {hasTurnaroundJob
                          ? `Turnaround for job: ${
                              turnaroundJob.jobNumber || turnaroundJob.bookingId
                            } — ${turnaroundJob.client || "Client"}`
                          : "Turnaround for job: (not selected)"}
                      </div>
                      {hasTurnaroundJob && turnaroundJob.location ? (
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: "#6b7280",
                            marginTop: 2,
                          }}
                        >
                          {turnaroundJob.location}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* HOLIDAY / BANK HOLIDAY / OFF */}
                  {isHolidayCard && (
                    <div style={{ fontWeight: 600 }}>
                      <span style={{ color: "#007da3ff" }}>
                        {mode === "bankholiday" ? "Bank holiday" : "Holiday"}
                      </span>
                      {hasLiveHoliday && paidLabel && (
                        <span
                          style={{
                            marginLeft: 6,
                            color:
                              paidLabel.toLowerCase() === "unpaid" ? "#8a8a8aff" : "#1d4ed8",
                          }}
                        >
                          ({paidLabel})
                        </span>
                      )}
                    </div>
                  )}
                  {isOffCard && <div style={{ color: "#6b7280" }}>Day Off</div>}

                  {/* JOB INFO (still show jobs if they exist) */}
                  {jobsToday.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 6 }}>
                      {jobsToday.map((job, idx) => (
                        <div
                          key={`${job.bookingId || job.id || idx}-${idx}`}
                          style={{
                            background: "#fefce8",
                            border: "1px solid #facc15",
                            padding: "7px 9px",
                            borderRadius: 10,
                          }}
                        >
                          <div style={{ marginBottom: 3 }}>
                            <strong style={{ fontSize: 13.5 }}>
                              {job.jobNumber || job.id || job.bookingId}
                            </strong>

                            {job.client && (
                              <span style={{ marginLeft: 6, color: "#374151", fontWeight: 500 }}>
                                • {job.client}
                              </span>
                            )}

                            {job.location && (
                              <span style={{ marginLeft: 6, color: "#6b7280" }}>
                                • {job.location}
                              </span>
                            )}
                          </div>

                          {Array.isArray(job.vehicles) &&
                            job.vehicles.map((vKey, vIdx) => {
                              const v = resolveVehicle(vKey);
                              return (
                                <div
                                  key={`${job.bookingId || job.id}-vehicle-${String(vKey)}-${vIdx}`}
                                  style={{ color: "#047857", fontWeight: 700, fontSize: 13 }}
                                >
                                  {v.name} —{" "}
                                  <span style={{ fontWeight: 700 }}>{v.registration || "No Reg"}</span>
                                </div>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Yard blocks (hide for turnaround UNLESS blocks exist) */}
                  {entryExists && (mode === "yard" || (mode === "turnaround" && hasTimeBlocks)) && (
                    <div style={{ fontSize: 13, marginTop: 2 }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        {mode === "turnaround" ? "Time blocks (optional):" : "Yard:"}
                      </div>
                      {yardSegs.map((seg, i) => (
                        <div key={`${day}-seg-${i}`}>
                          {seg.start} → {seg.end}
                        </div>
                      ))}
                      {mode === "yard" && (
                        <div style={{ color: "#9ca3af", fontSize: 12 }}>
                          {yardLunchDeducted ? "(-0.5 hr lunch)" : "(no lunch deduction)"}
                        </div>
                      )}
                      {mode === "yard" && (
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 6,
                            fontSize: 12,
                            color: UI.ink,
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={yardLunchDeducted}
                            disabled={isApproved || lunchSavingDay === day}
                            onChange={(e) => handleLunchDeductionToggle(day, e.target.checked)}
                          />
                          {lunchSavingDay === day ? "Saving lunch deduction..." : "Deduct lunch"}
                        </label>
                      )}
                    </div>
                  )}

                  {/* Travel */}
                  {entryExists && mode === "travel" && (
                    <div style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 700 }}>Travel:</div>
                      <div>
                        {entry.leaveTime ?? "—"} → {entry.arriveTime ?? "—"}
                      </div>
                      {entry.travelLunchSup ? <div style={{ marginTop: 4 }}>• Lunch (travel)</div> : null}
                      {entry.travelPD ? <div>• PD</div> : null}
                    </div>
                  )}

                  {/* On Set */}
                  {entryExists && mode === "onset" && (
                    <div style={{ marginTop: 3, fontSize: 13 }}>
                      <div style={{ fontWeight: 700 }}>On Set:</div>
                      <ul style={{ marginTop: 4, marginLeft: 16, paddingLeft: 0, listStyle: "disc" }}>
                        {entry.leaveTime && <li>Leave: {entry.leaveTime}</li>}
                        {entry.arriveTime && <li>Arrive: {entry.arriveTime}</li>}
                        {precallLabel && <li>Pre-Call: {precallLabel}</li>}
                        {entry.callTime && <li>Unit-Call: {entry.callTime}</li>}
                        {entry.wrapTime && <li>Wrap: {entry.wrapTime}</li>}
                        {entry.arriveBack && <li>Back: {entry.arriveBack}</li>}
                        {entry.overnight && <li>Overnight stay</li>}
                        {entry.nightShoot && <li>Night shoot</li>}
                        {/* mealSup on mobile means "no meal supplement offered" (your info text) */}
                        {entry.mealSup && <li>Meal supplement claimed</li>}
                      </ul>

                      <div style={{ marginTop: 2 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>Breakdown:</div>
                        <div style={{ fontSize: 12 }}>Travel to: {formatHoursLabel(travelToHrs)}</div>
                        <div style={{ fontSize: 12 }}>Pre-call: {formatHoursLabel(preCallHrs)}</div>
                        <div style={{ fontSize: 12 }}>
                          On set{entry.callTime ? " (10-hour block)" : ""}: {formatHoursLabel(onSetPaidHrs)}
                        </div>
                        {entry.callTime ? (
                          <div style={{ fontSize: 12 }}>
                            Extra after 10 hours: {formatHoursLabel(extraAfterTenHrs)}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12 }}>Travel back: {formatHoursLabel(travelBackHrs)}</div>
                        )}
                        {entry.callTime && entry.wrapTime ? (
                          <div style={{ fontSize: 12, color: UI.muted }}>
                            Actual on-set window: {formatHoursLabel(onSetBlockHrs)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* NOTES */}
                  {entryExists && entry?.dayNotes && (
                    <div style={{ marginTop: 6, fontSize: 12, color: UI.muted, fontStyle: "italic" }}>
                       {entry.dayNotes}
                    </div>
                  )}

                  {/* Daily total */}
                  <div
                    style={{
                      marginTop: "auto",
                      borderTop: UI.border,
                      paddingTop: 8,
                      fontSize: 12,
                      color: "#374151",
                      textAlign: "right",
                    }}
                  >
                    Daily total: <strong style={{ fontWeight: 700 }}>{dayTotalLabel}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* WEEK TOTAL + NOTES ROW */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 260px",
              gap: 10,
              marginTop: 12,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                background: "#f8fbfd",
                borderRadius: 14,
                border: UI.border,
                padding: 12,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: UI.ink }}>General Notes</div>
              <div style={{ color: "#4b5563", minHeight: 24 }}>{timesheet.notes || "—"}</div>
            </div>

            <div
              style={{
                background: "linear-gradient(135deg, #17324f 0%, #234a71 100%)",
                color: "#f9fafb",
                borderRadius: 14,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "flex-end",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8, marginBottom: 4 }}>
                Weekly total
              </div>
              <div>{formatHoursLabel(weeklyTotal)}</div>
            </div>
          </div>
        </div>

        <div
          id="pay-advice-print-root"
          style={{
            marginTop: 14,
            background: "#ffffff",
            borderRadius: UI.radius,
            border: UI.border,
            boxShadow: UI.shadowSm,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 16px 10px",
              background: "linear-gradient(180deg, #eef2f7 0%, #e3e8ef 100%)",
              borderBottom: UI.border,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: UI.brand, letterSpacing: 0.4 }}>
              Weekly Pay Advice
            </div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: UI.ink }}>
              {timesheet.employeeName || timesheet.employeeCode} - W/E {formatShortDate(timesheet.weekStart)}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: UI.muted }}>
              Auto-filled from the current timesheet. Finance can use this as the first-pass pay advice view.
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSavePayAdvice}
                disabled={payAdviceSaving || isApproved}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: `1px solid ${UI.brand}`,
                  background: UI.brand,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: payAdviceSaving || isApproved ? "not-allowed" : "pointer",
                  opacity: payAdviceSaving || isApproved ? 0.6 : 1,
                }}
              >
                {payAdviceSaving ? "Saving..." : "Save Pay Advice"}
              </button>
              {payAdviceMessage ? (
                <div style={{ fontSize: 12, color: payAdviceMessage.includes("Failed") ? "#b91c1c" : "#166534" }}>
                  {payAdviceMessage}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ overflowX: "auto", padding: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: "#e5e7eb" }}>
                  <th
                    colSpan={3}
                    style={{
                      border: "1px solid #94a3b8",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    {timesheet.employeeName || timesheet.employeeCode}
                  </th>
                  <th
                    colSpan={2}
                    style={{
                      border: "1px solid #94a3b8",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    Workshop
                  </th>
                  <th
                    colSpan={2}
                    style={{
                      border: "1px solid #94a3b8",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    Travel
                  </th>
                  <th
                    colSpan={2}
                    style={{
                      border: "1px solid #94a3b8",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    On Set
                  </th>
                  <th
                    colSpan={3}
                    style={{
                      border: "1px solid #94a3b8",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    Extra Supplements
                  </th>
                  <th
                    colSpan={1}
                    style={{
                      border: "1px solid #94a3b8",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    Total
                  </th>
                </tr>
                <tr style={{ background: "#f3f4f6" }}>
                  {[
                    "Date",
                    "Job Name",
                    "Week Day",
                    "W/shop Hrs",
                    "O/Time Hrs",
                    "Travel Hrs",
                    "Sunday Hrs",
                    "On Set Hrs",
                    "On Set O/T",
                    "Sa/Su Units",
                    "O/N Units",
                    "Travel Meal",
                    "Total",
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        border: "1px solid #cbd5e1",
                        padding: "7px 6px",
                        color: UI.ink,
                        fontWeight: 800,
                        textAlign: "center",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payAdvice.rows.map((row) => (
                  <tr key={row.day}>
                    <td style={payAdviceCell}>
                      <input
                        value={row.dateLabel}
                        onChange={(e) => handlePayAdviceFieldChange(row.day, "dateLabel", e.target.value)}
                        style={payAdviceInput}
                        disabled={isApproved}
                      />
                    </td>
                    <td style={{ ...payAdviceCell, textAlign: "left" }}>
                      <input
                        value={row.jobName}
                        onChange={(e) => handlePayAdviceFieldChange(row.day, "jobName", e.target.value)}
                        style={{ ...payAdviceInput, textAlign: "left" }}
                        disabled={isApproved}
                      />
                    </td>
                    <td style={payAdviceCell}>{row.day}</td>
                    {[
                      "workshopHrs",
                      "overtimeHrs",
                      "travelHrs",
                      "sundayHrs",
                      "onSetHrs",
                      "onSetOvertimeHrs",
                      "weekendSupplementUnits",
                      "overnightUnits",
                      "travelMealUnits",
                      "dailyTotalHrs",
                    ].map((field) => (
                      <td key={`${row.day}-${field}`} style={{ ...payAdviceCell, fontWeight: field === "dailyTotalHrs" ? 800 : 400 }}>
                        <input
                          type="number"
                          step="0.25"
                          value={Number(row[field] || 0)}
                          onChange={(e) => handlePayAdviceFieldChange(row.day, field, e.target.value)}
                          style={payAdviceInput}
                          disabled={isApproved}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ background: "#f8fafc" }}>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }} colSpan={3}>
                    Totals
                  </td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.workshopHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.overtimeHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.travelHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.sundayHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.onSetHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.onSetOvertimeHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.weekendSupplementUnits.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.overnightUnits.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.travelMealUnits.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.dailyTotalHrs.toFixed(2)}</td>
                </tr>
                {isAdmin ? (
                  <tr style={{ background: "#eff6ff" }}>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }} colSpan={3}>
                      Rates
                    </td>
                    {[
                      "workshopRate",
                      "overtimeRate",
                      "travelRate",
                      "sundayRate",
                      "onSetRate",
                      "onSetOvertimeRate",
                      "weekendSupplementRate",
                      "overnightRate",
                      "travelMealRate",
                    ].map((field) => (
                      <td key={field} style={{ ...payAdviceCell, fontWeight: 800 }}>
                        <input
                          type="number"
                          step="0.01"
                          value={Number(payAdvice.rates[field] || 0)}
                          onChange={(e) => handlePayAdviceRateChange(field, e.target.value)}
                          style={payAdviceInput}
                          disabled={isApproved}
                        />
                      </td>
                    ))}
                    <td style={{ ...payAdviceCell, fontWeight: 800 }} />
                  </tr>
                ) : null}
                {isAdmin ? (
                  <tr style={{ background: "#dbeafe" }}>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }} colSpan={3}>
                      Total Monetary
                    </td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.workshopAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.overtimeAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.travelAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.sundayAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.onSetAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.onSetOvertimeAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.weekendSupplementAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.overnightAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.travelMealAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.totalMonetary)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* MANAGER QUERIES */}
        <div
          style={{
            marginTop: 12,
            background: UI.panelTint,
            borderRadius: UI.radius,
            padding: 14,
            border: UI.border,
            boxShadow: UI.shadowSm,
            fontSize: 13,
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, marginBottom: 8, color: UI.ink }}>
            Manager queries
          </h2>

          {isApproved && (
            <div
              style={{
                marginBottom: 10,
                padding: "7px 10px",
                borderRadius: 10,
                backgroundColor: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1e3a8a",
                fontSize: 12,
              }}
            >
              This timesheet is approved. Queries are now read-only – you can review existing queries
              but cannot send new ones.
            </div>
          )}

          <form
            onSubmit={handleSubmitQuery}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "flex-start",
              marginBottom: 10,
              opacity: isApproved ? 0.6 : 1,
            }}
          >
            <div style={{ minWidth: 140 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Day
              </label>
              <select
                value={queryDay}
                onChange={(e) => setQueryDay(e.target.value)}
                disabled={isApproved}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: UI.border,
                  fontSize: 13,
                  backgroundColor: isApproved ? "#f3f4f6" : "#ffffff",
                  cursor: isApproved ? "not-allowed" : "pointer",
                }}
              >
                <option value="">Select day…</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 160 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                What are you querying?
              </label>
              <select
                value={queryField}
                onChange={(e) => setQueryField(e.target.value)}
                disabled={isApproved}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: UI.border,
                  fontSize: 13,
                  backgroundColor: isApproved ? "#f3f4f6" : "#ffffff",
                  cursor: isApproved ? "not-allowed" : "pointer",
                }}
              >
                <option value="overall">Overall hours</option>
                <option value="yard">Yard times</option>
                <option value="travel">Travel times</option>
                <option value="onset">On-set times</option>
                <option value="notes">Notes / comments</option>
                <option value="holiday">Holiday / day off</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Query note for employee
              </label>
              <textarea
                value={queryNote}
                onChange={(e) => setQueryNote(e.target.value)}
                rows={2}
                placeholder={
                  isApproved
                    ? "Queries are closed on approved timesheets."
                    : "e.g. Hours seem high on Thursday – can you double-check call and wrap times?"
                }
                disabled={isApproved}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: UI.border,
                  fontSize: 13,
                  resize: "vertical",
                  backgroundColor: isApproved ? "#f3f4f6" : "#ffffff",
                  cursor: isApproved ? "not-allowed" : "text",
                }}
              />
            </div>

            <div style={{ alignSelf: "flex-end" }}>
              <button
                type="submit"
                disabled={querySubmitting || isApproved}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: `1px solid ${UI.brand}`,
                  backgroundColor: isApproved ? "#9ca3af" : UI.brand,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: querySubmitting || isApproved ? "not-allowed" : "pointer",
                  opacity: querySubmitting ? 0.7 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {isApproved ? "Queries closed" : querySubmitting ? "Sending…" : "Send query to employee"}
              </button>
            </div>
          </form>

          {queryError && (
            <div
              style={{
                marginBottom: 8,
                padding: "7px 10px",
                borderRadius: 10,
                backgroundColor: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#991b1b",
                fontSize: 12,
              }}
            >
              {queryError}
            </div>
          )}
          {querySuccess && (
            <div
              style={{
                marginBottom: 8,
                padding: "7px 10px",
                borderRadius: 10,
                backgroundColor: "#ecfdf5",
                border: "1px solid #bbf7d0",
                color: "#166534",
                fontSize: 12,
              }}
            >
              {querySuccess}
            </div>
          )}

          {queries.length > 0 && (
            <div style={{ marginTop: 8, borderTop: UI.border, paddingTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: UI.ink }}>
                Existing queries on this timesheet
              </div>
              <ul
                style={{
                  listStyle: "none",
                  paddingLeft: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {queries.map((q) => (
                  <li
                    key={q.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      backgroundColor: "#f8fbfd",
                      border: UI.border,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ marginBottom: 2 }}>
                      <strong>{q.day}</strong>{" "}
                      <span style={{ color: "#6b7280" }}>({q.field || "overall"})</span>
                      {q.status && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: 999,
                            backgroundColor:
                              String(q.status).toLowerCase() === "closed" ? "#dcfce7" : "#eef2ff",
                            color:
                              String(q.status).toLowerCase() === "closed" ? "#166534" : "#3730a3",
                          }}
                        >
                          {String(q.status).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#4b5563", marginBottom: 6 }}>{q.note}</div>

                    <QueryMessageThread query={q} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ------------------------------------------------------------- */
/* INLINE QUERY MESSAGE THREAD                                   */
/* ------------------------------------------------------------- */

function QueryMessageThread({ query }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const isClosed = String(query?.status || "").toLowerCase() === "closed";

  useEffect(() => {
    if (!query?.id) return;

    const msgRef = fsQuery(collection(db, "timesheetQueries", query.id, "messages"));

    const unsub = onSnapshot(msgRef, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMessages(rows);
    });

    return () => unsub();
  }, [query?.id]);

  const handleSend = async () => {
    if (!input.trim() || !query?.id || isClosed) return;
    setSending(true);
    try {
      await addDoc(collection(db, "timesheetQueries", query.id, "messages"), {
        text: input.trim(),
        from: "manager",
        createdAt: serverTimestamp(),
      });
      setInput("");
    } catch (err) {
      console.error("Error sending query message:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        borderRadius: 10,
        border: UI.border,
        background: "#f8fbfd",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: UI.muted }}>
        Messages {isClosed && "(read-only)"}
      </div>

      <div
        style={{
          maxHeight: 200,
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: 10,
          border: UI.border,
          padding: 8,
          marginBottom: 8,
          fontSize: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "#9ca3af", textAlign: "center" }}>No messages yet.</div>
        )}

        {messages.map((m) => {
          const isManager = m.from === "manager";
          return (
            <div key={m.id} style={{ marginBottom: 6, textAlign: isManager ? "right" : "left" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "5px 9px",
                  borderRadius: 999,
                  backgroundColor: isManager ? UI.brand : "#e5e7eb",
                  color: isManager ? "#f9fafb" : "#111827",
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      {isClosed && (
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
          This query is closed. No further messages can be sent.
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isClosed ? "Query closed – replies disabled." : "Reply to this query…"}
          disabled={isClosed}
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: 999,
            border: UI.border,
            fontSize: 12,
            backgroundColor: isClosed ? "#f3f4f6" : "#ffffff",
            cursor: isClosed ? "not-allowed" : "text",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim() || isClosed}
          style={{
            padding: "8px 10px",
            borderRadius: 999,
            border: `1px solid ${UI.brand}`,
            backgroundColor: isClosed ? "#9ca3af" : UI.brand,
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 700,
            cursor: sending || !input.trim() || isClosed ? "not-allowed" : "pointer",
            opacity: sending || !input.trim() || isClosed ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
