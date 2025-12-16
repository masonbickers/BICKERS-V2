"use client";

import { useState, useEffect } from "react";
import { db } from "../../../firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DatePicker from "react-multi-date-picker";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage, auth } from "../../../firebaseConfig";

/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens + shared styles (layout-only; no logic changed)
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

// ✅ grid snaps to 1/2/3 columns automatically and stays inside the section
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

// ✅ summary won’t overflow; sticks within the section with safe offset
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

/* ────────────────────────────────────────────────────────────────────────────
   Travel helpers
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
const labelFromMins = (mins) => {
  const n = Number(mins) || 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!n) return "—";
  return h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

/* ────────────────────────────────────────────────────────────────────────────
   Blocking helpers
──────────────────────────────────────────────────────────────────────────── */
const BLOCKING_STATUSES = ["Confirmed", "First Pencil", "Second Pencil"];
const doesBlock = (b) => BLOCKING_STATUSES.includes((b.status || "").trim());
const anyDateOverlap = (datesA, datesB) => {
  if (!Array.isArray(datesA) || !Array.isArray(datesB)) return false;
  const setA = new Set(datesA);
  return datesB.some((d) => setA.has(d));
};
const expandBookingDates = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length)
    return b.bookingDates;
  const one = (b.date || "").slice(0, 10);
  const start = (b.startDate || "").slice(0, 10);
  const end = (b.endDate || "").slice(0, 10);
  if (one) return [one];
  if (start && end) {
    return enumerateDaysYMD_UTC(start, end);
  }
  return [];
};

/* ────────────────────────────────────────────────────────────────────────────
   Date & vehicle key helpers for maintenance bookings
──────────────────────────────────────────────────────────────────────────── */
const toJsDate = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  // Firestore Timestamp
  if (typeof raw?.toDate === "function") return raw.toDate();
  const s = String(raw);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
};

/** Prefer registration, else name; all lowercased + trimmed */
const canonicalVehicleKey = (name, registration) => {
  const reg = (registration || "").trim().toLowerCase();
  const nm = (name || "").trim().toLowerCase();
  return reg || nm || null;
};

/* ────────────────────────────────────────────────────────────────────────────
   Contacts helpers
──────────────────────────────────────────────────────────────────────────── */
const FILM_DEPARTMENTS = [
  "Production",
  "Director",
  "Assistant Director",
  "Locations",
  "Art Department",
  "Camera",
  "Grip",
  "Electric",
  "Costume",
  "Makeup & Hair",
  "Stunts",
  "Sound",
  "Post-Production",
  "Other",
];

const contactIdFromEmail = (email) =>
  (email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") || null;

export default function CreateBookingPage() {
  const router = useRouter();

  // state (logic preserved)
  const [equipment, setEquipment] = useState([]);
  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employees, setEmployees] = useState([]);
  const [customEmployee, setCustomEmployee] = useState("");
  const [vehicles, setVehicles] = useState([]);
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

  const [isSecondPencil, setIsSecondPencil] = useState(false);
  const [isCrewed, setIsCrewed] = useState(false);
  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);
  const [notes, setNotes] = useState("");
  const [quoteFile, setQuoteFile] = useState(null);
  const [quoteURL, setQuoteURL] = useState(null);
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [status, setStatus] = useState("Confirmed");
  const [shootType, setShootType] = useState("Day");
  const [notesByDate, setNotesByDate] = useState({});
  const [freelancers, setFreelancers] = useState([]); // kept for compatibility
  const [freelancerList, setFreelancerList] = useState([]);
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
  const [openGroups, setOpenGroups] = useState({
    Bike: false,
    "Electric Tracking Vehicles": false,
    "Small Tracking Vehicles": false,
    "Large Tracking Vehicles": false,
    "Low Loaders": false,
    "Transport Lorry": false,
    "Transport Van": false,
    "Other Vehicles": false,
  });

  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [customDates, setCustomDates] = useState([]);
  const [quoteProgress, setQuoteProgress] = useState(0);

  const [employeeList, setEmployeeList] = useState([]);

  /* 👇 NEW: name → code map (used only for saving employeeCodes) */
  const [nameToCode, setNameToCode] = useState({});

  const isMaintenance = status === "Maintenance";

  // NEW: contacts
  const [additionalContacts, setAdditionalContacts] = useState([]);
  const [savedContacts, setSavedContacts] = useState([]);
  const [selectedSavedContactId, setSelectedSavedContactId] = useState("");

  // ── Core field validation (now *only* Production + Location) ─────────────
  const coreFilled = isMaintenance
    ? Boolean((location || "").trim())
    : Boolean((client || "").trim() && (location || "").trim());

  const saveTooltip = isMaintenance
    ? !coreFilled
      ? "Fill Location to save"
      : ""
    : !coreFilled
    ? "Fill Production and Location to save"
    : "";

  // load data
  useEffect(() => {
    const loadData = async () => {
      // 1) bookings
      const bookingSnap = await getDocs(collection(db, "bookings"));
      const bookings = bookingSnap.docs.map((docu) => docu.data());
      setAllBookings(bookings);

      // auto job number
      const jobNumbers = bookings
        .map((b) => b.jobNumber)
        .filter((jn) => /^\d+$/.test(jn))
        .map((jn) => parseInt(jn, 10));
      const max = jobNumbers.length > 0 ? Math.max(...jobNumbers) : 0;
      setJobNumber(String(max + 1).padStart(4, "0"));

      // 2) equipment
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
          if (!groupedEquip["Uncategorised"])
            groupedEquip["Uncategorised"] = [];
          if (!openEquip["Uncategorised"]) openEquip["Uncategorised"] = false;
          groupedEquip["Uncategorised"].push(name);
        }
      });
      setEquipmentGroups(groupedEquip);
      setOpenEquipmentGroups(openEquip);

      // 3) holidays
      const holidaySnap = await getDocs(collection(db, "holidays"));
      setHolidayBookings(holidaySnap.docs.map((d) => d.data()));

      // 4) employees/freelancers
      const empSnap = await getDocs(collection(db, "employees"));
      const allEmployees = empSnap.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));

      setEmployeeList(
        allEmployees
          .filter((emp) => {
            const titles = Array.isArray(emp.jobTitle)
              ? emp.jobTitle
              : [emp.jobTitle];
            return titles.some(
              (t) => (t || "").toLowerCase() === "driver"
            );
          })
          .map((emp) => emp.name || emp.fullName || emp.id)
      );

      setFreelancerList(
        allEmployees
          .filter((emp) => {
            const titles = Array.isArray(emp.jobTitle)
              ? emp.jobTitle
              : [emp.jobTitle];
            return titles.some((t) => {
              const val = (t || "").toLowerCase();
              return val === "freelance" || val === "freelancer";
            });
          })
          .map((emp) => emp.name || emp.fullName || emp.id)
      );

      // 👇 NEW: build plain object map { lowercasedName: userCode }
      const map = {};
      for (const emp of allEmployees) {
        const name = String(emp.name || emp.fullName || "")
          .trim()
          .toLowerCase();
        const code = String(emp.userCode || "").trim();
        if (name && code) map[name] = code;
      }
      setNameToCode(map);

      // 5) maintenance/work bookings
      const workSnap = await getDocs(collection(db, "workBookings"));
      setMaintenanceBookings(workSnap.docs.map((d) => d.data()));

      // 6) vehicles
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
        const vehicle = {
          name: data.name,
          registration: data.registration || "",
        };

        if (category.includes("small"))
          grouped["Small Tracking Vehicles"].push(vehicle);
        else if (category.includes("bike")) grouped["Bike"].push(vehicle);
        else if (category.includes("electric"))
          grouped["Electric Tracking Vehicles"].push(vehicle);
        else if (category.includes("large"))
          grouped["Large Tracking Vehicles"].push(vehicle);
        else if (category.includes("low loader"))
          grouped["Low Loaders"].push(vehicle);
        else if (category.includes("lorry"))
          grouped["Transport Lorry"].push(vehicle);
        else if (category.includes("van"))
          grouped["Transport Van"].push(vehicle);
        else grouped["Other Vehicles"].push(vehicle);
      });
      setVehicleGroups(grouped);

      // 7) saved contacts (for reuse in later bookings)
      const contactsSnap = await getDocs(collection(db, "contacts"));
      const contacts = contactsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setSavedContacts(contacts);
    };

    loadData();
  }, []);

  // selections / blocking
  const selectedDates = (() => {
    if (useCustomDates) return customDates;
    if (!startDate) return [];
    if (isRange && endDate) {
      const out = [];
      let cur = parseYMD_UTC(startDate);
      const stop = parseYMD_UTC(endDate);
      if (!cur || !stop) return [];
      while (cur <= stop) {
        out.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      return out;
    }
    return [startDate];
  })();

  const isEmployeeOnHoliday = (employeeName) => {
    if (!employeeName || selectedDates.length === 0) return false;
    return holidayBookings.some((h) => {
      if (h.employee !== employeeName) return false;
      const holidayStart = new Date(h.startDate);
      const holidayEnd = new Date(h.endDate);
      return selectedDates.some((dStr) => {
        const d = new Date(dStr);
        return d >= holidayStart && d <= holidayEnd;
      });
    });
  };

  const bookedVehicles = allBookings
    .filter(
      (b) =>
        doesBlock(b) && anyDateOverlap(expandBookingDates(b), selectedDates)
    )
    .flatMap((b) => b.vehicles || []);

  const bookedEquipment = allBookings
    .filter(
      (b) =>
        doesBlock(b) && anyDateOverlap(expandBookingDates(b), selectedDates)
    )
    .flatMap((b) => b.equipment || []);

  const bookedEmployees = allBookings
    .filter(
      (b) =>
        doesBlock(b) && anyDateOverlap(expandBookingDates(b), selectedDates)
    )
    .flatMap((b) => b.employees || []);

  // 🔧 Build a set of canonical keys for vehicles that are off for maintenance
  // on any of the selected dates.
  const maintenanceVehicleKeySet = new Set(
    maintenanceBookings.flatMap((b) => {
      const start =
        toJsDate(b.startDate || b.date || b.start) || toJsDate(b.date);
      const end =
        toJsDate(b.endDate || b.end || b.endDate) ||
        start ||
        toJsDate(b.date);

      if (!start || !end) return [];

      const overlaps = selectedDates.some((dateStr) => {
        const d = new Date(dateStr + "T00:00:00");
        return d >= start && d <= end;
      });
      if (!overlaps) return [];

      const keys = [];

      // If work bookings store an array of vehicles
      if (Array.isArray(b.vehicles) && b.vehicles.length) {
        b.vehicles.forEach((v) => {
          if (typeof v === "string") {
            const key = canonicalVehicleKey(v, null);
            if (key) keys.push(key);
          } else if (v && typeof v === "object") {
            const key = canonicalVehicleKey(
              v.name || v.vehicleName,
              v.registration || v.reg || v.vehicleReg
            );
            if (key) keys.push(key);
          }
        });
      } else {
        // Single fields
        const key = canonicalVehicleKey(
          b.vehicleName || b.vehicle,
          b.vehicleReg || b.registration || b.reg
        );
        if (key) keys.push(key);
      }

      return keys;
    })
  );

  // helpers for additional contacts
  const handleAddContactRow = () => {
    setAdditionalContacts((prev) => [
      ...prev,
      {
        department: "",
        departmentOther: "",
        name: "",
        email: "",
        phone: "",
      },
    ]);
  };

  const handleUpdateContactRow = (index, key, value) => {
    setAdditionalContacts((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [key]: value,
            }
          : row
      )
    );
  };

  const handleRemoveContactRow = (index) => {
    setAdditionalContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuickAddSavedContact = (id) => {
    if (!id) return;
    const found = savedContacts.find((c) => c.id === id);
    if (!found) return;
    setAdditionalContacts((prev) => [
      ...prev,
      {
        department: found.department || "",
        departmentOther: "",
        name: found.name || "",
        email: found.email || "",
        phone: found.phone || found.number || "",
      },
    ]);
  };

  // submit (logic preserved, + save employeeCodes + contacts)
  const handleSubmit = async (submitStatus = "Confirmed") => {
    const submitIsMaintenance = submitStatus === "Maintenance";

    if (submitStatus !== "Enquiry") {
      if (useCustomDates) {
        if (customDates.length === 0)
          return alert("Please select at least one date.");
      } else {
        if (!startDate) return alert("Please select a start date.");
        if (isRange && !endDate)
          return alert("Please select an end date.");
      }
    }

    // ✅ Block if core fields are missing/invalid (now no contact email/number)
    const normalCoreFilled = Boolean(
      (client || "").trim() && (location || "").trim()
    );
    const maintenanceCoreFilled = Boolean((location || "").trim());
    const effectiveFilled = submitIsMaintenance
      ? maintenanceCoreFilled
      : normalCoreFilled;

    if (!effectiveFilled) {
      const missing = [];
      if (!submitIsMaintenance && !(client || "").trim())
        missing.push("Production");
      if (!(location || "").trim()) missing.push("Location");
      alert("Please provide: " + missing.join(", ") + ".");
      return;
    }

    const customNames = customEmployee
      ? customEmployee.split(",").map((n) => n.trim())
      : [];
    const cleanedEmployees = employees
      .filter((n) => n !== "Other")
      .concat(customNames);

    for (const employee of cleanedEmployees) {
      if (isEmployeeOnHoliday(employee)) {
        alert(`${employee} is on holiday during the selected dates.`);
        return;
      }
    }

    const bookingDates = submitStatus !== "Enquiry" ? selectedDates : [];

    const filteredNotesByDate = {};
    bookingDates.forEach((d) => {
      filteredNotesByDate[d] = notesByDate[d] || "";
      if (typeof notesByDate[`${d}-other`] !== "undefined")
        filteredNotesByDate[`${d}-other`] = notesByDate[`${d}-other`];
      if (typeof notesByDate[`${d}-travelMins`] !== "undefined")
        filteredNotesByDate[`${d}-travelMins`] =
          notesByDate[`${d}-travelMins`];
    });

    // upload quote (PDF only)
    let quoteUrlToSave = null;

    if (quoteFile) {
      try {
        // Guard: must be a PDF
        const nameIsPdf = /\.pdf$/i.test(quoteFile.name || "");
        const typeIsPdf =
          (quoteFile.type || "").toLowerCase() === "application/pdf";
        if (!nameIsPdf && !typeIsPdf) {
          alert("Please attach a PDF (.pdf) file.");
          return;
        }

        // Sanitize + enforce .pdf extension
        const base = `${jobNumber || "nojob"}_${quoteFile.name}`.replace(
          /\s+/g,
          "_"
        );
        const safeName = base.toLowerCase().endsWith(".pdf")
          ? base
          : `${base}.pdf`;

        // Keep quotes in /quotes
        const storageRef = ref(storage, `quotes/${safeName}`);

        // Always set the contentType to application/pdf
        const uploadTask = uploadBytesResumable(storageRef, quoteFile, {
          contentType: "application/pdf",
        });

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snap) => {
              const pct = Math.round(
                (snap.bytesTransferred / snap.totalBytes) * 100
              );
              setQuoteProgress(pct);
            },
            (err) => {
              console.error("Upload error:", err);
              reject(err);
            },
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              setQuoteURL(url);
              quoteUrlToSave = url;
              resolve();
            }
          );
        });
      } catch (error) {
        alert(
          "Failed to upload PDF: " + (error?.message || String(error))
        );
        return; // stop save if upload fails
      }
    }

    // 👇 NEW: derive codes from selected names (keeps employees as names)
    const employeeCodes = cleanedEmployees
      .map(
        (n) =>
          nameToCode[String(n || "").trim().toLowerCase()]
      )
      .filter(Boolean);

    // normalise additional contacts for saving
    const additionalContactsToSave = additionalContacts
      .map((c) => ({
        department:
          c.department === "Other" && c.departmentOther
            ? c.departmentOther
            : c.department || "",
        name: (c.name || "").trim(),
        email: (c.email || "").trim(),
        phone: (c.phone || "").trim(),
      }))
      // filter out completely empty rows
      .filter(
        (c) =>
          c.name || c.email || c.phone || c.department
      );

    const user = auth.currentUser;
    const booking = {
      jobNumber,
      client,
      location,
      employees: cleanedEmployees, // ← unchanged (names)
      employeeCodes, // ← NEW (for array-contains queries)
      vehicles,
      equipment,
      isSecondPencil,
      isCrewed,
      notes,
      notesByDate: filteredNotesByDate,
      status: submitStatus,
      bookingDates,
      shootType,
      hasHS,
      hasRiskAssessment,
      quoteUrl: quoteUrlToSave,
      additionalContacts: additionalContactsToSave, // NEW
      ...(submitStatus !== "Enquiry" && !useCustomDates
        ? isRange
          ? {
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate).toISOString(),
              date: null,
            }
          : {
              date: new Date(startDate).toISOString(),
              startDate: null,
              endDate: null,
            }
        : { date: null, startDate: null, endDate: null }),
      createdBy: user?.email || "Unknown",
      lastEditedBy: user?.email || "Unknown",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        {
          action: "Created",
          user: user?.email || "Unknown",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      await addDoc(collection(db, "bookings"), booking);

      // NEW: upsert contacts into a separate "contacts" collection
      // (Only from the additional contacts now)
      const contactsToUpsert = [...additionalContactsToSave];

      for (const c of contactsToUpsert) {
        const id = contactIdFromEmail(c.email);
        if (!id) continue;
        const refDoc = doc(db, "contacts", id);
        await setDoc(
          refDoc,
          {
            name: c.name,
            email: c.email,
            phone: c.phone,
            number: c.phone,           // ❗ ensure number field as well
            department: c.department,  // e.g. "Production"
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      alert("Booking Saved ✅");
      router.push("/dashboard?saved=true");
    } catch (err) {
      console.error("❌ Error saving booking:", err);
      alert("Failed to save booking ❌\n\n" + err.message);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={mainWrap}>
          <h1 style={h1Style}>➕ Create New Booking</h1>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(status);
            }}
          >
            <div style={sectionGrid}>
              {/* Column 1: Job Info */}
              <div style={card}>
                <h3 style={cardTitle}>Job Info</h3>

                <label style={field.label}>Job Number</label>
                <input
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  required
                  style={field.input}
                />

                <label style={field.label}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={field.input}
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="First Pencil">First Pencil</option>
                  <option value="Second Pencil">Second Pencil</option>
                  <option value="Enquiry">Enquiry</option>
                  <option value="Maintenance">Maintenance</option>
                </select>

                <label style={field.label}>Shoot Type</label>
                <select
                  value={shootType}
                  onChange={(e) => setShootType(e.target.value)}
                  style={field.input}
                >
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>

                <label style={field.label}>Production</label>
                <textarea
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  style={field.textarea}
                  required={status !== "Maintenance"}
                />

                {/* Contacts section */}
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: UI.radiusSm,
                    border: UI.border,
                    background: UI.bgAlt,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      Contacts
                    </span>
                    <button
                      type="button"
                      onClick={handleAddContactRow}
                      style={{
                        ...btn,
                        padding: "4px 8px",
                        fontSize: 12,
                        borderRadius: 999,
                      }}
                    >
                      + Add contact
                    </button>
                  </div>
                  {additionalContacts.length === 0 && (
                    <p
                      style={{
                        fontSize: 12,
                        color: UI.muted,
                        marginBottom: 6,
                      }}
                    >
                      Add production contacts (e.g. Production, Locations, AD,
                      line producer, stunts).
                    </p>
                  )}

                  {additionalContacts.map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: UI.radiusXs,
                        background: "#ffffff",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            Department
                          </label>
                          <select
                            value={row.department}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "department",
                                e.target.value
                              )
                            }
                            style={field.input}
                          >
                            <option value="">Select department</option>
                            {FILM_DEPARTMENTS.map((dep) => (
                              <option key={dep} value={dep}>
                                {dep}
                              </option>
                            ))}
                          </select>
                          {row.department === "Other" && (
                            <input
                              type="text"
                              placeholder="Custom department"
                              value={row.departmentOther || ""}
                              onChange={(e) =>
                                handleUpdateContactRow(
                                  idx,
                                  "departmentOther",
                                  e.target.value
                                )
                              }
                              style={{
                                ...field.input,
                                marginTop: 6,
                              }}
                            />
                          )}
                        </div>
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            Name
                          </label>
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "name",
                                e.target.value
                              )
                            }
                            style={field.input}
                            placeholder="Contact name"
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            Email
                          </label>
                          <input
                            type="email"
                            value={row.email}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "email",
                                e.target.value
                              )
                            }
                            style={field.input}
                            placeholder="Email"
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            Number
                          </label>
                          <input
                            type="tel"
                            value={row.phone}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "phone",
                                e.target.value
                              )
                            }
                            style={field.input}
                            placeholder="Phone number"
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleRemoveContactRow(idx)}
                          style={{
                            ...btn,
                            padding: "4px 8px",
                            fontSize: 11,
                            borderRadius: 999,
                            borderColor: "#dc2626",
                            color: "#dc2626",
                            background: "#fff",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  {savedContacts.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <label
                        style={{
                          ...field.label,
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        Quick add from saved contacts
                      </label>
                      <select
                        value={selectedSavedContactId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedSavedContactId(val);
                          if (val) {
                            handleQuickAddSavedContact(val);
                            // reset selection
                            setSelectedSavedContactId("");
                          }
                        }}
                        style={field.input}
                      >
                        <option value="">Select saved contact</option>
                        {savedContacts.map((c) => {
                          const labelBase = c.name || c.email || "Unnamed";
                          const deptLabel = c.department
                            ? ` – ${c.department}`
                            : "";
                          return (
                            <option key={c.id} value={c.id}>
                              {labelBase}
                              {deptLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                <label style={field.label}>Location</label>
                <textarea
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={field.textarea}
                  required
                />
              </div>

              {/* Column 2: Dates & People */}
              <div style={card}>
                <h3 style={cardTitle}>Dates & People</h3>

                <label style={field.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={useCustomDates}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setUseCustomDates(on);
                      if (on) setIsRange(false);
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
                            typeof v?.format === "function"
                              ? v.format("YYYY-MM-DD")
                              : String(v)
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
                      <label style={field.label}>
                        {isRange ? "Start Date" : "Date"}
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required={status !== "Enquiry"}
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
                          required={status !== "Enquiry"}
                          style={field.input}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Notes single-day */}
                {!isRange && startDate && !useCustomDates && (
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
                      <option value="1/2 Day Travel">1/2 Day Travel</option>
                      <option value="Night Shoot">Night Shoot</option>
                      <option value="On Set">Shoot Day</option>
                      <option value="Other">Other</option>
                      <option value="Rehearsal Day">Rehearsal Day</option>
                      <option value="Rest Day">Rest Day</option>
                      <option value="Rig Day">Rig Day</option>
                      <option value="Standby Day">Standby Day</option>
                      <option value="Travel Day">Travel Day</option>
                      <option value="Travel Time">Travel Time</option>
                      <option value="Turnaround Day">Turnaround Day</option>
                      <option value="Recce Day">Recce Day</option>
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
                        <label
                          style={{
                            ...field.label,
                            marginBottom: 6,
                          }}
                        >
                          Travel duration
                        </label>
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
                {isRange && startDate && endDate && !useCustomDates && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: "8px 0" }}>Notes for Each Day</h4>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit,minmax(320px,1fr))",
                        gap: 12,
                      }}
                    >
                      {enumerateDaysYMD_UTC(startDate, endDate).map(
                        (date) => {
                          const selectedNote = notesByDate[date] || "";
                          const isOther = selectedNote === "Other";
                          const customOtherValue =
                            notesByDate[`${date}-other`] || "";
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
                              <div
                                style={{
                                  fontWeight: 700,
                                  marginBottom: 8,
                                }}
                              >
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
                                <option value="1/2 Day Travel">
                                  1/2 Day Travel
                                </option>
                                <option value="Night Shoot">
                                  Night Shoot
                                </option>
                                <option value="On Set">Shoot Day</option>
                                <option value="Other">Other</option>
                                <option value="Rehearsal Day">
                                  Rehearsal Day
                                </option>
                                <option value="Rest Day">Rest Day</option>
                                <option value="Rig Day">Rig Day</option>
                                <option value="Standby Day">
                                  Standby Day
                                </option>
                                <option value="Spilt Day">Spilt Day</option>
                                <option value="Travel Day">
                                  Travel Day
                                </option>
                                <option value="Travel Time">
                                  Travel Time
                                </option>
                                <option value="Turnaround Day">
                                  Turnaround Day
                                </option>
                                <option value="Recce Day">Recce Day</option>
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
                                  <label
                                    style={{
                                      ...field.label,
                                      marginBottom: 6,
                                    }}
                                  >
                                    Travel duration
                                  </label>
                                  <select
                                    value={
                                      notesByDate[`${date}-travelMins`] ||
                                      ""
                                    }
                                    onChange={(e) =>
                                      setNotesByDate({
                                        ...notesByDate,
                                        [date]: "Travel Time",
                                        [`${date}-travelMins`]:
                                          e.target.value,
                                      })
                                    }
                                    style={field.input}
                                  >
                                    <option value="">Select duration</option>
                                    {TRAVEL_DURATION_OPTIONS.map((opt) => (
                                      <option
                                        key={opt.value}
                                        value={opt.value}
                                      >
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                <div style={divider} />

                <h4 style={{ margin: "8px 0" }}>Precision Driver</h4>
                {[...employeeList, "Other"].map((name) => {
                  const isBooked = bookedEmployees.includes(name);
                  const isHoliday = isEmployeeOnHoliday(name);
                  const disabled = isBooked || isHoliday || isCrewed;
                  return (
                    <label
                      key={name}
                      style={{ display: "block", marginBottom: 6 }}
                    >
                      <input
                        type="checkbox"
                        value={name}
                        disabled={disabled}
                        checked={employees.includes(name)}
                        onChange={(e) =>
                          setEmployees(
                            e.target.checked
                              ? [...employees, name]
                              : employees.filter((n) => n !== name)
                          )
                        }
                      />{" "}
                      <span
                        style={{
                          color: disabled ? "#9ca3af" : UI.text,
                        }}
                      >
                        {name} {isBooked && "(Booked)"}{" "}
                        {isHoliday && "(On Holiday)"}
                      </span>
                    </label>
                  );
                })}

                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <label style={{ fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={isCrewed}
                      onChange={(e) => setIsCrewed(e.target.checked)}
                    />{" "}
                    Booking Crewed
                  </label>
                </div>

                <h4 style={{ margin: "8px 0" }}>Freelancers</h4>
                {[...freelancerList, "Other"].map((name) => {
                  const isBooked = bookedEmployees.includes(name);
                  const isHoliday = isEmployeeOnHoliday(name);
                  const disabled = isBooked || isHoliday;
                  return (
                    <label
                      key={name}
                      style={{ display: "block", marginBottom: 6 }}
                    >
                      <input
                        type="checkbox"
                        value={name}
                        disabled={disabled}
                        checked={employees.includes(name)}
                        onChange={(e) =>
                          setEmployees(
                            e.target.checked
                              ? [...employees, name]
                              : employees.filter((n) => n !== name)
                          )
                        }
                      />{" "}
                      <span
                        style={{
                          color: disabled ? "#9ca3af" : UI.text,
                        }}
                      >
                        {name} {isBooked && "(Booked)"}{" "}
                        {isHoliday && "(On Holiday)"}
                      </span>
                    </label>
                  );
                })}

                {employees.includes("Other") && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="Other employee(s), comma-separated"
                      value={customEmployee}
                      onChange={(e) => setCustomEmployee(e.target.value)}
                      style={field.input}
                    />
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
                        onClick={() =>
                          setOpenGroups((prev) => ({
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
                            const isBooked = bookedVehicles.includes(
                              vehicle.name
                            );

                            const vehicleKey = canonicalVehicleKey(
                              vehicle.name,
                              vehicle.registration
                            );
                            const isMaintenance = vehicleKey
                              ? maintenanceVehicleKeySet.has(vehicleKey)
                              : false;

                            const disabled = isBooked || isMaintenance;

                            return (
                              <label
                                key={
                                  vehicle.registration
                                    ? `${vehicle.name}-${vehicle.registration}`
                                    : vehicle.name
                                }
                                style={{
                                  display: "block",
                                  marginBottom: 6,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  value={vehicle.name}
                                  disabled={disabled}
                                  checked={vehicles.includes(vehicle.name)}
                                  onChange={(e) =>
                                    setVehicles(
                                      e.target.checked
                                        ? [...vehicles, vehicle.name]
                                        : vehicles.filter(
                                            (v) => v !== vehicle.name
                                          )
                                    )
                                  }
                                />{" "}
                                <span
                                  style={{
                                    color: disabled ? "#9ca3af" : UI.text,
                                  }}
                                >
                                  {vehicle.name}
                                  {vehicle.registration
                                    ? ` – ${vehicle.registration}`
                                    : ""}
                                  {isBooked && " (Booked)"}{" "}
                                  {isMaintenance && " (Maintenance)"}
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
                          {items.map((item) => {
                            const isBooked =
                              bookedEquipment.includes(item);
                            const disabled = isBooked;
                            return (
                              <label
                                key={item}
                                style={{
                                  display: "block",
                                  marginBottom: 6,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  value={item}
                                  disabled={disabled}
                                  checked={equipment.includes(item)}
                                  onChange={(e) =>
                                    setEquipment(
                                      e.target.checked
                                        ? [...equipment, item]
                                        : equipment.filter(
                                            (i) => i !== item
                                          )
                                    )
                                  }
                                />{" "}
                                <span
                                  style={{
                                    color: disabled ? "#9ca3af" : UI.text,
                                  }}
                                >
                                  {item} {isBooked && "(Booked)"}
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

            {/* Files & Notes (separate card) */}
            <div style={{ ...card, marginTop: 18 }}>
              <h3 style={cardTitle}>Files & Notes</h3>

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
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: UI.muted,
                  }}
                >
                  Uploading: {quoteProgress}%
                </div>
              )}

              <div style={{ marginTop: 14 }} />
              <label style={field.label}>Job Description</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={field.textarea}
                placeholder="Anything extra to include for this booking..."
              />

              <div style={divider} />

              <label style={field.checkboxRow}>
                <input
                  type="checkbox"
                  checked={hasHS}
                  onChange={(e) => setHasHS(e.target.checked)}
                />
                Health & Safety Completed
              </label>
              <label style={field.checkboxRow}>
                <input
                  type="checkbox"
                  checked={hasRiskAssessment}
                  onChange={(e) => setHasRiskAssessment(e.target.checked)}
                />
                Risk Assessment Completed
              </label>

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
                  Save Booking
                </button>

              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                style={btnGhost}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Summary row */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={summaryCard}>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: 16,
                  fontWeight: 800,
                }}
              >
                📋 Summary
              </h3>
              <div style={summaryRow}>
                <div>Job Number</div>
                <div>{jobNumber || "—"}</div>
              </div>
              <div style={summaryRow}>
                <div>Status</div>
                <div>{status || "—"}</div>
              </div>
              <div style={summaryRow}>
                <div>Shoot Type</div>
                <div>{shootType || "—"}</div>
              </div>
              <div style={summaryRow}>
                <div>Production</div>
                <div>{client || "—"}</div>
              </div>
              <div style={summaryRow}>
                <div>Contacts</div>
                <div>
                  {additionalContacts.length
                    ? additionalContacts
                        .map((c) => {
                          const dept =
                            c.department === "Other" &&
                            c.departmentOther
                              ? c.departmentOther
                              : c.department;
                          return [
                            c.name || c.email || "Unnamed",
                            dept ? `(${dept})` : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                        })
                        .join(", ")
                    : "—"}
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
                <div>People</div>
                <div>
                  {employees
                    .concat(
                      customEmployee
                        ? customEmployee
                            .split(",")
                            .map((n) => n.trim())
                        : []
                    )
                    .join(", ") || "—"}
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
            </div>
          </div>
        </form>
      </div>
    </div>
  </HeaderSidebarLayout>
  );
}
