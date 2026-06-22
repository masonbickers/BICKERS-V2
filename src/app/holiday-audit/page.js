"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocs } from "firebase/firestore";
import { ArrowLeft, CalendarDays, History, Search, Trash2, UserRound } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { db } from "../../../firebaseConfig";

const UI = {
  bg: "#f3f6f9",
  card: "#ffffff",
  border: "#d7dee8",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  green: "#15803d",
  amber: "#b45309",
  red: "#b91c1c",
};

const pageWrap = { minHeight: "100vh", background: UI.bg, padding: "16px 16px 32px", color: UI.text };
const surface = {
  background: UI.card,
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
};
const h1 = { margin: 0, fontSize: 22, lineHeight: 1.1, fontWeight: 850, letterSpacing: 0 };
const hint = { color: UI.muted, fontSize: 12.5, lineHeight: 1.45, marginTop: 5 };
const btn = {
  minHeight: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "#fff",
  color: UI.text,
  fontSize: 12.5,
  fontWeight: 850,
  padding: "0 10px",
  cursor: "pointer",
  textDecoration: "none",
};
const input = {
  width: "100%",
  minHeight: 38,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "#fff",
  color: UI.text,
  fontSize: 13,
  fontWeight: 750,
  padding: "8px 10px",
  boxSizing: "border-box",
};
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid #c8d6e3`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 850,
  whiteSpace: "nowrap",
};
const tableWrap = { ...surface, overflow: "auto" };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 };
const th = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: `1px solid ${UI.border}`,
  background: "#f7f9fc",
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const td = { padding: "9px 10px", borderBottom: "1px solid #edf2f7", verticalAlign: "top" };

const normalise = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const employeeDisplayName = (employee = {}) =>
  String(employee.name || employee.fullName || employee.employeeName || employee.displayName || employee.id || "").trim();

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const fmtDate = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
};

const fmtDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatus = (holiday = {}) =>
  String(holiday.status || holiday.approvalStatus || (holiday.approved ? "approved" : "requested") || "").trim() || "requested";

const statusStyle = (status = "") => {
  const clean = normalise(status);
  if (clean.includes("delete") || clean === "deleted") return { color: UI.red, background: "#fee2e2", borderColor: "#fecaca" };
  if (clean.includes("approved")) return { color: UI.green, background: "#ecfdf3", borderColor: "#bbf7d0" };
  if (clean.includes("declined")) return { color: UI.red, background: "#fff1f2", borderColor: "#fecdd3" };
  return { color: UI.amber, background: "#fffbeb", borderColor: "#fde68a" };
};

const StatusPill = ({ status }) => {
  const style = statusStyle(status);
  return <span style={{ ...chip, ...style }}>{status || "requested"}</span>;
};

const employeeMatchesHoliday = (holiday = {}, employee = {}) => {
  if (!employee?.id) return false;
  const employeeValues = [
    employee.id,
    employee.employeeId,
    employee.employeeCode,
    employee.userCode,
    employee.code,
    employee.name,
    employee.fullName,
    employee.employeeName,
    employee.displayName,
  ].map(normalise).filter(Boolean);
  const holidayValues = [
    holiday.employee,
    holiday.employeeName,
    holiday.employeeId,
    holiday.employeeCode,
    holiday.userCode,
    holiday.code,
  ].map(normalise).filter(Boolean);
  return holidayValues.some((value) => employeeValues.includes(value));
};

const holidayLabel = (holiday = {}) => {
  const start = fmtDate(holiday.startDate || holiday.holidayDate);
  const end = fmtDate(holiday.endDate || holiday.startDate || holiday.holidayDate);
  return start === end ? start : `${start} to ${end}`;
};

const historyEntriesForHoliday = (holiday = {}, source = "Active") => {
  const entries = [];
  if (holiday.createdAt || holiday.requestedByEmail || holiday.requestedByName) {
    entries.push({
      id: `${holiday.id}-created`,
      at: holiday.createdAt,
      action: "Created",
      user: holiday.requestedByName || holiday.requestedByEmail || "",
      changes: [`${holidayLabel(holiday)} - ${holiday.paidStatus || "Holiday"}`],
      source,
      holiday,
    });
  }
  if (Array.isArray(holiday.history)) {
    holiday.history.forEach((entry, index) => {
      entries.push({
        id: `${holiday.id}-history-${entry.id || index}`,
        at: entry.at || entry.createdAt || entry.updatedAt,
        action: entry.action || "Updated",
        user: entry.user?.name || entry.user?.email || entry.by || "",
        changes: Array.isArray(entry.changes) ? entry.changes : [entry.note || entry.change || ""].filter(Boolean),
        source,
        holiday,
      });
    });
  }
  if (holiday.decidedAt || holiday.decidedBy) {
    entries.push({
      id: `${holiday.id}-decided`,
      at: holiday.decidedAt,
      action: `Decision: ${getStatus(holiday)}`,
      user: holiday.decidedBy || "",
      changes: [`Status set to ${getStatus(holiday)}`],
      source,
      holiday,
    });
  }
  if (holiday.deleteRequestedAt || holiday.deleteRequestedBy) {
    entries.push({
      id: `${holiday.id}-delete-requested`,
      at: holiday.deleteRequestedAt,
      action: "Delete requested",
      user: holiday.deleteRequestedBy || "",
      changes: [`Delete requested from ${holiday.deleteFromStatus || holiday.previousStatus || "approved"}`],
      source,
      holiday,
    });
  }
  if (holiday.deletedAt || holiday.deletedBy) {
    entries.push({
      id: `${holiday.id}-deleted`,
      at: holiday.deletedAt,
      action: "Deleted",
      user: holiday.deletedBy || "",
      changes: ["Holiday moved to deleted audit records"],
      source: "Deleted",
      holiday,
    });
  }
  return entries;
};

const allowanceRowsForEmployee = (employee = {}) => {
  if (!employee) return [];
  const years = new Set([
    ...Object.keys(employee.holidayAllowances || {}),
    ...Object.keys(employee.carryOverByYear || {}),
  ]);
  const currentYear = String(new Date().getFullYear());
  if (!years.size && (employee.holidayAllowance !== undefined || employee.carriedOverDays !== undefined)) {
    years.add(currentYear);
  }
  return [...years]
    .sort((a, b) => Number(b) - Number(a))
    .map((year) => ({
      year,
      allowance:
        employee.holidayAllowances?.[year] !== undefined
          ? employee.holidayAllowances[year]
          : year === currentYear
          ? employee.holidayAllowance
          : undefined,
      carry:
        employee.carryOverByYear?.[year] !== undefined
          ? employee.carryOverByYear[year]
          : year === currentYear
          ? employee.carriedOverDays
          : undefined,
    }));
};

const allowanceEntriesForEmployee = (employee = {}) => {
  if (!Array.isArray(employee?.holidayAllowanceHistory)) return [];
  return employee.holidayAllowanceHistory.map((entry, index) => ({
    id: `${employee.id}-allowance-${entry.id || index}`,
    at: entry.at || entry.createdAt || entry.updatedAt,
    action: entry.action || "Allowance changed",
    user: entry.user?.name || entry.user?.email || entry.by || "",
    changes: Array.isArray(entry.changes) ? entry.changes : [entry.note || entry.change || ""].filter(Boolean),
    source: "Allowance",
    label: entry.year ? `Holiday allowance ${entry.year}` : "Holiday allowance",
    holiday: {},
  }));
};

export default function HolidayAuditPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [deletedHolidays, setDeletedHolidays] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "holidays", operation: "load holiday audit" });
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [employeeSnap, holidaySnap] = await Promise.all([
          getDocs(tenantCollectionQuery(db, "employees", dataAccessState)),
          getDocs(tenantCollectionQuery(db, "holidays", dataAccessState)),
        ]);
        const employeeRows = employeeSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
          .filter((employee) => employeeDisplayName(employee))
          .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b)));
        setEmployees(employeeRows);
        setHolidays(holidaySnap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}), __source: "Active" })));
        if (!selectedEmployeeId && employeeRows[0]?.id) setSelectedEmployeeId(employeeRows[0].id);

        try {
          const deletedSnap = await getDocs(tenantCollectionQuery(db, "deletedHolidays", dataAccessState));
          setDeletedHolidays(deletedSnap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}), __source: "Deleted" })));
        } catch (deletedErr) {
          if (!handleFirestoreAccessError(deletedErr, { collectionName: "deletedHolidays", operation: "load deleted holiday audit" })) {
            console.warn("Deleted holiday audit records are unavailable:", deletedErr);
          }
          setDeletedHolidays([]);
        }
      } catch (err) {
        if (!handleFirestoreAccessError(err, { collectionName: "holidays", operation: "load holiday audit" })) {
          console.error("Failed loading holiday audit:", err);
          setError("Unable to load holiday audit data.");
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accessKey, dataAccessState, selectedEmployeeId]);

  const visibleEmployees = useMemo(() => {
    const needle = normalise(search);
    if (!needle) return employees;
    return employees.filter((employee) => normalise(employeeDisplayName(employee)).includes(needle));
  }, [employees, search]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) || visibleEmployees[0] || null,
    [employees, selectedEmployeeId, visibleEmployees]
  );

  const employeeHolidays = useMemo(() => {
    if (!selectedEmployee) return [];
    return [...holidays, ...deletedHolidays]
      .filter((holiday) => employeeMatchesHoliday(holiday, selectedEmployee))
      .sort((a, b) => (toDate(b.startDate)?.getTime() || 0) - (toDate(a.startDate)?.getTime() || 0));
  }, [deletedHolidays, holidays, selectedEmployee]);

  const timeline = useMemo(
    () =>
      [
        ...employeeHolidays.flatMap((holiday) => historyEntriesForHoliday(holiday, holiday.__source || "Active")),
        ...allowanceEntriesForEmployee(selectedEmployee),
      ].sort((a, b) => (toDate(b.at)?.getTime() || 0) - (toDate(a.at)?.getTime() || 0)),
    [employeeHolidays, selectedEmployee]
  );

  const activeCount = employeeHolidays.filter((holiday) => holiday.__source !== "Deleted").length;
  const deletedCount = employeeHolidays.filter((holiday) => holiday.__source === "Deleted" || getStatus(holiday) === "deleted").length;
  const changeCount = timeline.length;
  const allowanceRows = allowanceRowsForEmployee(selectedEmployee);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <h1 style={h1}>Holiday Audit</h1>
            <div style={hint}>Choose an employee to review holiday records, changes, delete requests and archived deletions.</div>
          </div>
          <button type="button" onClick={() => router.push("/hr")} style={btn}>
            <ArrowLeft size={15} />
            HR
          </button>
        </div>

        {error ? <div style={{ ...surface, padding: 12, marginBottom: 12, color: UI.red, fontWeight: 850 }}>{error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
          <aside style={{ ...surface, padding: 12 }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: UI.muted }} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee..." style={{ ...input, paddingLeft: 34 }} />
            </div>
            <select value={selectedEmployee?.id || ""} onChange={(event) => setSelectedEmployeeId(event.target.value)} style={input}>
              {visibleEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeDisplayName(employee)}
                </option>
              ))}
            </select>
            <div style={{ ...hint, marginTop: 10 }}>
              {loading ? "Loading..." : `${visibleEmployees.length} employee${visibleEmployees.length === 1 ? "" : "s"}`}
            </div>
          </aside>

          <main style={{ display: "grid", gap: 12 }}>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              <div style={{ ...surface, padding: 12 }}>
                <div style={hint}>Employee</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{selectedEmployee ? employeeDisplayName(selectedEmployee) : "-"}</div>
              </div>
              <div style={{ ...surface, padding: 12 }}>
                <div style={hint}>Active records</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{activeCount}</div>
              </div>
              <div style={{ ...surface, padding: 12 }}>
                <div style={hint}>Deleted records</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{deletedCount}</div>
              </div>
              <div style={{ ...surface, padding: 12 }}>
                <div style={hint}>Audit entries</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{changeCount}</div>
              </div>
            </section>

            <section style={tableWrap}>
              <div style={{ padding: 12, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", borderBottom: `1px solid ${UI.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
                  <UserRound size={17} />
                  Holiday Allowances
                </div>
                <span style={chip}>{allowanceRows.length} year{allowanceRows.length === 1 ? "" : "s"}</span>
              </div>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Year</th>
                    <th style={th}>Allowance</th>
                    <th style={th}>Carry over</th>
                  </tr>
                </thead>
                <tbody>
                  {allowanceRows.length ? (
                    allowanceRows.map((row) => (
                      <tr key={row.year}>
                        <td style={{ ...td, fontWeight: 850 }}>{row.year}</td>
                        <td style={td}>{row.allowance ?? "-"}</td>
                        <td style={td}>{row.carry ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td style={td} colSpan={3}>No allowance records found for this employee.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section style={tableWrap}>
              <div style={{ padding: 12, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", borderBottom: `1px solid ${UI.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
                  <CalendarDays size={17} />
                  Holiday Records
                </div>
                <span style={chip}>{employeeHolidays.length} total</span>
              </div>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Dates</th>
                    <th style={th}>Type</th>
                    <th style={th}>Status</th>
                    <th style={th}>Reason</th>
                    <th style={th}>Requested / Deleted</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeHolidays.length ? (
                    employeeHolidays.map((holiday) => (
                      <tr key={`${holiday.__source}-${holiday.id}`}>
                        <td style={{ ...td, fontWeight: 850 }}>{holidayLabel(holiday)}</td>
                        <td style={td}>{holiday.paidStatus || holiday.leaveType || "Holiday"}</td>
                        <td style={td}><StatusPill status={holiday.__source === "Deleted" ? "deleted" : getStatus(holiday)} /></td>
                        <td style={td}>{holiday.holidayReason || holiday.notes || "-"}</td>
                        <td style={td}>
                          <div>{holiday.requestedByName || holiday.requestedByEmail || "-"}</div>
                          {holiday.deletedAt || holiday.deletedBy ? (
                            <div style={{ color: UI.red, fontSize: 12, marginTop: 3 }}>
                              Deleted {fmtDateTime(holiday.deletedAt)} {holiday.deletedBy ? `by ${holiday.deletedBy}` : ""}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td style={td} colSpan={5}>No holiday records found for this employee.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section style={{ ...surface, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
                  <History size={17} />
                  Audit Timeline
                </div>
                <span style={chip}>{timeline.length} entries</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {timeline.length ? (
                  timeline.map((entry) => (
                    <div key={entry.id} style={{ border: `1px solid ${UI.border}`, borderRadius: 8, padding: 10, background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
                          {entry.source === "Deleted" ? <Trash2 size={14} color={UI.red} /> : <UserRound size={14} color={UI.brand} />}
                          {entry.action}
                        </div>
                        <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800 }}>{fmtDateTime(entry.at)}</div>
                      </div>
                      <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                        {entry.label || holidayLabel(entry.holiday)} {entry.user ? `- ${entry.user}` : ""}
                      </div>
                      {entry.changes?.length ? (
                        <div style={{ display: "grid", gap: 3, marginTop: 8 }}>
                          {entry.changes.map((change, index) => (
                            <div key={`${entry.id}-${index}`} style={{ fontSize: 12.5, color: UI.text }}>
                              {change}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div style={{ color: UI.muted, fontSize: 13 }}>No audit entries recorded for this employee yet.</div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
