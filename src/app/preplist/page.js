"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import PrepItemPicker from "@/app/components/PrepItemPicker";
import { db, auth } from "../../../firebaseConfig";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
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
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: UI.text,
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const inputBase = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "7px 9px",
  fontSize: 12,
  width: "100%",
  background: "#fff",
  color: UI.text,
};

const badge = (bg, color) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 8px",
  borderRadius: 999,
  background: bg,
  color,
  fontSize: 10,
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

const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const itemId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const safeLower = (v) => String(v || "").trim().toLowerCase();

const normaliseVehicleLabel = (v, vehicleById) => {
  if (v && typeof v === "object") {
    return String(v.name || v.registration || v.reg || v.id || "Vehicle");
  }
  const key = String(v || "").trim();
  return String(vehicleById.get(key) || key || "Vehicle");
};

const defaultItemsForSection = (equipment) => [
  { id: itemId(), text: "Check clean & tidy inside & out.", checked: false, isEquipment: false },
  { id: itemId(), text: "Check work area is clean & tidy.", checked: false, isEquipment: false },
  { id: itemId(), text: "Check screen wash & levels.", checked: false, isEquipment: false },
  ...asArray(equipment).map((eq) => ({
    id: itemId(),
    text: `Load ${eq}.`,
    checked: false,
    isEquipment: true,
  })),
];

function isArchivedRecord(record, outingYmd, todayYmd) {
  if (!outingYmd) return !!record?.archived;
  if (outingYmd < todayYmd) return true;
  if (record?.archived) return true;
  return false;
}

function groupSectionsByJob(list) {
  const map = new Map();

  list.forEach((section) => {
    const jobKey = section.isManual
      ? `manual::${section.manualId || section.sectionKey}`
      : `${section.bookingId || ""}::${section.jobNumber || ""}::${section.client || ""}::${section.location || ""}`;

    if (!map.has(jobKey)) {
      map.set(jobKey, {
        jobKey,
        bookingId: section.bookingId,
        prepDate: section.prepDate,
        prepYmd: section.prepYmd,
        outingDate: section.outingDate,
        outingYmd: section.outingYmd,
        jobNumber: section.jobNumber || "-",
        client: section.client || "-",
        location: section.location || "-",
        status: section.status || "-",
        bookingNote: section.bookingNote || "",
        isManual: !!section.isManual,
        manualIds: section.manualId ? [section.manualId] : [],
        vehicles: [],
      });
    }

    const group = map.get(jobKey);
    group.vehicles.push(section);

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

export default function PrepListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [prepRecordsByKey, setPrepRecordsByKey] = useState({});
  const [manualEntries, setManualEntries] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [cloudHydrated, setCloudHydrated] = useState(false);

  const [manualForm, setManualForm] = useState({
    prepDate: ymd(dayOnly(new Date())),
    vehicleLabel: "",
    jobNumber: "",
    client: "",
    location: "",
    equipmentCSV: "",
  });

  const [fleetForm, setFleetForm] = useState({
    prepDate: ymd(dayOnly(new Date())),
    vehicleId: "",
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
        const [bSnap, vSnap] = await Promise.all([
          getDocs(collection(db, "bookings")),
          getDocs(collection(db, "vehicles")),
        ]);

        if (!active) return;

        setBookings(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setVehicles(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Failed loading prep list data:", error);
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

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const snap = await getDoc(PREP_SHARED_DOC_REF);
        if (!active || !snap.exists()) return;

        const data = snap.data() || {};
        const cloudPrep = data.prepRecordsByKey;
        const cloudManual = data.manualEntries;

        if (cloudPrep && typeof cloudPrep === "object") {
          setPrepRecordsByKey((prev) => ({ ...prev, ...cloudPrep }));
        }

        if (Array.isArray(cloudManual)) {
          setManualEntries((prev) => {
            const byId = new Map();
            prev.forEach((entry) => {
              if (entry?.id) byId.set(String(entry.id), entry);
            });
            cloudManual.forEach((entry) => {
              if (entry?.id) byId.set(String(entry.id), entry);
            });
            return Array.from(byId.values());
          });
        }
      } catch (error) {
        console.error("Failed loading shared prep data:", error);
      } finally {
        if (active) setCloudHydrated(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cloudHydrated) return;

    const t = setTimeout(async () => {
      try {
        await setDoc(
          PREP_SHARED_DOC_REF,
          {
            prepRecordsByKey,
            manualEntries,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Failed saving shared prep data:", error);
      }
    }, 500);

    return () => clearTimeout(t);
  }, [cloudHydrated, prepRecordsByKey, manualEntries]);

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
      const equipment = asArray(b.equipment);

      resolvedVehicles.forEach((vehicleValue, idx) => {
        const vehicleLabel = normaliseVehicleLabel(vehicleValue, vehicleById);
        const sectionKey = `${b.id}::${idx}::${vehicleLabel}::${outingYmd}`;
        const record = prepRecordsByKey?.[sectionKey] || {};

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
          bookingNote: b.noteForDay || b.note || "",
          equipment,
          prepRecord: record,
        });
      });
    });

    manualEntries.forEach((m, idx) => {
      const prepDateRaw = toDateSafe(m?.prepDate);
      if (!prepDateRaw) return;

      const prepDate = dayOnly(prepDateRaw);
      const outingDate = addDays(prepDate, 1);
      const prepYmd = ymd(prepDate);
      const outingYmd = ymd(outingDate);
      const vehicleLabel = String(m.vehicleLabel || "Vehicle");
      const sectionKey = `manual::${m.id || idx}::${vehicleLabel}::${outingYmd}`;
      const record = prepRecordsByKey?.[sectionKey] || {};

      out.push({
        sectionKey,
        bookingId: null,
        isManual: true,
        manualId: m.id,
        prepDate,
        prepYmd,
        outingDate,
        outingYmd,
        vehicleLabel,
        jobNumber: m.jobNumber || "-",
        client: m.client || "-",
        location: m.location || "-",
        status: "Manual",
        bookingNote: m.notes || "",
        equipment: asArray(m.equipment),
        prepRecord: record,
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
  }, [bookings, manualEntries, vehicleById, prepRecordsByKey]);

  useEffect(() => {
    if (!prepItems.length) return;

    setPrepRecordsByKey((prev) => {
      const next = { ...prev };
      let changed = false;

      prepItems.forEach((item) => {
        if (!next[item.sectionKey]) {
          next[item.sectionKey] = {
            completed: false,
            ready: false,
            preparedBy: "",
            preparedAt: "",
            removed: false,
            removedAt: "",
            archived: item.outingYmd < todayYmd,
            archivedAt: item.outingYmd < todayYmd ? new Date().toISOString() : "",
            prepYmd: item.prepYmd,
            outingYmd: item.outingYmd,
            jobNumber: item.jobNumber,
            client: item.client,
            location: item.location,
            vehicleLabel: item.vehicleLabel,
            notes: "",
            items: defaultItemsForSection(item.equipment),
          };
          changed = true;
          return;
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
          items: Array.isArray(current.items)
            ? current.items
            : defaultItemsForSection(item.equipment),
        };

        const same =
          current.completed === merged.completed &&
          current.ready === merged.ready &&
          current.preparedBy === merged.preparedBy &&
          current.preparedAt === merged.preparedAt &&
          current.removed === merged.removed &&
          current.removedAt === merged.removedAt &&
          current.archived === merged.archived &&
          current.archivedAt === merged.archivedAt &&
          current.prepYmd === merged.prepYmd &&
          current.outingYmd === merged.outingYmd &&
          current.jobNumber === merged.jobNumber &&
          current.client === merged.client &&
          current.location === merged.location &&
          current.vehicleLabel === merged.vehicleLabel &&
          current.notes === merged.notes &&
          Array.isArray(current.items) === Array.isArray(merged.items);

        if (!same) {
          next[item.sectionKey] = merged;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [prepItems, todayYmd]);

  const availableDays = useMemo(() => {
    const set = new Set();
    prepItems.forEach((item) => {
      if (item?.prepYmd) set.add(item.prepYmd);
    });
    return Array.from(set).sort();
  }, [prepItems]);

  useEffect(() => {
    const dayParam = String(searchParams.get("day") || "").trim();

    if (!availableDays.length) {
      setSelectedDay("");
      return;
    }

    setSelectedDay((current) => {
      if (dayParam && availableDays.includes(dayParam)) return dayParam;
      if (current && availableDays.includes(current)) return current;
      return availableDays.includes(todayYmd) ? todayYmd : availableDays[0];
    });
  }, [availableDays, searchParams, todayYmd]);

  useEffect(() => {
    if (!selectedDay) return;
    setManualForm((prev) => ({ ...prev, prepDate: selectedDay }));
    setFleetForm((prev) => ({ ...prev, prepDate: selectedDay }));
  }, [selectedDay]);

  const visibleSections = useMemo(() => {
    return prepItems
      .filter((item) => !selectedDay || item.prepYmd === selectedDay)
      .filter((item) => {
        const record = prepRecordsByKey?.[item.sectionKey] || {};
        const archived = isArchivedRecord(record, item.outingYmd, todayYmd);
        const removed = !!record.removed;
        const completed = !!record.completed;

        if (!showArchived && (archived || removed)) return false;
        if (completed) return false;

        return true;
      })
      .sort((a, b) => {
        if (String(a.jobNumber || "") !== String(b.jobNumber || "")) {
          return String(a.jobNumber || "").localeCompare(String(b.jobNumber || ""));
        }
        return a.vehicleLabel.localeCompare(b.vehicleLabel);
      });
  }, [prepItems, selectedDay, prepRecordsByKey, showArchived, todayYmd]);

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
    const prepDate = String(selectedDay || manualForm.prepDate || "").trim();
    const vehicleLabel = String(manualForm.vehicleLabel || "").trim();

    if (!prepDate) {
      alert("Please choose a prep date.");
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
      prepDate,
      vehicleLabel,
      jobNumber: String(manualForm.jobNumber || "").trim(),
      client: String(manualForm.client || "").trim(),
      location: String(manualForm.location || "").trim(),
      equipment,
      notes: "",
    };

    setManualEntries((prev) => [entry, ...prev]);

    setManualForm((prev) => ({
      ...prev,
      prepDate,
      vehicleLabel: "",
      jobNumber: "",
      client: "",
      location: "",
      equipmentCSV: "",
    }));
  };

  const addFleetEntry = () => {
    const prepDate = String(selectedDay || fleetForm.prepDate || "").trim();
    const vehicleId = String(fleetForm.vehicleId || "").trim();

    if (!prepDate) {
      alert("Please choose a prep date.");
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
      prepDate,
      vehicleLabel,
      vehicleId,
      isFleet: true,
      jobNumber: String(fleetForm.jobNumber || "").trim(),
      client: String(fleetForm.client || "").trim(),
      location: String(fleetForm.location || "").trim(),
      equipment,
      notes: "",
    };

    setManualEntries((prev) => [entry, ...prev]);

    setFleetForm((prev) => ({
      ...prev,
      prepDate,
      vehicleId: "",
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
        const prepDate = String(manual.prepDate || "");
        const outingYmd = prepDate ? ymd(addDays(toDateSafe(prepDate), 1)) : "";
        const manualKey = `manual::${manual.id}::${manual.vehicleLabel || "Vehicle"}::${outingYmd}`;
        delete next[manualKey];
      });
      return next;
    });

    setManualEntries((prev) => prev.filter((m) => m.id !== manualId));
  };

  const selectedPrepDate = selectedDay ? toDateSafe(selectedDay) : null;
  const selectedOutDayDate = selectedPrepDate ? addDays(selectedPrepDate, 1) : null;
  const totalVisible = visibleSections.length;
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

          body * {
            visibility: hidden !important;
          }

          .prep-sheet,
          .prep-sheet * {
            visibility: visible !important;
          }

          .prep-sheet {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            margin: 0 !important;
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
                Tracking Vehicle Prep List {selectedPrepDate ? fmtLong(selectedPrepDate) : fmtLong(new Date())}
              </h1>

              <div
                className="print-meta"
                style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}
              >
                Select one prep day at a time. Jobs are fetched using the same prep logic as the dashboard.
              </div>

              <div
                className="print-meta"
                style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                <span style={badge(UI.redBg, UI.red)}>Still to Prep: {totalVisible}</span>
                <span style={badge(UI.blueBg, UI.blue)}>Ready: {totalReady}</span>
                <span style={badge("#eef2ff", "#3730a3")}>
                  Prep Day: {selectedPrepDate ? fmtLong(selectedPrepDate) : "Not selected"}
                </span>
                <span style={badge("#fef3c7", "#92400e")}>
                  Going Out: {selectedOutDayDate ? fmtLong(selectedOutDayDate) : "Not selected"}
                </span>
              </div>
            </div>

            <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={selectedDay}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedDay(value);
                  setManualForm((p) => ({ ...p, prepDate: value || p.prepDate }));
                  setFleetForm((p) => ({ ...p, prepDate: value || p.prepDate }));
                }}
                style={{
                  ...buttonBase,
                  padding: "10px 12px",
                  fontWeight: 700,
                  minWidth: 240,
                }}
              >
                {availableDays.map((d) => (
                  <option key={d} value={d}>
                    {fmtLong(toDateSafe(d))}
                  </option>
                ))}
              </select>

              <button type="button" onClick={() => router.push("/preplist-dashboard")} style={buttonBase}>
                Prep Dashboard
              </button>

              <button type="button" onClick={() => router.push("/dashboard")} style={buttonBase}>
                Back to Dashboard
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
                {showArchived ? "Hide Removed / Archived" : "Show Removed / Archived"}
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
              value={selectedDay || manualForm.prepDate}
              onChange={(e) => {
                setSelectedDay(e.target.value);
                setManualForm((p) => ({ ...p, prepDate: e.target.value }));
                setFleetForm((p) => ({ ...p, prepDate: e.target.value }));
              }}
              style={inputBase}
            />

            <input
              type="text"
              placeholder="Vehicle name / reg"
              value={manualForm.vehicleLabel}
              onChange={(e) => setManualForm((p) => ({ ...p, vehicleLabel: e.target.value }))}
              style={inputBase}
            />

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
              value={selectedDay || fleetForm.prepDate}
              onChange={(e) => {
                setSelectedDay(e.target.value);
                setFleetForm((p) => ({ ...p, prepDate: e.target.value }));
                setManualForm((p) => ({ ...p, prepDate: e.target.value }));
              }}
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
          ) : prepItems.length === 0 ? (
            <div style={{ color: UI.muted }}>No prep vehicles found.</div>
          ) : groupedVisibleSections.length === 0 ? (
            <div style={{ color: UI.muted }}>
              No vehicles still need preparing for this selected prep day.
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

                      <div style={{ marginTop: 6, fontSize: 13, color: UI.muted }}>
                        Goes out: {fmtLong(job.outingDate)}
                      </div>

                      {job.bookingNote ? (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 13,
                            color: UI.text,
                            background: "#f8fafc",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            padding: "8px 10px",
                            maxWidth: 900,
                          }}
                        >
                          <b>Booking note:</b> {job.bookingNote}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badge("#eef2ff", "#3730a3")}>
                        Vehicles still to prep: {job.vehicles.length}
                      </span>
                      {job.isManual && <span style={badge(UI.purpleBg, UI.purple)}>MANUAL</span>}
                      {!job.isManual && (
                        <button
                          className="no-print"
                          type="button"
                          style={{ ...buttonBase, padding: "6px 10px", fontSize: 12 }}
                          onClick={() => router.push(`/view-booking/${job.bookingId}`)}
                        >
                          Open Booking
                        </button>
                      )}
                      {job.isManual && job.manualIds.length > 0 && (
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
                          Delete Manual Job
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

                      const isReady = !!section.ready;
                      const isRemoved = !!section.removed;
                      const isArchived = isArchivedRecord(section, s.outingYmd, todayYmd);

                      return (
                        <section
                          key={s.sectionKey}
                          className="prep-section"
                          style={{
                            border: "1px solid #e5e7eb",
                            padding: 14,
                            background: "transparent",
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

                              <span style={badge(UI.redBg, UI.red)}>NEEDS PREP</span>
                              {isReady && <span style={badge(UI.blueBg, UI.blue)}>READY</span>}
                              {isRemoved && <span style={badge("#fff1f2", "#9f1239")}>REMOVED</span>}
                              {isArchived && <span style={badge("#f3e8ff", "#6d28d9")}>ARCHIVED</span>}
                            </div>

                            <span style={{ fontSize: 14, color: UI.muted, fontWeight: 700 }}>
                              Out: {fmtShort(s.outingDate)}
                            </span>
                          </div>

                          {section.notes ? (
                            <div
                              style={{
                                marginTop: 10,
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

                          <div className="no-print" style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              style={{
                                ...buttonBase,
                                padding: "6px 10px",
                                fontSize: 12,
                                background: "#ecfdf5",
                                borderColor: "#86efac",
                                color: "#166534",
                              }}
                              onClick={() => toggleComplete(s.sectionKey)}
                            >
                              Mark Prepped
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
                              {isRemoved ? "Restore to List" : "Remove from List"}
                            </button>
                          </div>

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
                                  {it.checked ? "✓" : ""}
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