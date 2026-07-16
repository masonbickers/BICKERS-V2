"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

import { db, auth, storage } from "../../../../firebaseConfig";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc, // keep (Save as copy)
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* ───────────────────────────────────────────
   U-Crane roles (MUST match Create page + Crew Manager)
─────────────────────────────────────────── */
const UCRANE_ROLES = [
  { role: "Precision Driver", key: "u-crane driver" },
  { role: "Arm Operator", key: "arm operator" },
  { role: "Arm & Head Tech", key: "Head and Arm Tech" },
  { role: "Transport Driver", key: "transport driver" },
  { role: "Camera Operator", key: "camera operator" },
];

const getDisplayName = (row) =>
  row?.name ||
  row?.fullName ||
  [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim() ||
  row?.displayName ||
  row?.email ||
  row?.id ||
  "Unknown";

/* ───────────────────────────────────────────
   Styles (MATCH Create booking page vibe)
─────────────────────────────────────────── */
const UI = UI_TOKENS;

const pageCss = `
  .ucrane-edit-page h3,
  .ucrane-edit-page h4 {
    color: ${UI.muted} !important;
    font-size: 12px !important;
    font-weight: 800 !important;
    letter-spacing: 0.03em !important;
    text-transform: uppercase !important;
    margin: 0 0 6px !important;
  }
  .ucrane-edit-page label {
    color: ${UI.text};
    font-size: 14px;
    font-weight: 650;
  }
  .ucrane-edit-page input[type="checkbox"] {
    accent-color: ${UI.brand};
  }
`;

const pageBg = {
  display: "flex",
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  backgroundColor: UI.bg,
};
const main = { flex: 1, padding: "16px", color: UI.text };
const panel = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "flex-start",
  marginTop: "12px",
  backgroundColor: UI.card,
  padding: "12px",
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  fontSize: "14px",
  lineHeight: "1.45",
};
const col = {
  flex: "1 1 300px",
  minWidth: "280px",
  padding: "12px",
  border: UI.borderSoft,
  borderRadius: UI.radius,
  backgroundColor: UI.card,
};

const inputStyle = {
  width: "100%",
  height: "34px",
  marginBottom: "10px",
  padding: "6px 9px",
  fontSize: "14px",
  border: "1px solid var(--color-border)",
  borderRadius: UI.radius,
  boxSizing: "border-box",
  backgroundColor: "var(--color-surface)",
  color: UI.text,
};

const textArea = {
  width: "100%",
  padding: "9px 10px",
  fontSize: "14px",
  border: "1px solid var(--color-border)",
  borderRadius: UI.radius,
  boxSizing: "border-box",
  backgroundColor: "var(--color-surface)",
  color: UI.text,
};

const buttonStyle = {
  marginRight: "10px",
  marginTop: "10px",
  padding: "8px 13px",
  background: "linear-gradient(180deg, var(--color-brand-hover) 0%, var(--color-brand) 100%)",
  color: "var(--color-white)",
  border: `1px solid ${UI.brand}`,
  borderRadius: UI.radius,
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 8px 18px rgba(31, 75, 122, 0.16)",
};
const cancelBtn = {
  ...buttonStyle,
  background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
  color: UI.text,
  border: `1px solid ${UI.brandBorder}`,
  boxShadow: "none",
};
const dangerBtn = {
  ...buttonStyle,
  background: "var(--color-danger-soft)",
  color: "var(--color-danger)",
  border: "1px solid var(--color-danger-border)",
  boxShadow: "none",
};
const summaryCard = {
  marginTop: 12,
  padding: 14,
  backgroundColor: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
};

/* ───────────────────────────────────────────
   Edit Booking Page (Matches Create Page logic + layout)
    Equipment NOT shown (but still preserved in data unless you remove it)
─────────────────────────────────────────── */
export default function EditBookingPage() {
  const router = useRouter();
  const { id } = useParams();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  // record state
  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("Confirmed");
  const [shootType, setShootType] = useState("Day");
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [notesByDate, setNotesByDate] = useState({});
  const [isSecondPencil, setIsSecondPencil] = useState(false);
  const [isCrewed, setIsCrewed] = useState(false);
  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // UI stores {role, name} for display like Create page
  const [employees, setEmployees] = useState([]); // [{role,name}]
  const [customEmployee, setCustomEmployee] = useState(""); // comma-separated

  const [vehicles, setVehicles] = useState([]); // ["U-Crane 1", ...]

  // keep equipment state (for preserving existing data + availability calc),
  // but we do NOT render it anywhere.
  const [equipment, setEquipment] = useState([]); // ["Tow Dolly", ...] (hidden)

  const [quoteFile, setQuoteFile] = useState(null);
  const [quoteURL, setQuoteURL] = useState(null);

  // lists / lookups
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [unavailableNotes, setUnavailableNotes] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);

  const [vehicleGroups, setVehicleGroups] = useState({
    "U-Crane": [],
    "Transport Lorry": [],
  });

  //  Create-page style crew pool:
  // Employees + U-Crane Freelancers filtered by uCraneVisible + uCraneRoles
  const [crewPool, setCrewPool] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ───────────────────────────────────────────
     Helpers
  ──────────────────────────────────────────── */
  const parseDateStr = (isoOrDate) => {
    if (!isoOrDate) return "";
    try {
      const d = new Date(isoOrDate);
      if (Number.isNaN(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    } catch {
      return "";
    }
  };

  const selectedDates = (() => {
    if (!startDate) return [];
    const dates = [];
    const start = new Date(startDate);
    const end = isRange && endDate ? new Date(endDate) : start;
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  })();

  const isEmployeeOnHoliday = (employeeName) => {
    if (!startDate) return false;

    const selectedStart = new Date(startDate);
    const selectedEnd = isRange && endDate ? new Date(endDate) : selectedStart;

    return holidayBookings.some((h) => {
      if (h.employee !== employeeName) return false;
      const holidayStart = new Date(h.startDate);
      const holidayEnd = new Date(h.endDate);

      return (
        (selectedStart >= holidayStart && selectedStart <= holidayEnd) ||
        (selectedEnd >= holidayStart && selectedEnd <= holidayEnd) ||
        (selectedStart <= holidayStart && selectedEnd >= holidayEnd)
      );
    });
  };

  const getEmployeeUnavailableNote = (employeeName) => {
    const target = String(employeeName || "").trim().toLowerCase();
    if (!target || !selectedDates.length) return null;
    const dateSet = new Set(selectedDates.map((d) => String(d || "").slice(0, 10)));

    return (
      unavailableNotes.find((note) => {
        const noteEmployee = String(note.employee || note.employeeName || "").trim().toLowerCase();
        if (noteEmployee !== target) return false;
        const noteDate = String(note.date || note.startDate || "").slice(0, 10);
        return noteDate && dateSet.has(noteDate);
      }) || null
    );
  };

  const isEmployeeUnavailableByNote = (employeeName) => Boolean(getEmployeeUnavailableNote(employeeName));

  const nameFromEmployeeValue = (e) => {
    if (!e) return "";
    if (typeof e === "string") return e;
    if (typeof e === "object") return e.name || "";
    return "";
  };

  /* ───────────────────────────────────────────
     Load lists + record
  ──────────────────────────────────────────── */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load U-Crane edit data" });
      setLoading(false);
      return;
    }

    const loadAll = async () => {
      try {
        const [
          bookingSnap,
          holidaySnap,
          noteSnap,
          workSnap,
          vehicleSnap,
          empSnap,
          freeSnap,
        ] = await Promise.all([
          getDocs(tenantCollectionQuery(db, "bookings", dataAccessState)),
          getDocs(tenantCollectionQuery(db, "holidays", dataAccessState)),
          getDocs(tenantCollectionQuery(db, "notes", dataAccessState)),
          getDocs(tenantCollectionQuery(db, "workBookings", dataAccessState)),
          getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState)),
          getDocs(tenantCollectionQuery(db, "employees", dataAccessState)),
          getDocs(tenantCollectionQuery(db, "uCraneFreelancers", dataAccessState)),
        ]);

        const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllBookings(bookings);

        setHolidayBookings(holidaySnap.docs.map((d) => d.data()));
        setUnavailableNotes(
          noteSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((note) => note.blocksEmployeeBooking === true)
        );
        setMaintenanceBookings(workSnap.docs.map((d) => d.data()));

        // Vehicles groups (same as Create page)
        const groupedVehicles = { "U-Crane": [], "Transport Lorry": [] };
        vehicleSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const category = (data.category || "").trim().toLowerCase();
          const vehicle = { name: data.name, registration: data.registration || "" };

          if (category.includes("u-crane")) groupedVehicles["U-Crane"].push(vehicle);
          else if (category.includes("lorry") && !category.includes("trailer")) {
            if (vehicle.name && vehicle.name.toLowerCase().startsWith("u-crane lorry")) {
              groupedVehicles["Transport Lorry"].push(vehicle);
            }
          }
        });
        setVehicleGroups(groupedVehicles);

        // Crew pool (Employees + Freelancers) filtered by uCraneVisible
        const allEmployees = empSnap.docs.map((d) => ({
          id: d.id,
          __collection: "employees",
          ...d.data(),
        }));
        const allFreelancers = freeSnap.docs.map((d) => ({
          id: d.id,
          __collection: "uCraneFreelancers",
          ...d.data(),
        }));

        const combined = [...allEmployees, ...allFreelancers]
          .filter((p) => p?.uCraneVisible === true)
          .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

        setCrewPool(combined);

        // Load record to edit
        const refDoc = await getDoc(doc(db, "bookings", id));
        if (!refDoc.exists()) {
          alert("Booking not found");
          router.push("/dashboard");
          return;
        }
        const data = refDoc.data();

        const hasRange = !!(data.startDate || data.endDate);
        setIsRange(hasRange);
        setStartDate(parseDateStr(data.startDate || data.date));
        setEndDate(hasRange ? parseDateStr(data.endDate || data.startDate) : "");

        setJobNumber(data.jobNumber || "");
        setClient(data.client || "");
        setLocation(data.location || "");
        setStatus(data.status || "Confirmed");
        setShootType(data.shootType || "Day");
        setNotes(data.notes || "");
        setNotesByDate(data.notesByDate || {});
        setIsSecondPencil(!!data.isSecondPencil);
        setIsCrewed(!!data.isCrewed);
        setHasHS(!!data.hasHS);
        setHasRiskAssessment(!!data.hasRiskAssessment);
        setContactNumber(data.contactNumber || "");
        setContactEmail(data.contactEmail || "");
        setQuoteURL(data.quoteUrl || null);

        // Employees from db could be strings or objects
        const empVal = Array.isArray(data.employees) ? data.employees : [];
        setEmployees(
          empVal
            .map((e) => {
              if (typeof e === "string") return { role: "Role", name: e };
              if (e && typeof e === "object") return { role: e.role || "Role", name: e.name || "" };
              return null;
            })
            .filter(Boolean)
        );

        setVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
        setEquipment(Array.isArray(data.equipment) ? data.equipment : []); // hidden but preserved
      } catch (err) {
        console.error(err);
        alert("Failed to load booking.");
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [accessKey, dataAccessState, id, router]);

  /* ───────────────────────────────────────────
     Availability checks (match Create page)
  ──────────────────────────────────────────── */
  const bookedVehicles = allBookings
    .filter((b) => {
      if (b.id === id) return false;
      const bookingDates = b.bookingDates || [];
      return bookingDates.some((date) => selectedDates.includes(date));
    })
    .flatMap((b) => b.vehicles || []);

  const bookedEmployees = allBookings
    .filter((b) => {
      if (b.id === id) return false;
      const dateToCheck = startDate;
      const bDate = b.date?.slice(0, 10);
      const bStart = b.startDate?.slice(0, 10);
      const bEnd = b.endDate?.slice(0, 10);
      if (!dateToCheck) return false;
      return (
        (bDate && bDate === dateToCheck) ||
        (bStart && bEnd && dateToCheck >= bStart && dateToCheck <= bEnd)
      );
    })
    .flatMap((b) => (b.employees || []).map((e) => nameFromEmployeeValue(e)).filter(Boolean));

  const maintenanceBookedVehicles = maintenanceBookings
    .filter((b) => {
      const start = new Date(b.startDate);
      const end = new Date(b.endDate || b.startDate);
      return selectedDates.some((dateStr) => {
        const d = new Date(dateStr);
        return d >= start && d <= end;
      });
    })
    .map((b) => b.vehicleName);

  /* ───────────────────────────────────────────
     Crew options per role (MATCH Create page)
  ──────────────────────────────────────────── */
  const crewOptionsForRole = useMemo(() => {
    const map = {};
    for (const { role, key } of UCRANE_ROLES) {
      map[role] = crewPool.filter((p) => {
        const roles = Array.isArray(p.uCraneRoles) ? p.uCraneRoles : [];
        return roles.some((r) => String(r).trim() === key);
      });
    }
    return map;
  }, [crewPool]);

  const isChecked = (role, personName) =>
    employees.some((e) => e?.name === personName && e?.role === role);

  /* ───────────────────────────────────────────
     Save/update (matches Create page payload style)
  ──────────────────────────────────────────── */
  const handleUpdate = async () => {
    if (saving) return;
    setSaving(true);

    try {
      if (status !== "Enquiry") {
        if (!startDate) return alert("Please select a start date.");
        if (isRange && !endDate) return alert("Please select an end date.");
      }

      const customNames = customEmployee
        ? customEmployee.split(",").map((n) => n.trim()).filter(Boolean)
        : [];

      // Create page saves employees as array of NAMES
      const cleanedEmployees = employees
        .filter((e) => e?.name && e.name !== "Other")
        .map((e) => e.name)
        .concat(customNames);

      for (const employeeName of cleanedEmployees) {
        if (isEmployeeOnHoliday(employeeName)) {
          setSaving(false);
          alert(`${employeeName} is on holiday during the selected dates.`);
          return;
        }
        const unavailableNote = getEmployeeUnavailableNote(employeeName);
        if (unavailableNote) {
          setSaving(false);
          alert(
            `${employeeName} is marked unavailable on a note during the selected dates.${unavailableNote.text ? `\n\nNote: ${unavailableNote.text}` : ""}`
          );
          return;
        }
      }

      // bookingDates
      let bookingDates = [];
      if (status !== "Enquiry") {
        if (isRange && startDate && endDate) {
          const current = new Date(startDate);
          const end = new Date(endDate);
          while (current <= end) {
            bookingDates.push(current.toISOString().split("T")[0]);
            current.setDate(current.getDate() + 1);
          }
        } else if (startDate) {
          bookingDates = [new Date(startDate).toISOString().split("T")[0]];
        }
      }

      // upload quote if provided
      let quoteUrlToSave = quoteURL || null;
      if (quoteFile) {
        const storageRef = ref(storage, `quotes/${jobNumber}_${quoteFile.name}`);
        const metadata = {
          contentType:
            quoteFile.type ||
            (quoteFile.name.endsWith(".csv")
              ? "text/csv"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        };
        const uploadTask = uploadBytesResumable(storageRef, quoteFile, metadata);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            () => {},
            (err) => reject(err),
            async () => {
              quoteUrlToSave = await getDownloadURL(uploadTask.snapshot.ref);
              setQuoteURL(quoteUrlToSave);
              resolve();
            }
          );
        });
      }

      const user = auth.currentUser;
      const refDoc = doc(db, "bookings", id);
      const snap = await getDoc(refDoc);
      const existing = snap.exists() ? snap.data() : {};

      const updatePayload = {
        jobNumber,
        client,
        contactNumber,
        contactEmail,
        location,
        employees: cleanedEmployees,
        vehicles,
        equipment, //  preserved even though hidden
        isSecondPencil,
        isCrewed,
        notes,
        notesByDate,
        status,
        bookingDates,
        shootType,
        hasHS,
        hasRiskAssessment,
        quoteUrl: quoteUrlToSave,

        ...(status !== "Enquiry"
          ? isRange
            ? {
                startDate: new Date(startDate).toISOString(),
                endDate: new Date(endDate).toISOString(),
                date: null,
              }
            : { date: new Date(startDate).toISOString(), startDate: null, endDate: null }
          : { date: null, startDate: null, endDate: null }),

        createdByUid: existing?.createdByUid || user?.uid || "",
        lastEditedBy: user?.email || "Unknown",
        lastEditedByUid: user?.uid || "",
        updatedAt: new Date().toISOString(),
        history: [
          ...(Array.isArray(existing.history) ? existing.history : []),
          { action: "Edited", user: user?.email || "Unknown", timestamp: new Date().toISOString() },
        ],
      };

      await updateDoc(refDoc, updatePayload);
      alert("Booking updated ");
      router.push(`/job-numbers/${id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to update booking \n\n" + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <style>{pageCss}</style>
        <div className="ucrane-edit-page" style={pageBg}>
          <div style={main}>
            <h1 style={{ color: UI.text, margin: "0 0 8px", fontSize: 22, fontWeight: 850 }}>
              Edit U-Crane Booking
            </h1>
            <p>Loading booking…</p>
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <style>{pageCss}</style>
      <div className="ucrane-edit-page" style={pageBg}>
        <div style={main}>
          <div className={layoutStyles.extracted1}>
            <div>
              <h1 style={{ color: UI.text, margin: 0, fontSize: 22, fontWeight: 850 }}>
                Edit U-Crane Booking
              </h1>
              <div style={{ color: UI.muted, marginTop: 5, fontSize: 13.5, fontWeight: 700 }}>
                Booking ID: {id}
              </div>
            </div>

            <Link
              href={`/job-numbers/${id}`}
              style={{
                marginLeft: "auto",
                textDecoration: "none",
                fontWeight: 800,
                color: UI.brand,
                border: UI.border,
                borderRadius: UI.radius,
                padding: "7px 10px",
                background: "var(--color-surface)",
                boxShadow: UI.shadowSm,
              }}
            >
              View Booking →
            </Link>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdate();
            }}
          >
            <div style={panel}>
              {/* Column 1: Job Info */}
              <div style={col}>
                <h3 className={layoutStyles.extracted2}>Job Number</h3>
                <input
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  required
                  style={inputStyle}
                />

                <h3 className={layoutStyles.extracted3}>Status</h3>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                  <option value="Confirmed">Confirmed</option>
                  <option value="First Pencil">First Pencil</option>
                  <option value="Second Pencil">Second Pencil</option>
                  <option value="Enquiry">Enquiry</option>
                  <option value="Ready to Invoice">Ready to Invoice</option>
                  <option value="Invoiced">Invoiced</option>
                  <option value="Paid">Paid</option>
                  <option value="Action Required">Action Required</option>
                </select>

                <h3 className={layoutStyles.extracted4}>Shoot Type</h3>
                <select
                  value={shootType}
                  onChange={(e) => setShootType(e.target.value)}
                  style={inputStyle}
                >
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>

                <h3 className={layoutStyles.extracted5}>Production Company</h3>
                <input value={client} onChange={(e) => setClient(e.target.value)} required style={inputStyle} />

                <h3 className={layoutStyles.extracted6}>Contact Email</h3>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                  style={inputStyle}
                />

                <h3 className={layoutStyles.extracted7}>Contact Number</h3>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  required
                  style={inputStyle}
                />

                <h3 className={layoutStyles.extracted8}>Location</h3>
                <textarea
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  rows={2}
                  required
                  style={{ ...inputStyle, height: "auto", minHeight: "40px", resize: "vertical" }}
                />
              </div>

              {/* Column 2: Dates + Crew */}
              <div style={col}>
                <h3>Dates</h3>
                <label className={layoutStyles.extracted9}>
                  <input type="checkbox" checked={isRange} onChange={() => setIsRange(!isRange)} />
                  Multi-day
                </label>

                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required={status !== "Enquiry"}
                  style={inputStyle}
                />

                {isRange && (
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required={status !== "Enquiry"}
                    style={inputStyle}
                  />
                )}

                <h3 className={layoutStyles.extracted10}>Crew</h3>
                <div className={layoutStyles.extracted11}>
                  {UCRANE_ROLES.map(({ role }) => (
                    <div key={role} className={layoutStyles.extracted12}>
                      <h4 className={layoutStyles.extracted13}>{role}</h4>

                      {(crewOptionsForRole[role] || []).map((person) => {
                        const personName = getDisplayName(person);
                        const isBooked = bookedEmployees.includes(personName);
                        const isHoliday = isEmployeeOnHoliday(personName);
                        const isUnavailable = isEmployeeUnavailableByNote(personName);
                        const disabled = isBooked || isHoliday || isUnavailable;

                        return (
                          <label
                            key={`${person.__collection}:${person.id}:${role}`}
                            className={layoutStyles.extracted14}
                          >
                            <input
                              type="checkbox"
                              value={personName}
                              disabled={disabled}
                              checked={isChecked(role, personName)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEmployees((prev) => [...prev, { role, name: personName }]);
                                } else {
                                  setEmployees((prev) =>
                                    prev.filter((sel) => !(sel.name === personName && sel.role === role))
                                  );
                                }
                              }}
                            />
                            <span style={{ color: disabled ? "grey" : "var(--color-text)" }}>
                              {personName}{" "}
                              {person.__collection === "uCraneFreelancers" ? "(Freelancer)" : ""}
                              {isBooked && " (Booked)"} {isHoliday && " (On Holiday)"} {isUnavailable && " (Unavailable)"}
                            </span>
                          </label>
                        );
                      })}

                      {(crewOptionsForRole[role] || []).length === 0 && (
                        <div className={layoutStyles.extracted15}>
                          No crew set as visible for this role.
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className={layoutStyles.extracted16}>
                  <h4 className={layoutStyles.extracted17}>Add custom crew (comma separated)</h4>
                  <input
                    value={customEmployee}
                    onChange={(e) => setCustomEmployee(e.target.value)}
                    placeholder="e.g. John Smith, Jane Doe"
                    style={{ ...inputStyle, width: "100%" }}
                  />
                </div>
              </div>

              {/* Column 3: Vehicles + Quote + Flags */}
              <div style={col}>
                <h3>Vehicles</h3>
                {["U-Crane", "Transport Lorry"].map((group) => (
                  <div key={group} className={layoutStyles.extracted18}>
                    <h4 className={layoutStyles.extracted19}>{group}</h4>

                    {vehicleGroups[group]?.length > 0 ? (
                      vehicleGroups[group].map((vehicle, index) => {
                        const maintenanceBlocked = maintenanceBookedVehicles.includes(vehicle.name);
                        const dateBlocked = bookedVehicles.includes(vehicle.name);
                        const disabled = maintenanceBlocked || dateBlocked;

                        return (
                          <label
                            key={`${group}-${vehicle.id || vehicle.name || "vehicle"}-${vehicle.registration || ""}-${index}`}
                            className={layoutStyles.extracted20}
                          >
                            <input
                              type="checkbox"
                              value={vehicle.name}
                              checked={vehicles.includes(vehicle.name)}
                              disabled={disabled}
                              onChange={(e) =>
                                setVehicles((prev) =>
                                  e.target.checked
                                    ? [...prev, vehicle.name]
                                    : prev.filter((v) => v !== vehicle.name)
                                )
                              }
                            />
                            <span style={{ color: disabled ? "grey" : "var(--color-text)" }}>
                              {vehicle.name}{" "}
                              {vehicle.registration && `– ${vehicle.registration}`}{" "}
                              {maintenanceBlocked && "(Maintenance)"} {dateBlocked && "(Booked)"}
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p className={layoutStyles.extracted21}>No vehicles in this category</p>
                    )}
                  </div>
                ))}

                <h3 className={layoutStyles.extracted22}>Quote (Excel/CSV)</h3>
                {quoteURL ? (
                  <p className={layoutStyles.extracted23}>
                    Current:{" "}
                    <a href={quoteURL} target="_blank" rel="noopener noreferrer">
                      Download existing
                    </a>
                  </p>
                ) : (
                  <p className={layoutStyles.extracted24}>No quote attached</p>
                )}

                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => setQuoteFile(e.target.files?.[0] || null)}
                />

                <div className={layoutStyles.extracted25}>
                  <label>
                    <input type="checkbox" checked={hasHS} onChange={(e) => setHasHS(e.target.checked)} />{" "}
                    Health & Safety Completed
                  </label>
                  <br />
                  <label>
                    <input
                      type="checkbox"
                      checked={hasRiskAssessment}
                      onChange={(e) => setHasRiskAssessment(e.target.checked)}
                    />{" "}
                    Risk Assessment Completed
                  </label>
                  <br />
                  <label>
                    <input type="checkbox" checked={isCrewed} onChange={(e) => setIsCrewed(e.target.checked)} />{" "}
                    Crewed
                  </label>
                  <br />
                  <label>
                    <input
                      type="checkbox"
                      checked={isSecondPencil}
                      onChange={(e) => setIsSecondPencil(e.target.checked)}
                    />{" "}
                    Second Pencil
                  </label>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className={layoutStyles.extracted26}>
              <h3>Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={textArea}
                placeholder="Anything extra to include..."
              />
            </div>

            {/* Actions */}
            <div className={layoutStyles.extracted27}>
              <button type="submit" style={buttonStyle} disabled={saving}>
                {saving ? "Saving…" : "Save U-Crane Booking"}
              </button>

              <button type="button" onClick={() => router.push(`/job-numbers/${id}`)} style={cancelBtn}>
                Cancel
              </button>

              <button
                type="button"
                style={dangerBtn}
                onClick={async () => {
                  if (!confirm("Save a copy as a new booking?")) return;
                  try {
                    const user = auth.currentUser;

                    const customNames = customEmployee
                      ? customEmployee.split(",").map((n) => n.trim()).filter(Boolean)
                      : [];
                    const cleanedEmployees = employees
                      .filter((e) => e?.name && e.name !== "Other")
                      .map((e) => e.name)
                      .concat(customNames);

                    const payload = {
                      jobNumber: `${jobNumber}-COPY`,
                      client,
                      contactNumber,
                      contactEmail,
                      location,
                      employees: cleanedEmployees,
                      vehicles,
                      equipment, // preserved
                      isSecondPencil,
                      isCrewed,
                      notes,
                      notesByDate,
                      status,
                      shootType,
                      hasHS,
                      hasRiskAssessment,
                      quoteUrl: quoteURL,
                      ...(status !== "Enquiry"
                        ? isRange
                          ? {
                              startDate: new Date(startDate).toISOString(),
                              endDate: new Date(endDate).toISOString(),
                            }
                          : { date: new Date(startDate).toISOString() }
                        : {}),
                      createdBy: user?.email || "Unknown",
                      createdByUid: user?.uid || "",
                      lastEditedBy: user?.email || "Unknown",
                      lastEditedByUid: user?.uid || "",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      history: [
                        {
                          action: "Created (Copy)",
                          user: user?.email || "Unknown",
                          timestamp: new Date().toISOString(),
                        },
                      ],
                    };

                    const newRef = await addDoc(collection(db, "bookings"), payload);
                    alert("Copy created ");
                    router.push(`/job-numbers/${newRef.id}`);
                  } catch (err) {
                    console.error(err);
                    alert("Failed to create copy: " + err.message);
                  }
                }}
              >
                Save as Copy
              </button>
            </div>
          </form>

          {/* Summary (NO equipment shown) */}
          <div style={summaryCard}>
            <h2 style={{ margin: "0 0 10px", color: UI.text, fontSize: 16, fontWeight: 850 }}>
              Booking Summary
            </h2>

            <p>
              <strong>Job Number:</strong> {jobNumber}
            </p>
            <p>
              <strong>Status:</strong> {status}
            </p>
            <p>
              <strong>Shoot Type:</strong> {shootType}
            </p>
            <p>
              <strong>Client:</strong> {client}
            </p>
            <p>
              <strong>Contact Email:</strong> {contactEmail}
            </p>
            <p>
              <strong>Contact Number:</strong> {contactNumber}
            </p>
            <p>
              <strong>Location:</strong> {location}
            </p>

            <p>
              <strong>Health & Safety:</strong> {hasHS ? " Completed" : " Not Done"}
            </p>
            <p>
              <strong>Risk Assessment:</strong> {hasRiskAssessment ? " Completed" : " Not Done"}
            </p>

            <p>
              <strong>Dates:</strong>{" "}
              {isRange ? `${startDate || "N/A"} → ${endDate || "N/A"}` : startDate || "N/A"}
            </p>

            <p>
              <strong>Employees:</strong>{" "}
              {[
                ...employees.map((e) => `${e.role || "Role"} – ${e.name || "Unknown"}`),
                ...(customEmployee ? customEmployee.split(",").map((n) => n.trim()).filter(Boolean) : []),
              ].join(", ") || "None selected"}
            </p>

            <p>
              <strong>Vehicles:</strong> {vehicles.join(", ") || "None selected"}
            </p>

            <p>
              <strong>Notes:</strong> {notes || "None added"}
            </p>

            {quoteURL && (
              <p>
                <strong>Attached Quote:</strong>{" "}
                <a href={quoteURL} target="_blank" rel="noopener noreferrer">
                  Download Excel
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
