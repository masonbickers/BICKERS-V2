"use client";

import { useEffect, useMemo, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import PrepItemPicker from "@/app/components/PrepItemPicker";
import { db, auth } from "../../../firebaseConfig";
import { doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";

const UI = {
  bg: "var(--color-surface-subtle)",
  card: "var(--color-surface)",
  text: "var(--legacy-color-111827)",
  muted: "var(--legacy-color-6b7280)",
  border: "1px solid var(--legacy-color-e5e7eb)",
  green: "var(--legacy-color-065f46)",
  greenBg: "var(--color-success-soft)",
  red: "var(--color-danger)",
  redBg: "var(--color-danger-soft)",
  blue: "var(--color-info)",
  blueBg: "var(--color-info-soft)",
  purple: "var(--legacy-color-6d28d9)",
  purpleBg: "var(--legacy-color-f5f3ff)",
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
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-4)",
};

const buttonBase = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--legacy-color-d1d5db)",
  background: "var(--color-white)",
  color: UI.text,
  fontWeight: 800,
  cursor: "pointer",
  fontSize: "var(--font-size-xs)",
};

const inputBase = {
  border: "1px solid var(--legacy-color-d1d5db)",
  borderRadius: "var(--radius-md)",
  padding: "7px 9px",
  fontSize: "var(--font-size-xs)",
  width: "100%",
  background: "var(--color-white)",
  color: UI.text,
};

const badge = (bg, color) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 8px",
  borderRadius: "var(--radius-pill)",
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

const normaliseVehicleKey = (v, fallback) => {
  if (v && typeof v === "object") {
    return safeLower(v.id || v.registration || v.reg || v.name || fallback);
  }
  return safeLower(v || fallback);
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
    const dateCompare = String(a.prepYmd || "").localeCompare(String(b.prepYmd || ""));
    if (dateCompare !== 0) return dateCompare;
    const jobCompare = String(a.jobNumber || "").localeCompare(String(b.jobNumber || ""));
    if (jobCompare !== 0) return jobCompare;
    return String(a.client || "").localeCompare(String(b.client || ""));
  });
}

export default function PrepListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);

  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [prepRecordsByKey, setPrepRecordsByKey] = useState({});
  const [manualEntries, setManualEntries] = useState([]);
  const [selectedFromDay, setSelectedFromDay] = useState("");
  const [selectedToDay, setSelectedToDay] = useState("");
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
    if (!authState?.user) return undefined;
    let active = true;

    (async () => {
      try {
        const [bSnap, vSnap] = await Promise.all([
          getDocs(tenantCollectionQuery(db, "bookings", authState)),
          getDocs(tenantCollectionQuery(db, "vehicles", authState)),
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
  }, [accessKey, authState]);

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
          vehicleKey: normaliseVehicleKey(vehicleValue, sectionKey),
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
        vehicleKey: safeLower(m.vehicleId || vehicleLabel || sectionKey),
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
    const fromParam = String(searchParams.get("from") || "").trim();
    const toParam = String(searchParams.get("to") || "").trim();

    if (!availableDays.length) {
      setSelectedFromDay("");
      setSelectedToDay("");
      return;
    }

    const fallback = availableDays.includes(todayYmd) ? todayYmd : availableDays[0];
    const initialFrom = fromParam || dayParam || fallback;
    const initialTo = toParam || dayParam || initialFrom;

    setSelectedFromDay((current) => {
      if (fromParam || dayParam) return initialFrom;
      if (current) return current;
      return fallback;
    });
    setSelectedToDay((current) => {
      if (toParam || dayParam) return initialTo;
      if (current) return current;
      return availableDays.includes(todayYmd) ? todayYmd : availableDays[0];
    });
  }, [availableDays, searchParams, todayYmd]);

  useEffect(() => {
    if (!selectedFromDay) return;
    setManualForm((prev) => ({ ...prev, prepDate: selectedFromDay }));
    setFleetForm((prev) => ({ ...prev, prepDate: selectedFromDay }));
  }, [selectedFromDay]);

  const visibleSections = useMemo(() => {
    const inRange = prepItems
      .filter((item) => !selectedFromDay || item.prepYmd >= selectedFromDay)
      .filter((item) => !selectedToDay || item.prepYmd <= selectedToDay)
      .filter((item) => {
        const record = prepRecordsByKey?.[item.sectionKey] || {};
        const archived = isArchivedRecord(record, item.outingYmd, todayYmd);
        const removed = !!record.removed;
        const completed = !!record.completed;

        if (!showArchived && (archived || removed)) return false;
        if (completed) return false;

        return true;
      });

    // A vehicle can be attached to several jobs in the selected period. The
    // prep sheet only needs its first upcoming occurrence so it is listed once.
    const seenVehicles = new Set();
    const uniqueVehicles = inRange.filter((item) => {
      const key = item.vehicleKey || safeLower(item.vehicleLabel) || item.sectionKey;
      if (seenVehicles.has(key)) return false;
      seenVehicles.add(key);
      return true;
    });

    return uniqueVehicles
      .sort((a, b) => {
        if (a.prepYmd !== b.prepYmd) return a.prepYmd.localeCompare(b.prepYmd);
        if (String(a.jobNumber || "") !== String(b.jobNumber || "")) {
          return String(a.jobNumber || "").localeCompare(String(b.jobNumber || ""));
        }
        return a.vehicleLabel.localeCompare(b.vehicleLabel);
      });
  }, [prepItems, selectedFromDay, selectedToDay, prepRecordsByKey, showArchived, todayYmd]);

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
    const prepDate = String(manualForm.prepDate || selectedFromDay || "").trim();
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
    const prepDate = String(fleetForm.prepDate || selectedFromDay || "").trim();
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

  const selectedFromDate = selectedFromDay ? toDateSafe(selectedFromDay) : null;
  const selectedToDate = selectedToDay ? toDateSafe(selectedToDay) : null;
  const selectedOutFromDate = selectedFromDate ? addDays(selectedFromDate, 1) : null;
  const selectedOutToDate = selectedToDate ? addDays(selectedToDate, 1) : null;
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
            background: var(--color-white) !important;
          }

          .no-print {
            display: none !important;
          }

          .prep-sheet {
            background: var(--color-white) !important;
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
            border-color: var(--color-black) !important;
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
        <div style={{ ...card, marginBottom: "var(--space-4)" }} className="prep-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-3)",
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
                Tracking Vehicle Prep List
              </h1>

              <div
                className="print-meta"
                style={{ marginTop: "var(--space-1)", color: UI.muted, fontSize: "var(--font-size-sm)" }}
              >
                Choose a prep-date range. Each vehicle is shown once on its earliest matching job.
              </div>

              <div
                className="print-meta"
                style={{ marginTop: 6, display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}
              >
                <span style={badge(UI.redBg, UI.red)}>Still to Prep: {totalVisible}</span>
                <span style={badge(UI.blueBg, UI.blue)}>Ready: {totalReady}</span>
                <span style={badge("var(--legacy-color-eef2ff)", "var(--legacy-color-3730a3)")}>
                  Prep: {selectedFromDate ? fmtLong(selectedFromDate) : "Not selected"}
                  {selectedToDate && selectedToDay !== selectedFromDay
                    ? ` to ${fmtLong(selectedToDate)}`
                    : ""}
                </span>
                <span style={badge("var(--legacy-color-fef3c7)", "var(--legacy-color-92400e)")}>
                  Going Out: {selectedOutFromDate ? fmtLong(selectedOutFromDate) : "Not selected"}
                  {selectedOutToDate && selectedToDay !== selectedFromDay
                    ? ` to ${fmtLong(selectedOutToDate)}`
                    : ""}
                </span>
              </div>
            </div>

            <div className="no-print" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: "var(--space-1)", color: UI.muted, fontSize: 11, fontWeight: 800 }}>
                FROM PREP DATE
                <input
                  type="date"
                  value={selectedFromDay}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedFromDay(value);
                    if (!selectedToDay || selectedToDay < value) setSelectedToDay(value);
                  }}
                  style={{ ...inputBase, minWidth: 170 }}
                />
              </label>

              <label style={{ display: "grid", gap: "var(--space-1)", color: UI.muted, fontSize: 11, fontWeight: 800 }}>
                TO PREP DATE
                <input
                  type="date"
                  value={selectedToDay}
                  min={selectedFromDay}
                  onChange={(e) => setSelectedToDay(e.target.value)}
                  style={{ ...inputBase, minWidth: 170 }}
                />
              </label>

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
                  background: showArchived ? "var(--legacy-color-6d28d9)" : "var(--color-white)",
                  color: showArchived ? "var(--color-white)" : UI.text,
                  borderColor: showArchived ? "var(--legacy-color-6d28d9)" : "var(--legacy-color-d1d5db)",
                }}
              >
                {showArchived ? "Hide Removed / Archived" : "Show Removed / Archived"}
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  ...buttonBase,
                  background: "var(--legacy-color-111827)",
                  color: "var(--color-white)",
                  borderColor: "var(--legacy-color-111827)",
                }}
              >
                Print Prep List
              </button>
            </div>
          </div>
        </div>

        <div className="no-print" style={{ ...card, marginBottom: "var(--space-4)" }}>
          <div style={{ fontSize: "var(--font-size-md)", fontWeight: 900, marginBottom: 10 }}>
            Add Manual Vehicle Prep
          </div>

          <div
            style={{
              display: "grid",
              gap: "var(--space-2)",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <input
              type="date"
              value={manualForm.prepDate}
              onChange={(e) => {
                setManualForm((p) => ({ ...p, prepDate: e.target.value }));
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
                background: "var(--color-info)",
                borderColor: "var(--color-info)",
                color: "var(--color-white)",
              }}
            >
              Add Manual Vehicle
            </button>
          </div>
        </div>

        <div className="no-print" style={{ ...card, marginBottom: "var(--space-4)" }}>
          <div style={{ fontSize: "var(--font-size-md)", fontWeight: 900, marginBottom: 10 }}>
            Add Fleet Vehicle Prep
          </div>

          <div
            style={{
              display: "grid",
              gap: "var(--space-2)",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <input
              type="date"
              value={fleetForm.prepDate}
              onChange={(e) => {
                setFleetForm((p) => ({ ...p, prepDate: e.target.value }));
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
                background: "var(--legacy-color-0f766e)",
                borderColor: "var(--legacy-color-0f766e)",
                color: "var(--color-white)",
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
            <div style={{ display: "grid", gap: "var(--space-5)" }}>
              {groupedVisibleSections.map((job) => (
                <section
                  key={job.jobKey}
                  className="prep-job"
                  style={{
                    borderBottom: "2px solid var(--legacy-color-d1d5db)",
                    paddingBottom: 18,
                    marginBottom: "var(--space-1)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "var(--space-3)",
                      marginBottom: "var(--space-3)",
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

                      <div style={{ marginTop: 6, fontSize: "var(--font-size-md)", color: UI.text }}>
                        {job.location} · <span style={{ fontWeight: 800 }}>{job.status}</span>
                      </div>

                      <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: UI.muted }}>
                        Goes out: {fmtLong(job.outingDate)}
                      </div>

                      {job.bookingNote ? (
                        <div
                          style={{
                            marginTop: "var(--space-2)",
                            fontSize: "var(--font-size-sm)",
                            color: UI.text,
                            background: "var(--color-surface-subtle)",
                            border: "1px solid var(--legacy-color-e5e7eb)",
                            borderRadius: "var(--radius-md)",
                            padding: "8px 10px",
                            maxWidth: 900,
                          }}
                        >
                          <b>Booking note:</b> {job.bookingNote}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <span style={badge("var(--legacy-color-eef2ff)", "var(--legacy-color-3730a3)")}>
                        Vehicles still to prep: {job.vehicles.length}
                      </span>
                      {job.isManual && <span style={badge(UI.purpleBg, UI.purple)}>MANUAL</span>}
                      {!job.isManual && (
                        <button
                          className="no-print"
                          type="button"
                          style={{ ...buttonBase, padding: "6px 10px", fontSize: "var(--font-size-xs)" }}
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
                            fontSize: "var(--font-size-xs)",
                            background: "var(--legacy-color-fff1f2)",
                            borderColor: "var(--color-danger-border)",
                            color: "var(--legacy-color-9f1239)",
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
                            border: "1px solid var(--legacy-color-e5e7eb)",
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
                              gap: "var(--space-3)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <h2
                                className="prep-vehicle-title"
                                style={{
                                  margin: 0,
                                  fontSize: "var(--font-size-xl)",
                                  lineHeight: 1.1,
                                  fontWeight: 800,
                                  color: UI.text,
                                }}
                              >
                                {s.vehicleLabel}
                              </h2>

                              <span style={badge(UI.redBg, UI.red)}>NEEDS PREP</span>
                              {isReady && <span style={badge(UI.blueBg, UI.blue)}>READY</span>}
                              {isRemoved && <span style={badge("var(--legacy-color-fff1f2)", "var(--legacy-color-9f1239)")}>REMOVED</span>}
                              {isArchived && <span style={badge("var(--legacy-color-f3e8ff)", "var(--legacy-color-6d28d9)")}>ARCHIVED</span>}
                            </div>

                            <span style={{ fontSize: "var(--font-size-md)", color: UI.muted, fontWeight: 700 }}>
                              Out: {fmtShort(s.outingDate)}
                            </span>
                          </div>

                          {section.notes ? (
                            <div
                              style={{
                                marginTop: 10,
                                fontSize: "var(--font-size-sm)",
                                color: UI.text,
                                background: "var(--color-info-soft)",
                                border: "1px solid var(--color-info-border)",
                                borderRadius: "var(--radius-md)",
                                padding: "8px 10px",
                              }}
                            >
                              <b>Prep notes:</b> {section.notes}
                            </div>
                          ) : null}

                          <div className="no-print" style={{ marginTop: 10, display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              style={{
                                ...buttonBase,
                                padding: "6px 10px",
                                fontSize: "var(--font-size-xs)",
                                background: "var(--color-success-soft)",
                                borderColor: "var(--legacy-color-86efac)",
                                color: "var(--color-success)",
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
                                fontSize: "var(--font-size-xs)",
                                background: isReady ? "var(--legacy-color-dbeafe)" : "var(--color-white)",
                                borderColor: "var(--legacy-color-93c5fd)",
                                color: "var(--color-info)",
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
                                fontSize: "var(--font-size-xs)",
                                background: isRemoved ? "var(--color-success-soft)" : "var(--legacy-color-fff1f2)",
                                borderColor: isRemoved ? "var(--legacy-color-86efac)" : "var(--color-danger-border)",
                                color: isRemoved ? "var(--color-success)" : "var(--legacy-color-9f1239)",
                              }}
                              onClick={() => toggleRemoved(s.sectionKey)}
                            >
                              {isRemoved ? "Restore to List" : "Remove from List"}
                            </button>
                          </div>

                          <div className="no-print" style={{ marginTop: "var(--space-3)" }}>
                            <div
                              style={{
                                display: "grid",
                                gap: "var(--space-2)",
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

                          <div style={{ marginTop: "var(--space-3)", display: "grid", gap: 10 }}>
                            {(Array.isArray(section.items) ? section.items : []).map((it) => (
                              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => toggleItem(s.sectionKey, it.id)}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    border: "1px solid var(--legacy-color-111827)",
                                    borderRadius: 3,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: it.checked ? "var(--color-success-border)" : "var(--color-white)",
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
                                    color: it.isEquipment ? "var(--legacy-color-b91c1c)" : "var(--legacy-color-111827)",
                                    fontWeight: it.isEquipment ? 900 : 600,
                                    textDecoration: it.isEquipment ? "underline" : "none",
                                    background: it.checked ? "var(--legacy-color-ecfccb)" : "transparent",
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
                                    border: "1px solid var(--color-danger-border)",
                                    background: "var(--legacy-color-fff1f2)",
                                    color: "var(--legacy-color-9f1239)",
                                    borderRadius: "var(--radius-md)",
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

                          <div className="no-print" style={{ marginTop: "var(--space-3)" }}>
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
