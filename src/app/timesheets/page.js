"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatWeekRange(mondayStr) {
  const monday = new Date(mondayStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })} – ${sunday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

export default function TimesheetListPage() {
  const [grouped, setGrouped] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all, submitted, missing
  const [weekFilter, setWeekFilter] = useState("all"); // all or a specific week
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get employees
        const empSnap = await getDocs(collection(db, "employees"));
        const employees = empSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Get timesheets
        const tsSnap = await getDocs(collection(db, "timesheets"));
        const timesheets = tsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Deduplicate → keep only latest per employee/week
        const latestMap = {};
        timesheets.forEach((ts) => {
          const key = `${ts.employeeCode}_${ts.weekStart}`;
          if (!latestMap[key] || ts.updatedAt > latestMap[key].updatedAt) {
            latestMap[key] = ts;
          }
        });
        const deduped = Object.values(latestMap);

        // Group by employee
        const groupedByEmp = {};
        employees.forEach((emp) => {
          const empTimesheets = deduped.filter(
            (ts) => ts.employeeCode === emp.userCode
          );
          groupedByEmp[emp.userCode] = {
            name: emp.name,
            code: emp.userCode,
            timesheets: empTimesheets.sort(
              (a, b) =>
                new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
            ),
          };
        });

        setGrouped(groupedByEmp);
      } catch (err) {
        console.error("Error loading timesheets:", err);
      }
    };

    loadData();
  }, []);

  // Past 4 weeks (including current)
  const weekOptions = [...Array(4)].map((_, i) => {
    const monday = getMonday(new Date());
    monday.setDate(monday.getDate() - 7 * i);
    return monday.toISOString().split("T")[0];
  });

  // Filtered employees
  const filteredEmployees = Object.values(grouped).filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.code.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter by status
    let matchesStatus = true;
    if (statusFilter === "submitted") {
      matchesStatus = weekOptions.some((week) =>
        emp.timesheets.find((t) => t.weekStart === week)
      );
    } else if (statusFilter === "missing") {
      matchesStatus = weekOptions.every(
        (week) => !emp.timesheets.find((t) => t.weekStart === week)
      );
    }

    return matchesSearch && matchesStatus;
  });

  // Determine which weeks to display (filtered or all)
  const displayedWeeks =
    weekFilter === "all" ? weekOptions : [weekFilter];

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          flex: 1,
          minHeight: "100vh",
          backgroundColor: "#f4f4f5",
          color: "#333",
          fontFamily: "Arial, sans-serif",
          padding: 40,
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
          📂 Timesheet Submissions
        </h1>

        {/* 🔎 Search + Filter controls */}
        <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
          <input
            type="text"
            placeholder="Search by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontSize: 14,
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontSize: 14,
            }}
          >
            <option value="all">All</option>
            <option value="submitted">Submitted</option>
            <option value="missing">Missing</option>
          </select>

          <select
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
            style={{
              padding: "8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontSize: 14,
            }}
          >
            <option value="all">All Weeks</option>
            {weekOptions.map((week) => (
              <option key={week} value={week}>
                {formatWeekRange(week)}
              </option>
            ))}
          </select>
        </div>

        {filteredEmployees.length === 0 ? (
          <p style={{ color: "#555" }}>No matching employees found.</p>
        ) : (
          filteredEmployees.map((emp) => (
            <div key={emp.code} style={{ marginBottom: 30 }}>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: "600",
                  marginBottom: 10,
                  borderBottom: "1px solid #ddd",
                  paddingBottom: 4,
                }}
              >
                {emp.name} ({emp.code})
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 20,
                }}
              >
                {displayedWeeks.map((weekStart) => {
                  const ts = emp.timesheets.find(
                    (t) => t.weekStart === weekStart
                  );
                  return (
                    <div
                      key={weekStart}
                      style={{
                        backgroundColor: "#fff",
                        padding: 20,
                        borderRadius: 8,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        cursor: ts ? "pointer" : "default",
                        borderLeft: ts
                          ? "4px solid #22c55e"
                          : "4px solid #f87171",
                      }}
                      onClick={() =>
                        ts && router.push(`/timesheet-id/${ts.id}`)
                      }
                    >
                      <h3 style={{ marginBottom: 6, fontSize: 16 }}>
                        {formatWeekRange(weekStart)}
                      </h3>
                      {ts ? (
                        <p style={{ color: "#22c55e", fontWeight: "500" }}>
                          ✅ Submitted
                        </p>
                      ) : (
                        <p style={{ color: "#f87171", fontWeight: "500" }}>
                          ❌ No timesheet submitted
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
