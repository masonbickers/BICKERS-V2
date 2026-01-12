// src/app/components/holidayform.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

export default function HolidayForm({ onClose, onSaved, defaultDate = "" }) {
  const router = useRouter();

  const [employee, setEmployee] = useState("");

  const [isMultiDay, setIsMultiDay] = useState(true);

  const [holidayDate, setHolidayDate] = useState(defaultDate || ""); // yyyy-mm-dd (single)
  const [startDate, setStartDate] = useState(defaultDate || ""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState(defaultDate || ""); // yyyy-mm-dd

  // ✅ Half-day support
  const [startHalfDay, setStartHalfDay] = useState(false);
  const [startAMPM, setStartAMPM] = useState("AM");
  const [endHalfDay, setEndHalfDay] = useState(false);
  const [endAMPM, setEndAMPM] = useState("PM");

  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");

  const [employees, setEmployees] = useState([]); // {id,name,holidayAllowances,holidayAllowance}
  const [saving, setSaving] = useState(false);

  // ✅ Double-booking protection (holiday overlaps)
  const [existingHolidays, setExistingHolidays] = useState([]);
  const [holidayConflictMsg, setHolidayConflictMsg] = useState("");

  // ✅ Job/crew protection (don’t allow holiday over a job)
  const [existingBookings, setExistingBookings] = useState([]);
  const [jobConflictMsg, setJobConflictMsg] = useState("");

  // ✅ Allowance enforcement (if no paid days left => force unpaid)
  const [allowanceInfo, setAllowanceInfo] = useState({
    year: new Date().getFullYear(),
    allowance: 0,
    usedPaidApproved: 0,
    remainingPaid: 0,
    requestedDays: 0,
    loading: false,
    msg: "",
  });

  // ✅ Bank holidays (exclude from allowance usage)
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

  // ✅ match your HR logic: count PAID ONLY (strict)
  const isPaidHoliday = (h = {}) => {
    const ps = String(h.paidStatus ?? h.paid ?? h.isPaid ?? "").trim().toLowerCase();
    const lt = String(h.leaveType ?? h.type ?? "").trim().toLowerCase();

    if (h.isPaid === true || h.paid === true || h.paid === 1) return true;
    if (ps.includes("unpaid") || lt.includes("unpaid")) return false;
    if (ps.includes("paid")) return true;
    if (lt.includes("paid")) return true;
    return false; // default: don't count unless explicitly paid
  };

  // ✅ compute requested weekday days for the new request (full=1, half=0.5)
  // ✅ UPDATED: excludes bank holidays too
  const computeRequestedDays = ({ s, e, single }) => {
    if (!s || !e) return 0;
    const days = eachDateInclusive(s, e);

    let total = 0;
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      if (isWeekend(d)) continue;
      if (isBankHoliday(d)) continue; // ✅ NEW

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

  // ✅ compute paid used days from existing holidays (approved + paid only + weekdays + half-days)
  // ✅ UPDATED: excludes bank holidays too
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
      if (isBankHoliday(d)) continue; // ✅ NEW

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
    const fetchEmployees = async () => {
      try {
        const snap = await getDocs(collection(db, "employees"));
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
        console.error("Failed to fetch employees:", e);
      }
    };
    fetchEmployees();
  }, []);

  /* ---------------- Fetch existing holidays (for conflict + allowance) ---------------- */
  useEffect(() => {
    const fetchExisting = async () => {
      try {
        const snap = await getDocs(collection(db, "holidays"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setExistingHolidays(list);
      } catch (e) {
        console.error("Failed to fetch holidays:", e);
        setExistingHolidays([]);
      }
    };
    fetchExisting();
  }, []);

  /* ---------------- Fetch bookings/jobs (for crew conflict) ---------------- */
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const snap = await getDocs(collection(db, "bookings"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setExistingBookings(list);
      } catch (e) {
        console.warn("No bookings collection or failed to fetch bookings:", e);
        setExistingBookings([]);
      }
    };
    fetchBookings();
  }, []);

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

  // ✅ compute proposed start/end (as Date) from UI
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
      `⚠️ ${employee} already has a holiday that overlaps: ${fmt(holidayConflict.from)} → ${fmt(
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

      const r = bookingRange(b);
      if (!r.start || !r.end) return false;

      return rangesOverlap(proposed.start, proposed.end, r.start, r.end);
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
      `⚠️ ${employee} is already crewed on a job during these dates: ${jobConflict.title}${
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

      // ✅ Force unpaid if no paid days remaining
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
    bankHolidaySet, // ✅ ensure recalculates when BH list loads
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

      const payload = {
        employee,
        startDate: startAsDate,
        endDate: endAsDate,

        startHalfDay: !!startHalfDay,
        startAMPM: startHalfDay ? startAMPM : null,
        endHalfDay: single ? false : !!endHalfDay,
        endAMPM: single ? null : endHalfDay ? endAMPM : null,

        holidayReason: holidayReason.trim(),
        paidStatus,

        status: "requested",
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "holidays"), payload);

      // refresh local cache so immediate subsequent bookings block correctly
      try {
        const snap = await getDocs(collection(db, "holidays"));
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
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={headerRow}>
          <h2 style={modalTitle}>Add Holiday</h2>
          <button onClick={handleBack} style={closeBtn} aria-label="Close" type="button">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          {/* Employee */}
          <div>
            <label style={label}>Employee</label>
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
          <div>
            <label style={label}>Holiday Type</label>
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
            <div>
              <label style={label}>Date</label>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                required
                style={input}
              />
            </div>
          ) : (
            <>
              <div>
                <label style={label}>Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={input} />
              </div>

              <div>
                <label style={label}>End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={input} />
              </div>
            </>
          )}

          {/* ✅ Allowance banner */}
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
                color: "rgba(255,255,255,0.92)",
                borderRadius: 12,
                padding: 10,
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 4 }}>
                Allowance check ({allowanceInfo.year})
              </div>
              <div style={{ opacity: 0.95 }}>
                Allowance: <b>{allowanceInfo.allowance}</b> • Used (approved paid):{" "}
                <b>{allowanceInfo.usedPaidApproved}</b> • Remaining paid:{" "}
                <b>{allowanceInfo.remainingPaid}</b> • This request:{" "}
                <b>{allowanceInfo.requestedDays}</b>
              </div>
              {allowanceInfo.msg ? (
                <div style={{ marginTop: 6, opacity: 0.9 }}>{allowanceInfo.msg}</div>
              ) : null}
            </div>
          ) : null}

          {/* ✅ Holiday conflict warning */}
          {holidayConflictMsg ? (
            <div
              style={{
                border: "1px solid rgba(239,68,68,0.45)",
                background: "rgba(239,68,68,0.12)",
                color: "rgba(255,255,255,0.92)",
                borderRadius: 12,
                padding: 10,
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Holiday conflict</div>
              <div>{holidayConflictMsg}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                You can’t submit an overlapping holiday for the same employee (unless it’s AM vs PM half-day on the same date).
              </div>
            </div>
          ) : null}

          {/* ✅ Job/crew conflict warning */}
          {jobConflictMsg ? (
            <div
              style={{
                border: "1px solid rgba(245,158,11,0.55)",
                background: "rgba(245,158,11,0.14)",
                color: "rgba(255,255,255,0.92)",
                borderRadius: 12,
                padding: 10,
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Job conflict</div>
              <div>{jobConflictMsg}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                Remove them from the job first, or choose different holiday dates.
              </div>
            </div>
          ) : null}

          {/* ✅ Half day controls */}
          <div style={halfWrap}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,0.92)" }}>Half day</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                  {isMultiDay ? "Use start and/or end half day." : "Single day can be AM or PM."}
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={startHalfDay}
                  onChange={(e) => setStartHalfDay(e.target.checked)}
                />
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                  {isMultiDay ? "Start half" : "Half day"}
                </span>
              </label>
            </div>

            {startHalfDay ? (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                <div>
                  <label style={label}>Start AM / PM</label>
                  <select value={startAMPM} onChange={(e) => setStartAMPM(e.target.value)} style={input}>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>

                {isMultiDay ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <label style={{ ...label, marginBottom: 0 }}>End half day</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={endHalfDay}
                          onChange={(e) => setEndHalfDay(e.target.checked)}
                        />
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>End half</span>
                      </label>
                    </div>

                    {endHalfDay ? (
                      <div style={{ marginTop: 8 }}>
                        <label style={label}>End AM / PM</label>
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
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <label style={{ ...label, marginBottom: 0 }}>End half day</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={endHalfDay}
                      onChange={(e) => setEndHalfDay(e.target.checked)}
                    />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>End half</span>
                  </label>
                </div>

                {endHalfDay ? (
                  <div style={{ marginTop: 8 }}>
                    <label style={label}>End AM / PM</label>
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
          <div>
            <label style={label}>Reason</label>
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
          <div>
            <label style={label}>Paid status</label>
            <select value={paidStatus} onChange={(e) => setPaidStatus(e.target.value)} style={input}>
              <option value="Paid" disabled={!paidAllowed}>
                Paid{!paidAllowed ? " (no paid remaining)" : ""}
              </option>
              <option value="Unpaid">Unpaid</option>
            </select>

            {paidStatus === "Paid" && paidAllowed && !paidEnoughForThisRequest ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                Not enough paid remaining for this request — pick Unpaid or split.
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...primaryBtn,
              opacity: canSubmit ? 1 : 0.55,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving..." : "Save holiday"}
          </button>

          <button type="button" onClick={handleBack} style={dangerBtn}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

/* -------------------- styles -------------------- */

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 90,
  padding: 16,
};

const modal = {
  width: "min(520px, 95vw)",
  borderRadius: 16,
  padding: 18,
  color: "#fff",
  background:
    "linear-gradient(180deg, rgba(22,22,22,0.95) 0%, rgba(12,12,12,0.98) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
  backdropFilter: "blur(10px)",
};

const headerRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
};

const modalTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0.2,
};

const closeBtn = {
  border: "none",
  background: "transparent",
  color: "#cbd5e1",
  fontSize: 20,
  cursor: "pointer",
  padding: 6,
  lineHeight: 1,
};

const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(255,255,255,0.85)",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  backgroundColor: "rgba(255,255,255,0.14)",
  color: "#fff",
  outline: "none",
  fontSize: 14,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  appearance: "none",
};

const halfWrap = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 12,
};

const globalOptionCSS = `
select option {
  background: #0b0b0b !important;
  color: #fff !important;
}
`;

if (typeof document !== "undefined" && !document.getElementById("holiday-form-option-css")) {
  const style = document.createElement("style");
  style.id = "holiday-form-option-css";
  style.innerHTML = globalOptionCSS;
  document.head.appendChild(style);
}

const primaryBtn = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(37,99,235,0.55)",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
};

const dangerBtn = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(185,28,28,0.55)",
  background: "linear-gradient(180deg, #991b1b 0%, #7f1d1d 100%)",
  color: "#fee2e2",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
