// src/app/maintenance/[id]/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db, storage, auth } from "../../../../firebaseConfig";

import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import DatePicker from "react-multi-date-picker";

/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens + shared styles (layout-only; aligned to Create Booking page)
──────────────────────────────────────────────────────────────────────────── */
const UI = {
  radius: 10,
  radiusSm: 8,
  radiusXs: 6,
  shadow: "0 6px 18px rgba(0,0,0,0.08)",
  border: "1px solid #e5e7eb",
  bg: "#ffffff",
  bgAlt: "#f8fafc",
  text: "#111827",
  muted: "#6b7280",
};

const pageWrap = {
  display: "flex",
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: "#f1f5f9",
};

const mainWrap = {
  flex: 1,
  color: UI.text,
  maxWidth: 1600,
  margin: "0 auto",
  padding: "20px 24px",
};

const h1Style = {
  color: UI.text,
  marginBottom: 12,
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: 0.2,
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
  gap: 16,
  marginTop: 8,
};

const card = {
  background: UI.bg,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadow,
  padding: 16,
};

const cardTitle = { margin: "0 0 10px", fontSize: 15, fontWeight: 700 };

const field = {
  label: {
    display: "block",
    fontWeight: 600,
    marginBottom: 6,
    color: UI.text,
  },
  input: {
    width: "100%",
    height: 38,
    padding: "8px 10px",
    fontSize: 14,
    borderRadius: UI.radiusXs,
    border: "1px solid #d1d5db",
    background: "#fff",
  },
  textarea: {
    width: "100%",
    minHeight: 80,
    padding: "10px 12px",
    fontSize: 14,
    borderRadius: UI.radiusXs,
    border: "1px solid #d1d5db",
    background: "#fff",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 600,
    marginBottom: 8,
  },
};

const accordionBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  background: UI.bgAlt,
  cursor: "pointer",
  fontWeight: 700,
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 8px",
  fontSize: 12,
  borderRadius: 999,
  background: "#e5e7eb",
  border: "1px solid #d1d5db",
};

const divider = { height: 1, background: "#e5e7eb", margin: "12px 0" };

const actionsRow = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 14,
};

const btn = {
  padding: "9px 13px",
  borderRadius: UI.radiusXs,
  border: "1px solid #111",
  cursor: "pointer",
  fontWeight: 700,
};
const btnPrimary = { ...btn, background: "#111", color: "#fff" };
const btnGhost = { ...btn, background: "#fff", color: "#111" };

const summaryCard = {
  ...card,
  position: "sticky",
  top: 12,
  alignSelf: "start",
  background: "#0b1220",
  color: "#e6edf7",
  border: "1px solid rgba(255,255,255,0.08)",
};

const summaryRow = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 10,
  padding: "6px 0",
  borderBottom: "1px dashed rgba(255,255,255,0.08)",
};

/* ────────────────────────────────────────────────────────────────────────────
   UTC day helpers
──────────────────────────────────────────────────────────────────────────── */
const parseYMD_UTC = (ymd) => {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};
const formatYMD_UTC = (dt) => dt.toISOString().slice(0, 10);
const addDaysUTC = (dt, n) => {
  const copy = new Date(dt.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
};
const enumerateDaysYMD_UTC = (startYMD, endYMD) => {
  const start = parseYMD_UTC(startYMD);
  const end = parseYMD_UTC(endYMD);
  if (!start || !end) return [];
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(formatYMD_UTC(cur));
    cur = addDaysUTC(cur, 1);
  }
  return out;
};

// ✅ checks if a YMD list is fully consecutive day-by-day
const isConsecutiveYMDList = (dates = []) => {
  if (!Array.isArray(dates) || dates.length <= 1) return true;
  const sorted = dates.slice().sort();
  const expected = enumerateDaysYMD_UTC(sorted[0], sorted[sorted.length - 1]);
  if (expected.length !== sorted.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== sorted[i]) return false;
  }
  return true;
};

/* ────────────────────────────────────────────────────────────────────────────
   Travel helpers (same as booking page)
──────────────────────────────────────────────────────────────────────────── */
const buildTravelDurationOptions = () => {
  const out = [];
  for (let mins = 15; mins <= 360; mins += 15) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const label = h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
    out.push({ value: String(mins), label });
  }
  return out;
};
const TRAVEL_DURATION_OPTIONS = buildTravelDurationOptions();

/* ────────────────────────────────────────────────────────────────────────────
   Vehicle key helper (for stable checkbox keys)
──────────────────────────────────────────────────────────────────────────── */
const canonicalVehicleKey = (name, registration) => {
  const reg = (registration || "").trim().toLowerCase();
  const nm = (name || "").trim().toLowerCase();
  return reg || nm || null;
};

/* ────────────────────────────────────────────────────────────────────────────
   Maintenance Types
──────────────────────────────────────────────────────────────────────────── */
const MAINT_TYPES = [
  "Service",
  "MOT",
  "Repair",
  "Inspection",
  "Tyres",
  "Tax",
  "Insurance",
  "Breakdown",
  "Other",
];

export default function MaintenanceFormPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");
  const isNew = id === "new";

  /* ───────────────────────────
     State (aligned to booking page)
  ─────────────────────────── */
  const [loading, setLoading] = useState(!isNew);

  const [jobNumber, setJobNumber] = useState("");
  const [jobUnlocked, setJobUnlocked] = useState(false); // ✅ unlock toggle
  const [maintenanceType, setMaintenanceType] = useState("Service");
  const [maintenanceTypeOther, setMaintenanceTypeOther] = useState("");

  // core fields (maintenance requires Location only)
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  // dates
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [customDates, setCustomDates] = useState([]);
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // notes-by-date (same structure)
  const [notesByDate, setNotesByDate] = useState({});

  // vehicles + equipment selection
  const [vehicles, setVehicles] = useState([]);
  const [equipment, setEquipment] = useState([]);

  const [vehicleGroups, setVehicleGroups] = useState({
    Bike: [],
    "Electric Tracking Vehicles": [],
    "Small Tracking Vehicles": [],
    "Large Tracking Vehicles": [],
    "Low Loaders": [],
    "Transport Lorry": [],
    "Transport Van": [],
    "Other Vehicles": [],
  });
  const [openVehicleGroups, setOpenVehicleGroups] = useState({
    Bike: false,
    "Electric Tracking Vehicles": false,
    "Small Tracking Vehicles": false,
    "Large Tracking Vehicles": false,
    "Low Loaders": false,
    "Transport Lorry": false,
    "Transport Van": false,
    "Other Vehicles": false,
  });

  const [equipmentGroups, setEquipmentGroups] = useState({
    "A-Frame": [],
    Trailer: [],
    Battery: [],
    "Tow Dolly": [],
    "Lorry Trailer": [],
  });
  const [openEquipmentGroups, setOpenEquipmentGroups] = useState({
    "A-Frame": false,
    Trailer: false,
    Battery: false,
    "Tow Dolly": false,
    "Lorry Trailer": false,
  });

  // PDF upload
  const [quoteFile, setQuoteFile] = useState(null);
  const [quoteUrl, setQuoteUrl] = useState(null);
  const [quoteProgress, setQuoteProgress] = useState(0);

  // core validation
  const coreFilled = Boolean((location || "").trim());
  const saveTooltip = !coreFilled ? "Fill Location to save" : "";

  // ✅ default unlock behaviour: only unlocked on NEW
  useEffect(() => {
    setJobUnlocked(isNew);
  }, [isNew]);

  /* ────────────────────────────────────────────────────────────────────────────
     Derived: selectedDates (same approach as booking page)
  ───────────────────────────────────────────────────────────────────────────── */
  const selectedDates = useMemo(() => {
    if (useCustomDates) return customDates;
    if (!startDate) return [];
    if (isRange && endDate) {
      return enumerateDaysYMD_UTC(startDate, endDate);
    }
    return [startDate];
  }, [useCustomDates, customDates, startDate, isRange, endDate]);

  /* ────────────────────────────────────────────────────────────────────────────
     Load: vehicles + equipment (same quality grouping)
  ───────────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const loadLists = async () => {
      // vehicles
      const vehicleSnap = await getDocs(collection(db, "vehicles"));
      const grouped = {
        Bike: [],
        "Electric Tracking Vehicles": [],
        "Small Tracking Vehicles": [],
        "Large Tracking Vehicles": [],
        "Low Loaders": [],
        "Transport Lorry": [],
        "Transport Van": [],
        "Other Vehicles": [],
      };

      vehicleSnap.docs.forEach((docu) => {
        const data = docu.data();
        const category = (data.category || "").trim().toLowerCase();
        const vehicle = { name: data.name, registration: data.registration || "" };

        if (category.includes("small")) grouped["Small Tracking Vehicles"].push(vehicle);
        else if (category.includes("bike")) grouped["Bike"].push(vehicle);
        else if (category.includes("electric")) grouped["Electric Tracking Vehicles"].push(vehicle);
        else if (category.includes("large")) grouped["Large Tracking Vehicles"].push(vehicle);
        else if (category.includes("low loader")) grouped["Low Loaders"].push(vehicle);
        else if (category.includes("lorry")) grouped["Transport Lorry"].push(vehicle);
        else if (category.includes("van")) grouped["Transport Van"].push(vehicle);
        else grouped["Other Vehicles"].push(vehicle);
      });

      setVehicleGroups(grouped);

      // equipment
      const equipmentSnap = await getDocs(collection(db, "equipment"));
      const groupedEquip = {
        "A-Frame": [],
        Trailer: [],
        Battery: [],
        "Tow Dolly": [],
        "Lorry Trailer": [],
      };
      const openEquip = {
        "A-Frame": false,
        Trailer: false,
        Battery: false,
        "Tow Dolly": false,
        "Lorry Trailer": false,
      };

      equipmentSnap.docs.forEach((docu) => {
        const data = docu.data();
        const category = data.category || "Uncategorised";
        const name = data.name || data.label || "Unnamed Equipment";

        if (groupedEquip[category]) {
          groupedEquip[category].push(name);
        } else {
          if (!groupedEquip["Uncategorised"]) groupedEquip["Uncategorised"] = [];
          if (!openEquip["Uncategorised"]) openEquip["Uncategorised"] = false;
          groupedEquip["Uncategorised"].push(name);
        }
      });

      setEquipmentGroups(groupedEquip);
      setOpenEquipmentGroups(openEquip);
    };

    loadLists();
  }, []);

  /* ────────────────────────────────────────────────────────────────────────────
     Auto job number (on NEW)
     - uses maintenanceBookings collection
  ───────────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isNew) return;

    const gen = async () => {
      const snap = await getDocs(collection(db, "maintenanceBookings"));
      const nums = snap.docs
        .map((d) => d.data()?.jobNumber)
        .filter((jn) => /^\d+$/.test(String(jn || "")))
        .map((jn) => parseInt(jn, 10));

      const max = nums.length ? Math.max(...nums) : 0;
      setJobNumber(String(max + 1).padStart(4, "0"));
    };

    gen();
  }, [isNew]);

  /* ────────────────────────────────────────────────────────────────────────────
     Load existing doc (on EDIT)
     ✅ Fixes non-consecutive hydration: decide from bookingDates continuity
  ───────────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (isNew) return;

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "maintenanceBookings", id));
        if (!snap.exists()) {
          alert("Maintenance booking not found");
          router.push("/dashboard");
          return;
        }

        const d = snap.data();

        setJobNumber(d.jobNumber || "");
        setMaintenanceType(d.maintenanceType || "Service");
        setMaintenanceTypeOther(d.maintenanceTypeOther || "");

        setLocation(d.location || "");
        setNotes(d.notes || "");

        setVehicles(Array.isArray(d.vehicles) ? d.vehicles : []);
        setEquipment(Array.isArray(d.equipment) ? d.equipment : []);

        setNotesByDate(d.notesByDate || {});
        setQuoteUrl(d.quoteUrl || null);

        // ✅ HYDRATE DATE MODE (correctly handles non-consecutive)
        if (Array.isArray(d.bookingDates) && d.bookingDates.length) {
          const sortedDates = d.bookingDates.slice().sort();
          const consecutive = isConsecutiveYMDList(sortedDates);

          if (!consecutive) {
            setUseCustomDates(true);
            setCustomDates(sortedDates);
            setIsRange(false);
            setStartDate("");
            setEndDate("");
          } else {
            if (sortedDates.length === 1) {
              setUseCustomDates(false);
              setIsRange(false);
              setStartDate(sortedDates[0]);
              setEndDate("");
            } else {
              setUseCustomDates(false);
              setIsRange(true);
              setStartDate(sortedDates[0]);
              setEndDate(sortedDates[sortedDates.length - 1]);
            }
            setCustomDates([]);
          }
        } else if (d.startDate && d.endDate) {
          const s = String(d.startDate).slice(0, 10);
          const e = String(d.endDate).slice(0, 10);
          setUseCustomDates(false);
          setIsRange(true);
          setStartDate(s);
          setEndDate(e);
          setCustomDates([]);
        } else if (d.date) {
          const one = String(d.date).slice(0, 10);
          setUseCustomDates(false);
          setIsRange(false);
          setStartDate(one);
          setEndDate("");
          setCustomDates([]);
        } else {
          // nothing saved
          setUseCustomDates(false);
          setIsRange(false);
          setStartDate("");
          setEndDate("");
          setCustomDates([]);
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        alert("Failed to load maintenance booking");
        router.push("/dashboard");
      }
    };

    load();
  }, [id, isNew, router]);

  /* ────────────────────────────────────────────────────────────────────────────
     Save (create or update)
  ───────────────────────────────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!coreFilled) {
      alert("Please provide: Location.");
      return;
    }

    // Dates validation (keep same behaviour as booking: require dates)
    if (!useCustomDates) {
      if (!startDate) return alert("Please select a start date.");
      if (isRange && !endDate) return alert("Please select an end date.");
    } else {
      if (customDates.length === 0) return alert("Please select at least one date.");
    }

    // Filter notesByDate to only selectedDates
    const filteredNotesByDate = {};
    selectedDates.forEach((d) => {
      filteredNotesByDate[d] = notesByDate[d] || "";
      if (typeof notesByDate[`${d}-other`] !== "undefined")
        filteredNotesByDate[`${d}-other`] = notesByDate[`${d}-other`];
      if (typeof notesByDate[`${d}-travelMins`] !== "undefined")
        filteredNotesByDate[`${d}-travelMins`] = notesByDate[`${d}-travelMins`];
    });

    // Upload PDF (PDF only)
    let quoteUrlToSave = quoteUrl || null;

    if (quoteFile) {
      try {
        const nameIsPdf = /\.pdf$/i.test(quoteFile.name || "");
        const typeIsPdf = (quoteFile.type || "").toLowerCase() === "application/pdf";
        if (!nameIsPdf && !typeIsPdf) {
          alert("Please attach a PDF (.pdf) file.");
          return;
        }

        const base = `${jobNumber || "nojob"}_${quoteFile.name}`.replace(/\s+/g, "_");
        const safeName = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;

        const storageRef = ref(storage, `maintenance-quotes/${safeName}`);
        const uploadTask = uploadBytesResumable(storageRef, quoteFile, {
          contentType: "application/pdf",
        });

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setQuoteProgress(pct);
            },
            (err) => {
              console.error("Upload error:", err);
              reject(err);
            },
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              setQuoteUrl(url);
              quoteUrlToSave = url;
              resolve();
            }
          );
        });
      } catch (error) {
        alert("Failed to upload PDF: " + (error?.message || String(error)));
        return;
      }
    }

    const userEmail = auth.currentUser?.email || "Unknown";
    const nowIso = new Date().toISOString();

    const effectiveMaintenanceType =
      maintenanceType === "Other" ? (maintenanceTypeOther || "").trim() : maintenanceType;

    const payload = {
      jobNumber,
      status: "Maintenance",
      maintenanceType: maintenanceType,
      maintenanceTypeOther: maintenanceTypeOther || "",
      maintenanceTypeLabel: effectiveMaintenanceType || maintenanceType,

      location,
      vehicles,
      equipment,

      notes,
      notesByDate: filteredNotesByDate,

      bookingDates: selectedDates,
      quoteUrl: quoteUrlToSave,

      ...(useCustomDates
        ? { date: null, startDate: null, endDate: null }
        : isRange && startDate && endDate
        ? {
            startDate: new Date(startDate).toISOString(),
            endDate: new Date(endDate).toISOString(),
            date: null,
          }
        : startDate
        ? {
            date: new Date(startDate).toISOString(),
            startDate: null,
            endDate: null,
          }
        : { date: null, startDate: null, endDate: null }),

      lastEditedBy: userEmail,
      updatedAt: nowIso,
    };

    try {
      if (isNew) {
        await addDoc(collection(db, "maintenanceBookings"), {
          ...payload,
          createdBy: userEmail,
          createdAt: nowIso,
          history: [{ action: "Created", user: userEmail, timestamp: nowIso }],
        });
        alert("Maintenance Saved ✅");
      } else {
        const refDoc = doc(db, "maintenanceBookings", id);

        // append edit entry (preserve old history if present)
        const existingSnap = await getDoc(refDoc);
        const old = existingSnap.exists() ? existingSnap.data() : {};
        const history = Array.isArray(old.history) ? old.history : [];
        history.push({ action: "Edited", user: userEmail, timestamp: nowIso });

        await updateDoc(refDoc, { ...payload, history });
        alert("Maintenance Updated ✅");
      }

      router.push("/dashboard?saved=true");
    } catch (err) {
      console.error("❌ Error saving maintenance:", err);
      alert("Failed to save maintenance ❌\n\n" + err.message);
    }
  };

  /* ────────────────────────────────────────────────────────────────────────────
     UI helpers
  ───────────────────────────────────────────────────────────────────────────── */
  const title = isNew ? "🛠️ Create Maintenance" : "✏️ Edit Maintenance";

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={mainWrap}>
            <h1 style={h1Style}>{title}</h1>
            <div style={card}>Loading…</div>
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={mainWrap}>
          <h1 style={h1Style}>{title}</h1>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div style={sectionGrid}>
              {/* Column 1: Job Info */}
              <div style={card}>
                <h3 style={cardTitle}>Maintenance Info</h3>

                <label style={field.label}>Job Number</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    value={jobNumber}
                    onChange={(e) => setJobNumber(e.target.value)}
                    disabled={!jobUnlocked}
                    style={{
                      ...field.input,
                      flex: 1,
                      opacity: jobUnlocked ? 1 : 0.7,
                      cursor: jobUnlocked ? "text" : "not-allowed",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setJobUnlocked((v) => !v)}
                    style={btnGhost}
                    title={jobUnlocked ? "Lock job number" : "Unlock job number"}
                  >
                    {jobUnlocked ? "Lock" : "Unlock"}
                  </button>
                </div>

                <label style={{ ...field.label, marginTop: 12 }}>Maintenance Type</label>
                <select
                  value={maintenanceType}
                  onChange={(e) => setMaintenanceType(e.target.value)}
                  style={field.input}
                >
                  {MAINT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {maintenanceType === "Other" && (
                  <div style={{ marginTop: 8 }}>
                    <label style={field.label}>Type (Other)</label>
                    <input
                      value={maintenanceTypeOther}
                      onChange={(e) => setMaintenanceTypeOther(e.target.value)}
                      style={field.input}
                      placeholder="e.g. Windscreen, Electrical, Bodywork…"
                    />
                  </div>
                )}

                <label style={{ ...field.label, marginTop: 12 }}>Location</label>
                <textarea
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={field.textarea}
                  required
                />

                <div style={divider} />

                <label style={field.label}>Job Description</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  style={field.textarea}
                  placeholder="Describe the maintenance required..."
                />
              </div>

              {/* Column 2: Dates + notes-by-date */}
              <div style={card}>
                <h3 style={cardTitle}>Dates</h3>

                <label style={field.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={useCustomDates}
                    onChange={(e) => {
                      const on = e.target.checked;

                      if (on) {
                        // ✅ seed custom dates from current selection (nice UX)
                        const seed = selectedDates?.length ? selectedDates.slice() : [];
                        setCustomDates(seed);
                        setIsRange(false);
                        setStartDate("");
                        setEndDate("");
                      } else {
                        // turning off custom -> start from first selected date (if any)
                        const first = (customDates?.[0] || "").slice(0, 10);
                        setStartDate(first || "");
                        setEndDate("");
                        setIsRange(false);
                        setCustomDates([]);
                      }

                      setUseCustomDates(on);
                    }}
                  />
                  Select non-consecutive dates
                </label>

                {!useCustomDates && (
                  <label style={field.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={isRange}
                      onChange={() => setIsRange(!isRange)}
                    />
                    Multi-day booking (consecutive)
                  </label>
                )}

                {useCustomDates ? (
                  <div style={{ marginTop: 10 }}>
                    <DatePicker
                      multiple
                      value={customDates}
                      format="YYYY-MM-DD"
                      onChange={(vals) => {
                        const normalised = (Array.isArray(vals) ? vals : [])
                          .map((v) =>
                            typeof v?.format === "function" ? v.format("YYYY-MM-DD") : String(v)
                          )
                          .sort();
                        setCustomDates(normalised);
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isRange ? "1fr 1fr" : "1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <label style={field.label}>{isRange ? "Start Date" : "Date"}</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                        style={field.input}
                      />
                    </div>
                    {isRange && (
                      <div>
                        <label style={field.label}>End Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          required
                          style={field.input}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Notes single-day */}
                {!useCustomDates && !isRange && startDate && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: "8px 0" }}>Note for the Day</h4>
                    <select
                      value={notesByDate[startDate] || ""}
                      onChange={(e) =>
                        setNotesByDate({
                          ...notesByDate,
                          [startDate]: e.target.value,
                        })
                      }
                      style={field.input}
                    >
                      <option value="">Select note</option>
                      <option value="On Set">On Set</option>
                      <option value="Travel Day">Travel Day</option>
                      <option value="Travel Time">Travel Time</option>
                      <option value="1/2 Day Travel">1/2 Day Travel</option>
                      <option value="Night Shoot">Night Shoot</option>
                      <option value="Turnaround Day">Turnaround Day</option>
                      <option value="Other">Other</option>
                    </select>

                    {notesByDate[startDate] === "Other" && (
                      <div style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          placeholder="Enter custom note"
                          value={notesByDate[`${startDate}-other`] || ""}
                          onChange={(e) =>
                            setNotesByDate({
                              ...notesByDate,
                              [startDate]: "Other",
                              [`${startDate}-other`]: e.target.value,
                            })
                          }
                          style={field.input}
                        />
                      </div>
                    )}

                    {notesByDate[startDate] === "Travel Time" && (
                      <div style={{ marginTop: 8 }}>
                        <label style={{ ...field.label, marginBottom: 6 }}>Travel duration</label>
                        <select
                          value={notesByDate[`${startDate}-travelMins`] || ""}
                          onChange={(e) =>
                            setNotesByDate({
                              ...notesByDate,
                              [startDate]: "Travel Time",
                              [`${startDate}-travelMins`]: e.target.value,
                            })
                          }
                          style={field.input}
                        >
                          <option value="">Select duration</option>
                          {TRAVEL_DURATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes per-day for range */}
                {!useCustomDates && isRange && startDate && endDate && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: "8px 0" }}>Notes for Each Day</h4>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
                        gap: 12,
                      }}
                    >
                      {enumerateDaysYMD_UTC(startDate, endDate).map((date) => {
                        const selectedNote = notesByDate[date] || "";
                        const isOther = selectedNote === "Other";
                        const customOtherValue = notesByDate[`${date}-other`] || "";

                        return (
                          <div
                            key={date}
                            style={{
                              border: UI.border,
                              borderRadius: UI.radiusSm,
                              padding: 10,
                              background: UI.bgAlt,
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>
                              {new Date(date).toDateString()}
                            </div>

                            <select
                              value={selectedNote}
                              onChange={(e) =>
                                setNotesByDate({
                                  ...notesByDate,
                                  [date]: e.target.value,
                                })
                              }
                              style={field.input}
                            >
                              <option value="">Select note</option>
                              <option value="On Set">On Set</option>
                              <option value="Travel Day">Travel Day</option>
                              <option value="Travel Time">Travel Time</option>
                              <option value="1/2 Day Travel">1/2 Day Travel</option>
                              <option value="Night Shoot">Night Shoot</option>
                              <option value="Turnaround Day">Turnaround Day</option>
                              <option value="Other">Other</option>
                            </select>

                            {isOther && (
                              <div style={{ marginTop: 8 }}>
                                <input
                                  type="text"
                                  placeholder="Enter custom note"
                                  value={customOtherValue}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: "Other",
                                      [`${date}-other`]: e.target.value,
                                    })
                                  }
                                  style={field.input}
                                />
                              </div>
                            )}

                            {selectedNote === "Travel Time" && (
                              <div style={{ marginTop: 8 }}>
                                <label style={{ ...field.label, marginBottom: 6 }}>
                                  Travel duration
                                </label>
                                <select
                                  value={notesByDate[`${date}-travelMins`] || ""}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: "Travel Time",
                                      [`${date}-travelMins`]: e.target.value,
                                    })
                                  }
                                  style={field.input}
                                >
                                  <option value="">Select duration</option>
                                  {TRAVEL_DURATION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notes for custom dates */}
                {useCustomDates && customDates.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: "8px 0" }}>Notes for Each Selected Day</h4>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
                        gap: 12,
                      }}
                    >
                      {customDates.map((date) => {
                        const selectedNote = notesByDate[date] || "";
                        const isOther = selectedNote === "Other";
                        const customOtherValue = notesByDate[`${date}-other`] || "";

                        return (
                          <div
                            key={date}
                            style={{
                              border: UI.border,
                              borderRadius: UI.radiusSm,
                              padding: 10,
                              background: UI.bgAlt,
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>
                              {new Date(date).toDateString()}
                            </div>

                            <select
                              value={selectedNote}
                              onChange={(e) =>
                                setNotesByDate({
                                  ...notesByDate,
                                  [date]: e.target.value,
                                })
                              }
                              style={field.input}
                            >
                              <option value="">Select note</option>
                              <option value="On Set">On Set</option>
                              <option value="Travel Day">Travel Day</option>
                              <option value="Travel Time">Travel Time</option>
                              <option value="1/2 Day Travel">1/2 Day Travel</option>
                              <option value="Night Shoot">Night Shoot</option>
                              <option value="Turnaround Day">Turnaround Day</option>
                              <option value="Other">Other</option>
                            </select>

                            {isOther && (
                              <div style={{ marginTop: 8 }}>
                                <input
                                  type="text"
                                  placeholder="Enter custom note"
                                  value={customOtherValue}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: "Other",
                                      [`${date}-other`]: e.target.value,
                                    })
                                  }
                                  style={field.input}
                                />
                              </div>
                            )}

                            {selectedNote === "Travel Time" && (
                              <div style={{ marginTop: 8 }}>
                                <label style={{ ...field.label, marginBottom: 6 }}>
                                  Travel duration
                                </label>
                                <select
                                  value={notesByDate[`${date}-travelMins`] || ""}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: "Travel Time",
                                      [`${date}-travelMins`]: e.target.value,
                                    })
                                  }
                                  style={field.input}
                                >
                                  <option value="">Select duration</option>
                                  {TRAVEL_DURATION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Column 3: Vehicles + Equipment */}
              <div style={card}>
                <h3 style={cardTitle}>Vehicles</h3>

                {Object.entries(vehicleGroups).map(([group, items]) => {
                  const isOpen = openVehicleGroups[group] || false;

                  return (
                    <div key={group} style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenVehicleGroups((prev) => ({
                            ...prev,
                            [group]: !prev[group],
                          }))
                        }
                        style={accordionBtn}
                      >
                        <span>
                          {isOpen ? "▼" : "►"} {group}
                        </span>
                        <span style={pill}>{items.length}</span>
                      </button>

                      {isOpen && (
                        <div style={{ padding: "10px 6px" }}>
                          {items.map((vehicle) => {
                            const key = canonicalVehicleKey(vehicle.name, vehicle.registration);

                            return (
                              <label
                                key={key || vehicle.name}
                                style={{ display: "block", marginBottom: 6 }}
                              >
                                <input
                                  type="checkbox"
                                  value={vehicle.name}
                                  checked={vehicles.includes(vehicle.name)}
                                  onChange={(e) =>
                                    setVehicles(
                                      e.target.checked
                                        ? [...vehicles, vehicle.name]
                                        : vehicles.filter((v) => v !== vehicle.name)
                                    )
                                  }
                                />{" "}
                                <span style={{ color: UI.text }}>
                                  {vehicle.name}
                                  {vehicle.registration ? ` – ${vehicle.registration}` : ""}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={divider} />

                <h3 style={cardTitle}>Equipment</h3>
                {Object.entries(equipmentGroups).map(([group, items]) => {
                  const isOpen = openEquipmentGroups[group] || false;
                  return (
                    <div key={group} style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenEquipmentGroups((prev) => ({
                            ...prev,
                            [group]: !prev[group],
                          }))
                        }
                        style={accordionBtn}
                      >
                        <span>
                          {isOpen ? "▼" : "►"} {group}
                        </span>
                        <span style={pill}>{items.length}</span>
                      </button>

                      {isOpen && (
                        <div style={{ padding: "10px 6px" }}>
                          {items.map((item) => (
                            <label key={item} style={{ display: "block", marginBottom: 6 }}>
                              <input
                                type="checkbox"
                                value={item}
                                checked={equipment.includes(item)}
                                onChange={(e) =>
                                  setEquipment(
                                    e.target.checked
                                      ? [...equipment, item]
                                      : equipment.filter((i) => i !== item)
                                  )
                                }
                              />{" "}
                              <span style={{ color: UI.text }}>{item}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Files & actions */}
            <div style={{ ...card, marginTop: 18 }}>
              <h3 style={cardTitle}>Files</h3>

              <label style={field.label}>Attach Quote (PDF)</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setQuoteFile(file || null);
                }}
                style={{ ...field.input, height: "auto", padding: 10 }}
              />

              {quoteProgress > 0 && quoteProgress < 100 && (
                <div style={{ marginTop: 8, fontSize: 12, color: UI.muted }}>
                  Uploading: {quoteProgress}%
                </div>
              )}

              {quoteUrl && (
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  <a href={quoteUrl} target="_blank" rel="noreferrer">
                    View attached PDF
                  </a>
                </div>
              )}

              <div style={actionsRow}>
                <button
                  type="submit"
                  disabled={!coreFilled}
                  title={saveTooltip}
                  style={{
                    ...btnPrimary,
                    opacity: coreFilled ? 1 : 0.5,
                    cursor: coreFilled ? "pointer" : "not-allowed",
                  }}
                >
                  {isNew ? "Save Maintenance" : "Update Maintenance"}
                </button>

                <button type="button" onClick={() => router.push("/dashboard")} style={btnGhost}>
                  Cancel
                </button>
              </div>
            </div>

            {/* Summary */}
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={summaryCard}>
                <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>
                  📋 Summary
                </h3>

                <div style={summaryRow}>
                  <div>Job Number</div>
                  <div>{jobNumber || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>Type</div>
                  <div>
                    {maintenanceType === "Other"
                      ? maintenanceTypeOther || "Other"
                      : maintenanceType || "—"}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Location</div>
                  <div>{location || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>Dates</div>
                  <div>
                    {useCustomDates
                      ? customDates.length
                        ? customDates.join(", ")
                        : "—"
                      : isRange
                      ? `${startDate || "—"} → ${endDate || "—"}`
                      : startDate || "—"}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Vehicles</div>
                  <div>{vehicles.join(", ") || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>Equipment</div>
                  <div>{equipment.join(", ") || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>PDF</div>
                  <div>{quoteUrl ? "Attached" : "—"}</div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
