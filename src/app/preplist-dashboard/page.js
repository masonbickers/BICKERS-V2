"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";

const PREP_STORAGE_KEY = "preplist:vehicle-checks:v2";
const PREP_MANUAL_STORAGE_KEY = "preplist:manual-entries:v1";

const INACTIVE_STATUSES = new Set([
  "cancelled",
  "dnh",
  "lost",
  "postponed",
  "deleted",
]);

const UI = {
  bg: "#f6f8fb",
  card: "#ffffff",
  line: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  soft: "#f8fafc",
  green: "#166534",
  greenBg: "#dcfce7",
  red: "#991b1b",
  redBg: "#fee2e2",
  purple: "#6d28d9",
  purpleBg: "#f3e8ff",
  dark: "#0f172a",
};

const pageWrap = {
  padding: "24px 18px 40px",
  background: UI.bg,
  minHeight: "100vh",
};

const panel = {
  background: UI.card,
  border: `1px solid ${UI.line}`,
  borderRadius: 18,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const statCard = {
  ...panel,
  padding: 16,
};

const buttonBase = {
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid ${UI.line}`,
  background: "#fff",
  color: UI.text,
  fontWeight: 800,
  cursor: "pointer",
};

const inputBase = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 12,
  border: `1px solid ${UI.line}`,
  fontSize: 14,
  color: UI.text,
  background: "#fff",
  outline: "none",
};

const selectBase = {
  ...inputBase,
  cursor: "pointer",
};

const pill = (bg, color) => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  background: bg,
  color,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
});

const toDateSafe = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d, days) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const ymd = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fmtLong = (d) =>
  d
    ? d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "-";

const fmtShort = (d) =>
  d
    ? d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      })
    : "-";

const fmtDateTime = (v) => {
  const d = toDateSafe(v);
  if (!d) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const safeLower = (v) => String(v || "").trim().toLowerCase();

function normaliseVehicleLabel(v, vehicleById) {
  if (v && typeof v === "object") {
    return String(v.name || v.registration || v.reg || v.id || "Vehicle");
  }
  const key = String(v || "").trim();
  return String(vehicleById.get(key) || key || "Vehicle");
}

function getPrepRecord(records, key) {
  return records?.[key] || {};
}

function isArchivedRecord(record, outingYmd, todayYmd) {
  if (!outingYmd) return !!record?.archived;
  if (outingYmd < todayYmd) return true;
  if (record?.archived) return true;
  return false;
}

function groupByPrepDateAndJob(items) {
  const prepDateMap = new Map();

  items.forEach((item) => {
    if (!prepDateMap.has(item.prepYmd)) {
      prepDateMap.set(item.prepYmd, new Map());
    }

    const jobsMap = prepDateMap.get(item.prepYmd);
    const jobKey = item.isManual
      ? `manual::${item.sectionKey}`
      : `${item.bookingId || ""}::${item.jobNumber}::${item.client}::${item.location}`;

    if (!jobsMap.has(jobKey)) {
      jobsMap.set(jobKey, {
        jobKey,
        bookingId: item.bookingId,
        isManual: item.isManual,
        prepDate: item.prepDate,
        prepYmd: item.prepYmd,
        outingDate: item.outingDate,
        outingYmd: item.outingYmd,
        jobNumber: item.jobNumber,
        client: item.client,
        location: item.location,
        status: item.status,
        notesForDay: item.notesForDay,
        vehicles: [],
      });
    }

    jobsMap.get(jobKey).vehicles.push(item);
  });

  return Array.from(prepDateMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([prepYmd, jobsMap]) => ({
      prepYmd,
      prepDate: toDateSafe(prepYmd),
      jobs: Array.from(jobsMap.values()).sort((a, b) => {
        const aj = String(a.jobNumber || "");
        const bj = String(b.jobNumber || "");
        return aj.localeCompare(bj) || String(a.client || "").localeCompare(String(b.client || ""));
      }),
    }));
}

function getEmployeeDisplayName(emp) {
  return (
    emp?.name ||
    [emp?.firstName, emp?.lastName].filter(Boolean).join(" ").trim() ||
    emp?.fullName ||
    emp?.displayName ||
    emp?.employeeName ||
    emp?.email ||
    emp?.id ||
    ""
  );
}

export default function PrepListDashboardPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [manualEntries, setManualEntries] = useState([]);
  const [prepRecordsByKey, setPrepRecordsByKey] = useState({});
  const [loading, setLoading] = useState(true);
  const [storageLoaded, setStorageLoaded] = useState(false);

  const [rangeFilter, setRangeFilter] = useState("all-upcoming");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState({});
  const [staffNameDrafts, setStaffNameDrafts] = useState({});

  const today = useMemo(() => dayOnly(new Date()), []);
  const todayYmd = useMemo(() => ymd(today), [today]);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [bSnap, vSnap, eSnap] = await Promise.all([
          getDocs(collection(db, "bookings")),
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "employees")),
        ]);
        if (!active) return;
        setBookings(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setVehicles(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setEmployees(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Failed loading prep dashboard data:", error);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const rawChecks = localStorage.getItem(PREP_STORAGE_KEY);
      if (rawChecks) {
        const parsed = JSON.parse(rawChecks);
        if (parsed && typeof parsed === "object") setPrepRecordsByKey(parsed);
      }
    } catch (error) {
      console.error("Failed loading prep records:", error);
    }

    try {
      const rawManual = localStorage.getItem(PREP_MANUAL_STORAGE_KEY);
      if (rawManual) {
        const parsed = JSON.parse(rawManual);
        if (Array.isArray(parsed)) setManualEntries(parsed);
      }
    } catch (error) {
      console.error("Failed loading manual prep entries:", error);
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      localStorage.setItem(PREP_STORAGE_KEY, JSON.stringify(prepRecordsByKey));
    } catch (error) {
      console.error("Failed saving prep records:", error);
    }
  }, [prepRecordsByKey, storageLoaded]);

  const vehicleById = useMemo(() => {
    const map = new Map();
    vehicles.forEach((v) => {
      const label = v?.name || v?.registration || v?.reg || v?.id;
      map.set(String(v.id), String(label || v.id));
    });
    return map;
  }, [vehicles]);

  const employeeOptions = useMemo(() => {
    return employees
      .map((emp) => getEmployeeDisplayName(emp))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const prepItems = useMemo(() => {
    const out = [];

    bookings.forEach((b) => {
      const statusLC = safeLower(b.status);
      if (INACTIVE_STATUSES.has(statusLC)) return;

      const start = toDateSafe(b.startDate || b.date);
      if (!start) return;

      const outingDate = dayOnly(start);
      const prepDate = addDays(outingDate, -1);
      const outingYmd = ymd(outingDate);
      const prepYmd = ymd(prepDate);

      const rawVehicles = asArray(b.vehicles);
      const resolvedVehicles = rawVehicles.length ? rawVehicles : ["Vehicle"];

      resolvedVehicles.forEach((vehicleValue, idx) => {
        const vehicleLabel = normaliseVehicleLabel(vehicleValue, vehicleById);
        const sectionKey = `${b.id}::${idx}::${vehicleLabel}::${outingYmd}`;

        out.push({
          sectionKey,
          bookingId: b.id,
          isManual: false,
          prepDate,
          prepYmd,
          outingDate,
          outingYmd,
          vehicleLabel,
          jobNumber: b.jobNumber || "-",
          client: b.client || "-",
          location: b.location || "-",
          status: b.status || "-",
          notesForDay: b.noteForDay || b.note || "",
        });
      });
    });

    manualEntries.forEach((m, idx) => {
      const d = toDateSafe(m?.outingDate || m?.date);
      if (!d) return;

      const outingDate = dayOnly(d);
      const prepDate = addDays(outingDate, -1);
      const outingYmd = ymd(outingDate);
      const prepYmd = ymd(prepDate);
      const vehicleLabel = String(m.vehicleLabel || "Vehicle");
      const sectionKey = `manual::${m.id || idx}::${vehicleLabel}::${outingYmd}`;

      out.push({
        sectionKey,
        bookingId: null,
        isManual: true,
        prepDate,
        prepYmd,
        outingDate,
        outingYmd,
        vehicleLabel,
        jobNumber: m.jobNumber || "-",
        client: m.client || "-",
        location: m.location || "-",
        status: "Manual",
        notesForDay: m.notes || "",
      });
    });

    out.sort((a, b) => {
      if (a.prepYmd !== b.prepYmd) return a.prepYmd.localeCompare(b.prepYmd);
      if (String(a.jobNumber || "") !== String(b.jobNumber || "")) {
        return String(a.jobNumber || "").localeCompare(String(b.jobNumber || ""));
      }
      return a.vehicleLabel.localeCompare(b.vehicleLabel);
    });

    return out;
  }, [bookings, manualEntries, vehicleById]);

  useEffect(() => {
    if (!storageLoaded || !prepItems.length) return;

    setPrepRecordsByKey((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const item of prepItems) {
        if (!next[item.sectionKey]) {
          next[item.sectionKey] = {
            completed: false,
            preparedBy: "",
            preparedAt: "",
            archived: item.outingYmd < todayYmd,
            archivedAt: item.outingYmd < todayYmd ? new Date().toISOString() : "",
            prepYmd: item.prepYmd,
            outingYmd: item.outingYmd,
            jobNumber: item.jobNumber,
            client: item.client,
            location: item.location,
            vehicleLabel: item.vehicleLabel,
            notes: "",
          };
          changed = true;
          continue;
        }

        const current = next[item.sectionKey];
        const shouldAutoArchive = item.outingYmd < todayYmd;

        const merged = {
          ...current,
          prepYmd: current.prepYmd || item.prepYmd,
          outingYmd: current.outingYmd || item.outingYmd,
          jobNumber: item.jobNumber,
          client: item.client,
          location: item.location,
          vehicleLabel: item.vehicleLabel,
          archived: shouldAutoArchive ? true : !!current.archived,
          archivedAt:
            shouldAutoArchive && !current.archivedAt
              ? new Date().toISOString()
              : current.archivedAt || "",
        };

        const same =
          current.completed === merged.completed &&
          current.preparedBy === merged.preparedBy &&
          current.preparedAt === merged.preparedAt &&
          current.archived === merged.archived &&
          current.archivedAt === merged.archivedAt &&
          current.prepYmd === merged.prepYmd &&
          current.outingYmd === merged.outingYmd &&
          current.jobNumber === merged.jobNumber &&
          current.client === merged.client &&
          current.location === merged.location &&
          current.vehicleLabel === merged.vehicleLabel &&
          current.notes === merged.notes;

        if (!same) {
          next[item.sectionKey] = merged;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [prepItems, todayYmd, storageLoaded]);

  const itemsWithRecords = useMemo(
    () =>
      prepItems.map((item) => ({
        ...item,
        prepRecord: getPrepRecord(prepRecordsByKey, item.sectionKey),
      })),
    [prepItems, prepRecordsByKey]
  );

  const filteredItems = useMemo(() => {
    const q = safeLower(search);

    return itemsWithRecords.filter((item) => {
      const archived = isArchivedRecord(item.prepRecord, item.outingYmd, todayYmd);

      if (!showArchived && archived) return false;

      if (!archived) {
        if (rangeFilter === "today" && item.prepYmd !== todayYmd) return false;
        if (rangeFilter === "tomorrow" && item.prepYmd !== ymd(tomorrow)) return false;
        if (rangeFilter === "7days") {
          const max = ymd(addDays(today, 7));
          if (item.prepYmd < todayYmd || item.prepYmd > max) return false;
        }
        if (rangeFilter === "all-upcoming" && item.prepYmd < todayYmd) return false;
      }

      if (!q) return true;

      const haystack = [
        item.vehicleLabel,
        item.jobNumber,
        item.client,
        item.location,
        item.status,
        item.prepRecord?.preparedBy,
        item.prepRecord?.notes,
        item.prepYmd,
        item.outingYmd,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [itemsWithRecords, rangeFilter, search, showArchived, todayYmd, tomorrow, today]);

  const activeItems = useMemo(
    () => filteredItems.filter((item) => !isArchivedRecord(item.prepRecord, item.outingYmd, todayYmd)),
    [filteredItems, todayYmd]
  );

  const archivedItems = useMemo(
    () => filteredItems.filter((item) => isArchivedRecord(item.prepRecord, item.outingYmd, todayYmd)),
    [filteredItems, todayYmd]
  );

  const queueItems = useMemo(
    () => activeItems.filter((item) => !item.prepRecord?.completed),
    [activeItems]
  );

  const preppedItems = useMemo(
    () => activeItems.filter((item) => item.prepRecord?.completed),
    [activeItems]
  );

  const donePct = activeItems.length ? Math.round((preppedItems.length / activeItems.length) * 100) : 0;

  const groupedActive = useMemo(() => groupByPrepDateAndJob(activeItems), [activeItems]);
  const groupedArchive = useMemo(() => groupByPrepDateAndJob(archivedItems), [archivedItems]);

  const tomorrowJobs = useMemo(() => {
    const grouped = groupByPrepDateAndJob(itemsWithRecords.filter((x) => x.prepYmd === ymd(tomorrow)));
    return grouped[0]?.jobs || [];
  }, [itemsWithRecords, tomorrow]);

  const updatePrepRecord = (sectionKey, updater) => {
    setPrepRecordsByKey((prev) => {
      const current = prev?.[sectionKey] || {};
      const nextValue =
        typeof updater === "function" ? updater(current) : { ...current, ...updater };
      return { ...prev, [sectionKey]: nextValue };
    });
  };

  const handleMarkPrepped = (item) => {
    const preparedBy = (staffNameDrafts[item.sectionKey] || item.prepRecord?.preparedBy || "").trim();

    updatePrepRecord(item.sectionKey, (current) => ({
      ...current,
      completed: true,
      preparedBy,
      preparedAt: new Date().toISOString(),
      archived: item.outingYmd < todayYmd ? true : !!current.archived,
      archivedAt:
        item.outingYmd < todayYmd
          ? current.archivedAt || new Date().toISOString()
          : current.archivedAt || "",
      prepYmd: item.prepYmd,
      outingYmd: item.outingYmd,
      jobNumber: item.jobNumber,
      client: item.client,
      location: item.location,
      vehicleLabel: item.vehicleLabel,
      notes: current.notes || "",
    }));

    setExpandedKeys((prev) => ({ ...prev, [item.sectionKey]: false }));
  };

  const handleUndoPrep = (item) => {
    updatePrepRecord(item.sectionKey, (current) => ({
      ...current,
      completed: false,
      preparedAt: "",
      preparedBy: current.preparedBy || "",
      archived: item.outingYmd < todayYmd ? true : !!current.archived,
      archivedAt:
        item.outingYmd < todayYmd
          ? current.archivedAt || new Date().toISOString()
          : current.archivedAt || "",
    }));
  };

  const handleArchive = (item) => {
    updatePrepRecord(item.sectionKey, (current) => ({
      ...current,
      archived: true,
      archivedAt: new Date().toISOString(),
    }));
  };

  const handleUnarchive = (item) => {
    if (item.outingYmd < todayYmd) return;
    updatePrepRecord(item.sectionKey, (current) => ({
      ...current,
      archived: false,
      archivedAt: "",
    }));
  };

  const handleNotesChange = (sectionKey, notes) => {
    updatePrepRecord(sectionKey, (current) => ({
      ...current,
      notes,
    }));
  };

  const toggleExpanded = (sectionKey) => {
    setExpandedKeys((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div
          style={{
            ...panel,
            padding: 18,
            marginBottom: 16,
            background: "linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: UI.muted, letterSpacing: 0.5 }}>
                PREP OPERATIONS
              </div>
              <h1 style={{ margin: "6px 0 0", color: UI.text, fontSize: 30, fontWeight: 900 }}>
                Vehicle Prep Dashboard
              </h1>
              <div style={{ marginTop: 8, color: UI.muted, fontSize: 14, maxWidth: 760 }}>
                Jobs appear on the day they need to be prepped, which is the day before the outing.
                Vehicles are grouped under each job and the board now shows all upcoming prep days.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => router.push("/dashboard")} style={buttonBase}>
                Back to Dashboard
              </button>
              <button
                type="button"
                onClick={() => router.push(`/preplist?day=${ymd(addDays(today, 1))}`)}
                style={{
                  ...buttonBase,
                  background: UI.dark,
                  borderColor: UI.dark,
                  color: "#fff",
                }}
              >
                Open Tomorrow&apos;s Print List
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginBottom: 16,
          }}
        >
          <section style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>Active Queue</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: UI.text }}>{activeItems.length}</div>
          </section>
          <section style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>Needs Prep</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: UI.red }}>{queueItems.length}</div>
          </section>
          <section style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>Prepped</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: UI.green }}>{preppedItems.length}</div>
          </section>
          <section style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>Completion</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: UI.text }}>{donePct}%</div>
          </section>
          <section style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>Archived</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: UI.purple }}>{archivedItems.length}</div>
          </section>
        </div>

        <div style={{ ...panel, padding: 14, marginBottom: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              gap: 12,
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vehicle, job number, client, location, staff..."
              style={inputBase}
            />
            <select value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value)} style={selectBase}>
              <option value="today">Prep Today</option>
              <option value="tomorrow">Prep Tomorrow</option>
              <option value="7days">Next 7 Prep Days</option>
              <option value="all-upcoming">All Upcoming Prep</option>
            </select>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              style={{
                ...buttonBase,
                background: showArchived ? UI.dark : "#fff",
                color: showArchived ? "#fff" : UI.text,
                borderColor: showArchived ? UI.dark : UI.line,
              }}
            >
              {showArchived ? "Hide Archived" : "Show Archived"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "minmax(0, 1.8fr) minmax(300px, 0.9fr)",
            alignItems: "start",
          }}
        >
          <section style={{ ...panel, padding: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 14,
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: UI.text, fontSize: 20 }}>Prep Board</h2>
                <div style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}>
                  Grouped by prep date, then by job.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={pill(UI.redBg, UI.red)}>Needs Prep: {queueItems.length}</span>
                <span style={pill(UI.greenBg, UI.green)}>Prepped: {preppedItems.length}</span>
              </div>
            </div>

            {loading ? (
              <div style={{ color: UI.muted }}>Loading prep queue...</div>
            ) : groupedActive.length === 0 ? (
              <div style={{ color: UI.muted }}>No upcoming prep items found.</div>
            ) : (
              <div style={{ display: "grid", gap: 18 }}>
                {groupedActive.map((dateGroup) => (
                  <div key={dateGroup.prepYmd}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                        marginBottom: 10,
                        paddingBottom: 8,
                        borderBottom: `1px solid ${UI.line}`,
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 900, color: UI.text }}>
                        {fmtLong(dateGroup.prepDate)}
                      </div>
                      <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                        {dateGroup.jobs.length} job{dateGroup.jobs.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 12 }}>
                      {dateGroup.jobs.map((job) => {
                        const doneCount = job.vehicles.filter((v) => v.prepRecord?.completed).length;
                        const pendingCount = job.vehicles.length - doneCount;

                        return (
                          <div
                            key={job.jobKey}
                            style={{
                              border: `1px solid ${UI.line}`,
                              borderRadius: 16,
                              overflow: "hidden",
                              background: "#fff",
                            }}
                          >
                            <div
                              style={{
                                padding: "14px 14px 12px",
                                background: UI.soft,
                                borderBottom: `1px solid ${UI.line}`,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  flexWrap: "wrap",
                                  alignItems: "flex-start",
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: 18, fontWeight: 900, color: UI.text }}>
                                    Job #{job.jobNumber} · {job.client}
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: 13, color: UI.text }}>
                                    {job.location}
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                                    Prep {fmtShort(job.prepDate)} · Out {fmtShort(job.outingDate)} · {job.status}
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {job.isManual && <span style={pill(UI.purpleBg, UI.purple)}>Manual</span>}
                                  <span style={pill("#eef2ff", "#3730a3")}>Vehicles: {job.vehicles.length}</span>
                                  <span style={pill(UI.redBg, UI.red)}>Pending: {pendingCount}</span>
                                  <span style={pill(UI.greenBg, UI.green)}>Done: {doneCount}</span>
                                </div>
                              </div>

                              {job.notesForDay ? (
                                <div
                                  style={{
                                    marginTop: 10,
                                    padding: "9px 10px",
                                    background: "#fff",
                                    border: `1px solid ${UI.line}`,
                                    borderRadius: 10,
                                    fontSize: 13,
                                    color: UI.text,
                                  }}
                                >
                                  <b>Booking note:</b> {job.notesForDay}
                                </div>
                              ) : null}

                              {!job.isManual && job.bookingId ? (
                                <div style={{ marginTop: 10 }}>
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/view-booking/${job.bookingId}`)}
                                    style={{ ...buttonBase, padding: "8px 10px", fontSize: 12 }}
                                  >
                                    Open Booking
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div>
                              {job.vehicles.map((item, idx) => {
                                const record = item.prepRecord || {};
                                const expanded = !!expandedKeys[item.sectionKey];
                                const preparedByValue =
                                  staffNameDrafts[item.sectionKey] ?? record.preparedBy ?? "";

                                return (
                                  <div
                                    key={item.sectionKey}
                                    style={{
                                      padding: 14,
                                      borderTop: idx === 0 ? "none" : `1px solid ${UI.line}`,
                                      background: record.completed ? "#fcfffd" : "#fff",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0,1fr) auto",
                                        gap: 12,
                                        alignItems: "start",
                                      }}
                                    >
                                      <div>
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          <div style={{ fontSize: 16, fontWeight: 900, color: UI.text }}>
                                            {item.vehicleLabel}
                                          </div>
                                          {record.completed ? (
                                            <span style={pill(UI.greenBg, UI.green)}>Prepped</span>
                                          ) : (
                                            <span style={pill(UI.redBg, UI.red)}>Needs Prep</span>
                                          )}
                                        </div>

                                        {record.completed ? (
                                          <div style={{ marginTop: 8, fontSize: 13, color: UI.muted }}>
                                            Completed by <b style={{ color: UI.text }}>{record.preparedBy || "-"}</b> on{" "}
                                            <b style={{ color: UI.text }}>{fmtDateTime(record.preparedAt)}</b>
                                          </div>
                                        ) : null}

                                        {record.notes ? (
                                          <div
                                            style={{
                                              marginTop: 8,
                                              padding: "8px 10px",
                                              background: UI.soft,
                                              border: `1px solid ${UI.line}`,
                                              borderRadius: 10,
                                              fontSize: 13,
                                              color: UI.text,
                                            }}
                                          >
                                            <b>Prep notes:</b> {record.notes}
                                          </div>
                                        ) : null}
                                      </div>

                                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        {!record.completed ? (
                                          <button
                                            type="button"
                                            onClick={() => toggleExpanded(item.sectionKey)}
                                            style={{
                                              ...buttonBase,
                                              borderColor: "#2563eb",
                                              color: "#2563eb",
                                            }}
                                          >
                                            {expanded ? "Close" : "Prep"}
                                          </button>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleUndoPrep(item)}
                                              style={{
                                                ...buttonBase,
                                                borderColor: "#dc2626",
                                                color: "#dc2626",
                                              }}
                                            >
                                              Undo
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleArchive(item)}
                                              style={{
                                                ...buttonBase,
                                                borderColor: UI.purple,
                                                color: UI.purple,
                                              }}
                                            >
                                              Archive
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {expanded && !record.completed ? (
                                      <div
                                        style={{
                                          marginTop: 12,
                                          paddingTop: 12,
                                          borderTop: `1px dashed ${UI.line}`,
                                          display: "grid",
                                          gap: 10,
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                            gap: 10,
                                          }}
                                        >
                                          <select
                                            value={preparedByValue}
                                            onChange={(e) =>
                                              setStaffNameDrafts((prev) => ({
                                                ...prev,
                                                [item.sectionKey]: e.target.value,
                                              }))
                                            }
                                            style={selectBase}
                                          >
                                            <option value="">Select employee</option>
                                            {employeeOptions.map((employeeName) => (
                                              <option key={employeeName} value={employeeName}>
                                                {employeeName}
                                              </option>
                                            ))}
                                          </select>

                                          <input
                                            value={record.notes || ""}
                                            onChange={(e) => handleNotesChange(item.sectionKey, e.target.value)}
                                            placeholder="Prep notes"
                                            style={inputBase}
                                          />
                                        </div>

                                        <div>
                                          <button
                                            type="button"
                                            onClick={() => handleMarkPrepped(item)}
                                            style={{
                                              ...buttonBase,
                                              background: UI.green,
                                              borderColor: UI.green,
                                              color: "#fff",
                                            }}
                                          >
                                            Mark as Prepped
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside style={{ display: "grid", gap: 16 }}>
            <section style={{ ...panel, padding: 16 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 18, color: UI.text }}>
                Tomorrow&apos;s Prep
              </h3>
              <div style={{ fontSize: 13, color: UI.muted, marginBottom: 12 }}>
                {fmtLong(tomorrow)}
              </div>

              {tomorrowJobs.length === 0 ? (
                <div style={{ color: UI.muted }}>No jobs need prepping tomorrow.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {tomorrowJobs.map((job) => (
                    <div
                      key={job.jobKey}
                      style={{
                        padding: 12,
                        border: `1px solid ${UI.line}`,
                        borderRadius: 12,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: UI.text }}>
                        Job #{job.jobNumber} · {job.client}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: UI.text }}>{job.location}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: UI.muted }}>
                        Outing: {fmtLong(job.outingDate)}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, color: UI.text }}>
                        {job.vehicles.map((v) => v.vehicleLabel).join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={{ ...panel, padding: 16 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 18, color: UI.text }}>
                Archive
              </h3>
              <div style={{ fontSize: 13, color: UI.muted, marginBottom: 12 }}>
                Jobs move here once the outing date has passed.
              </div>

              {groupedArchive.length === 0 ? (
                <div style={{ color: UI.muted }}>No archived prep history yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 12, maxHeight: 760, overflowY: "auto" }}>
                  {groupedArchive.map((dateGroup) => (
                    <div key={dateGroup.prepYmd}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 900,
                          color: UI.text,
                          marginBottom: 8,
                        }}
                      >
                        {fmtLong(dateGroup.prepDate)}
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {dateGroup.jobs.map((job) => (
                          <div
                            key={job.jobKey}
                            style={{
                              padding: 10,
                              border: `1px solid ${UI.line}`,
                              borderRadius: 12,
                              background: "#fff",
                            }}
                          >
                            <div style={{ fontWeight: 900, color: UI.text }}>
                              Job #{job.jobNumber} · {job.client}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12, color: UI.muted }}>
                              Outing: {fmtLong(job.outingDate)}
                            </div>

                            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                              {job.vehicles.map((item) => (
                                <div
                                  key={item.sectionKey}
                                  style={{
                                    paddingTop: 8,
                                    borderTop: `1px solid ${UI.line}`,
                                  }}
                                >
                                  <div style={{ fontSize: 13, fontWeight: 800, color: UI.text }}>
                                    {item.vehicleLabel}
                                  </div>
                                  <div style={{ marginTop: 4, fontSize: 12, color: UI.muted }}>
                                    Completed by <b style={{ color: UI.text }}>{item.prepRecord?.preparedBy || "-"}</b>
                                  </div>
                                  <div style={{ marginTop: 4, fontSize: 12, color: UI.muted }}>
                                    {fmtDateTime(item.prepRecord?.preparedAt)}
                                  </div>
                                  {item.prepRecord?.notes ? (
                                    <div style={{ marginTop: 6, fontSize: 12, color: UI.text }}>
                                      <b>Notes:</b> {item.prepRecord.notes}
                                    </div>
                                  ) : null}
                                  {item.outingYmd >= todayYmd ? (
                                    <div style={{ marginTop: 8 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleUnarchive(item)}
                                        style={{ ...buttonBase, padding: "7px 10px", fontSize: 12 }}
                                      >
                                        Unarchive
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}