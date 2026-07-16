"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../firebaseConfig";
import { doc, getDoc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const toDateValue = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const raw = typeof value?.toDate === "function" ? value.toDate() : value;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const ymdToDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function EditHolidayPage() {
  const router = useRouter();
  const params = useParams();
  const holidayId = params.id;
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  

  const [employee, setEmployee] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "load edit holiday employees" });
      setEmployees([]);
      return;
    }

    const fetchHoliday = async () => {
      if (!holidayId) return;
      const docRef = doc(db, "holidays", holidayId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setEmployee(data.employee);
        setStartDate(toDateValue(data.startDate));
        setEndDate(toDateValue(data.endDate || data.startDate));
        setHolidayReason(data.holidayReason);
        setPaidStatus(data.paidStatus || "Paid");
      }
    };

    const fetchEmployees = async () => {
      const snapshot = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
      const employeeData = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setEmployees(employeeData);
    };

    fetchHoliday();
    fetchEmployees();
  }, [accessKey, dataAccessState, holidayId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employee || !startDate || !endDate || !holidayReason) {
      alert("Please fill in all fields");
      return;
    }

    try {
      const startAsDate = ymdToDate(startDate);
      const endAsDate = ymdToDate(endDate);
      if (!startAsDate || !endAsDate) {
        alert("Please enter valid start and end dates.");
        return;
      }
      if (startAsDate > endAsDate) {
        alert("End date must be the same or after the start date.");
        return;
      }

      const docRef = doc(db, "holidays", holidayId);
      await updateDoc(docRef, tenantPayload(dataAccessState, {
        employee,
        startDate: startAsDate,
        endDate: endAsDate,
        holidayReason: holidayReason.trim(),
        paidStatus,
      }));
      alert("Holiday updated successfully!");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error updating holiday: ", error);
      alert("Failed to update holiday.");
    }
  };

  const handleCancel = () => router.push("/dashboard");

  const handleDelete = async () => {
    if (!holidayId) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this holiday?");
    if (!confirmDelete) return;
  
    try {
      await deleteDoc(doc(db, "holidays", holidayId));
      alert("Holiday deleted.");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting holiday: ", error);
      alert("Failed to delete holiday.");
    }
  };
  

  return (
    <div className={layoutStyles.extracted1}>
      <main className={layoutStyles.extracted2}>
        <div className={layoutStyles.extracted3}>
<button onClick={() => router.back()} className={layoutStyles.extracted4}>
  ← Back
</button>

        </div>

        <h1 className={layoutStyles.extracted5}>Edit Holiday</h1>

        <div className={layoutStyles.extracted6}>
          <h2 className={layoutStyles.extracted7}>Update Holiday Info</h2>
          <form onSubmit={handleSubmit}>
            <div className={layoutStyles.extracted8}>
              <label className={layoutStyles.extracted9}>Employee Name</label>
              <select value={employee} onChange={(e) => setEmployee(e.target.value)} required className={layoutStyles.extracted10}>
                <option value="" disabled>Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div className={layoutStyles.extracted11}>
              <label className={layoutStyles.extracted12}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className={layoutStyles.extracted13} />
            </div>

            <div className={layoutStyles.extracted14}>
              <label className={layoutStyles.extracted15}>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className={layoutStyles.extracted16} />
            </div>

            <div className={layoutStyles.extracted17}>
              <label className={layoutStyles.extracted18}>Holiday Reason</label>
              <textarea value={holidayReason} onChange={(e) => setHolidayReason(e.target.value)} required className={layoutStyles.extracted19} />
            </div>

            <div className={layoutStyles.extracted20}>
              <label className={layoutStyles.extracted21}>Paid or Unpaid</label>
              <select value={paidStatus} onChange={(e) => setPaidStatus(e.target.value)} required className={layoutStyles.extracted22}>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>

            <button type="submit" className={layoutStyles.extracted23}>Update Holiday</button>

            <button type="button" onClick={handleDelete} className={layoutStyles.extracted24}
>
  Delete Holiday
</button>

          </form>
        </div>
      </main>
    </div>
  );
}

// Style definitions match original HolidayForm styles
const mainContainerStyle = { display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "var(--shell-sidebar-bg)", color: "var(--color-white)", minHeight: "100vh", padding: "40px" };
const mainContentStyle = { maxWidth: "800px", width: "100%", backgroundColor: "var(--shell-sidebar-bg)", padding: "20px", borderRadius: "10px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" };
const logoStyle = { width: "180px", height: "auto" };
const backButtonStyle = { backgroundColor: "var(--color-warning)", color: "var(--color-white)", border: "none", padding: "8px 16px", fontSize: "14px", cursor: "pointer", borderRadius: "6px" };
const pageTitleStyle = { fontSize: "32px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" };
const formContainerStyle = { backgroundColor: "var(--shell-sidebar-bg)", padding: "30px", borderRadius: "8px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)" };
const formTitleStyle = { fontSize: "24px", fontWeight: "bold", marginBottom: "20px", color: "var(--color-white)" };
const inputContainerStyle = { marginBottom: "15px" };
const labelStyle = { fontSize: "14px", fontWeight: "600", marginBottom: "5px", display: "block", color: "var(--color-white)" };
const inputStyle = { width: "100%", padding: "12px", marginBottom: "10px", borderRadius: "6px", border: "1px solid var(--color-brand-hover)", fontSize: "14px", backgroundColor: "var(--shell-sidebar-bg)", color: "var(--color-white)" };
const buttonStyle = { width: "100%", padding: "12px", backgroundColor: "var(--color-info)", color: "var(--color-white)", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "20px" };
const cancelButtonStyle = { width: "100%", padding: "12px", backgroundColor: "var(--color-warning)", color: "var(--color-white)", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" };
