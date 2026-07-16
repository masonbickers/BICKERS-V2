// src/app/components/EditHolidayForm.jsx
"use client";

import layoutStyles from "./EditHolidayForm.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { holidayDateKeysFromRange } from "@/app/utils/bookingAvailability";
import { isAdminEmail } from "@/app/utils/adminAccess";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";


const norm = (v) => String(v ?? "").trim().toLowerCase();
const truthy = (v) =>
  v === true || v === 1 || ["true", "1", "yes", "y"].includes(norm(v));

/*  Approval helper: treat anything explicitly "approved" as approved */
function isApprovedHoliday(rec) {
  if (!rec) return false;
  if (truthy(rec.approved)) return true;

  const candidates = [
    rec.approvalStatus,
    rec.status,
    rec.state,
    rec.leaveStatus,
    rec.holidayStatus,
  ]
    .map((x) => norm(x))
    .filter(Boolean);

  if (candidates.some((s) => s === "approved" || s.includes("approved"))) return true;

  return false;
}

export default function EditHolidayForm({ holidayId, onClose, onSaved }) {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [employee, setEmployee] = useState("");
  const [employees, setEmployees] = useState([]);

  const [isMultiDay, setIsMultiDay] = useState(true);

  const [holidayDate, setHolidayDate] = useState(""); // yyyy-mm-dd (single)
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState(""); // yyyy-mm-dd

  //  Half-day support (same schema as create)
  const [startHalfDay, setStartHalfDay] = useState(false);
  const [startAMPM, setStartAMPM] = useState("AM");
  const [endHalfDay, setEndHalfDay] = useState(false);
  const [endAMPM, setEndAMPM] = useState("PM");

  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");

  //  approval + admin info (for labels + audit fields)
  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [holidayRec, setHolidayRec] = useState(null);
  const [approved, setApproved] = useState(false);
  const [existingStatus, setExistingStatus] = useState("");

  /* ---------------- helpers ---------------- */
  const ymdToDate = (ymd) => {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    return Number.isNaN(+dt) ? null : dt;
  };

  const dateToYMD = (val) => {
    if (!val) return "";
    const d = val?.toDate ? val.toDate() : val instanceof Date ? val : new Date(val);
    if (Number.isNaN(+d)) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const sameYMD = (a, b) =>
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const handleBack = () => {
    if (typeof onClose === "function") return onClose();
    router.push("/dashboard");
  };

  /* ---------------- Auth / admin ---------------- */
  useEffect(() => {
    const unsub = auth?.onAuthStateChanged?.(async (u) => {
      const email = u?.email || "";
      setUserEmail(email);

      if (!u) {
        setIsAdmin(false);
        return;
      }

      const allowlisted = isAdminEmail(email);
      if (allowlisted) {
        setIsAdmin(true);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", u.uid));
        const role = String(userSnap.data()?.role || "").trim().toLowerCase();
        setIsAdmin(role === "admin");
      } catch {
        setIsAdmin(false);
      }
    });
    return () => unsub?.();
  }, []);

  /* ---------------- Fetch employees ---------------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "load holiday employees" });
      setEmployees([]);
      return;
    }

    const fetchEmployees = async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        const list = snap.docs
          .map((d) => ({ id: d.id, name: d.data()?.name }))
          .filter((x) => x.name);
        setEmployees(list);
      } catch (e) {
        console.error("Failed to fetch employees:", e);
      }
    };
    fetchEmployees();
  }, [accessKey, dataAccessState]);

  /* ---------------- Load holiday ---------------- */
  useEffect(() => {
    const run = async () => {
      if (!holidayId) return;

      setLoading(true);
      try {
        const ref = doc(db, "holidays", String(holidayId));
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setLoading(false);
          alert("Holiday not found.");
          handleBack();
          return;
        }

        const rec = snap.data() || {};
        setHolidayRec(rec);

        const isAppr = isApprovedHoliday(rec);
        setApproved(isAppr);

        const st = String(rec.status || "").trim();
        setExistingStatus(st);

        const sYMD = dateToYMD(rec.startDate);
        const eYMD = dateToYMD(rec.endDate || rec.startDate);

        const sD = ymdToDate(sYMD);
        const eD = ymdToDate(eYMD);
        const isSingle = sD && eD ? sameYMD(sD, eD) : sYMD && eYMD && sYMD === eYMD;

        setEmployee(rec.employee || "");
        const storedPaidStatus = String(rec.paidStatus || "").trim();
        const legacyUnpaid = rec.isUnpaid === true || rec.unpaid === true || rec.paid === false;
        setPaidStatus(storedPaidStatus || (legacyUnpaid ? "Unpaid" : "Paid"));
        setHolidayReason(rec.holidayReason || rec.notes || "");

        setIsMultiDay(!isSingle);

        // dates
        if (isSingle) {
          setHolidayDate(sYMD);
          setStartDate(sYMD);
          setEndDate(eYMD);
        } else {
          setHolidayDate("");
          setStartDate(sYMD);
          setEndDate(eYMD);
        }

        // half-day (new schema preferred; fallback to legacy)
        const legacyHalf = rec.halfDay === true;
        const legacyWhen =
          String(rec.halfDayPeriod || rec.halfDayType || "").toUpperCase() === "PM"
            ? "PM"
            : "AM";

        const sHalf = !!rec.startHalfDay || (isSingle && legacyHalf);
        const sWhen =
          (rec.startAMPM || (isSingle && legacyHalf ? legacyWhen : "AM")) === "PM"
            ? "PM"
            : "AM";

        const eHalf = !!rec.endHalfDay; // for multi-day end half
        const eWhen = (rec.endAMPM || "PM") === "AM" ? "AM" : "PM";

        setStartHalfDay(sHalf);
        setStartAMPM(sWhen);
        setEndHalfDay(eHalf);
        setEndAMPM(eWhen);

        setLoading(false);
      } catch (err) {
        console.error("Failed to load holiday:", err);
        setLoading(false);
        alert("Failed to load holiday.");
        handleBack();
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holidayId]);

  // If single-day, keep end half settings aligned with start (for consistent HR parsing)
  useEffect(() => {
    if (!isMultiDay) {
      setEndHalfDay(startHalfDay);
      setEndAMPM(startAMPM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiDay, startHalfDay, startAMPM]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (saving) return false;
    if (!holidayId) return false;
    if (approved && !isAdmin) return false;

    if (!employee) return false;
    if (!holidayReason.trim()) return false;
    if (!paidStatus) return false;

    if (isMultiDay) return !!startDate && !!endDate;
    return !!holidayDate;
  }, [
    loading,
    saving,
    holidayId,
    employee,
    holidayReason,
    paidStatus,
    isMultiDay,
    startDate,
    endDate,
    holidayDate,
    approved,
    isAdmin,
  ]);

  const canEditRecord = isAdmin || !approved;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!holidayId) return;
    if (!canEditRecord) {
      alert("Approved holidays can only be edited by an admin.");
      return;
    }

    if (!employee) return alert("Please select an employee.");
    if (!holidayReason.trim()) return alert("Please enter a reason.");
    if (!paidStatus) return alert("Please select paid status.");

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

      const preserveApproval = isAdmin && approved;
      const finalStatus = preserveApproval ? String(existingStatus || "approved") : "requested";
      const selectedEmployee = employees.find((emp) => String(emp.name || "").trim() === String(employee || "").trim());
      const employeeCode = String(
        selectedEmployee?.employeeCode || selectedEmployee?.userCode || selectedEmployee?.code || holidayRec?.employeeCode || ""
      ).trim();

      const payload = {
        employee,
        employeeName: employee,
        employeeCode,
        startDate: startAsDate,
        endDate: endAsDate,
        holidayDateKeys: holidayDateKeysFromRange(finalStart, finalEnd),

        // half-day schema (same as create)
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

        status: finalStatus,
        approvalStatus: preserveApproval ? "approved" : "requested",
        approved: preserveApproval,

        updatedAt: serverTimestamp(),
        updatedBy: userEmail || "",
      };

      await updateDoc(doc(db, "holidays", String(holidayId)), tenantPayload(dataAccessState, payload));

      if (typeof onSaved === "function") onSaved();
      if (typeof onClose === "function") onClose();
      else router.push("/dashboard");
    } catch (err) {
      console.error("Error updating holiday:", err);
      alert("Failed to update holiday. Please try again.");
      setSaving(false);
    }
  };

  //  Request delete is allowed ONLY if the holiday is approved (matches your rule)
  // (actual delete happens in HR approvals page)
  const canRequestDelete = useMemo(() => {
    if (loading || saving) return false;
    return approved === true;
  }, [loading, saving, approved]);

  const handleRequestDelete = async () => {
    if (!holidayId) return;

    if (!approved) {
      alert("You can only request deletion for an APPROVED holiday.");
      return;
    }

    const ok = confirm(
      "Request deletion of this APPROVED holiday?\n\nAn admin must approve before it is removed."
    );
    if (!ok) return;

    setSaving(true);
    try {
      const ref = doc(db, "holidays", String(holidayId));

      // what status should we restore to if HR declines the delete?
      const prev =
        String(existingStatus || holidayRec?.status || "approved").trim() || "approved";

      await updateDoc(ref, tenantPayload(dataAccessState, {
        status: "delete_requested",
        deleteRequestedAt: serverTimestamp(),
        deleteRequestedBy: userEmail || "",
        deleteFromStatus: prev, //  used by HR "Decline delete" to restore
        updatedAt: serverTimestamp(),
        updatedBy: userEmail || "",
      }));

      if (typeof onSaved === "function") onSaved();
      if (typeof onClose === "function") onClose();
      else router.push("/holiday-usage");
    } catch (err) {
      console.error("Delete request failed:", err);
      alert("Failed to request deletion. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className={layoutStyles.extracted1}>
      <div className={layoutStyles.extracted2}>
        {/* Header */}
        <div className={layoutStyles.extracted3}>
          <div className={layoutStyles.extracted4}>
            <h2 className={layoutStyles.extracted5}>{loading ? "Loading…" : "Edit Holiday"}</h2>

            {!loading ? (
              <div className={layoutStyles.extracted6}>
                Status:{" "}
                <b className={layoutStyles.extracted7}>
                  {approved ? "Approved" : "Not approved"}
                </b>
                {holidayRec?.status ? (
                  <>
                    {" "}
                    • Record:{" "}
                    <b className={layoutStyles.extracted8}>
                      {String(holidayRec.status)}
                    </b>
                  </>
                ) : null}
                {userEmail ? (
                  <>
                    {" "}
                    • Signed in:{" "}
                    <b className={layoutStyles.extracted9}>{userEmail}</b>{" "}
                    • {isAdmin ? "Admin" : "Staff"}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <button onClick={handleBack} className={layoutStyles.extracted10} aria-label="Close" type="button">
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} className={layoutStyles.extracted11}>
          {!canEditRecord ? (
            <div
              className={layoutStyles.extracted12}
            >
              This holiday has already been approved. Only an admin can edit it now.
            </div>
          ) : null}
          <fieldset
            disabled={loading || saving || !canEditRecord}
            className={layoutStyles.extracted13}
          >
          {/* Employee */}
          <div>
            <label className={layoutStyles.extracted14}>Employee</label>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              className={layoutStyles.extracted15}
              required
            >
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
            <label className={layoutStyles.extracted16}>Holiday Type</label>
            <select
              value={isMultiDay ? "multi" : "single"}
              onChange={(e) => setIsMultiDay(e.target.value === "multi")}
              className={layoutStyles.extracted17}
              disabled={loading}
            >
              <option value="single">Single Day</option>
              <option value="multi">Multi-Day</option>
            </select>
          </div>

          {/* Dates */}
          {!isMultiDay ? (
            <div>
              <label className={layoutStyles.extracted18}>Date</label>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                required
                className={layoutStyles.extracted19}
                disabled={loading}
              />
            </div>
          ) : (
            <>
              <div>
                <label className={layoutStyles.extracted20}>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className={layoutStyles.extracted21}
                  disabled={loading}
                />
              </div>

              <div>
                <label className={layoutStyles.extracted22}>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className={layoutStyles.extracted23}
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* Half day controls */}
          <div className={layoutStyles.extracted24}>
            <div className={layoutStyles.extracted25}>
              <div>
                <div className={layoutStyles.extracted26}>
                  Half day
                </div>
                <div className={layoutStyles.extracted27}>
                  {isMultiDay ? "Use start and/or end half day." : "Single day can be AM or PM."}
                </div>
              </div>
              <label className={layoutStyles.extracted28}>
                <input
                  type="checkbox"
                  checked={startHalfDay}
                  onChange={(e) => setStartHalfDay(e.target.checked)}
                  disabled={loading}
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
                  <select
                    value={startAMPM}
                    onChange={(e) => setStartAMPM(e.target.value)}
                    className={layoutStyles.extracted32}
                    disabled={loading}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>

                {isMultiDay ? (
                  <div>
                    <div className={layoutStyles.extracted33}>
                      <label className={layoutStyles.extracted34}>End half day</label>
                      <label className={layoutStyles.extracted35}>
                        <input
                          type="checkbox"
                          checked={endHalfDay}
                          onChange={(e) => setEndHalfDay(e.target.checked)}
                          disabled={loading}
                        />
                        <span className={layoutStyles.extracted36}>End half</span>
                      </label>
                    </div>

                    {endHalfDay ? (
                      <div className={layoutStyles.extracted37}>
                        <label className={layoutStyles.extracted38}>End AM / PM</label>
                        <select
                          value={endAMPM}
                          onChange={(e) => setEndAMPM(e.target.value)}
                          className={layoutStyles.extracted39}
                          disabled={loading}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : isMultiDay ? (
              <div className={layoutStyles.extracted40}>
                <div className={layoutStyles.extracted41}>
                  <label className={layoutStyles.extracted42}>End half day</label>
                  <label className={layoutStyles.extracted43}>
                    <input
                      type="checkbox"
                      checked={endHalfDay}
                      onChange={(e) => setEndHalfDay(e.target.checked)}
                      disabled={loading}
                    />
                    <span className={layoutStyles.extracted44}>End half</span>
                  </label>
                </div>

                {endHalfDay ? (
                  <div className={layoutStyles.extracted45}>
                    <label className={layoutStyles.extracted46}>End AM / PM</label>
                    <select
                      value={endAMPM}
                      onChange={(e) => setEndAMPM(e.target.value)}
                      className={layoutStyles.extracted47}
                      disabled={loading}
                    >
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
            <label className={layoutStyles.extracted48}>Reason</label>
            <textarea
              value={holidayReason}
              onChange={(e) => setHolidayReason(e.target.value)}
              rows={3}
              placeholder="e.g. Family holiday / Sick / Appointment..."
              required
              className={layoutStyles.extracted49}
              disabled={loading}
            />
          </div>

          {/* Paid vs unpaid */}
          <div>
            <label className={layoutStyles.extracted50}>Paid status</label>
            <select
              value={paidStatus}
              onChange={(e) => setPaidStatus(e.target.value)}
              className={layoutStyles.extracted51}
              disabled={loading}
            >
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
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
              {saving ? "Saving..." : "Update holiday"}
            </button>
          </fieldset>

          <div className={layoutStyles.extracted52}>
            <button
              type="button"
              onClick={handleRequestDelete}
              style={{
                ...dangerBtn,
                opacity: canRequestDelete ? 1 : 0.45,
                cursor: canRequestDelete ? "pointer" : "not-allowed",
              }}
              disabled={!canRequestDelete}
              title={
                !approved
                  ? "Only approved holidays can be deletion-requested"
                  : "Request deletion (admin approval required)"
              }
            >
              Request delete (approved only)
            </button>

            <button type="button" onClick={handleBack} className={layoutStyles.extracted53} disabled={saving}>
              Cancel
            </button>
          </div>

          <div className={layoutStyles.extracted54}>
            Deletion requests are reviewed on the HR page. An admin must approve before the holiday is removed.
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------- styles (matching your create) -------------------- */

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 999, // keep above drawer
  padding: 16,
};

const modal = {
  width: "min(520px, 95vw)",
  borderRadius: 16,
  padding: 18,
  color: "var(--color-white)",
  background: "linear-gradient(180deg, rgba(22,22,22,0.95) 0%, rgba(12,12,12,0.98) 100%)",
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
  color: "var(--color-border-strong)",
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
  color: "var(--color-white)",
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
  background: var(--shell-sidebar-bg) !important;
  color: var(--color-white) !important;
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
  background: "linear-gradient(180deg, var(--color-brand) 0%, var(--color-brand) 100%)",
  color: "var(--color-white)",
  fontWeight: 800,
  fontSize: 14,
};

const dangerBtn = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(185,28,28,0.55)",
  background: "linear-gradient(180deg, var(--color-danger) 0%, var(--color-danger-hover) 100%)",
  color: "var(--color-accent-soft)",
  fontWeight: 800,
  fontSize: 14,
};

const ghostBtn = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.88)",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
