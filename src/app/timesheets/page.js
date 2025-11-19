"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* -------------------------------------------------------------------------- */
/*                              DATE HELPERS                                   */
/* -------------------------------------------------------------------------- */

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay(); // 0 = Sun, 1 = Mon
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust to Monday
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

/** Safely convert Firestore Timestamp / Date / string → millis */
function toMillis(val) {
  if (!val) return 0;

  if (typeof val?.toDate === "function") {
    const d = val.toDate();
    return d.getTime();
  }

  if (val instanceof Date) return val.getTime();

  if (typeof val === "object" && typeof val.seconds === "number") {
    return val.seconds * 1000;
  }

  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  return 0;
}

/** Best-effort "last updated" millis for a timesheet */
function getTimesheetUpdatedMs(ts) {
  return (
    toMillis(ts.updatedAt) ||
    toMillis(ts.submittedAt) ||
    toMillis(ts.createdAt) ||
    toMillis(ts.weekStart) ||
    0
  );
}

/* -------------------------------------------------------------------------- */
/*                                  PAGE                                      */
/* -------------------------------------------------------------------------- */

export default function TimesheetListPage() {
  const [grouped, setGrouped] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all, submitted, missing
  const [weekFilter, setWeekFilter] = useState("all"); // all or specific weekStart ISO
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      try {
        // Employees
        const empSnap = await getDocs(collection(db, "employees"));
        const employees = empSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Timesheets
        const tsSnap = await getDocs(collection(db, "timesheets"));
        const timesheets = tsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Deduplicate → latest per employeeCode + weekStart
        const latestMap = {};
        timesheets.forEach((ts) => {
          const key = `${ts.employeeCode}_${ts.weekStart}`;
          const current = latestMap[key];
          if (!current) {
            latestMap[key] = ts;
            return;
          }
          const curMs = getTimesheetUpdatedMs(current);
          const nextMs = getTimesheetUpdatedMs(ts);
          if (nextMs > curMs) {
            latestMap[key] = ts;
          }
        });
        const deduped = Object.values(latestMap);

        // Group by employeeCode
        const groupedByEmp = {};
        employees.forEach((emp) => {
          const code = emp.userCode || emp.code || "";
          const empTimesheets = deduped
            .filter((ts) => ts.employeeCode === code)
            .sort(
              (a, b) =>
                new Date(b.weekStart).getTime() -
                new Date(a.weekStart).getTime()
            );

          groupedByEmp[code] = {
            name: emp.name || "Unnamed",
            code,
            timesheets: empTimesheets,
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

  /* --------------------------- FILTERED EMPLOYEES -------------------------- */

  const filteredEmployees = Object.values(grouped).filter((emp) => {
    const matchesSearch =
      (emp.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.code || "").toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;

    if (statusFilter === "submitted") {
      // at least one submitted in last 4 weeks
      matchesStatus = weekOptions.some((week) =>
        emp.timesheets.some(
          (t) => t.weekStart === week && t.submitted === true
        )
      );
    } else if (statusFilter === "missing") {
      // none submitted in last 4 weeks
      matchesStatus = weekOptions.every(
        (week) =>
          !emp.timesheets.some(
            (t) => t.weekStart === week && t.submitted === true
          )
      );
    }

    return matchesSearch && matchesStatus;
  });

  const displayedWeeks =
    weekFilter === "all" ? weekOptions : [weekFilter];

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          flex: 1,
          minHeight: "100vh",
          backgroundColor: "#f4f4f5",
          color: "#111827",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          padding: "32px 32px 40px 32px",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        {/* Top content wrapper – full width */}
        <div style={{ width: "100%" }}>
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                📂 Timesheet Submissions
              </h1>
              <p
                style={{
                  marginTop: 6,
                  marginBottom: 0,
                  fontSize: 13,
                  color: "#6b7280",
                }}
              >
                Review weekly timesheets by employee. Dark green = approved, light
                green = submitted, amber = draft only, red = missing.
              </p>
            </div>

            {/* Legend */}
            <div
              style={{
                display: "flex",
                gap: 8,
                fontSize: 11,
                color: "#4b5563",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  background: "#dcfce7",
                  borderRadius: 999,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "999px",
                    background: "#16a34a",
                  }}
                />
                Submitted
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  background: "#bbf7d0",
                  borderRadius: 999,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "999px",
                    background: "#15803d",
                  }}
                />
                Approved
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  background: "#fef3c7",
                  borderRadius: 999,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "999px",
                    background: "#f59e0b",
                  }}
                />
                Draft only
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  background: "#fee2e2",
                  borderRadius: 999,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "999px",
                    background: "#ef4444",
                  }}
                />
                Missing
              </span>
            </div>
          </div>

          {/* Filters card */}
          <div
            style={{
              background: "#ffffff",
              padding: 16,
              borderRadius: 12,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              border: "1px solid #e5e7eb",
              marginBottom: 24,
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#4b5563",
                  marginBottom: 4,
                }}
              >
                Search
              </label>
              <input
                type="text"
                placeholder="Search by employee name or code"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  outline: "none",
                  background: "#f9fafb",
                }}
              />
            </div>

            <div style={{ minWidth: 180 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#4b5563",
                  marginBottom: 4,
                }}
              >
                Employee status (last 4 weeks)
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  background: "#f9fafb",
                }}
              >
                <option value="all">All employees</option>
                <option value="submitted">Has submissions</option>
                <option value="missing">No submissions</option>
              </select>
            </div>

            <div style={{ minWidth: 200 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#4b5563",
                  marginBottom: 4,
                }}
              >
                Week
              </label>
              <select
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  background: "#f9fafb",
                }}
              >
                <option value="all">All weeks (last 4)</option>
                {weekOptions.map((week) => (
                  <option key={week} value={week}>
                    {formatWeekRange(week)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* EMPLOYEE LIST */}
          {filteredEmployees.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14 }}>
              No matching employees found. Try adjusting your filters.
            </p>
          ) : (
            filteredEmployees.map((emp) => (
              <div
                key={emp.code}
                style={{
                  background: "#ffffff",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  padding: 16,
                  marginBottom: 18,
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                {/* Employee header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 10,
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        margin: 0,
                        color: "#111827",
                      }}
                    >
                      {emp.name || "Unknown employee"}
                    </h2>
                    <p
                      style={{
                        margin: 0,
                        marginTop: 2,
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      Code:{" "}
                      <span style={{ fontWeight: 600 }}>{emp.code}</span>
                    </p>
                  </div>

                  {/* Quick summary */}
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      textAlign: "right",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "999px",
                          background: "#22c55e",
                        }}
                      />
                      {
                        emp.timesheets.filter(
                          (t) =>
                            weekOptions.includes(t.weekStart) &&
                            t.submitted === true
                        ).length
                      }{" "}
                      submitted in window
                    </span>
                  </div>
                </div>

                {/* Week cards */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 14,
                    marginTop: 4,
                    width: "100%",
                  }}
                >
                  {displayedWeeks.map((weekStart) => {
                    const ts = emp.timesheets.find(
                      (t) => t.weekStart === weekStart
                    );

                    // 🔒 Detect approved status
                    const isApproved =
                      ts &&
                      (String(ts.status || "").toLowerCase() === "approved" ||
                        ts.approved === true ||
                        !!ts.approvedAt);

                    let statusLabel = "No timesheet submitted";
                    let statusColour = "#b91c1c";
                    let statusBg = "#fee2e2";
                    let borderColour = "#fca5a5";
                    let clickable = false;
                    let pillIcon = "❌";

                    if (ts) {
                      clickable = true;

                      if (isApproved) {
                        statusLabel = "Approved";
                        statusColour = "#15803d";
                        statusBg = "#bbf7d0";
                        borderColour = "#22c55e";
                        pillIcon = "✅";
                      } else if (ts.submitted) {
                        statusLabel = "Submitted";
                        statusColour = "#166534";
                        statusBg = "#dcfce7";
                        borderColour = "#4ade80";
                        pillIcon = "✅";
                      } else {
                        statusLabel = "Draft (not submitted)";
                        statusColour = "#92400e";
                        statusBg = "#fef3c7";
                        borderColour = "#fbbf24";
                        pillIcon = "📝";
                      }
                    }

                    const lastUpdateMs = ts ? getTimesheetUpdatedMs(ts) : 0;
                    const lastUpdateText =
                      lastUpdateMs > 0
                        ? new Date(lastUpdateMs).toLocaleString("en-GB")
                        : null;

                    return (
                      <div
                        key={weekStart}
                        style={{
                          backgroundColor: "#ffffff",
                          padding: 14,
                          borderRadius: 10,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                          cursor: clickable ? "pointer" : "default",
                          border: `1px solid ${borderColour}`,
                          transition:
                            "transform 0.05s ease-out, box-shadow 0.05s ease-out, border-color 0.05s ease-out",
                        }}
                        onClick={() =>
                          ts && router.push(`/timesheet-id/${ts.id}`)
                        }
                        onMouseEnter={(e) => {
                          if (!clickable) return;
                          e.currentTarget.style.transform = "translateY(-1px)";
                          e.currentTarget.style.boxShadow =
                            "0 4px 12px rgba(0,0,0,0.07)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "none";
                          e.currentTarget.style.boxShadow =
                            "0 1px 2px rgba(0,0,0,0.03)";
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <div>
                            <h3
                              style={{
                                margin: 0,
                                fontSize: 14,
                                fontWeight: 600,
                                color: "#111827",
                              }}
                            >
                              {formatWeekRange(weekStart)}
                            </h3>
                            <p
                              style={{
                                margin: 0,
                                marginTop: 3,
                                fontSize: 11,
                                color: "#6b7280",
                              }}
                            >
                              Week starting{" "}
                              <span style={{ fontWeight: 500 }}>
                                {new Date(weekStart).toLocaleDateString(
                                  "en-GB"
                                )}
                              </span>
                            </p>
                          </div>

                          {/* Status pill */}
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: statusBg,
                              color: statusColour,
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {pillIcon} {statusLabel}
                          </span>
                        </div>

                        {ts && (
                          <div style={{ marginTop: 8 }}>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 11,
                                color: "#6b7280",
                              }}
                            >
                              Timesheet ID:{" "}
                              <span
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: 11,
                                  color: "#4b5563",
                                }}
                              >
                                {ts.id}
                              </span>
                            </p>
                            {lastUpdateText && (
                              <p
                                style={{
                                  margin: 0,
                                  marginTop: 2,
                                  fontSize: 11,
                                  color: "#6b7280",
                                }}
                              >
                                Last update:{" "}
                                <span style={{ fontWeight: 500 }}>
                                  {lastUpdateText}
                                </span>
                              </p>
                            )}
                          </div>
                        )}

                        {!ts && (
                          <p
                            style={{
                              margin: 0,
                              marginTop: 8,
                              fontSize: 12,
                              color: "#991b1b",
                            }}
                          >
                            No saved timesheet for this week.
                          </p>
                        )}

                        {clickable && (
                          <p
                            style={{
                              margin: 0,
                              marginTop: 10,
                              fontSize: 11,
                              color: "#2563eb",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span>View timesheet</span>
                            <span>↗</span>
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
      </div>
    </HeaderSidebarLayout>
  );
}
