// src/app/components/holidayform.jsx
"use client";

import layoutStyles from "./holidayform.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { holidayDateKeysFromRange } from "@/app/utils/bookingAvailability";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { CalendarPlus, Check, X } from "lucide-react";
import { UI_TOKENS } from "@/app/utils/uiTokens";

export default function HolidayForm({ onClose, onSaved, defaultDate = "" }) {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [employee, setEmployee] = useState("");

  const [isMultiDay, setIsMultiDay] = useState(true);

  const [holidayDate, setHolidayDate] = useState(defaultDate || ""); // yyyy-mm-dd (single)
  const [startDate, setStartDate] = useState(defaultDate || ""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState(defaultDate || ""); // yyyy-mm-dd

  //  Half-day support
  const [startHalfDay, setStartHalfDay] = useState(false);
  const [startAMPM, setStartAMPM] = useState("AM");
  const [endHalfDay, setEndHalfDay] = useState(false);
  const [endAMPM, setEndAMPM] = useState("PM");

  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");

  const [employees, setEmployees] = useState([]); // {id,name,holidayAllowances,holidayAllowance}
  const [saving, setSaving] = useState(false);

  //  Double-booking protection (holiday overlaps)
  const [existingHolidays, setExistingHolidays] = useState([]);
  const [holidayConflictMsg, setHolidayConflictMsg] = useState("");

  //  Job/crew protection (don’t allow holiday over a job)
  const [existingBookings, setExistingBookings] = useState([]);
  const [jobConflictMsg, setJobConflictMsg] = useState("");

  //  Allowance enforcement (if no paid days left => force unpaid)
  const [allowanceInfo, setAllowanceInfo] = useState({
    year: new Date().getFullYear(),
    allowance: 0,
    usedPaidApproved: 0,
    remainingPaid: 0,
    requestedDays: 0,
    loading: false,
    msg: "",
  });

  //  Bank holidays (exclude from allowance usage)
  const [bankHolidaySet, setBankHolidaySet] = useState(new Set());

  /* ---------------- helpers ---------------- */
  const norm = (v) => String(v ?? "").trim().toLowerCase();

  const ymdToDate = (ymd) => {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(+dt) ? null : dt;
  };

  const dateToYMD = (d) => {
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const isBankHoliday = (d) => {
    if (!d) return false;
    const key = dateToYMD(d);
    return bankHolidaySet.has(key);
  };

  const sameYMD = (a, b) =>
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
    const d = new Date(v); // supports ISO "YYYY-MM-DD" or full ISO
    return Number.isNaN(+d) ? null : d;
  };

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    const as = startOfDay(aStart).getTime();
    const ae = endOfDay(aEnd).getTime();
    const bs = startOfDay(bStart).getTime();
    const be = endOfDay(bEnd).getTime();
    return as <= be && bs <= ae;
  };

  const isWeekend = (d) => {
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  const eachDateInclusive = (start, end) => {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const out = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  };

  // Half-day overlap rules for single-day same date:
  // - Full day conflicts with anything on that date
  // - AM conflicts with AM/full, PM conflicts with PM/full
  const halfDayOverlaps = (newHalf, newWhen, oldHalf, oldWhen) => {
    if (!newHalf || !oldHalf) return true; // if either is full-day => overlap
    if (!newWhen || !oldWhen) return true; // be safe
    return String(newWhen).toUpperCase() === String(oldWhen).toUpperCase();
  };

  const fmt = (d) => {
    if (!d) return "—";
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  //  match your HR logic: count PAID ONLY (strict)
  const isPaidHoliday = (h = {}) => {
    const ps = String(h.paidStatus ?? h.paid ?? h.isPaid ?? "").trim().toLowerCase();
    const lt = String(h.leaveType ?? h.type ?? "").trim().toLowerCase();

    if (h.isPaid === true || h.paid === true || h.paid === 1) return true;
    if (ps.includes("unpaid") || lt.includes("unpaid")) return false;
    if (ps.includes("paid")) return true;
    if (lt.includes("paid")) return true;
    return false; // default: don't count unless explicitly paid
  };

  //  compute requested weekday days for the new request (full=1, half=0.5)
  //  UPDATED: excludes bank holidays too
  const computeRequestedDays = ({ s, e, single }) => {
    if (!s || !e) return 0;
    const days = eachDateInclusive(s, e);

    let total = 0;
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      if (isWeekend(d)) continue;
      if (isBankHoliday(d)) continue; //  NEW

      let inc = 1;

      if (single) {
        if (startHalfDay) inc = 0.5;
      } else {
        if (i === 0 && startHalfDay) inc = 0.5;
        if (i === days.length - 1 && endHalfDay) inc = 0.5;
      }

      total += inc;
    }
    return total;
  };

  //  compute paid used days from existing holidays (approved + paid only + weekdays + half-days)
  //  UPDATED: excludes bank holidays too
  const daysForHoliday = (h) => {
    const hs = toDate(h.startDate);
    const he = toDate(h.endDate) || hs;
    if (!hs || !he) return 0;

    const days = eachDateInclusive(hs, he);
    const single = sameYMD(hs, he);

    const startIsHalf = h.startHalfDay === true || norm(h.startHalfDay) === "true";
    const endIsHalf = h.endHalfDay === true || norm(h.endHalfDay) === "true";

    let total = 0;
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      if (isWeekend(d)) continue;
      if (isBankHoliday(d)) continue; //  NEW

      let inc = 1;
      if (single) {
        if (startIsHalf || endIsHalf) inc = 0.5;
      } else {
        if (i === 0 && startIsHalf) inc = 0.5;
        if (i === days.length - 1 && endIsHalf) inc = 0.5;
      }
      total += inc;
    }

    return total;
  };

  /* ---------------- Fetch GOV.UK bank holidays ---------------- */
  useEffect(() => {
    const REGION = "england-and-wales"; // change if needed: "scotland" / "northern-ireland"

    const run = async () => {
      try {
        const res = await fetch("https://www.gov.uk/bank-holidays.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Bank holiday fetch failed: ${res.status}`);

        const data = await res.json();
        const items = data?.[REGION]?.events || [];

        const set = new Set(
          items
            .map((x) => String(x?.date || "").trim())
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        );

        setBankHolidaySet(set);
      } catch (e) {
        console.warn("[holidayform] failed to fetch bank holidays:", e);
        setBankHolidaySet(new Set());
      }
    };

    run();
  }, []);

  /* ---------------- Fetch employees ---------------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "read holiday form employees" });
      setEmployees([]);
      return;
    }
    const fetchEmployees = async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        const list = snap.docs
          .map((d) => {
            const data = d.data() || {};
            return {
              id: d.id,
              name: data?.name,
              holidayAllowances: data?.holidayAllowances || {}, // { "2026": 20, ... }
              holidayAllowance:
                typeof data?.holidayAllowance === "number" ? data.holidayAllowance : null, // legacy
            };
          })
          .filter((x) => x.name);
        setEmployees(list);
      } catch (e) {
        if (!handleFirestoreAccessError(e, { collectionName: "employees", operation: "read holiday form employees" })) {
          console.error("Failed to fetch employees:", e);
        }
      }
    };
    fetchEmployees();
  }, [accessKey, dataAccessState]);

  /* ---------------- Fetch existing holidays (for conflict + allowance) ---------------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "holidays", operation: "read holiday form holidays" });
      setExistingHolidays([]);
      return;
    }
    const fetchExisting = async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "holidays", dataAccessState));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setExistingHolidays(list);
      } catch (e) {
        if (!handleFirestoreAccessError(e, { collectionName: "holidays", operation: "read holiday form holidays" })) {
          console.error("Failed to fetch holidays:", e);
        }
        setExistingHolidays([]);
      }
    };
    fetchExisting();
  }, [accessKey, dataAccessState]);

  /* ---------------- Fetch bookings/jobs (for crew conflict) ---------------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "read holiday form bookings" });
      setExistingBookings([]);
      return;
    }
    const fetchBookings = async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "bookings", dataAccessState));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setExistingBookings(list);
      } catch (e) {
        if (!handleFirestoreAccessError(e, { collectionName: "bookings", operation: "read holiday form bookings" })) {
          console.warn("No bookings collection or failed to fetch bookings:", e);
        }
        setExistingBookings([]);
      }
    };
    fetchBookings();
  }, [accessKey, dataAccessState]);

  const handleBack = () => {
    if (typeof onClose === "function") return onClose();
    router.push("/dashboard");
  };

  // If single-day, keep end half settings aligned with start (so HR renders consistently)
  useEffect(() => {
    if (!isMultiDay) {
      setEndHalfDay(startHalfDay);
      setEndAMPM(startAMPM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiDay, startHalfDay, startAMPM]);

  //  compute proposed start/end (as Date) from UI
  const proposed = useMemo(() => {
    let s = null;
    let e = null;

    if (isMultiDay) {
      s = ymdToDate(startDate);
      e = ymdToDate(endDate);
    } else {
      s = ymdToDate(holidayDate);
      e = ymdToDate(holidayDate);
    }

    if (!s || !e) return { start: null, end: null, single: false };
    const single = sameYMD(s, e);
    return { start: s, end: e, single };
  }, [isMultiDay, startDate, endDate, holidayDate]);

  /* ---------------- Holiday overlap conflict check ---------------- */
  const holidayConflict = useMemo(() => {
    setHolidayConflictMsg("");

    if (!employee) return null;
    if (!proposed.start || !proposed.end) return null;

    const active = existingHolidays.filter((h) => {
      const emp = String(h.employee || "").trim();
      if (emp !== String(employee).trim()) return false;

      const st = String(h.status || "").toLowerCase();
      if (st === "declined" || st === "cancelled" || st === "canceled") return false;

      const hs = toDate(h.startDate);
      const he = toDate(h.endDate) || hs;
      if (!hs || !he) return false;

      if (!rangesOverlap(proposed.start, proposed.end, hs, he)) return false;

      // Allow AM+PM half-day split on SAME single day only
      const newSingle = proposed.single;
      const oldSingle = hs && he ? sameYMD(hs, he) : false;

      if (newSingle && oldSingle && sameYMD(proposed.start, hs)) {
        const newIsHalf = !!startHalfDay;
        const newWhen = newIsHalf ? startAMPM : null;

        const oldIsHalf =
          h.startHalfDay === true ||
          h.halfDay === true ||
          norm(h.startHalfDay) === "true" ||
          norm(h.halfDay) === "true";

        const oldWhen =
          (h.startAMPM || h.halfDayPeriod || h.halfDayType || "")
            .toString()
            .toUpperCase() || null;

        const overlaps = halfDayOverlaps(newIsHalf, newWhen, oldIsHalf, oldWhen);
        return overlaps; // true => conflict
      }

      return true; // overlap => conflict
    });

    if (!active.length) return null;

    const h = active[0];
    const hs = toDate(h.startDate);
    const he = toDate(h.endDate) || hs;
    const type = String(h.paidStatus || h.leaveType || "Holiday");
    const st = String(h.status || "requested");
    return { id: h.id, from: hs, to: he, type, status: st };
  }, [
    employee,
    proposed.start,
    proposed.end,
    proposed.single,
    existingHolidays,
    startHalfDay,
    startAMPM,
  ]);

  useEffect(() => {
    if (!holidayConflict) {
      setHolidayConflictMsg("");
      return;
    }
    setHolidayConflictMsg(
      `Warning ${employee} already has a holiday that overlaps: ${fmt(holidayConflict.from)} → ${fmt(
        holidayConflict.to
      )} (${holidayConflict.type}, ${holidayConflict.status}).`
    );
  }, [holidayConflict, employee]);

  /* ---------------- Crew/job conflict check ---------------- */

  const bookingHasEmployee = (b, empName) => {
    const target = norm(empName);
    if (!target) return false;

    const candidates = [
      b.employees,
      b.crew,
      b.staff,
      b.assignedEmployees,
      b.employeeNames,
      b.people,
    ];

    for (const c of candidates) {
      if (!c) continue;

      if (Array.isArray(c)) {
        if (c.some((x) => norm(x?.name ?? x) === target)) return true;
      }

      if (typeof c === "object" && !Array.isArray(c)) {
        const keys = Object.keys(c);
        if (keys.some((k) => norm(k) === target)) return true;
        const vals = Object.values(c);
        if (vals.some((v) => norm(v?.name ?? v) === target)) return true;
      }
    }

    if (typeof b.employee === "string" && norm(b.employee) === target) return true;

    return false;
  };

  const bookingRange = (b) => {
    const s = toDate(b.startDate) || toDate(b.date) || null;
    const e = toDate(b.endDate) || toDate(b.date) || null;

    if (s && e) return { start: s, end: e };

    if (Array.isArray(b.dates) && b.dates.length) {
      const parsed = b.dates.map(toDate).filter(Boolean);
      if (!parsed.length) return { start: null, end: null };
      parsed.sort((a, b) => +a - +b);
      return { start: parsed[0], end: parsed[parsed.length - 1] };
    }

    return { start: null, end: null };
  };

  const dateKey = (d) => {
    if (!d) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
      2,
      "0"
    )}`;
  };

  const bookingNoteForDate = (b, d) => {
    const key = dateKey(d);
    if (!key) return "";

    const notesByDate =
      b?.notesByDate && typeof b.notesByDate === "object"
        ? b.notesByDate
        : b?.dayNotes && typeof b.dayNotes === "object"
        ? b.dayNotes
        : b?.notesForEachDay && typeof b.notesForEachDay === "object"
        ? b.notesForEachDay
        : b?.noteForDay && typeof b.noteForDay === "object"
        ? b.noteForDay
        : null;

    if (!notesByDate) return "";
    return String(notesByDate[key] || "").trim();
  };

  const isHalfDayTravelBookingOnDate = (b, d) => {
    const note = norm(bookingNoteForDate(b, d));
    return note === "1/2 day travel" || note === "half day travel";
  };

  const proposedHolidayDates = useMemo(() => {
    if (!proposed.start || !proposed.end) return [];
    return eachDateInclusive(proposed.start, proposed.end).map((d, index, arr) => {
      let isHalf = false;

      if (proposed.single) {
        isHalf = !!startHalfDay;
      } else {
        if (index === 0 && startHalfDay) isHalf = true;
        if (index === arr.length - 1 && endHalfDay) isHalf = true;
      }

      return { date: d, isHalf };
    });
  }, [proposed.start, proposed.end, proposed.single, startHalfDay, endHalfDay]);

  const bookingBlocksProposedHoliday = (b) => {
    const r = bookingRange(b);
    if (!r.start || !r.end) return false;

    return proposedHolidayDates.some(({ date, isHalf }) => {
      if (!rangesOverlap(date, date, r.start, r.end)) return false;
      if (isHalf && isHalfDayTravelBookingOnDate(b, date)) return false;
      return true;
    });
  };

  const bookingIsActive = (b) => {
    const st = norm(b.status || b.bookingStatus || b.state);
    if (st.includes("cancel")) return false;
    if (st.includes("declin")) return false;
    return true;
  };

  const jobConflict = useMemo(() => {
    setJobConflictMsg("");

    if (!employee) return null;
    if (!proposed.start || !proposed.end) return null;
    if (!existingBookings.length) return null;

    const conflicts = existingBookings.filter((b) => {
      if (!bookingIsActive(b)) return false;
      if (!bookingHasEmployee(b, employee)) return false;
      return bookingBlocksProposedHoliday(b);
    });

    if (!conflicts.length) return null;

    const b = conflicts[0];
    const r = bookingRange(b);

    const title =
      b.jobNumber ||
      b.jobNo ||
      b.job ||
      b.title ||
      b.production ||
      b.client ||
      "Job";

    const where = b.location || b.toLocation || b.fromLocation || "";

    return {
      id: b.id,
      title: String(title),
      from: r.start,
      to: r.end,
      where: String(where || ""),
    };
  }, [employee, proposed.start, proposed.end, existingBookings]);

  useEffect(() => {
    if (!jobConflict) {
      setJobConflictMsg("");
      return;
    }
    setJobConflictMsg(
      `Warning ${employee} is already crewed on a job during these dates: ${jobConflict.title}${
        jobConflict.where ? ` (${jobConflict.where})` : ""
      } — ${fmt(jobConflict.from)} → ${fmt(jobConflict.to)}.`
    );
  }, [jobConflict, employee]);

  /* ---------------- Allowance enforcement ---------------- */
  useEffect(() => {
    const run = async () => {
      const yr = proposed.start ? proposed.start.getFullYear() : new Date().getFullYear();

      if (!employee || !proposed.start || !proposed.end) {
        setAllowanceInfo((prev) => ({
          ...prev,
          year: yr,
          allowance: 0,
          usedPaidApproved: 0,
          remainingPaid: 0,
          requestedDays: 0,
          msg: "",
        }));
        return;
      }

      setAllowanceInfo((prev) => ({ ...prev, loading: true, msg: "" }));

      const empRec = employees.find((e) => String(e.name).trim() === String(employee).trim());
      const yrKey = String(yr);

      const allowanceFromMap =
        empRec && typeof empRec.holidayAllowances?.[yrKey] === "number"
          ? empRec.holidayAllowances[yrKey]
          : null;

      const allowance =
        typeof allowanceFromMap === "number"
          ? allowanceFromMap
          : typeof empRec?.holidayAllowance === "number"
          ? empRec.holidayAllowance
          : 0;

      const used = existingHolidays
        .filter((h) => {
          const emp = String(h.employee || "").trim();
          if (emp !== String(employee).trim()) return false;

          const st = String(h.status || "").toLowerCase();
          if (st !== "approved") return false;

          const hs = toDate(h.startDate);
          const he = toDate(h.endDate) || hs;
          if (!hs || !he) return false;
          if (hs.getFullYear() !== yr || he.getFullYear() !== yr) return false;

          return isPaidHoliday(h);
        })
        .reduce((acc, h) => acc + daysForHoliday(h), 0);

      const requestedDays = computeRequestedDays({
        s: proposed.start,
        e: proposed.end,
        single: proposed.single,
      });

      const remainingPaid = Number((allowance - used).toFixed(2));

      let msg = "";
      if (remainingPaid <= 0) {
        msg = `No paid holiday remaining for ${yr}. You can only book unpaid holiday. (Weekends + bank holidays are excluded from allowance.)`;
      } else if (paidStatus === "Paid" && requestedDays > remainingPaid) {
        msg = `Only ${remainingPaid} paid day(s) remaining for ${yr}, but this request is ${requestedDays} day(s). Book as unpaid or split the request. (Weekends + bank holidays are excluded.)`;
      } else {
        msg = `Paid remaining for ${yr}: ${remainingPaid} day(s). (Weekends + bank holidays are excluded.)`;
      }

      setAllowanceInfo({
        year: yr,
        allowance,
        usedPaidApproved: Number(used.toFixed(2)),
        remainingPaid,
        requestedDays: Number(requestedDays.toFixed(2)),
        loading: false,
        msg,
      });

      //  Force unpaid if no paid days remaining
      if (remainingPaid <= 0 && paidStatus !== "Unpaid") {
        setPaidStatus("Unpaid");
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    employee,
    proposed.start,
    proposed.end,
    proposed.single,
    startHalfDay,
    endHalfDay,
    employees,
    existingHolidays,
    bankHolidaySet, //  ensure recalculates when BH list loads
  ]);

  const paidAllowed = allowanceInfo.remainingPaid > 0;
  const paidEnoughForThisRequest =
    allowanceInfo.remainingPaid > 0 &&
    allowanceInfo.requestedDays > 0 &&
    allowanceInfo.requestedDays <= allowanceInfo.remainingPaid;

  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!employee) return false;
    if (!holidayReason.trim()) return false;
    if (!paidStatus) return false;

    if (isMultiDay) {
      if (!startDate || !endDate) return false;
    } else {
      if (!holidayDate) return false;
    }

    if (holidayConflict) return false;
    if (jobConflict) return false;

    if (paidStatus === "Paid") {
      if (!paidAllowed) return false;
      if (!paidEnoughForThisRequest) return false;
    }

    return true;
  }, [
    saving,
    employee,
    holidayReason,
    paidStatus,
    isMultiDay,
    startDate,
    endDate,
    holidayDate,
    holidayConflict,
    jobConflict,
    paidAllowed,
    paidEnoughForThisRequest,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!employee) return alert("Please select an employee.");
    if (!holidayReason.trim()) return alert("Please enter a reason.");
    if (!paidStatus) return alert("Please select paid status.");

    if (holidayConflict)
      return alert(
        holidayConflictMsg || "This holiday overlaps an existing holiday for that employee."
      );
    if (jobConflict)
      return alert(jobConflictMsg || "This holiday overlaps a job the employee is booked on.");

    if (paidStatus === "Paid" && allowanceInfo.remainingPaid <= 0) {
      return alert("No paid holiday remaining — please book as Unpaid.");
    }
    if (paidStatus === "Paid" && !paidEnoughForThisRequest) {
      return alert(
        `Not enough paid holiday remaining. Remaining: ${allowanceInfo.remainingPaid} day(s). Request: ${allowanceInfo.requestedDays} day(s). Book as Unpaid or split the request.`
      );
    }

    setSaving(true);

    try {
      let finalStart = "";
      let finalEnd = "";

      if (isMultiDay) {
        if (!startDate || !endDate) {
          setSaving(false);
          return alert("Select both start and end dates.");
        }

        const s = new Date(startDate);
        const ed = new Date(endDate);
        if (Number.isNaN(+s) || Number.isNaN(+ed) || s > ed) {
          setSaving(false);
          return alert("End date must be the same or after start date.");
        }

        finalStart = startDate;
        finalEnd = endDate;
      } else {
        if (!holidayDate) {
          setSaving(false);
          return alert("Please select a date.");
        }
        finalStart = holidayDate;
        finalEnd = holidayDate;
      }

      const startAsDate = ymdToDate(finalStart);
      const endAsDate = ymdToDate(finalEnd);
      const single = startAsDate && endAsDate ? sameYMD(startAsDate, endAsDate) : false;
      const selectedEmployee = employees.find((emp) => String(emp.name || "").trim() === String(employee || "").trim());
      const employeeCode = String(
        selectedEmployee?.employeeCode || selectedEmployee?.userCode || selectedEmployee?.code || ""
      ).trim();

      const payload = {
        employee,
        employeeName: employee,
        employeeCode,
        startDate: startAsDate,
        endDate: endAsDate,
        holidayDateKeys: holidayDateKeysFromRange(finalStart, finalEnd),

        startHalfDay: !!startHalfDay,
        startAMPM: startHalfDay ? startAMPM : null,
        endHalfDay: single ? false : !!endHalfDay,
        endAMPM: single ? null : endHalfDay ? endAMPM : null,

        holidayReason: holidayReason.trim(),
        paidStatus,
        // Keep legacy consumers in sync while paidStatus remains canonical.
        paid: paidStatus === "Paid",
        isPaid: paidStatus === "Paid",
        unpaid: paidStatus === "Unpaid",
        isUnpaid: paidStatus === "Unpaid",

        status: "requested",
        requestedByUid: auth.currentUser?.uid || "",
        requestedByName:
          auth.currentUser?.displayName ||
          auth.currentUser?.email ||
          auth.currentUser?.uid ||
          "",
        requestedByEmail: auth.currentUser?.email || "",
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "holidays"), tenantPayload(dataAccessState, payload));

      // refresh local cache so immediate subsequent bookings block correctly
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "holidays", dataAccessState));
        setExistingHolidays(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {}

      if (typeof onSaved === "function") onSaved();
      if (typeof onClose === "function") onClose();
      else router.push("/dashboard");
    } catch (err) {
      console.error("Error saving holiday:", err);
      alert("Failed to save holiday. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className={layoutStyles.extracted1}>
      <div style={modal}>
        {/* Header */}
        <div className={layoutStyles.extracted2}>
          <div className={layoutStyles.extracted3}>
            <span style={iconBox}>
              <CalendarPlus size={18} />
            </span>
            <div>
              <div style={eyebrow}>Employee leave</div>
              <h2 style={modalTitle}>Add Holiday</h2>
            </div>
          </div>
          <button onClick={handleBack} style={closeBtn} aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={layoutStyles.extracted4}>
          {/* Employee */}
          <div className={layoutStyles.extracted5}>
            <label className={layoutStyles.extracted6}>Employee</label>
            <select value={employee} onChange={(e) => setEmployee(e.target.value)} style={input} required>
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type toggle */}
          <div className={layoutStyles.extracted7}>
            <label className={layoutStyles.extracted8}>Holiday Type</label>
            <select
              value={isMultiDay ? "multi" : "single"}
              onChange={(e) => setIsMultiDay(e.target.value === "multi")}
              style={input}
            >
              <option value="single">Single Day</option>
              <option value="multi">Multi-Day</option>
            </select>
          </div>

          {/* Dates */}
          {!isMultiDay ? (
            <div className={layoutStyles.extracted9}>
              <label className={layoutStyles.extracted10}>Date</label>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                required
                style={input}
              />
            </div>
          ) : (
            <div className={layoutStyles.extracted11}>
              <div className={layoutStyles.extracted12}>
                <label className={layoutStyles.extracted13}>Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={input} />
              </div>

              <div className={layoutStyles.extracted14}>
                <label className={layoutStyles.extracted15}>End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={input} />
              </div>
            </div>
          )}

          {/*  Allowance banner */}
          {employee && proposed.start && proposed.end ? (
            <div
              style={{
                border:
                  allowanceInfo.remainingPaid <= 0
                    ? "1px solid rgba(239,68,68,0.45)"
                    : "1px solid rgba(59,130,246,0.45)",
                background:
                  allowanceInfo.remainingPaid <= 0
                    ? "rgba(239,68,68,0.12)"
                    : "rgba(59,130,246,0.12)",
                color: "var(--color-text)",
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              <div className={layoutStyles.extracted16}>
                Allowance check ({allowanceInfo.year})
              </div>
              <div className={layoutStyles.extracted17}>
                Allowance: <b>{allowanceInfo.allowance}</b> • Used (approved paid):{" "}
                <b>{allowanceInfo.usedPaidApproved}</b> • Remaining paid:{" "}
                <b>{allowanceInfo.remainingPaid}</b> • This request:{" "}
                <b>{allowanceInfo.requestedDays}</b>
              </div>
              {allowanceInfo.msg ? (
                <div className={layoutStyles.extracted18}>{allowanceInfo.msg}</div>
              ) : null}
            </div>
          ) : null}

          {/*  Holiday conflict warning */}
          {holidayConflictMsg ? (
            <div
              className={layoutStyles.extracted19}
            >
              <div className={layoutStyles.extracted20}>Holiday conflict</div>
              <div>{holidayConflictMsg}</div>
              <div className={layoutStyles.extracted21}>
                You can’t submit an overlapping holiday for the same employee (unless it’s AM vs PM half-day on the same date).
              </div>
            </div>
          ) : null}

          {/*  Job/crew conflict warning */}
          {jobConflictMsg ? (
            <div
              className={layoutStyles.extracted22}
            >
              <div className={layoutStyles.extracted23}>Job conflict</div>
              <div>{jobConflictMsg}</div>
              <div className={layoutStyles.extracted24}>
                Remove them from the job first, or choose different holiday dates.
              </div>
            </div>
          ) : null}

          {/*  Half day controls */}
          <div style={halfWrap}>
            <div className={layoutStyles.extracted25}>
              <div>
                <div className={layoutStyles.extracted26}>Half day</div>
                <div className={layoutStyles.extracted27}>
                  {isMultiDay ? "Use start and/or end half day." : "Single day can be AM or PM."}
                </div>
              </div>
              <label className={layoutStyles.extracted28}>
                <input
                  type="checkbox"
                  checked={startHalfDay}
                  onChange={(e) => setStartHalfDay(e.target.checked)}
                />
                <span className={layoutStyles.extracted29}>
                  {isMultiDay ? "Start half" : "Half day"}
                </span>
              </label>
            </div>

            {startHalfDay ? (
              <div className={layoutStyles.extracted30}>
                <div>
                  <label className={layoutStyles.extracted31}>Start AM / PM</label>
                  <select value={startAMPM} onChange={(e) => setStartAMPM(e.target.value)} style={input}>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>

                {isMultiDay ? (
                  <div>
                    <div className={layoutStyles.extracted32}>
                      <label className={layoutStyles.extracted33}>End half day</label>
                      <label className={layoutStyles.extracted34}>
                        <input
                          type="checkbox"
                          checked={endHalfDay}
                          onChange={(e) => setEndHalfDay(e.target.checked)}
                        />
                        <span className={layoutStyles.extracted35}>End half</span>
                      </label>
                    </div>

                    {endHalfDay ? (
                      <div className={layoutStyles.extracted36}>
                        <label className={layoutStyles.extracted37}>End AM / PM</label>
                        <select value={endAMPM} onChange={(e) => setEndAMPM(e.target.value)} style={input}>
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : isMultiDay ? (
              <div className={layoutStyles.extracted38}>
                <div className={layoutStyles.extracted39}>
                  <label className={layoutStyles.extracted40}>End half day</label>
                  <label className={layoutStyles.extracted41}>
                    <input
                      type="checkbox"
                      checked={endHalfDay}
                      onChange={(e) => setEndHalfDay(e.target.checked)}
                    />
                    <span className={layoutStyles.extracted42}>End half</span>
                  </label>
                </div>

                {endHalfDay ? (
                  <div className={layoutStyles.extracted43}>
                    <label className={layoutStyles.extracted44}>End AM / PM</label>
                    <select value={endAMPM} onChange={(e) => setEndAMPM(e.target.value)} style={input}>
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Reason */}
          <div className={layoutStyles.extracted45}>
            <label className={layoutStyles.extracted46}>Reason</label>
            <textarea
              value={holidayReason}
              onChange={(e) => setHolidayReason(e.target.value)}
              rows={3}
              placeholder="e.g. Family holiday / Sick / Appointment..."
              required
              style={{ ...input, minHeight: 70, resize: "vertical", paddingTop: 12 }}
            />
          </div>

          {/* Paid vs unpaid */}
          <div className={layoutStyles.extracted47}>
            <label className={layoutStyles.extracted48}>Paid status</label>
            <select value={paidStatus} onChange={(e) => setPaidStatus(e.target.value)} style={input}>
              <option value="Paid" disabled={!paidAllowed}>
                Paid{!paidAllowed ? " (no paid remaining)" : ""}
              </option>
              <option value="Unpaid">Unpaid</option>
            </select>

            {paidStatus === "Paid" && paidAllowed && !paidEnoughForThisRequest ? (
              <div className={layoutStyles.extracted49}>
                Not enough paid remaining for this request — pick Unpaid or split.
              </div>
            ) : null}
          </div>

          <div className={layoutStyles.extracted50}>
            <button type="button" onClick={handleBack} style={secondaryBtn}>
              Cancel
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...primaryBtn,
                opacity: canSubmit ? 1 : 0.55,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              <Check size={15} />
              {saving ? "Saving..." : "Save Holiday"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const UI = UI_TOKENS;

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 90,
  padding: 16,
};

const modal = {
  width: "min(620px, 95vw)",
  borderRadius: 8,
  padding: 14,
  color: UI.text,
  background: "var(--color-surface)",
  border: `1px solid ${UI.border}`,
  boxShadow: "0 18px 46px rgba(15,23,42,0.24)",
};

const headerRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: "1px solid var(--color-border)",
};

const titleRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const iconBox = {
  width: 38,
  height: 38,
  borderRadius: 8,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
};

const eyebrow = {
  color: UI.muted,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginBottom: 2,
};

const modalTitle = {
  margin: 0,
  fontSize: 19,
  lineHeight: 1.1,
  fontWeight: 900,
  color: UI.text,
};

const closeBtn = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "var(--color-surface-subtle)",
  color: UI.muted,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const form = {
  display: "grid",
  gap: 12,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
};

const fieldGroup = {
  display: "grid",
  gap: 6,
};

const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const input = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  backgroundColor: "var(--color-surface)",
  color: UI.text,
  outline: "none",
  fontSize: 14,
  fontWeight: 700,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
};

const halfWrap = {
  border: `1px solid ${UI.border}`,
  background: "var(--color-surface-subtle)",
  borderRadius: 8,
  padding: 10,
};

const globalOptionCSS = `
select option {
  background: var(--color-surface) !important;
  color: var(--color-text) !important;
}
`;

if (typeof document !== "undefined" && !document.getElementById("holiday-form-option-css")) {
  const style = document.createElement("style");
  style.id = "holiday-form-option-css";
  style.innerHTML = globalOptionCSS;
  document.head.appendChild(style);
}

const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  minWidth: 138,
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${UI.brand}`,
  background: "linear-gradient(180deg, var(--color-brand-hover) 0%, var(--color-brand) 100%)",
  color: "var(--color-white)",
  fontWeight: 800,
  fontSize: 13,
  boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
};

const secondaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 98,
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
  color: UI.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const actions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
  paddingTop: 2,
};
