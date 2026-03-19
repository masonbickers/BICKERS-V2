"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import PrepItemPicker from "@/app/components/PrepItemPicker";
import { db, auth } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "1px solid #e5e7eb",
  green: "#065f46",
  greenBg: "#ecfdf5",
  red: "#991b1b",
  redBg: "#fef2f2",
  blue: "#1d4ed8",
  blueBg: "#eff6ff",
  purple: "#6d28d9",
  purpleBg: "#f5f3ff",
};

const PREP_STORAGE_KEY = "stunt-prep:vehicle-checks:v1";
const PREP_MANUAL_STORAGE_KEY = "stunt-prep:entries:v1";
const STUNT_PRESETS = [
  { value: "", label: "No preset" },
  { value: "front_car_cannon", label: "Front Car Cannon" },
  { value: "pipe_ramp", label: "Pipe Ramp" },
  { value: "side_car_cannon", label: "Side Car Cannon" },
  { value: "rear_car_cannon", label: "Rear Car Cannon" },
];
const STUNT_PRESET_ITEMS = {
  front_car_cannon: ["1", "2", "3", "4"],
  pipe_ramp: ["1", "2", "3", "4"],
  side_car_cannon: ["1", "2", "3", "4"],
  rear_car_cannon: ["1", "2", "3", "4"],
};

const pageWrap = {
  padding: "24px 18px 40px",
  background: UI.bg,
  minHeight: "100vh",
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: 12,
  padding: 16,
};

const buttonBase = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: UI.text,
  fontWeight: 800,
  cursor: "pointer",
};

const inputBase = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
  background: "#fff",
  color: UI.text,
};

const badge = (bg, color) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  background: bg,
  color,
  fontSize: 11,
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.05)",
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
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
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

const itemId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normaliseVehicleLabel = (v, vehicleById) => {
  if (v && typeof v === "object") {
    return String(v.name || v.registration || v.reg || v.id || "Vehicle");
  }
  const key = String(v || "").trim();
  return String(vehicleById.get(key) || key || "Vehicle");
};

const defaultItemsForSection = (equipment, presetType = "") => {
  const presetItems = asArray(STUNT_PRESET_ITEMS[presetType]).map((text) => ({
    id: itemId(),
    text: String(text),
    checked: false,
    isEquipment: false,
  }));

  const baseItems = presetItems.length
    ? presetItems
    : [
        { id: itemId(), text: "Check clean & tidy inside & out.", checked: false, isEquipment: false },
        { id: itemId(), text: "Check work area is clean & tidy.", checked: false, isEquipment: false },
        { id: itemId(), text: "Check screen wash & levels.", checked: false, isEquipment: false },
      ];

  return [
    ...baseItems,
    ...asArray(equipment).map((eq) => ({
      id: itemId(),
      text: `Load ${eq}.`,
      checked: false,
      isEquipment: true,
    })),
  ];
};

function isArchivedRecord(record, todayYmd) {
  if (!record) return false;
  if (record.archived) return true;
  if (record.completed && record.outingYmd && record.outingYmd < todayYmd) return true;
  return false;
}

function groupSectionsByJob(list) {
  const map = new Map();

  list.forEach((section) => {
    const groupedJobKey = String(section.jobNumber || "").trim();
    const jobKey = groupedJobKey
      ? `job::${groupedJobKey}::${section.client || "-"}::${section.outingYmd || "-"}`
      : `entry::${section.manualId || section.sectionKey}`;

    if (!map.has(jobKey)) {
      map.set(jobKey, {
        jobKey,
        outingDate: section.outingDate,
        outingYmd: section.outingYmd,
        jobNumber: section.jobNumber || "-",
        client: section.client || "-",
        location: section.location || "-",
        status: section.status || "-",
        hasFleet: section.sourceType === "fleet",
        hasManual: section.sourceType !== "fleet",
        manualIds: section.manualId ? [section.manualId] : [],
        vehicles: [],
      });
    }

    const group = map.get(jobKey);
    group.vehicles.push(section);
    if (section.sourceType === "fleet") group.hasFleet = true;
    if (section.sourceType !== "fleet") group.hasManual = true;

    if (section.manualId && !group.manualIds.includes(section.manualId)) {
      group.manualIds.push(section.manualId);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const jobCompare = String(a.jobNumber || "").localeCompare(String(b.jobNumber || ""));
    if (jobCompare !== 0) return jobCompare;
    return String(a.client || "").localeCompare(String(b.client || ""));
  });
}

export default function StuntPrepPage() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [prepRecordsByKey, setPrepRecordsByKey] = useState({});
  const [manualEntries, setManualEntries] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  const [manualForm, setManualForm] = useState({
    outingDate: ymd(addDays(dayOnly(new Date()), 1)),
    vehicleLabel: "",
    presetType: "",
    jobNumber: "",
    client: "",
    location: "",
    equipmentCSV: "",
  });
  const [fleetForm, setFleetForm] = useState({
    outingDate: ymd(addDays(dayOnly(new Date()), 1)),
    vehicleId: "",
    presetType: "",
    jobNumber: "",
    client: "",
    location: "",
    equipmentCSV: "",
  });

  const today = useMemo(() => dayOnly(new Date()), []);
  const todayYmd = useMemo(() => ymd(today), [today]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const vSnap = await getDocs(collection(db, "vehicles"));

        if (!active) return;

        setVehicles(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Failed loading stunt prep data:", error);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail((u?.email || "").toLowerCase());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setPrepRecordsByKey(parsed);
      }
    } catch (error) {
      console.error("Failed reading prep storage:", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREP_STORAGE_KEY, JSON.stringify(prepRecordsByKey));
    } catch (error) {
      console.error("Failed saving prep storage:", error);
    }
  }, [prepRecordsByKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREP_MANUAL_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setManualEntries(parsed);
    } catch (error) {
      console.error("Failed reading manual prep entries:", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREP_MANUAL_STORAGE_KEY, JSON.stringify(manualEntries));
    } catch (error) {
      console.error("Failed saving manual prep entries:", error);
    }
  }, [manualEntries]);

  const vehicleById = useMemo(() => {
    const map = new Map();
    vehicles.forEach((v) => {
      const label = v?.name || v?.registration || v?.reg || v?.id;
      map.set(String(v.id), String(label || v.id));
    });
    return map;
  }, [vehicles]);

  const fleetOptions = useMemo(() => {
    return vehicles
      .map((v) => {
        const name = String(v?.name || "").trim();
        const reg = String(v?.registration || v?.reg || "").trim();
        const label = [name, reg].filter(Boolean).join(" - ") || String(v.id);
        return { id: String(v.id), label, raw: v };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [vehicles]);

  const sections = useMemo(() => {
    const out = [];

    manualEntries.forEach((m, idx) => {
      const outDate = toDateSafe(m?.outingDate);
      if (!outDate) return;

      const outingDate = dayOnly(outDate);
      const outingYmd = ymd(outingDate);
      const vehicleLabel = normaliseVehicleLabel(m?.vehicleLabel, vehicleById);
      const sectionKey = `manual::${m.id || idx}::${vehicleLabel}::${outingYmd}`;
      const record = prepRecordsByKey?.[sectionKey] || {};

      out.push({
        sectionKey,
        outingDate,
        outingYmd,
        jobNumber: m.jobNumber || "-",
        client: m.client || "-",
        location: m.location || "-",
        status: m.isFleet ? "Fleet Vehicle" : "Manual Vehicle",
        vehicleLabel,
        presetType: String(m.presetType || ""),
        equipment: asArray(m.equipment),
        isManual: !m.isFleet,
        manualId: m.id,
        sourceType: m.isFleet ? "fleet" : "manual",
        prepRecord: record,
      });
    });

    out.sort((a, b) => a.outingDate - b.outingDate || a.vehicleLabel.localeCompare(b.vehicleLabel));
    return out;
  }, [vehicleById, manualEntries, prepRecordsByKey]);

  useEffect(() => {
    if (!sections.length) return;

    setPrepRecordsByKey((prev) => {
      const next = { ...prev };
      let changed = false;

      sections.forEach((s) => {
        if (!next[s.sectionKey]) {
          next[s.sectionKey] = {
            completed: false,
            ready: false,
            preparedBy: "",
            preparedAt: "",
            removed: false,
            removedAt: "",
            archived: false,
            archivedAt: "",
            outingYmd: s.outingYmd,
            jobNumber: s.jobNumber,
            client: s.client,
            location: s.location,
            vehicleLabel: s.vehicleLabel,
            notes: "",
            items: defaultItemsForSection(s.equipment, s.presetType),
          };
          changed = true;
          return;
        }

        const current = next[s.sectionKey];
        if (!Array.isArray(current.items)) {
          next[s.sectionKey] = {
            ...current,
            items: defaultItemsForSection(s.equipment, s.presetType),
          };
          changed = true;
        } else {
          const nextMeta = {
            outingYmd: current.outingYmd || s.outingYmd,
            jobNumber: s.jobNumber,
            client: s.client,
            location: s.location,
            vehicleLabel: s.vehicleLabel,
          };

          const metaChanged =
            current.outingYmd !== nextMeta.outingYmd ||
            current.jobNumber !== nextMeta.jobNumber ||
            current.client !== nextMeta.client ||
            current.location !== nextMeta.location ||
            current.vehicleLabel !== nextMeta.vehicleLabel;

          if (metaChanged) {
            next[s.sectionKey] = {
              ...current,
              ...nextMeta,
            };
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  }, [sections]);

  const availableDays = useMemo(() => {
    const set = new Set();
    sections.forEach((s) => {
      if (s?.outingYmd) set.add(s.outingYmd);
    });
    Object.values(prepRecordsByKey || {}).forEach((r) => {
      if (r?.outingYmd) set.add(String(r.outingYmd));
    });
    return Array.from(set).sort();
  }, [sections, prepRecordsByKey]);

  useEffect(() => {
    if (!availableDays.length) {
      setSelectedDay("");
      return;
    }

    if (!selectedDay || !availableDays.includes(selectedDay)) {
      const tomorrowYmd = ymd(addDays(today, 1));
      setSelectedDay(
        availableDays.includes(tomorrowYmd) ? tomorrowYmd : availableDays[0]
      );
    }
  }, [availableDays, selectedDay, today]);

  const visibleSections = useMemo(() => {
    return sections
      .filter((s) => !selectedDay || s.outingYmd === selectedDay)
      .filter((s) => {
        const record = prepRecordsByKey?.[s.sectionKey] || {};
        const archived = isArchivedRecord(record, todayYmd);
        const removed = !!record.removed;

        if (!showArchived && removed) return false;
        if (!showArchived && archived) return false;
        if (!showCompleted && record.completed) return false;

        return true;
      })
      .sort((a, b) => a.outingDate - b.outingDate || a.vehicleLabel.localeCompare(b.vehicleLabel));
  }, [sections, selectedDay, prepRecordsByKey, showCompleted, showArchived, todayYmd]);

  const groupedVisibleSections = useMemo(
    () => groupSectionsByJob(visibleSections),
    [visibleSections]
  );

  const updateSection = (sectionKey, updater) => {
    setPrepRecordsByKey((prev) => {
      const current = prev[sectionKey] || {
        completed: false,
        ready: false,
        preparedBy: "",
        preparedAt: "",
        removed: false,
        removedAt: "",
        archived: false,
        archivedAt: "",
        notes: "",
        items: [],
      };
      const updated = typeof updater === "function" ? updater(current) : updater;
      return { ...prev, [sectionKey]: updated };
    });
  };

  const toggleComplete = (sectionKey) => {
    updateSection(sectionKey, (section) => {
      const nextCompleted = !section.completed;
      return {
        ...section,
        completed: nextCompleted,
        ready: nextCompleted ? section.ready : false,
        preparedBy: nextCompleted ? section.preparedBy || userEmail || "unknown" : "",
        preparedAt: nextCompleted ? new Date().toISOString() : "",
        archived: false,
        archivedAt: "",
      };
    });
  };

  const toggleReady = (sectionKey) => {
    updateSection(sectionKey, (section) => ({
      ...section,
      ready: !section.ready,
    }));
  };

  const toggleRemoved = (sectionKey) => {
    updateSection(sectionKey, (section) => {
      const nextRemoved = !section.removed;
      return {
        ...section,
        removed: nextRemoved,
        removedAt: nextRemoved ? new Date().toISOString() : "",
      };
    });
  };

  const toggleItem = (sectionKey, id) => {
    updateSection(sectionKey, (section) => ({
      ...section,
      items: Array.isArray(section.items)
        ? section.items.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it))
        : [],
    }));
  };

  const addItem = (sectionKey, payload) => {
    const text = typeof payload === "string" ? payload.trim() : String(payload?.text || "").trim();
    const isEquipment = typeof payload === "string" ? false : !!payload?.isEquipment;
    if (!text) return;

    updateSection(sectionKey, (section) => ({
      ...section,
      items: [
        ...(Array.isArray(section.items) ? section.items : []),
        { id: itemId(), text, checked: false, isEquipment },
      ],
    }));
  };

  const removeItem = (sectionKey, id) => {
    updateSection(sectionKey, (section) => ({
      ...section,
      items: Array.isArray(section.items)
        ? section.items.filter((it) => it.id !== id)
        : [],
    }));
  };

  const updatePreparedBy = (sectionKey, value) => {
    updateSection(sectionKey, (section) => ({
      ...section,
      preparedBy: value,
    }));
  };

  const updateNotes = (sectionKey, value) => {
    updateSection(sectionKey, (section) => ({
      ...section,
      notes: value,
    }));
  };

  const addManualEntry = () => {
    const outingDate = String(manualForm.outingDate || "").trim();
    const vehicleLabel = String(manualForm.vehicleLabel || "").trim();

    if (!outingDate) {
      alert("Please choose an outing date.");
      return;
    }

    if (!vehicleLabel) {
      alert("Please enter a vehicle name/label.");
      return;
    }

    const equipment = String(manualForm.equipmentCSV || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const entry = {
      id: itemId(),
      outingDate,
      vehicleLabel,
      presetType: String(manualForm.presetType || ""),
      jobNumber: String(manualForm.jobNumber || "").trim(),
      client: String(manualForm.client || "").trim(),
      location: String(manualForm.location || "").trim(),
      equipment,
    };

    setManualEntries((prev) => [entry, ...prev]);

    setManualForm((prev) => ({
      ...prev,
      vehicleLabel: "",
      presetType: "",
      jobNumber: "",
      client: "",
      location: "",
      equipmentCSV: "",
    }));
  };

  const addFleetEntry = () => {
    const outingDate = String(fleetForm.outingDate || "").trim();
    const vehicleId = String(fleetForm.vehicleId || "").trim();
    if (!outingDate) {
      alert("Please choose an outing date.");
      return;
    }
    if (!vehicleId) {
      alert("Please select a fleet vehicle.");
      return;
    }

    const chosen = fleetOptions.find((v) => v.id === vehicleId);
    const vehicleLabel = chosen?.label || vehicleId;
    const equipment = String(fleetForm.equipmentCSV || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const entry = {
      id: itemId(),
      outingDate,
      vehicleLabel,
      vehicleId,
      isFleet: true,
      presetType: String(fleetForm.presetType || ""),
      jobNumber: String(fleetForm.jobNumber || "").trim(),
      client: String(fleetForm.client || "").trim(),
      location: String(fleetForm.location || "").trim(),
      equipment,
    };

    setManualEntries((prev) => [entry, ...prev]);

    setFleetForm((prev) => ({
      ...prev,
      vehicleId: "",
      presetType: "",
      jobNumber: "",
      client: "",
      location: "",
      equipmentCSV: "",
    }));
  };

  const removeManualEntry = (manualId) => {
    if (!manualId) return;

    const manualsToRemove = manualEntries.filter((m) => m.id === manualId);

    setPrepRecordsByKey((prev) => {
      const next = { ...prev };
      manualsToRemove.forEach((manual) => {
        const manualKey = `manual::${manual.id}::${manual.vehicleLabel || "Vehicle"}::${manual.outingDate}`;
        delete next[manualKey];
      });
      return next;
    });

    setManualEntries((prev) => prev.filter((m) => m.id !== manualId));
  };

  const selectedOutDayDate = selectedDay ? toDateSafe(selectedDay) : null;
  const prepCompleteDate = selectedOutDayDate ? addDays(selectedOutDayDate, -1) : null;
  const totalVisible = visibleSections.length;
  const totalCompleted = visibleSections.filter((s) => !!prepRecordsByKey?.[s.sectionKey]?.completed).length;
  const totalReady = visibleSections.filter((s) => !!prepRecordsByKey?.[s.sectionKey]?.ready).length;

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        .prep-vehicle-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        @media (max-width: 1200px) {
          .prep-vehicle-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .prep-vehicle-grid {
            grid-template-columns: 1fr;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm;
          }

          body {
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .prep-sheet {
            background: #fff !important;
            padding: 0 !important;
          }

          .prep-card {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
          }

          .prep-sheet {
            font-size: 8.5px !important;
          }

          .prep-job {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 6px !important;
          }

          .prep-section {
            break-inside: avoid;
            page-break-inside: avoid;
            padding: 6px !important;
            margin-bottom: 6px !important;
          }

          .print-check {
            border-color: #000 !important;
            width: 12px !important;
            height: 12px !important;
            min-width: 12px !important;
            min-height: 12px !important;
            font-size: 8px !important;
          }

          .print-meta {
            font-size: 8px !important;
          }

          .print-title {
            font-size: 14px !important;
            line-height: 1.05 !important;
            margin-bottom: 2px !important;
          }

          .prep-vehicle-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }

          .prep-job-title {
            font-size: 12px !important;
            line-height: 1.05 !important;
          }

          .prep-vehicle-title {
            font-size: 11px !important;
            line-height: 1.05 !important;
          }

          .prep-item-text {
            font-size: 9px !important;
            line-height: 1.1 !important;
            padding: 0 2px !important;
          }
        }
      `}</style>

      <div style={pageWrap} className="prep-sheet">
        <div style={{ ...card, marginBottom: 16 }} className="prep-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                className="print-title"
                style={{
                  margin: 0,
                  color: UI.text,
                  fontSize: 28,
                  textDecoration: "underline",
                }}
              >
                Stunt Vehicle Prep List{" "}
                {prepCompleteDate ? fmtLong(prepCompleteDate) : fmtLong(new Date())}
              </h1>

              <div
                className="print-meta"
                style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}
              >
                Prep to be completed on this date for outings on{" "}
                <b>{selectedOutDayDate ? fmtLong(selectedOutDayDate) : "selected day"}</b>.
              </div>

              <div
                className="print-meta"
                style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                <span style={badge(UI.redBg, UI.red)}>Vehicles: {totalVisible}</span>
                <span style={badge(UI.greenBg, UI.green)}>Prepped: {totalCompleted}</span>
                <span style={badge(UI.blueBg, UI.blue)}>Ready: {totalReady}</span>
              </div>
            </div>

            <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                style={{
                  ...buttonBase,
                  padding: "10px 12px",
                  fontWeight: 700,
                  minWidth: 220,
                }}
              >
                {availableDays.map((d) => (
                  <option key={d} value={d}>
                    {fmtLong(toDateSafe(d))}
                  </option>
                ))}
              </select>

              <button type="button" onClick={() => router.push("/preplist")} style={buttonBase}>
                Main Prep List
              </button>

              <button type="button" onClick={() => router.push("/dashboard")} style={buttonBase}>
                Back to Dashboard
              </button>

              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                style={{
                  ...buttonBase,
                  background: showCompleted ? "#111827" : "#fff",
                  color: showCompleted ? "#fff" : UI.text,
                  borderColor: showCompleted ? "#111827" : "#d1d5db",
                }}
              >
                {showCompleted ? "Hide Prepped" : "Show Prepped"}
              </button>

              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                style={{
                  ...buttonBase,
                  background: showArchived ? "#6d28d9" : "#fff",
                  color: showArchived ? "#fff" : UI.text,
                  borderColor: showArchived ? "#6d28d9" : "#d1d5db",
                }}
              >
                {showArchived ? "Hide Archived" : "Show Archived"}
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  ...buttonBase,
                  background: "#111827",
                  color: "#fff",
                  borderColor: "#111827",
                }}
              >
                Print Prep List
              </button>
            </div>
          </div>
        </div>

        <div className="no-print" style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>
            Add Manual Vehicle Prep
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <input
              type="date"
              value={manualForm.outingDate}
              onChange={(e) => setManualForm((p) => ({ ...p, outingDate: e.target.value }))}
              style={inputBase}
            />

            <input
              type="text"
              placeholder="Vehicle name / reg"
              value={manualForm.vehicleLabel}
              onChange={(e) => setManualForm((p) => ({ ...p, vehicleLabel: e.target.value }))}
              style={inputBase}
            />

            <select
              value={manualForm.presetType}
              onChange={(e) => setManualForm((p) => ({ ...p, presetType: e.target.value }))}
              style={inputBase}
            >
              {STUNT_PRESETS.map((preset) => (
                <option key={preset.value || "none"} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Job number"
              value={manualForm.jobNumber}
              onChange={(e) => setManualForm((p) => ({ ...p, jobNumber: e.target.value }))}
              style={inputBase}
            />

            <input
              type="text"
              placeholder="Client / production"
              value={manualForm.client}
              onChange={(e) => setManualForm((p) => ({ ...p, client: e.target.value }))}
              style={inputBase}
            />

            <input
              type="text"
              placeholder="Location"
              value={manualForm.location}
              onChange={(e) => setManualForm((p) => ({ ...p, location: e.target.value }))}
              style={inputBase}
            />

            <input
              type="text"
              placeholder="Equipment (comma separated)"
              value={manualForm.equipmentCSV}
              onChange={(e) => setManualForm((p) => ({ ...p, equipmentCSV: e.target.value }))}
              style={inputBase}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={addManualEntry}
              style={{
                ...buttonBase,
                background: "#1d4ed8",
                borderColor: "#1d4ed8",
                color: "#fff",
              }}
            >
              Add Manual Vehicle
            </button>
          </div>
        </div>

        <div className="no-print" style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>
            Add Fleet Vehicle Prep
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <input
              type="date"
              value={fleetForm.outingDate}
              onChange={(e) => setFleetForm((p) => ({ ...p, outingDate: e.target.value }))}
              style={inputBase}
            />

            <select
              value={fleetForm.vehicleId}
              onChange={(e) => setFleetForm((p) => ({ ...p, vehicleId: e.target.value }))}
              style={inputBase}
            >
              <option value="">Select fleet vehicle...</option>
              {fleetOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>

            <select
              value={fleetForm.presetType}
              onChange={(e) => setFleetForm((p) => ({ ...p, presetType: e.target.value }))}
              style={inputBase}
            >
              {STUNT_PRESETS.map((preset) => (
                <option key={preset.value || "none"} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Job number"
              value={fleetForm.jobNumber}
              onChange={(e) => setFleetForm((p) => ({ ...p, jobNumber: e.target.value }))}
              style={inputBase}
            />

            <input
              type="text"
              placeholder="Client / production"
              value={fleetForm.client}
              onChange={(e) => setFleetForm((p) => ({ ...p, client: e.target.value }))}
              style={inputBase}
            />

            <input
              type="text"
              placeholder="Location"
              value={fleetForm.location}
              onChange={(e) => setFleetForm((p) => ({ ...p, location: e.target.value }))}
              style={inputBase}
            />

            <input
              type="text"
              placeholder="Equipment (comma separated)"
              value={fleetForm.equipmentCSV}
              onChange={(e) => setFleetForm((p) => ({ ...p, equipmentCSV: e.target.value }))}
              style={inputBase}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={addFleetEntry}
              style={{
                ...buttonBase,
                background: "#0f766e",
                borderColor: "#0f766e",
                color: "#fff",
              }}
            >
              Add Fleet Vehicle
            </button>
          </div>
        </div>

        <div style={card} className="prep-card">
          {loading ? (
            <div style={{ color: UI.muted }}>Loading...</div>
          ) : sections.length === 0 ? (
            <div style={{ color: UI.muted }}>No prep vehicles found.</div>
          ) : groupedVisibleSections.length === 0 ? (
            <div style={{ color: UI.muted }}>
              {showCompleted
                ? "No vehicles for this outing day."
                : "No incomplete vehicles for this outing day."}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 20 }}>
              {groupedVisibleSections.map((job) => (
                <section
                  key={job.jobKey}
                  className="prep-job"
                  style={{
                    borderBottom: "2px solid #d1d5db",
                    paddingBottom: 18,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        className="prep-job-title"
                        style={{
                          fontSize: 24,
                          lineHeight: 1.1,
                          fontWeight: 800,
                          textDecoration: "underline",
                          color: UI.text,
                        }}
                      >
                        Job #{job.jobNumber} · {job.client}
                      </div>

                      <div style={{ marginTop: 6, fontSize: 14, color: UI.text }}>
                        {job.location} · <span style={{ fontWeight: 800 }}>{job.status}</span>
                      </div>

                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("#eef2ff", "#3730a3")}>
                        Vehicles: {job.vehicles.length}
                      </span>
                      {job.hasFleet && <span style={badge(UI.blueBg, UI.blue)}>FLEET</span>}
                      {job.hasManual && <span style={badge(UI.purpleBg, UI.purple)}>MANUAL</span>}
                      {job.manualIds.length > 0 && (
                        <button
                          className="no-print"
                          type="button"
                          style={{
                            ...buttonBase,
                            padding: "6px 10px",
                            fontSize: 12,
                            background: "#fff1f2",
                            borderColor: "#fecaca",
                            color: "#9f1239",
                          }}
                          onClick={() => removeManualEntry(job.manualIds[0])}
                        >
                          Remove Entry
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="prep-vehicle-grid">
                    {job.vehicles.map((s) => {
                      const section = prepRecordsByKey[s.sectionKey] || {
                        completed: false,
                        ready: false,
                        preparedBy: "",
                        preparedAt: "",
                        removed: false,
                        removedAt: "",
                        archived: false,
                        archivedAt: "",
                        notes: "",
                        items: [],
                      };

                      const isCompleted = !!section.completed;
                      const isReady = !!section.ready;
                      const isRemoved = !!section.removed;
                      const isArchived = isArchivedRecord(section, todayYmd);

                      return (
                        <section
                          key={s.sectionKey}
                          className="prep-section"
                          style={{
                            border: "1px solid #e5e7eb",
                            padding: 14,
                            background: isCompleted ? "#f0fdf4" : "transparent",
                            borderRadius: 10,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              gap: 12,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <h2
                                className="prep-vehicle-title"
                                style={{
                                  margin: 0,
                                  fontSize: 22,
                                  lineHeight: 1.1,
                                  fontWeight: 800,
                                  color: UI.text,
                                }}
                              >
                                {s.vehicleLabel}
                              </h2>

                              {!isCompleted ? (
                                <span style={badge(UI.redBg, UI.red)}>NEEDS PREP</span>
                              ) : (
                                <span style={badge(UI.greenBg, UI.green)}>PREPPED</span>
                              )}

                              {isReady && <span style={badge(UI.blueBg, UI.blue)}>READY</span>}
                              {isRemoved && <span style={badge("#fff1f2", "#9f1239")}>REMOVED</span>}
                              {isArchived && <span style={badge("#f3e8ff", "#6d28d9")}>ARCHIVED</span>}
                            </div>

                            <span style={{ fontSize: 14, color: UI.muted, fontWeight: 700 }}>
                              {fmtShort(s.outingDate)}
                            </span>
                          </div>

                          <div className="no-print" style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              style={{
                                ...buttonBase,
                                padding: "6px 10px",
                                fontSize: 12,
                                background: isCompleted ? "#fee2e2" : "#ecfdf5",
                                borderColor: isCompleted ? "#fecaca" : "#86efac",
                                color: isCompleted ? "#991b1b" : "#166534",
                              }}
                              onClick={() => toggleComplete(s.sectionKey)}
                            >
                              {isCompleted ? "Mark Incomplete" : "Mark Prepped"}
                            </button>

                            <button
                              type="button"
                              style={{
                                ...buttonBase,
                                padding: "6px 10px",
                                fontSize: 12,
                                background: isReady ? "#dbeafe" : "#fff",
                                borderColor: "#93c5fd",
                                color: "#1d4ed8",
                              }}
                              onClick={() => toggleReady(s.sectionKey)}
                            >
                              {isReady ? "Ready Marked" : "Mark Ready"}
                            </button>

                            <button
                              type="button"
                              style={{
                                ...buttonBase,
                                padding: "6px 10px",
                                fontSize: 12,
                                background: isRemoved ? "#ecfdf5" : "#fff1f2",
                                borderColor: isRemoved ? "#86efac" : "#fecaca",
                                color: isRemoved ? "#166534" : "#9f1239",
                              }}
                              onClick={() => toggleRemoved(s.sectionKey)}
                            >
                              {isRemoved ? "Restore to Prep List" : "Remove from Prep List"}
                            </button>
                          </div>

                          {(section.notes || isCompleted) && (
                            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                              {section.notes ? (
                                <div
                                  style={{
                                    fontSize: 13,
                                    color: UI.text,
                                    background: "#eff6ff",
                                    border: "1px solid #bfdbfe",
                                    borderRadius: 8,
                                    padding: "8px 10px",
                                  }}
                                >
                                  <b>Prep notes:</b> {section.notes}
                                </div>
                              ) : null}

                              {isCompleted ? (
                                <div style={{ fontSize: 12, color: UI.green, fontWeight: 700 }}>
                                  Completed by {section.preparedBy || "unknown"}
                                  {section.preparedAt ? ` on ${fmtDateTime(section.preparedAt)}` : ""}
                                </div>
                              ) : null}
                            </div>
                          )}

                          <div className="no-print" style={{ marginTop: 12 }}>
                            <div
                              style={{
                                display: "grid",
                                gap: 8,
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                              }}
                            >
                              <input
                                type="text"
                                placeholder="Prepared by"
                                value={section.preparedBy || ""}
                                onChange={(e) => updatePreparedBy(s.sectionKey, e.target.value)}
                                style={inputBase}
                              />

                              <input
                                type="text"
                                placeholder="Prep notes"
                                value={section.notes || ""}
                                onChange={(e) => updateNotes(s.sectionKey, e.target.value)}
                                style={inputBase}
                              />
                            </div>
                          </div>

                          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                            {(Array.isArray(section.items) ? section.items : []).map((it) => (
                              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => toggleItem(s.sectionKey, it.id)}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    border: "1px solid #111827",
                                    borderRadius: 3,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: it.checked ? "#bbf7d0" : "#fff",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                  className="print-check"
                                  aria-label="Toggle prep check"
                                >
                                  {it.checked ? "Yes" : ""}
                                </button>

                                <div
                                  className="prep-item-text"
                                  style={{
                                    fontSize: 18,
                                    lineHeight: 1.2,
                                    color: it.isEquipment ? "#b91c1c" : "#111827",
                                    fontWeight: it.isEquipment ? 900 : 600,
                                    textDecoration: it.isEquipment ? "underline" : "none",
                                    background: it.checked ? "#ecfccb" : "transparent",
                                    padding: "0 4px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {it.text}
                                </div>

                                <button
                                  className="no-print"
                                  type="button"
                                  onClick={() => removeItem(s.sectionKey, it.id)}
                                  style={{
                                    marginLeft: "auto",
                                    border: "1px solid #fecaca",
                                    background: "#fff1f2",
                                    color: "#9f1239",
                                    borderRadius: 8,
                                    padding: "6px 8px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="no-print" style={{ marginTop: 12 }}>
                            <PrepItemPicker
                              onQuickAdd={(item) => addItem(s.sectionKey, item)}
                              onCustomAdd={(text) => addItem(s.sectionKey, text)}
                            />
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
