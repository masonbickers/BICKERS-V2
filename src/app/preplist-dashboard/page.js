"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";
import {
  Archive, ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, ChevronUp,
  ClipboardCheck, Eye, EyeOff, Printer, RotateCcw, Search, Truck,
} from "lucide-react";

const PREP_STORAGE_KEY = "preplist:vehicle-checks:v4";
const PREP_MANUAL_STORAGE_KEY = "preplist:manual-entries:v3";
const PREP_SHARED_DOC_REF = doc(db, "appState", "preplistShared");

const INACTIVE_STATUSES = new Set([
  "cancelled",
  "dnh",
  "lost",
  "postponed",
  "deleted",
]);

const UI = {
  radius: 8,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  border: "1px solid var(--color-border)",
  bg: "var(--color-canvas)",
  card: "var(--color-surface)",
  line: "var(--color-border)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  soft: "var(--legacy-color-f8fbfd)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-soft)",
  brandBorder: "var(--color-border-strong)",
  green: "var(--color-success)",
  greenBg: "var(--legacy-color-edf7f2)",
  red: "var(--color-danger)",
  redBg: "var(--legacy-color-fcefee)",
  purple: "var(--legacy-color-5b21b6)",
  purpleBg: "var(--legacy-color-f5f3ff)",
  dark: "var(--color-text)",
};

const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
};

const panel = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
};

const statCard = {
  ...panel,
  padding: "var(--space-3)",
};

const buttonBase = {
  minHeight: "var(--control-height-md)",
  padding: "7px 10px",
  borderRadius: UI.radius,
  border: UI.border,
  background: "var(--color-white)",
  color: UI.text,
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12.5,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

const inputBase = {
  width: "100%",
  minHeight: "var(--control-height-md)",
  padding: "7px 9px",
  borderRadius: UI.radius,
  border: UI.border,
  fontSize: 13.5,
  color: UI.text,
  background: "var(--color-white)",
  outline: "none",
};

const selectBase = {
  ...inputBase,
  cursor: "pointer",
};

const pill = (bg, color) => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: "var(--radius-pill)",
  background: bg,
  color,
  fontSize: 11.5,
  fontWeight: 800,
  whiteSpace: "nowrap",
});

const dashboardCss = `
  .prep-dashboard-filter-grid { display:grid; grid-template-columns:minmax(240px,2fr) minmax(180px,1fr) auto; gap:10px; }
  .prep-dashboard-content-grid { display:grid; grid-template-columns:minmax(0,1.8fr) minmax(280px,.8fr); gap:12px; align-items:start; }
  @media (max-width:1120px) {
    .prep-dashboard-content-grid { grid-template-columns:1fr; }
    .prep-dashboard-aside { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  }
  @media (max-width:760px) {
    .prep-dashboard-filter-grid,.prep-dashboard-aside { grid-template-columns:1fr !important; }
    .prep-dashboard-stats { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
    .prep-dashboard-vehicle-row { grid-template-columns:1fr !important; }
  }
  @media (max-width:480px) { .prep-dashboard-stats { grid-template-columns:1fr !important; } }
`;

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
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);

  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [manualEntries, setManualEntries] = useState([]);
  const [prepRecordsByKey, setPrepRecordsByKey] = useState({});
  const [loading, setLoading] = useState(true);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);

  const [rangeFilter, setRangeFilter] = useState("all-upcoming");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState({});
  const [staffNameDrafts, setStaffNameDrafts] = useState({});

  const today = useMemo(() => dayOnly(new Date()), []);
  const todayYmd = useMemo(() => ymd(today), [today]);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  useEffect(() => {
    if (!authState?.user) return undefined;
    let active = true;
    (async () => {
      try {
        const [bSnap, vSnap, eSnap] = await Promise.all([
          getDocs(tenantCollectionQuery(db, "bookings", authState)),
          getDocs(tenantCollectionQuery(db, "vehicles", authState)),
          getDocs(tenantCollectionQuery(db, "employees", authState)),
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
  }, [accessKey, authState]);

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

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      localStorage.setItem(PREP_MANUAL_STORAGE_KEY, JSON.stringify(manualEntries));
    } catch (error) {
      console.error("Failed saving manual prep entries:", error);
    }
  }, [manualEntries, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return undefined;
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(PREP_SHARED_DOC_REF);
        if (!active || !snap.exists()) return;
        const data = snap.data() || {};
        if (data.prepRecordsByKey && typeof data.prepRecordsByKey === "object") {
          setPrepRecordsByKey((prev) => ({ ...prev, ...data.prepRecordsByKey }));
        }
        if (Array.isArray(data.manualEntries)) {
          setManualEntries((prev) => {
            const byId = new Map();
            prev.forEach((entry) => entry?.id && byId.set(String(entry.id), entry));
            data.manualEntries.forEach((entry) => entry?.id && byId.set(String(entry.id), entry));
            return Array.from(byId.values());
          });
        }
      } catch (error) {
        console.error("Failed loading shared prep dashboard data:", error);
      } finally {
        if (active) setCloudHydrated(true);
      }
    })();
    return () => { active = false; };
  }, [storageLoaded]);

  useEffect(() => {
    if (!cloudHydrated) return undefined;
    const timeout = setTimeout(async () => {
      try {
        await setDoc(PREP_SHARED_DOC_REF, {
          prepRecordsByKey,
          manualEntries,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (error) {
        console.error("Failed saving shared prep dashboard data:", error);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [cloudHydrated, manualEntries, prepRecordsByKey]);

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
      const storedPrepDate = toDateSafe(m?.prepDate);
      const storedOutingDate = toDateSafe(m?.outingDate || m?.date);
      if (!storedPrepDate && !storedOutingDate) return;

      const prepDate = storedPrepDate ? dayOnly(storedPrepDate) : addDays(dayOnly(storedOutingDate), -1);
      const outingDate = storedPrepDate ? addDays(prepDate, 1) : dayOnly(storedOutingDate);
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
      <style>{dashboardCss}</style>
      <div style={pageWrap}>
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-4)",
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h1 style={{ margin: 0, color: UI.text, fontSize: "var(--font-size-xl)", lineHeight: 1.08, fontWeight: 750, display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <ClipboardCheck size={22} color={UI.brand} />
                Vehicle Prep Dashboard
              </h1>
              <div style={{ marginTop: 6, color: UI.muted, fontSize: 13.5, lineHeight: 1.45, maxWidth: 760 }}>
                Track upcoming vehicle preparation by prep date and job.
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button type="button" onClick={() => router.push("/dashboard")} style={buttonBase}>
                <ArrowLeft size={14} /> Back to Dashboard
              </button>
              <button
                type="button"
                onClick={() => router.push(`/preplist?day=${ymd(tomorrow)}`)}
                style={{
                  ...buttonBase,
                  background: UI.brand,
                  borderColor: UI.brand,
                  color: "var(--color-white)",
                }}
              >
                <Printer size={14} /> Tomorrow&apos;s Print List
              </button>
            </div>
          </div>
        </div>

        <div
          className="prep-dashboard-stats"
          style={{
            display: "grid",
            gap: "var(--space-3)",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            marginBottom: "var(--space-3)",
          }}
        >
          <section style={statCard}>
            <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase" }}>Active Queue</div>
            <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: "var(--font-size-xl)" }}>{activeItems.length}</b><Truck size={19} color={UI.brand} /></div>
          </section>
          <section style={statCard}>
            <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase" }}>Needs Prep</div>
            <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: "var(--font-size-xl)", color: UI.red }}>{queueItems.length}</b><ClipboardCheck size={19} color={UI.red} /></div>
          </section>
          <section style={statCard}>
            <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase" }}>Prepped</div>
            <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: "var(--font-size-xl)", color: UI.green }}>{preppedItems.length}</b><CheckCircle2 size={19} color={UI.green} /></div>
          </section>
          <section style={statCard}>
            <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase" }}>Completion</div>
            <div style={{ marginTop: 5, fontSize: "var(--font-size-xl)", fontWeight: 800 }}>{donePct}%</div>
            <div style={{ marginTop: 7, height: 5, borderRadius: "var(--radius-pill)", background: "var(--legacy-color-e8edf2)", overflow: "hidden" }}><div style={{ height: "100%", width: `${donePct}%`, background: UI.green }} /></div>
          </section>
          <section style={statCard}>
            <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase" }}>Archived</div>
            <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: "var(--font-size-xl)", color: UI.purple }}>{archivedItems.length}</b><Archive size={19} color={UI.purple} /></div>
          </section>
        </div>

        <div style={{ ...panel, padding: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <div className="prep-dashboard-filter-grid">
            <div style={{ position: "relative" }}>
              <Search size={15} color={UI.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vehicle, job, client, location or staff" style={{ ...inputBase, paddingLeft: "var(--space-8)" }} />
            </div>
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
                background: showArchived ? UI.dark : "var(--color-white)",
                color: showArchived ? "var(--color-white)" : UI.text,
                borderColor: showArchived ? UI.dark : UI.line,
              }}
            >
              {showArchived ? <EyeOff size={14} /> : <Eye size={14} />}
              {showArchived ? "Hide Archived" : "Show Archived"}
            </button>
          </div>
        </div>

        <div className="prep-dashboard-content-grid">
          <section style={{ ...panel, padding: "var(--space-3)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--space-3)",
                flexWrap: "wrap",
                marginBottom: 14,
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: UI.text, fontSize: "var(--font-size-lg)", fontWeight: 800 }}>Prep Board</h2>
                <div style={{ marginTop: "var(--space-1)", color: UI.muted, fontSize: "var(--font-size-sm)" }}>
                  Grouped by prep date, then by job.
                </div>
              </div>

              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
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
                        gap: "var(--space-3)",
                        alignItems: "center",
                        marginBottom: 10,
                        paddingBottom: "var(--space-2)",
                        borderBottom: `1px solid ${UI.line}`,
                      }}
                    >
                      <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 900, color: UI.text }}>
                        {fmtLong(dateGroup.prepDate)}
                      </div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: UI.muted, fontWeight: 800 }}>
                        {dateGroup.jobs.length} job{dateGroup.jobs.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "var(--space-3)" }}>
                      {dateGroup.jobs.map((job) => {
                        const doneCount = job.vehicles.filter((v) => v.prepRecord?.completed).length;
                        const pendingCount = job.vehicles.length - doneCount;

                        return (
                          <div
                            key={job.jobKey}
                            style={{
                              border: `1px solid ${UI.line}`,
                              borderRadius: UI.radius,
                              overflow: "hidden",
                              background: "var(--color-white)",
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
                                  gap: "var(--space-3)",
                                  flexWrap: "wrap",
                                  alignItems: "flex-start",
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: 18, fontWeight: 900, color: UI.text }}>
                                    Job #{job.jobNumber} · {job.client}
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: UI.text }}>
                                    {job.location}
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: "var(--font-size-xs)", color: UI.muted }}>
                                    Prep {fmtShort(job.prepDate)} · Out {fmtShort(job.outingDate)} · {job.status}
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                                  {job.isManual && <span style={pill(UI.purpleBg, UI.purple)}>Manual</span>}
                                  <span style={pill("var(--legacy-color-eef2ff)", "var(--legacy-color-3730a3)")}>Vehicles: {job.vehicles.length}</span>
                                  <span style={pill(UI.redBg, UI.red)}>Pending: {pendingCount}</span>
                                  <span style={pill(UI.greenBg, UI.green)}>Done: {doneCount}</span>
                                </div>
                              </div>

                              {job.notesForDay ? (
                                <div
                                  style={{
                                    marginTop: 10,
                                    padding: "9px 10px",
                                    background: "var(--color-white)",
                                    border: `1px solid ${UI.line}`,
                                    borderRadius: 10,
                                    fontSize: "var(--font-size-sm)",
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
                                    style={{ ...buttonBase, padding: "8px 10px", fontSize: "var(--font-size-xs)" }}
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
                                    className="prep-dashboard-vehicle-row"
                                    style={{
                                      padding: 14,
                                      borderTop: idx === 0 ? "none" : `1px solid ${UI.line}`,
                                      background: record.completed ? "var(--legacy-color-fcfffd)" : "var(--color-white)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0,1fr) auto",
                                        gap: "var(--space-3)",
                                        alignItems: "start",
                                      }}
                                    >
                                      <div>
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "var(--space-2)",
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 900, color: UI.text }}>
                                            {item.vehicleLabel}
                                          </div>
                                          {record.completed ? (
                                            <span style={pill(UI.greenBg, UI.green)}>Prepped</span>
                                          ) : (
                                            <span style={pill(UI.redBg, UI.red)}>Needs Prep</span>
                                          )}
                                        </div>

                                        {record.completed ? (
                                          <div style={{ marginTop: "var(--space-2)", fontSize: "var(--font-size-sm)", color: UI.muted }}>
                                            Completed by <b style={{ color: UI.text }}>{record.preparedBy || "-"}</b> on{" "}
                                            <b style={{ color: UI.text }}>{fmtDateTime(record.preparedAt)}</b>
                                          </div>
                                        ) : null}

                                        {record.notes ? (
                                          <div
                                            style={{
                                              marginTop: "var(--space-2)",
                                              padding: "8px 10px",
                                              background: UI.soft,
                                              border: `1px solid ${UI.line}`,
                                              borderRadius: 10,
                                              fontSize: "var(--font-size-sm)",
                                              color: UI.text,
                                            }}
                                          >
                                            <b>Prep notes:</b> {record.notes}
                                          </div>
                                        ) : null}
                                      </div>

                                      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                                        {!record.completed ? (
                                          <button
                                            type="button"
                                            onClick={() => toggleExpanded(item.sectionKey)}
                                            style={{
                                              ...buttonBase,
                                              borderColor: "var(--legacy-color-2563eb)",
                                              color: "var(--legacy-color-2563eb)",
                                            }}
                                          >
                                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            {expanded ? "Close" : "Prep"}
                                          </button>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleUndoPrep(item)}
                                              style={{
                                                ...buttonBase,
                                                borderColor: "var(--legacy-color-dc2626)",
                                                color: "var(--legacy-color-dc2626)",
                                              }}
                                            >
                                              <RotateCcw size={14} /> Undo
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
                                              <Archive size={14} /> Archive
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {expanded && !record.completed ? (
                                      <div
                                        style={{
                                          marginTop: "var(--space-3)",
                                          paddingTop: "var(--space-3)",
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
                                              color: "var(--color-white)",
                                            }}
                                          >
                                            <CheckCircle2 size={14} /> Mark as Prepped
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

          <aside className="prep-dashboard-aside" style={{ display: "grid", gap: "var(--space-3)" }}>
            <section style={{ ...panel, padding: "var(--space-3)" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "var(--font-size-lg)", color: UI.text, display: "flex", alignItems: "center", gap: 7 }}>
                <CalendarDays size={17} color={UI.brand} />
                Tomorrow&apos;s Prep
              </h3>
              <div style={{ fontSize: "var(--font-size-sm)", color: UI.muted, marginBottom: "var(--space-3)" }}>
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
                        padding: "var(--space-3)",
                        border: `1px solid ${UI.line}`,
                        borderRadius: UI.radius,
                        background: "var(--color-white)",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: UI.text }}>
                        Job #{job.jobNumber} · {job.client}
                      </div>
                      <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-xs)", color: UI.text }}>{job.location}</div>
                      <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-xs)", color: UI.muted }}>
                        Outing: {fmtLong(job.outingDate)}
                      </div>
                      <div style={{ marginTop: "var(--space-2)", fontSize: "var(--font-size-xs)", color: UI.text }}>
                        {job.vehicles.map((v) => v.vehicleLabel).join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={{ ...panel, padding: "var(--space-3)" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "var(--font-size-lg)", color: UI.text, display: "flex", alignItems: "center", gap: 7 }}>
                <Archive size={17} color={UI.purple} />
                Archive
              </h3>
              <div style={{ fontSize: "var(--font-size-sm)", color: UI.muted, marginBottom: "var(--space-3)" }}>
                Jobs move here once the outing date has passed.
              </div>

              {groupedArchive.length === 0 ? (
                <div style={{ color: UI.muted }}>No archived prep history yet.</div>
              ) : (
                <div style={{ display: "grid", gap: "var(--space-3)", maxHeight: 760, overflowY: "auto" }}>
                  {groupedArchive.map((dateGroup) => (
                    <div key={dateGroup.prepYmd}>
                      <div
                        style={{
                          fontSize: "var(--font-size-sm)",
                          fontWeight: 900,
                          color: UI.text,
                          marginBottom: "var(--space-2)",
                        }}
                      >
                        {fmtLong(dateGroup.prepDate)}
                      </div>

                      <div style={{ display: "grid", gap: "var(--space-2)" }}>
                        {dateGroup.jobs.map((job) => (
                          <div
                            key={job.jobKey}
                            style={{
                              padding: 10,
                              border: `1px solid ${UI.line}`,
                              borderRadius: UI.radius,
                              background: "var(--color-white)",
                            }}
                          >
                            <div style={{ fontWeight: 900, color: UI.text }}>
                              Job #{job.jobNumber} · {job.client}
                            </div>
                            <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-xs)", color: UI.muted }}>
                              Outing: {fmtLong(job.outingDate)}
                            </div>

                            <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-2)" }}>
                              {job.vehicles.map((item) => (
                                <div
                                  key={item.sectionKey}
                                  style={{
                                    paddingTop: "var(--space-2)",
                                    borderTop: `1px solid ${UI.line}`,
                                  }}
                                >
                                  <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 800, color: UI.text }}>
                                    {item.vehicleLabel}
                                  </div>
                                  <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-xs)", color: UI.muted }}>
                                    Completed by <b style={{ color: UI.text }}>{item.prepRecord?.preparedBy || "-"}</b>
                                  </div>
                                  <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-xs)", color: UI.muted }}>
                                    {fmtDateTime(item.prepRecord?.preparedAt)}
                                  </div>
                                  {item.prepRecord?.notes ? (
                                    <div style={{ marginTop: 6, fontSize: "var(--font-size-xs)", color: UI.text }}>
                                      <b>Notes:</b> {item.prepRecord.notes}
                                    </div>
                                  ) : null}
                                  {item.outingYmd >= todayYmd ? (
                                    <div style={{ marginTop: "var(--space-2)" }}>
                                      <button
                                        type="button"
                                        onClick={() => handleUnarchive(item)}
                                        style={{ ...buttonBase, padding: "7px 10px", fontSize: "var(--font-size-xs)" }}
                                      >
                                        <RotateCcw size={14} /> Unarchive
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
