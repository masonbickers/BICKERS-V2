"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { db, auth } from "../../../../firebaseConfig";
import {
doc, getDoc, getDocs, updateDoc, collection, addDoc,
} from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ── Per-item status helpers ────────────────────────────────────────────────
// ── Per-item status helpers ────────────────────────────────────────────────
const VEHICLE_STATUSES = [
  "Confirmed",
  "First Pencil",
  "Second Pencil",
  "Enquiry",
  "DNH",
  "Lost",
  "Postponed",
  "Cancelled",
];

const doesBlockStatus = (s = "") =>
  ["Confirmed", "First Pencil", "Second Pencil"].includes(s.trim());


// --- Normalisers (add just after imports) ---
// --- Normalisers (replace your current ones) ---
const normalizeVehicleList = (list) =>
  (Array.isArray(list) ? list : [])
    .map((v) => (typeof v === "string" ? v : v?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);

const normalizeEmployeeNames = (list) =>
  (Array.isArray(list) ? list : [])
    .map((e) => (typeof e === "string" ? e : e?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);

const normalizeEquipmentList = (list) =>
  (Array.isArray(list) ? list : [])
    .map((x) => (typeof x === "string" ? x : x?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);


    
/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens + shared styles (layout-only; no logic changed)
──────────────────────────────────────────────────────────────────────────── */
const UI = {
  radius: 10, radiusSm: 8, radiusXs: 6,
  shadow: "0 6px 18px rgba(0,0,0,0.08)",
  border: "1px solid #e5e7eb",
  bg: "#ffffff", bgAlt: "#f8fafc", text: "#111827", muted: "#6b7280",
};

// page/container sizing
const pageWrap = {
  display: "flex",
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: "#f1f5f9",
};

// ✅ keep the content inside the layout’s “page section”
const mainWrap = {
  flex: 1,
  color: UI.text,
  // clamp width to your content area (adjust 1040 if your section is narrower/wider)
  maxWidth: 1600,
  // center it
  margin: "0 auto",
  // a bit tighter padding so it never hits the edges
  padding: "20px 24px",
};

const h1Style = { color: UI.text, marginBottom: 12, fontSize: 26, fontWeight: 800, letterSpacing: 0.2 };

// ✅ grid snaps to 1/2/3 columns automatically and stays inside the section
// was: "repeat(auto-fit, minmax(300px, 1fr))"
const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", // ← wider cards
  gap: 16,
  marginTop: 8,
};

const card      = { background: UI.bg, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadow, padding: 16 };
const cardTitle = { margin: "0 0 10px", fontSize: 15, fontWeight: 700 };

const field = {
  label: { display: "block", fontWeight: 600, marginBottom: 6, color: UI.text },
  input: { width: "100%", height: 38, padding: "8px 10px", fontSize: 14, borderRadius: UI.radiusXs, border: "1px solid #d1d5db", background: "#fff" },
  textarea: { width: "100%", minHeight: 80, padding: "10px 12px", fontSize: 14, borderRadius: UI.radiusXs, border: "1px solid #d1d5db", background: "#fff" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 8 },
};

const accordionBtn = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  width: "100%", padding: "8px 10px", borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db", background: UI.bgAlt, cursor: "pointer", fontWeight: 700
};

const pill     = { display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", fontSize: 12, borderRadius: 999, background: "#e5e7eb", border: "1px solid #d1d5db" };
const divider  = { height: 1, background: "#e5e7eb", margin: "12px 0" };
const actionsRow = { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 };

const btn       = { padding: "9px 13px", borderRadius: UI.radiusXs, border: "1px solid #111", cursor: "pointer", fontWeight: 700 };
const btnPrimary = { ...btn, background: "#111", color: "#fff" };
const btnGhost   = { ...btn, background: "#fff", color: "#111" };

// ✅ summary won’t overflow; sticks within the section with safe offset
const summaryCard = {
  ...card,
  position: "sticky",
  top: 12,                // was 20
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
   Time helpers (unchanged)
──────────────────────────────────────────────────────────────────────────── */
const buildTimeOptions = () => {
  const out = [];
  for (let h = 0; h < 24; h++) for (const m of [0, 15, 30, 45]) out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  return out;
};
const TIME_OPTIONS = buildTimeOptions();
const buildTravelDurationOptions = () => {
  const out = [];
  for (let mins = 15; mins <= 360; mins += 15) {
    const h = Math.floor(mins / 60), m = mins % 60;
    out.push({ value: String(mins), label: h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m` });
  }
  return out;
};
const TRAVEL_DURATION_OPTIONS = buildTravelDurationOptions();
const labelFromMins = (mins) => {
  const n = Number(mins) || 0, h = Math.floor(n / 60), m = n % 60;
  if (!n) return "—"; return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};



/* ────────────────────────────────────────────────────────────────────────────
   Blocking helpers (unchanged)
──────────────────────────────────────────────────────────────────────────── */
const BLOCKING_STATUSES = ["Confirmed", "First Pencil", "Second Pencil"];
const doesBlock = (b) => BLOCKING_STATUSES.includes((b.status || "").trim());
const datesOverlap = (aStart, aEnd, bStart, bEnd) =>
  aStart && aEnd && bStart && bEnd && !(aEnd < bStart || aStart > bEnd);
const getBookingSpan = (b) => {
  const s = (b.startDate || b.date || "").slice(0, 10) || null;
  const e = (b.endDate || b.date || "").slice(0, 10) || s;
  return [s, e];
};

export default function CreateBookingPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id;

  // state (unchanged logic)
  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);
  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employees, setEmployees] = useState([]);
  const [customEmployee, setCustomEmployee] = useState("");
  const [vehicles, setVehicles] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [vehicleStatus, setVehicleStatus] = useState({});
  const [isSecondPencil, setIsSecondPencil] = useState(false);
  const [isCrewed, setIsCrewed] = useState(false);
  const [notes, setNotes] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [status, setStatus] = useState("Confirmed");
  const [shootType, setShootType] = useState("Day");
  const [notesByDate, setNotesByDate] = useState({});
  const [freelancerList, setFreelancerList] = useState([]);
  const [employeeList, setEmployeeList] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState({
    "Bike":[], "Electric Tracking Vehicles":[],
    "Small Tracking Vehicles":[], "Large Tracking Vehicles":[],
    "Low Loaders":[], "Transport Lorry":[], "Transport Van":[], "Other Vehicles":[]
  });
  const [openGroups, setOpenGroups] = useState({
    "Small Tracking Vehicles": false, "Large Tracking Vehicles": false,
    "Low Loaders": false, "Transport Lorry": false,
    "Transport Van": false, "Other Vehicles": false, "Bike": false, "Electric Tracking Vehicles": false,
  });

  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [openEquipGroups, setOpenEquipGroups] = useState({});
  const [allEquipmentNames, setAllEquipmentNames] = useState([]);


  // NEW: auto-open equipment groups that contain a selected item
useEffect(() => {
  const next = { ...openEquipGroups };
  Object.entries(equipmentGroups).forEach(([group, items]) => {
    const hasSelected = items?.some((name) => equipment.includes(name));
    if (hasSelected) next[group] = true;
  });
  setOpenEquipGroups(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [equipmentGroups, equipment]);


  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [statusReasons, setStatusReasons] = useState([]);
  const [statusReasonOther, setStatusReasonOther] = useState("");

  const [hasHotel, setHasHotel] = useState(false);
  const [callTime, setCallTime] = useState("");
  const [hasRiggingAddress, setHasRiggingAddress] = useState(false);
  const [riggingAddress, setRiggingAddress] = useState("");

  // load data (unchanged logic)
  useEffect(() => {
    const loadData = async () => {
      const [bookingSnap, holidaySnap, empSnap, vehicleSnap, equipSnap] = await Promise.all([
        getDocs(collection(db, "bookings")),
        getDocs(collection(db, "holidays")),
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "vehicles")),
        getDocs(collection(db, "equipment")),
      ]);

      const bookings = bookingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllBookings(bookings);
      setHolidayBookings(holidaySnap.docs.map(doc => doc.data()));

      const allEmployees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployeeList(
        allEmployees
          .filter(emp =>
            Array.isArray(emp.jobTitle)
              ? emp.jobTitle.some(j => j?.toLowerCase() === "driver")
              : (emp.jobTitle || "").toLowerCase() === "driver"
          )
          .map(emp => ({ id: emp.id, name: emp.name || emp.fullName || emp.id, jobTitle: emp.jobTitle }))
      );
      setFreelancerList(
        allEmployees
          .filter(emp => {
            const titles = Array.isArray(emp.jobTitle)
              ? emp.jobTitle.map(j => (j || "").toLowerCase())
              : [(emp.jobTitle || "").toLowerCase()];
            return titles.includes("freelancer") || titles.includes("freelance");
          })
          .map(emp => ({ id: emp.id, name: emp.name || emp.fullName || emp.id, jobTitle: emp.jobTitle }))
      );

      const grouped = {
        "Bike": [], "Electric Tracking Vehicles": [],
        "Small Tracking Vehicles": [], "Large Tracking Vehicles": [],
        "Low Loaders": [], "Transport Lorry": [], "Transport Van": [], "Other Vehicles": []
      };
      vehicleSnap.docs.forEach(doc => {
        const v = doc.data();
        const category = (v.category || "").trim().toLowerCase();
        const name = v.name?.trim(); const registration = v.registration?.trim();
        if (!name) return;
        const info = { name, registration };
        if (category.includes("bike")) grouped["Bike"].push(info);
        else if (category.includes("electric")) grouped["Electric Tracking Vehicles"].push(info);
        else if (category.includes("small")) grouped["Small Tracking Vehicles"].push(info);
        else if (category.includes("large")) grouped["Large Tracking Vehicles"].push(info);
        else if (category.includes("low loader")) grouped["Low Loaders"].push(info);
        else if (category.includes("lorry")) grouped["Transport Lorry"].push(info);
        else if (category.includes("van")) grouped["Transport Van"].push(info);
        else grouped["Other Vehicles"].push(info);
      });
      setVehicleGroups(grouped);

      if (bookingId) {
        const ref = doc(db, "bookings", bookingId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const b = snap.data();
          setJobNumber(b.jobNumber || "");
          setClient(b.client || "");
          setContactEmail(b.contactEmail || "");
          setContactNumber(b.contactNumber || "");
          setLocation(b.location || "");
          setIsRange(!!b.startDate && !!b.endDate);
          setStartDate((b.startDate || b.date || "").slice(0, 10));
          setEndDate((b.endDate || "").slice(0, 10));
          setStatusReasons(b.statusReasons || []);
          setStatusReasonOther(b.statusReasonOther || "");
          setEmployees((b.employees || []).map(e => (typeof e === "string" ? { role: "Precision Driver", name: e } : e)));
setVehicles(normalizeVehicleList(b.vehicles || []));
    setEquipment(normalizeEquipmentList(b.equipment || []));
    setVehicleStatus(b.vehicleStatus || {});


          setIsSecondPencil(!!b.isSecondPencil);
          setNotes(b.notes || "");
          setNotesByDate(b.notesByDate || {});
          setStatus(b.status || "Confirmed");
          setShootType(b.shootType || "Day");
          setIsCrewed(!!b.isCrewed);
          setHasHS(!!b.hasHS);
          setHasRiskAssessment(!!b.hasRiskAssessment);
          setHasHotel(!!b.hasHotel);
          setCallTime(b.callTime || "");
          setHasRiggingAddress(!!b.hasRiggingAddress);
          setRiggingAddress(b.riggingAddress || "");
        }
      }

      const groupedEquip = {};
      equipSnap.docs.forEach(docu => {
        const e = docu.data();
        const cat = (e.category || "Other").trim();
        const nm = e.name?.trim();
        if (!nm) return;
        if (!groupedEquip[cat]) groupedEquip[cat] = [];
        groupedEquip[cat].push(nm);
      });
      setEquipmentGroups(groupedEquip);
      const openEquip = {};
      Object.keys(groupedEquip).forEach(k => (openEquip[k] = false));
      setOpenEquipGroups(openEquip);
      setAllEquipmentNames(
  Object.values(groupedEquip)
    .flat()
    .map((s) => String(s || "").trim())
);



    };
    loadData();
  }, [bookingId]);

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
const toggleVehicle = (name, checked) => {
  setVehicles(prev => (checked ? uniq([...prev, name]) : prev.filter(v => v !== name)));
  setVehicleStatus(prev => {
    const next = { ...prev };
    if (checked) {
      if (!next[name]) next[name] = status; // inherit booking-level status by default
    } else {
      delete next[name];
    }
    return next;
  });
};

// --- Legacy/missing equipment helpers (items that were saved but are no longer in the master list)
const missingEquipment = equipment.filter(
  (n) => !allEquipmentNames.includes(String(n || "").trim())
);

const removeEquipment = (name) => {
  const key = String(name || "").trim();
  setEquipment((prev) => prev.filter((x) => x !== key));
};

const remapEquipment = (oldName, newName) => {
  const oldKey = String(oldName || "").trim();
  const newKey = String(newName || "").trim();
  setEquipment((prev) => {
    const next = prev.filter((x) => x !== oldKey);
    if (newKey && !next.includes(newKey)) next.push(newKey);
    return next;
  });
};


  const isEmployeeOnHoliday = (employeeName) => {
    const selectedStart = new Date(startDate);
    const selectedEnd = isRange ? new Date(endDate) : selectedStart;
    return holidayBookings.some(h => {
      if (h.employee !== employeeName) return false;
      const hs = new Date(h.startDate), he = new Date(h.endDate);
      return (selectedStart >= hs && selectedStart <= he) ||
             (selectedEnd   >= hs && selectedEnd   <= he) ||
             (selectedStart <= hs && selectedEnd   >= he);
    });
  };

// --- Overlap window for current selection ---
const selStart = startDate;
const selEnd   = isRange && endDate ? endDate : startDate;

// --- Only relevant overlapping bookings (excluding self) ---
const overlapping = allBookings.filter((b) => {
  if (bookingId && b.id === bookingId) return false;
  if (!selStart) return false;
  const [bStart, bEnd] = getBookingSpan(b);
  if (!bStart || !bEnd) return false;
  return datesOverlap(selStart, selEnd, bStart, bEnd);
});

// --- Normalised conflict lists ---
// Per-vehicle blocking using each booking's vehicleStatus map (fallback to booking.status)
// Per-vehicle blocking using each booking's vehicleStatus map (fallback to booking.status)
const bookedVehicles = overlapping.flatMap((b) => {
  const names = normalizeVehicleList(b.vehicles || []);
  const vmap  = b.vehicleStatus || {};
  return names.filter((nm) => {
    const itemStatus = (vmap && vmap[nm]) != null ? vmap[nm] : (b.status || "");
    return doesBlockStatus(String(itemStatus).trim());
  });
});

const heldVehicles = overlapping.flatMap((b) => {
  const names = normalizeVehicleList(b.vehicles || []);
  const vmap  = b.vehicleStatus || {};
  return names.filter((nm) => {
    const itemStatus = (vmap && vmap[nm]) != null ? vmap[nm] : (b.status || "");
    return !doesBlockStatus(String(itemStatus).trim());
  });
});



const bookedEmployees = overlapping
  .filter(doesBlock)
  .flatMap((b) => normalizeEmployeeNames(b.employees || []));

const heldEmployees = overlapping
  .filter((b) => !doesBlock(b))
  .flatMap((b) => normalizeEmployeeNames(b.employees || []));

  // NEW: equipment conflicts (mirrors vehicles)
const bookedEquipment = overlapping
  .filter(doesBlock)
  .flatMap((b) => normalizeEquipmentList(b.equipment || []));

const heldEquipment = overlapping
  .filter((b) => !doesBlock(b))
  .flatMap((b) => normalizeEquipmentList(b.equipment || []));


  const handleSubmit = async () => {
    if (status !== "Enquiry") {
      if (!startDate) return alert("Please select a start date.");
      if (isRange && !endDate) return alert("Please select an end date.");
    }
    const needsReason = ["Lost", "Postponed", "Cancelled"].includes(status);
    if (needsReason) {
      if (!statusReasons.length) return alert("Please choose at least one reason.");
      if (statusReasons.includes("Other") && !statusReasonOther.trim()) return alert("Please enter the 'Other' reason.");
    }

    const customNames = customEmployee ? customEmployee.split(",").map(n => n.trim()).filter(Boolean) : [];
    const cleanedEmployees = [
      ...employees.filter(e => e.name !== "Other"),
      ...customNames.map(n => ({ role: "Precision Driver", name: n })),
    ];
    for (const employee of cleanedEmployees) {
      if (isEmployeeOnHoliday(employee.name)) {
        alert(`${employee.name} is on holiday during the selected dates.`);
        return;
      }
    }

    let bookingDates = [];
    if (status !== "Enquiry") {
      if (isRange && startDate && endDate) {
        const current = new Date(startDate);
        const stop = new Date(endDate);
        while (current <= stop) {
          bookingDates.push(current.toISOString().split("T")[0]);
          current.setDate(current.getDate() + 1);
        }
      } else if (startDate) {
        bookingDates = [new Date(startDate).toISOString().split("T")[0]];
      }
    }

    let pdfURL = null;
    if (pdfFile) {
      const storage = getStorage();
      const storageRef = ref(storage, `booking_pdfs/${Date.now()}_${pdfFile.name}`);
      const snapshot = await uploadBytes(storageRef, pdfFile);
      pdfURL = await getDownloadURL(snapshot.ref);
    }

    const filteredNotesByDate = {};
    bookingDates.forEach((date) => {
      filteredNotesByDate[date] = notesByDate[date] || "";
      if (typeof notesByDate[`${date}-other`] !== "undefined") filteredNotesByDate[`${date}-other`] = notesByDate[`${date}-other`];
      if (typeof notesByDate[`${date}-travelMins`] !== "undefined") filteredNotesByDate[`${date}-travelMins`] = notesByDate[`${date}-travelMins`];
    });

    const user = auth.currentUser;
    const payload = {
      jobNumber, client, contactNumber, contactEmail, location,
      employees: cleanedEmployees, vehicles,  vehicleStatus, equipment,
      isSecondPencil, isCrewed, hasHS, hasRiskAssessment, notes,
      notesByDate: filteredNotesByDate, status, bookingDates, shootType,
      pdfURL: pdfURL || null, hasHotel, callTime: callTime || "",
      hasRiggingAddress, riggingAddress: hasRiggingAddress ? (riggingAddress || "") : "",
      ...(["Lost","Postponed","Cancelled"].includes(status) && {
        statusReasons, statusReasonOther: statusReasons.includes("Other") ? statusReasonOther.trim() : "",
      }),
      ...(status !== "Enquiry"
        ? (isRange
            ? { startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), date: null }
            : { date: new Date(startDate).toISOString(), startDate: null, endDate: null })
        : {}),
      lastEditedBy: user?.email || "Unknown",
      updatedAt: new Date().toISOString(),
    };

    try {
      if (bookingId) {
        await updateDoc(doc(db, "bookings", bookingId), payload);
      } else {
        await addDoc(collection(db, "bookings"), payload);
      }
      alert(bookingId ? "Booking Updated ✅" : "Booking Saved ✅");
      router.back();
    } catch (err) {
      console.error("❌ Error saving booking:", err);
      alert("Failed to save booking ❌\n\n" + err.message);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={mainWrap}>
          <h1 style={h1Style}>{bookingId ? "✏️ Edit Booking" : "➕ Create New Booking"}</h1>

          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <div style={sectionGrid}>
              {/* Column 1: Job Info */}
              <div style={card}>
                <h3 style={cardTitle}>Job Info</h3>

                <label style={field.label}>Job Number</label>
                <input
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  required
                  style={{
                    ...field.input,
                    backgroundColor: bookingId ? "#f3f4f6" : "#fff",
                    color: bookingId ? UI.muted : UI.text,
                    cursor: bookingId ? "not-allowed" : "text",
                  }}
                />

                <label style={field.label}>Status</label>
                <select
                  value={status}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStatus(next);
                    if (!["Lost", "Postponed", "Cancelled"].includes(next)) {
                      setStatusReasons([]);
                      setStatusReasonOther("");
                    }
                  }}
                  style={field.input}
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="First Pencil">First Pencil</option>
                  <option value="Second Pencil">Second Pencil</option>
                  <option value="Enquiry">Enquiry</option>
                  <option value="DNH">DNH</option>
                  <option value="Lost">Lost</option>
                  <option value="Postponed">Postponed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>

                {["Lost","Postponed","Cancelled"].includes(status) && (
                  <div style={{ border: UI.border, borderRadius: UI.radiusSm, padding:12, marginTop: -6, marginBottom: 12, background: UI.bgAlt }}>
                    <h4 style={{ margin:"0 0 10px" }}>Reason</h4>
                    {["Cost", "Weather", "Competitor", "DNH", "Other"].map((r) => (
                      <label key={r} style={{ display:"inline-flex", alignItems:"center", gap:8, marginRight: 16, marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          checked={statusReasons.includes(r)}
                          onChange={() => setStatusReasons((prev) => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                        />
                        {r}
                      </label>
                    ))}
                    {statusReasons.includes("Other") && (
                      <div style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          placeholder="Other reason..."
                          value={statusReasonOther}
                          onChange={(e) => setStatusReasonOther(e.target.value)}
                          style={field.input}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div style={divider} />

                <label style={field.label}>Shoot Type</label>
                <select value={shootType} onChange={(e) => setShootType(e.target.value)} style={field.input}>
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>

                <label style={field.label}>Production</label>
                <textarea value={client} onChange={(e) => setClient(e.target.value)} style={field.textarea} />

                <label style={field.label}>Contact Email</label>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={field.input} />

                <label style={field.label}>Contact Number</label>
                <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} style={field.input} />

                <label style={field.label}>Location</label>
                <textarea value={location} onChange={(e) => setLocation(e.target.value)} style={field.textarea} />
              </div>

              {/* Column 2: Dates + People */}
              <div style={card}>
                <h3 style={cardTitle}>Dates & People</h3>

                <div style={field.checkboxRow}>
                  <input type="checkbox" checked={isRange} onChange={() => setIsRange(!isRange)} />
                  <span>Multi-day booking</span>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:isRange ? "1fr 1fr" : "1fr", gap:12 }}>
                  <div>
                    <label style={field.label}>{isRange ? "Start Date" : "Date"}</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={field.input} />
                  </div>
                  {isRange && (
                    <div>
                      <label style={field.label}>End Date</label>
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={field.input} />
                    </div>
                  )}
                </div>

                {startDate && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin:"8px 0" }}>{isRange ? "Notes for Each Day" : "Note for the Day"}</h4>
                    {(() => {
                      const days = [];
                      const start = new Date(startDate);
                      const end = isRange && endDate ? new Date(endDate) : start;
                      const curr = new Date(start);
                      while (curr <= end) {
                        const d = curr.toISOString().split("T")[0];
                        days.push(d);
                        curr.setDate(curr.getDate() + 1);
                      }
                      return (
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:12 }}>

                          {days.map((date) => {
                            const selectedNote = notesByDate[date] || "";
                            const isOther = selectedNote === "Other";
                            const customNote = notesByDate[`${date}-other`] || "";
                            return (
                              <div key={date} style={{ border:UI.border, borderRadius:UI.radiusSm, padding:10, background:UI.bgAlt }}>
                                <div style={{ fontWeight:700, marginBottom:8 }}>{new Date(date).toDateString()}</div>
                                <select
                                  value={selectedNote}
                                  onChange={(e) => setNotesByDate({ ...notesByDate, [date]: e.target.value })}
                                  style={field.input}
                                >
                                  <option value="">Select note</option>
                                  <option value="1/2 Day Travel">1/2 Day Travel</option>
                                  <option value="Night Shoot">Night Shoot</option>
                                  <option value="On Set">Shoot Day</option>
                                  <option value="Other">Other</option>
                                  <option value="Rehearsal Day">Rehearsal Day</option>
                                  <option value="Rest Day">Rest Day</option>
                                  <option value="Rig Day">Rig Day</option>
                                  <option value="Standby Day">Standby Day</option>
                                  <option value="Spilt Day">Spilt Day</option>
                                  <option value="Travel Day">Travel Day</option>
                                  <option value="Travel Time">Travel Time</option>
                                  <option value="Turnaround Day">Turnaround Day</option>
                                  <option value="Recce Day">Recce Day</option>
                                </select>

                                {isOther && (
                                  <div style={{ marginTop: 8 }}>
                                    <input
                                      type="text"
                                      placeholder="Enter custom note"
                                      value={customNote}
                                      onChange={(e) => setNotesByDate({ ...notesByDate, [date]: "Other", [`${date}-other`]: e.target.value })}
                                      style={field.input}
                                    />
                                  </div>
                                )}

                                {selectedNote === "Travel Time" && (
                                  <div style={{ marginTop: 8 }}>
                                    <label style={{ ...field.label, marginBottom: 6 }}>Travel duration</label>
                                    <select
                                      value={notesByDate[`${date}-travelMins`] || ""}
                                      onChange={(e) => setNotesByDate({ ...notesByDate, [date]: "Travel Time", [`${date}-travelMins`]: e.target.value })}
                                      style={field.input}
                                    >
                                      <option value="">Select duration</option>
                                      {TRAVEL_DURATION_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div style={divider} />

                <h4 style={{ margin:"8px 0" }}>Precision Driver</h4>
                {[...employeeList, { id: "other", name: "Other" }].map(emp => {
                  const name = emp.name;
                  const isBooked  = bookedEmployees.includes(name);
                  const isHeld    = typeof heldEmployees !== "undefined" && heldEmployees.includes(name);
                  const isHoliday = isEmployeeOnHoliday(name);
                  const disabled  = isBooked || isHoliday || isCrewed;
                  return (
                    <label key={emp.id || name} style={{ display:"block", marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        value={name}
                        disabled={disabled}
                        checked={employees.some(e => e.name === name && e.role === "Precision Driver")}
                        onChange={(e) => setEmployees(
                          e.target.checked
                            ? [...employees, { role: "Precision Driver", name }]
                            : employees.filter(sel => !(sel.name === name && sel.role === "Precision Driver"))
                        )}
                      />{" "}
                      <span style={{ color: disabled ? "#9ca3af" : UI.text }}>
                        {name} {isBooked && "(Booked)"} {!isBooked && isHeld && "(Held)"} {isHoliday && "(On Holiday)"}
                      </span>
                    </label>
                  );
                })}

                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <label style={{ fontWeight: 700 }}>
                    <input type="checkbox" checked={isCrewed} onChange={(e) => setIsCrewed(e.target.checked)} /> Booking Crewed
                  </label>
                </div>

                <h4 style={{ margin:"8px 0" }}>Freelancers</h4>
                {[...freelancerList, { id: "other", name: "Other" }].map(emp => {
                  const name = emp.name || emp;
                  const isBooked = bookedEmployees.includes(name);
                  const isHoliday = isEmployeeOnHoliday(name);
                  const disabled = isBooked || isHoliday;
                  return (
                    <label key={emp.id || name} style={{ display:"block", marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        value={name}
                        disabled={disabled}
                        checked={employees.some(e => e.name === name && e.role === "Freelancer")}
                        onChange={(e) => setEmployees(
                          e.target.checked
                            ? [...employees, { role: "Freelancer", name }]
                            : employees.filter(sel => !(sel.name === name && sel.role === "Freelancer"))
                        )}
                      />{" "}
                      <span style={{ color: disabled ? "#9ca3af" : UI.text }}>
                        {name} {isBooked && "(Booked)"} {isHoliday && "(On Holiday)"}
                      </span>
                    </label>
                  );
                })}

                {employees.some(e => e.name === "Other") && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="Other employee(s), comma-separated"
                      value={customEmployee}
                      onChange={(e) => setCustomEmployee(e.target.value)}
                      style={{ ...field.input, marginBottom: 8 }}
                    />
                    {customEmployee.split(",").map(n => n.trim()).filter(Boolean).map(name => (
                      <label key={name} style={{ display:"block", marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={employees.some(e => e.role === "Precision Driver" && e.name === name)}
                          onChange={(e) => {
                            setEmployees(e.target.checked
                              ? [...employees, { role:"Precision Driver", name }]
                              : employees.filter(x => !(x.role === "Precision Driver" && x.name === name))
                            );
                          }}
                        />{" "}
                        <span>{name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Column 3: Vehicles + Equipment */}
              <div style={card}>
                <h3 style={cardTitle}>Vehicles</h3>
{Object.entries(vehicleGroups).map(([group, items]) => {
  const isOpen = openGroups[group] || false;

  return (
    <div key={group} style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))}
        style={accordionBtn}
      >
        <span>{isOpen ? "▼" : "►"} {group}</span>
        <span style={pill}>{items.length}</span>
      </button>

      {isOpen && (
        <div style={{ padding: "10px 6px" }}>
{items.map((vehicle) => {
  const name       = vehicle.name;
  const isBooked   = bookedVehicles.includes(name);
  const isHeld     = heldVehicles.includes(name);
  const isSelected = vehicles.includes(name);

  // grey out + disable when booked (unless it's already selected on this booking)
  const disabled = isBooked && !isSelected;

  return (
    <div
      key={name}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        opacity: disabled ? 0.55 : 1,          // ← greyed out row
        cursor: disabled ? "not-allowed" : "", // ← like employees
      }}
      title={disabled ? "Booked on overlapping job" : ""}
    >
      <input
        type="checkbox"
        checked={isSelected}
        disabled={disabled}
        onChange={(e) => toggleVehicle(name, e.target.checked)}
      />
      <span style={{ flex: 1, color: disabled ? "#6e6f70ff" : UI.text }}>
        {vehicle.name}{vehicle.registration ? ` – ${vehicle.registration}` : ""}
        {isBooked && " (Booked)"} {!isBooked && isHeld && " (Held)"}
      </span>

      {isSelected && (
        <select
          value={vehicleStatus[name] || status}
          onChange={(e) => setVehicleStatus((prev) => ({ ...prev, [name]: e.target.value }))}
          style={{ height: 32 }}
          title="Vehicle status"
        >
          {VEHICLE_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
    </div>
  );
})}

        </div>
      )}
    </div>
  );
})}


                <div style={divider} />

{/* NEW: Legacy equipment (selected on this booking but not in current master list) */}
{missingEquipment.length > 0 && (
  <div style={{ ...card, borderColor: "#f59e0b", background: "#FFFBEB", marginTop: 10 }}>
    <h4 style={{ margin: "0 0 8px" }}>Legacy equipment (renamed or deleted)</h4>
    <p style={{ marginTop: 0, color: "#92400e" }}>
      These items are saved on this booking but aren’t in the current equipment list. Remove or remap them:
    </p>
    {missingEquipment.map((old) => (
      <div key={old} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <span style={pill}>{old}</span>
        <button
          type="button"
          onClick={() => removeEquipment(old)}
          style={{ ...btn, padding: "6px 10px" }}
          title="Remove from this booking"
        >
          Remove
        </button>
        <select
          defaultValue=""
          onChange={(e) => e.target.value && remapEquipment(old, e.target.value)}
          style={{ ...field.input, width: 320, height: 34 }}
          title="Remap to a current equipment name"
        >
          <option value="">Remap to…</option>
          {allEquipmentNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
    ))}
  </div>
)}


<h3 style={cardTitle}>Equipment</h3>


{Object.entries(equipmentGroups).map(([group, items]) => {
  const isOpen = openEquipGroups[group] || false;

  return (
    <div key={group} style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() =>
          setOpenEquipGroups((prev) => ({ ...prev, [group]: !prev[group] }))
        }
        style={accordionBtn}
      >
        <span>{isOpen ? "▼" : "►"} {group}</span>
        <span style={pill}>{items.length}</span>
      </button>

      {isOpen && (
        <div style={{ padding: "10px 6px" }}>
{items.map((rawName) => {
  const name = String(rawName || "").trim();   // 🔧 trim for safety
  const isBooked   = bookedEquipment.includes(name);
  const isHeld     = heldEquipment.includes(name);
  const isSelected = equipment.includes(name);
  const disabled   = isBooked && !isSelected; // allow changing current selection

  return (
    <label key={name} style={{ display: "block", marginBottom: 6 }}>
      <input
        type="checkbox"
        value={name}
        disabled={disabled}
        checked={isSelected}
        onChange={(e) => {
          if (e.target.checked) {
            setEquipment((prev) => Array.from(new Set([...prev, name])));
          } else {
            setEquipment((prev) => prev.filter((x) => x !== name));
          }
        }}
      />{" "}
      <span style={{ color: disabled ? "#9ca3af" : UI.text }}>
        {name}
        {isBooked && " (Booked)"} {!isBooked && isHeld && " (Held)"}
      </span>
    </label>
  );
})}

        </div>
      )}
    </div>
  );
})}


              </div>


            </div>

            {/* Notes + file upload (separate card) */}
            <div style={{ ...card, marginTop: 18 }}>
              <h3 style={cardTitle}>Files & Notes</h3>

              <label style={field.label}>Attach Quote PDF</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdfFile(e.target.files[0])}
                style={{ ...field.input, height: "auto", padding: 10 }}
              />

              <div style={{ marginTop: 14 }} />
              <label style={field.label}>Additional Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={field.textarea}
                placeholder="Anything extra to include for this booking..."
              />

              <div style={divider} />

              <label style={field.checkboxRow}>
                <input type="checkbox" checked={hasHS} onChange={(e) => setHasHS(e.target.checked)} />
                Health & Safety Completed
              </label>
              <label style={field.checkboxRow}>
                <input type="checkbox" checked={hasRiskAssessment} onChange={(e) => setHasRiskAssessment(e.target.checked)} />
                Risk Assessment Completed
              </label>
              <label style={field.checkboxRow}>
                <input type="checkbox" checked={hasHotel} onChange={(e) => setHasHotel(e.target.checked)} />
                Hotel Booked
              </label>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop: 8 }}>
                <div>
                  <label style={field.label}>Call Time</label>
                  <select value={callTime} onChange={(e) => setCallTime(e.target.value)} style={field.input}>
                    <option value="">-- Select time --</option>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label style={field.label}>Rigging Address</label>
                  <div style={field.checkboxRow}>
                    <input type="checkbox" checked={hasRiggingAddress} onChange={(e) => setHasRiggingAddress(e.target.checked)} />
                    Add Rigging Address
                  </div>
                  {hasRiggingAddress && (
                    <textarea
                      value={riggingAddress}
                      onChange={(e) => setRiggingAddress(e.target.value)}
                      rows={3}
                      style={field.textarea}
                      placeholder="Enter rigging address..."
                    />
                  )}
                </div>
              </div>

              

              <div style={actionsRow}>
                <button type="submit" style={btnPrimary}>{bookingId ? "Update Booking" : "Save Booking"}</button>
                <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
              </div>

              
            </div>

                          {/* Summary (full-width row, sticky) */}
              <div style={{ gridColumn:"1 / -1" }}>
                <div style={summaryCard}>
                  <h3 style={{ margin:"0 0 10px", fontSize:16, fontWeight:800 }}>📋 Summary</h3>
                  <div style={summaryRow}><div>Job Number</div><div>{jobNumber || "—"}</div></div>
                  <div style={summaryRow}><div>Status</div><div>{status || "—"}</div></div>
                  <div style={summaryRow}><div>Shoot Type</div><div>{shootType || "—"}</div></div>
                  <div style={summaryRow}><div>Client</div><div>{client || "—"}</div></div>
                  <div style={summaryRow}><div>Contact</div><div>{contactEmail || "—"}{contactNumber ? ` • ${contactNumber}` : ""}</div></div>
                  <div style={summaryRow}><div>Location</div><div>{location || "—"}</div></div>
                  <div style={summaryRow}><div>Dates</div><div>{isRange ? `${startDate || "—"} → ${endDate || "—"}` : (startDate || "—")}</div></div>
                  <div style={summaryRow}><div>Drivers</div><div>{employees.filter(e=>e.role==="Precision Driver").map(e=>e.name).join(", ") || "—"}</div></div>
                  <div style={summaryRow}><div>Freelancers</div><div>{employees.filter(e=>e.role==="Freelancer").map(e=>e.name).join(", ") || "—"}</div></div>
  <div style={summaryRow}>
  <div>Vehicles</div>
  <div>
    {Object.values(vehicleGroups).flat()
      .filter(v => vehicles.includes(v.name))
      .map(v => {
        const vs = vehicleStatus[v.name] || status; // inherit if not overridden
        const label = v.registration ? `${v.name} – ${v.registration}` : v.name;
        return (
          <span key={v.name} style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid #d1d5db",
            borderRadius: 999,
            padding: "2px 8px",
            marginRight: 6,
            marginBottom: 6
          }}>
            {label} • {vs}
          </span>
        );
      })}
    {vehicles.length === 0 && "—"}
  </div>
</div>

                  <div style={summaryRow}><div>Equipment</div><div>{equipment.join(", ") || "—"}</div></div>
                  <div style={summaryRow}><div>Hotel / CT</div><div>{hasHotel ? "Hotel ✓" : "Hotel ✗"}{callTime ? ` • ${callTime}` : ""}</div></div>
                  {hasRiggingAddress && <div style={summaryRow}><div>Rigging Address</div><div>{riggingAddress || "—"}</div></div>}
                </div>
              </div>
          </form>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
