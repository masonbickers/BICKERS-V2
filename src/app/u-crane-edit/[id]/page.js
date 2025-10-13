"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

import { db, auth } from "../../../../firebaseConfig";import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc, // (kept in case you want "Save as copy")
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

/* ────────────────────────────────────────────────────────────────────────────
   Minimal design tokens (match your Create page vibe)
──────────────────────────────────────────────────────────────────────────── */
const pageBg = { display: "flex", minHeight: "100vh", fontFamily: "Arial, sans-serif", backgroundColor: "#f4f4f5" };
const main = { flex: 1, padding: "20px 40px", color: "#333" };
const panel = {
  display: "flex",
  gap: 40,
  flexWrap: "wrap",
  alignItems: "flex-start",
  marginTop: 20,
  backgroundColor: "#f9f9f9",
  padding: 30,
  borderRadius: 10,
  boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
  fontSize: 14,
  lineHeight: 1.6,
};
const col = { flex: "1 1 300px", minWidth: 280 };
const inputBase = { width: "90%", height: 28, marginBottom: 12, padding: "4px 6px", fontSize: 14, border: "1px solid #ccc", borderRadius: 4 };
const inputStyle = inputBase;
const textArea = { width: "100%", padding: 8, fontSize: 16, border: "1px solid #ccc", borderRadius: 4 };
const buttonStyle = { marginRight: 10, marginTop: 10, padding: "8px 12px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 700 };
const ghostBtn = { ...buttonStyle, backgroundColor: "#ccc", color: "#000" };
const dangerBtn = { ...buttonStyle, backgroundColor: "#ef4444" };

/* ────────────────────────────────────────────────────────────────────────────
   Edit Booking Page
──────────────────────────────────────────────────────────────────────────── */
export default function EditBookingPage() {
  const router = useRouter();
  const { id } = useParams();

  // lists / lookups
  const [employeeList, setEmployeeList] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState({
    "U-Crane": [],
    "Transport Lorry": [],
  });
  const [equipmentGroups, setEquipmentGroups] = useState({
    "A-Frame": [],
    "Trailer": [],
    "Battery": [],
    "Tow Dolly": [],
    "Lorry Trailer": [],
  });

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
  const [employees, setEmployees] = useState([]); // [{role, name}] or ["Alice"]
  const [customEmployee, setCustomEmployee] = useState(""); // comma separated additional names
  const [vehicles, setVehicles] = useState([]); // ["U-Crane", ...]
  const [equipment, setEquipment] = useState([]); // ["Tow Dolly", ...]
  const [quoteFile, setQuoteFile] = useState(null);
  const [quoteURL, setQuoteURL] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // derived
  const selectedDates = (() => {
    if (!startDate) return [];
    const dates = [];
    const s = new Date(startDate);
    const e = isRange && endDate ? new Date(endDate) : s;
    const cur = new Date(s);
    while (cur <= e) {
      dates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  })();

  /* ── helpers ───────────────────────────────────────────────────────────── */
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

  const isEmployeeOnHoliday = (employeeName) => {
    const selectedStart = new Date(startDate);
    const selectedEnd = isRange ? new Date(endDate) : selectedStart;

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

  /* ── initial load: lists + record ─────────────────────────────────────── */
  useEffect(() => {
    const loadAll = async () => {
      try {
        // 1) Load base collections (bookings, employees, holidays, maintenance, vehicles, equipment)
        const [bookingSnap, empSnap, holidaySnap, workSnap, vehicleSnap, equipmentSnap] =
          await Promise.all([
            getDocs(collection(db, "bookings")),
            getDocs(collection(db, "employees")),
            getDocs(collection(db, "holidays")),
            getDocs(collection(db, "workBookings")),
            getDocs(collection(db, "vehicles")),
            getDocs(collection(db, "equipment")),
          ]);

        setAllBookings(bookingSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setEmployeeList(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setHolidayBookings(holidaySnap.docs.map((d) => d.data()));
        setMaintenanceBookings(workSnap.docs.map((d) => d.data()));

        // Vehicles (group as per your create page rules)
        const groupedVehicles = { "U-Crane": [], "Transport Lorry": [] };
        vehicleSnap.docs.forEach((d) => {
          const v = d.data();
          const category = (v.category || "").trim().toLowerCase();
          const vehicle = { name: v.name, registration: v.registration || "" };

          if (category.includes("u-crane")) groupedVehicles["U-Crane"].push(vehicle);
          else if (category.includes("lorry") && !category.includes("trailer")) {
            if (vehicle.name && vehicle.name.toLowerCase().startsWith("u-crane lorry")) {
              groupedVehicles["Transport Lorry"].push(vehicle);
            }
          }
        });
        setVehicleGroups(groupedVehicles);

        // Equipment groups
        const groupedEquip = {
          "A-Frame": [],
          "Trailer": [],
          "Battery": [],
          "Tow Dolly": [],
          "Lorry Trailer": [],
        };
        equipmentSnap.docs.forEach((d) => {
          const x = d.data();
          const category = x.category || "Uncategorised";
          const name = x.name || x.label || "Unnamed Equipment";
          if (groupedEquip[category]) groupedEquip[category].push(name);
          else {
            if (!groupedEquip["Uncategorised"]) groupedEquip["Uncategorised"] = [];
            groupedEquip["Uncategorised"].push(name);
          }
        });
        setEquipmentGroups(groupedEquip);

        // 2) Load the record to edit
        const refDoc = await getDoc(doc(db, "bookings", id));
        if (!refDoc.exists()) {
          alert("Booking not found");
          router.push("/dashboard");
          return;
        }
        const data = refDoc.data();

        // Dates: support single date OR range
        const hasRange = !!(data.startDate || data.endDate);
        setIsRange(hasRange);
        setStartDate(parseDateStr(data.startDate || data.date));
        setEndDate(hasRange ? parseDateStr(data.endDate || data.startDate) : "");

        // Base fields
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

        // Employees may be strings or {role,name}
        const empVal = Array.isArray(data.employees) ? data.employees : [];
        setEmployees(
          empVal.map((e) => {
            if (typeof e === "string") return { role: "Role", name: e };
            if (e && typeof e === "object")
              return { role: e.role || "Role", name: e.name || "" };
            return { role: "Role", name: "" };
          })
        );

        setVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
        setEquipment(Array.isArray(data.equipment) ? data.equipment : []);
      } catch (err) {
        console.error(err);
        alert("Failed to load booking.");
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [id, router]);

  /* ── availability checks (booked employees/vehicles/equipment) ────────── */
  const bookedVehicles = allBookings
    .filter((b) => {
      const bookingDates = b.bookingDates || [];
      return bookingDates.some((d) => selectedDates.includes(d)) && b.id !== id;
    })
    .flatMap((b) => b.vehicles || []);

  const bookedEquipment = allBookings
    .filter((b) => {
      const bookingDates = b.bookingDates || [];
      return bookingDates.some((d) => selectedDates.includes(d)) && b.id !== id;
    })
    .flatMap((b) => b.equipment || []);

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
    .flatMap((b) => b.employees || []);

  const maintenanceBookedVehicles = maintenanceBookings
    .filter((b) => {
      const s = new Date(b.startDate);
      const e = new Date(b.endDate || b.startDate);
      return selectedDates.some((dateStr) => {
        const d = new Date(dateStr);
        return d >= s && d <= e;
      });
    })
    .map((b) => b.vehicleName);

  /* ── save/update ───────────────────────────────────────────────────────── */
  const handleUpdate = async () => {
    if (saving) return;
    setSaving(true);

    try {
      // For anything other than Enquiry, dates required
      if (status !== "Enquiry") {
        if (!startDate) {
          alert("Please select a start date.");
          setSaving(false);
          return;
        }
        if (isRange && !endDate) {
          alert("Please select an end date.");
          setSaving(false);
          return;
        }
      }

      // validate employees vs holiday
      const customNames = customEmployee
        ? customEmployee.split(",").map((n) => n.trim()).filter(Boolean)
        : [];
      const cleanedEmployees = employees
        .filter((e) => e?.name && e.name !== "Other")
        .map((e) => ({ role: e.role || "Role", name: e.name }))
        .concat(customNames.map((n) => ({ role: "Role", name: n })));

      for (const { name } of cleanedEmployees) {
        if (isEmployeeOnHoliday(name)) {
          alert(`${name} is on holiday during the selected dates.`);
          setSaving(false);
          return;
        }
      }

      // build bookingDates
      let bookingDates = [];
      if (status !== "Enquiry") {
        if (isRange && startDate && endDate) {
          const cur = new Date(startDate);
          const e = new Date(endDate);
          while (cur <= e) {
            bookingDates.push(cur.toISOString().split("T")[0]);
            cur.setDate(cur.getDate() + 1);
          }
        } else if (startDate) {
          bookingDates = [new Date(startDate).toISOString().split("T")[0]];
        }
      }

      // upload new file if provided
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
              resolve();
            }
          );
        });
      }

      const user = auth.currentUser;
      const refDoc = doc(db, "bookings", id);
      const snapshot = await getDoc(refDoc);
      const existing = snapshot.exists() ? snapshot.data() : {};

      // Build update payload (merge with existing)
      const updatePayload = {
        jobNumber,
        client,
        contactNumber,
        contactEmail,
        location,
        employees: cleanedEmployees,
        vehicles,
        equipment,
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
            ? { startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), date: null }
            : { date: new Date(startDate).toISOString(), startDate: null, endDate: null }
          : { date: null, startDate: null, endDate: null }),
        lastEditedBy: user?.email || "Unknown",
        updatedAt: new Date().toISOString(),
        history: [
          ...(Array.isArray(existing.history) ? existing.history : []),
          {
            action: "Edited",
            user: user?.email || "Unknown",
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await updateDoc(refDoc, updatePayload);
      alert("Booking updated ✅");
      router.push(`/job-numbers/${id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to update booking ❌\n\n" + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ── UI helpers ────────────────────────────────────────────────────────── */
  const roleBuckets = [
    { role: "Precision Driver", key: "u-crane driver" },
    { role: "Arm Operator", key: "arm operator" },
    { role: "Arm & Head Tech", key: "Head and Arm Tech" },
    { role: "Transport Driver", key: "transport driver" },
    { role: "Camera Operator", key: "camera operator" },
  ];

  const employeeChecked = (role, name) =>
    employees.some((e) => (typeof e === "string" ? e === name : e.name === name && e.role === role));

  const toggleEmployee = (role, name, checked) => {
    if (checked) setEmployees((prev) => [...prev, { role, name }]);
    else setEmployees((prev) => prev.filter((e) => !(e.name === name && e.role === role)));
  };

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={pageBg}>
          <div style={main}>
            <h1>✏️ Edit Booking</h1>
            <p>Loading booking…</p>
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <div style={pageBg}>
        <div style={main}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <h1 style={{ color: "#111", marginBottom: 0 }}>✏️ Edit Booking</h1>
            <span style={{ color: "#6b7280" }}>ID: {id}</span>
            <Link href={`/job-numbers/${id}`} style={{ marginLeft: "auto", textDecoration: "none", fontWeight: 700 }}>
              View Booking →
            </Link>
          </div>

          {/* FORM */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdate();
            }}
          >
            <div style={panel}>
              {/* Column 1: Job Info */}
              <div style={col}>
                <h3 style={{ marginBottom: 6 }}>Job Number</h3>
                <input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} required style={inputStyle} />

                <h3 style={{ marginBottom: 6 }}>Status</h3>
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

                <h3 style={{ marginBottom: 6 }}>Shoot Type</h3>
                <select value={shootType} onChange={(e) => setShootType(e.target.value)} style={inputStyle}>
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>

                <h3 style={{ marginBottom: 6 }}>Production Company</h3>
                <input value={client} onChange={(e) => setClient(e.target.value)} required style={inputStyle} />

                <h3 style={{ marginBottom: 6 }}>Contact Email</h3>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} />

                <h3 style={{ marginBottom: 6 }}>Contact Number</h3>
                <input type="text" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} style={inputStyle} />

                <h3 style={{ marginBottom: 6 }}>Location</h3>
                <textarea value={location} onChange={(e) => setLocation(e.target.value)} rows={2} required style={{ ...textArea, minHeight: 40 }} />
              </div>

              {/* Column 2: Dates + Crew */}
              <div style={col}>
                <h3>Dates</h3>
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <input type="checkbox" checked={isRange} onChange={() => setIsRange(!isRange)} /> Multi-day
                </label>
                {status !== "Enquiry" ? (
                  <>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={inputStyle} />
                    {isRange && (
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={inputStyle} />
                    )}
                  </>
                ) : (
                  <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 12 }}>
                    Enquiry: dates are optional and won’t be saved.
                  </div>
                )}

                <h3 style={{ marginTop: 10 }}>Crew</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {roleBuckets.map(({ role, key }) => (
                    <div key={role}>
                      <h4 style={{ marginBottom: 6 }}>{role}</h4>
                      {employeeList
                        .filter(
                          (emp) =>
                            Array.isArray(emp.jobTitle) &&
                            emp.jobTitle.some((jt) => jt.toLowerCase().trim() === key.toLowerCase().trim())
                        )
                        .map((emp) => {
                          const isBooked = bookedEmployees.includes(emp.name);
                          const isHoliday = isEmployeeOnHoliday(emp.name);
                          const disabled = isBooked || isHoliday;
                          return (
                            <label key={emp.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 15 }}>
                              <input
                                type="checkbox"
                                checked={employeeChecked(role, emp.name)}
                                disabled={disabled}
                                onChange={(e) => toggleEmployee(role, emp.name, e.target.checked)}
                              />
                              <span style={{ color: disabled ? "grey" : "#333" }}>
                                {emp.name} {isBooked && "(Booked)"} {isHoliday && "(On Holiday)"}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  ))}
                </div>

                {/* Custom employees (comma separated) */}
                <div style={{ marginTop: 10 }}>
                  <h4 style={{ marginBottom: 6 }}>Add custom crew (comma separated)</h4>
                  <input
                    placeholder="Jane Doe, John Example"
                    value={customEmployee}
                    onChange={(e) => setCustomEmployee(e.target.value)}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                </div>
              </div>

              {/* Column 3: Vehicles + Equipment + Files */}
              <div style={col}>
                <h3>Vehicles</h3>
                {["U-Crane", "Transport Lorry"].map((group) => (
                  <div key={group} style={{ marginBottom: 15 }}>
                    <h4 style={{ marginBottom: 6 }}>{group}</h4>
                    {vehicleGroups[group]?.length ? (
                      vehicleGroups[group].map((v) => {
                        const maintenanceBlocked = maintenanceBookedVehicles.includes(v.name);
                        const dateBlocked = bookedVehicles.includes(v.name);
                        const disabled = maintenanceBlocked || dateBlocked;
                        return (
                          <label key={v.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <input
                              type="checkbox"
                              value={v.name}
                              checked={vehicles.includes(v.name)}
                              disabled={disabled}
                              onChange={(e) =>
                                setVehicles((prev) =>
                                  e.target.checked ? [...prev, v.name] : prev.filter((x) => x !== v.name)
                                )
                              }
                            />
                            <span style={{ color: disabled ? "grey" : "#333" }}>
                              {v.name} {v.registration && `– ${v.registration}`}{" "}
                              {maintenanceBlocked && "(Maintenance)"} {dateBlocked && "(Booked)"}
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p style={{ fontSize: 12, color: "#666" }}>No vehicles in this category</p>
                    )}
                  </div>
                ))}

                <h3 style={{ marginTop: 10 }}>Equipment</h3>
                {Object.keys(equipmentGroups).map((group) => (
                  <div key={group} style={{ marginBottom: 12 }}>
                    <h4 style={{ marginBottom: 6 }}>{group}</h4>
                    {equipmentGroups[group]?.length ? (
                      equipmentGroups[group].map((name) => {
                        const disabled = bookedEquipment.includes(name);
                        return (
                          <label key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <input
                              type="checkbox"
                              checked={equipment.includes(name)}
                              disabled={disabled}
                              onChange={(e) =>
                                setEquipment((prev) =>
                                  e.target.checked ? [...prev, name] : prev.filter((x) => x !== name)
                                )
                              }
                            />
                            <span style={{ color: disabled ? "grey" : "#333" }}>
                              {name} {disabled && "(Booked)"}
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p style={{ fontSize: 12, color: "#666" }}>No equipment in this category</p>
                    )}
                  </div>
                ))}

                <h3 style={{ marginTop: 10 }}>Quote (Excel/CSV)</h3>
                {quoteURL ? (
                  <p style={{ margin: "6px 0 10px" }}>
                    Current:{" "}
                    <a href={quoteURL} target="_blank" rel="noopener noreferrer">
                      Download existing
                    </a>
                  </p>
                ) : (
                  <p style={{ margin: "6px 0 10px", color: "#6b7280" }}>No quote attached</p>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => setQuoteFile(e.target.files?.[0] || null)}
                />

                <div style={{ marginTop: 16 }}>
                  <label>
                    <input type="checkbox" checked={hasHS} onChange={(e) => setHasHS(e.target.checked)} /> Health & Safety
                    Completed
                  </label>
                  <br />
                  <label>
                    <input type="checkbox" checked={hasRiskAssessment} onChange={(e) => setHasRiskAssessment(e.target.checked)} />{" "}
                    Risk Assessment Completed
                  </label>
                  <br />
                  <label>
                    <input type="checkbox" checked={isCrewed} onChange={(e) => setIsCrewed(e.target.checked)} /> Crewed
                  </label>
                  <br />
                  <label>
                    <input type="checkbox" checked={isSecondPencil} onChange={(e) => setIsSecondPencil(e.target.checked)} /> Second
                    Pencil
                  </label>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginTop: 20 }}>
              <h3>Notes</h3>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} style={textArea} placeholder="Anything extra to include..." />
            </div>

            {/* Actions */}
            <div style={{ marginTop: 30, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={buttonStyle} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button type="button" onClick={() => router.push(`/job-numbers/${id}`)} style={ghostBtn}>
                Cancel
              </button>
              <button
                type="button"
                style={dangerBtn}
                onClick={async () => {
                  // Optional: quick duplicate as new booking
                  if (!confirm("Save a copy as a new booking?")) return;
                  try {
                    const user = auth.currentUser;
                    const payload = {
                      jobNumber: `${jobNumber}-COPY`,
                      client,
                      contactNumber,
                      contactEmail,
                      location,
                      employees,
                      vehicles,
                      equipment,
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
                          ? { startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString() }
                          : { date: new Date(startDate).toISOString() }
                        : {}),
                      createdBy: user?.email || "Unknown",
                      lastEditedBy: user?.email || "Unknown",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      history: [
                        { action: "Created (Copy)", user: user?.email || "Unknown", timestamp: new Date().toISOString() },
                      ],
                    };
                    const newRef = await addDoc(collection(db, "bookings"), payload);
                    alert("Copy created ✅");
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

          {/* Summary */}
          <div style={{ marginTop: 40, padding: 20, backgroundColor: "#e0f7fa", borderRadius: 8 }}>
            <h2 style={{ marginBottom: 10 }}>Booking Summary</h2>
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
              <strong>Health & Safety:</strong> {hasHS ? "✅ Completed" : "❌ Not Done"}
            </p>
            <p>
              <strong>Risk Assessment:</strong> {hasRiskAssessment ? "✅ Completed" : "❌ Not Done"}
            </p>
            <p>
              <strong>Dates:</strong>{" "}
              {status === "Enquiry" ? "— (Enquiry)" : isRange ? `${startDate || "N/A"} → ${endDate || "N/A"}` : startDate || "N/A"}
            </p>
            <p>
              <strong>Crew:</strong>{" "}
              {employees.length
                ? employees
                    .map((e) => (typeof e === "string" ? e : `${e.role || "Role"} – ${e.name || "Unknown"}`))
                    .concat(customEmployee ? customEmployee.split(",").map((n) => n.trim()) : [])
                    .join(", ")
                : "None selected"}
            </p>
            <p>
              <strong>Vehicles:</strong> {vehicles.join(", ") || "None selected"}
            </p>
            <p>
              <strong>Equipment:</strong> {equipment.join(", ") || "None selected"}
            </p>
            <p>
              <strong>Notes:</strong> {notes || "None added"}
            </p>
            {quoteURL && (
              <p>
                <strong>Attached Quote:</strong>{" "}
                <a href={quoteURL} target="_blank" rel="noopener noreferrer">
                  Download
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
