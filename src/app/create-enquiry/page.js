"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, getDocs, setDoc } from "firebase/firestore";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Package,
  Save,
  Search,
  Truck,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { auth, db } from "@/app/utils/firebaseClient";
import { contactIdFromEmail } from "@/app/utils/bookingFormShared";
import {
  loadBookingFormReferenceData,
  loadSavedContacts,
} from "@/app/utils/bookingFormReferenceData";
import {
  buildBookingDerivedFields,
  buildInitialLifecycle,
  buildInitialStatusHistory,
} from "@/app/utils/bookingLifecycle";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const UI = {
  bg: "var(--legacy-color-f3f6f9)",
  card: "var(--legacy-color-ffffff)",
  text: "var(--legacy-color-0f172a)",
  muted: "var(--legacy-color-5f6f82)",
  border: "1px solid var(--legacy-color-d7dee8)",
  radius: 8,
  shadow: "0 1px 2px rgba(15,23,42,0.05)",
  brand: "var(--legacy-color-1f4b7a)",
  brandSoft: "var(--legacy-color-edf3f8)",
  brandBorder: "var(--legacy-color-c8d6e3)",
  green: "var(--legacy-color-15803d)",
  greenSoft: "var(--legacy-color-ecfdf3)",
  greenBorder: "var(--legacy-color-bbf7d0)",
};

const pageWrap = {
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: UI.bg,
  padding: "16px 16px 32px",
};

const mainWrap = {
  color: UI.text,
  width: "100%",
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadow,
  padding: 12,
};

const pageHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const h1Style = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 900,
  color: UI.text,
};

const pageSub = {
  marginTop: 6,
  color: UI.muted,
  fontSize: 13.5,
  lineHeight: 1.45,
};

const headerChecks = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const headerChecksBox = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  padding: "10px 12px",
  border: UI.border,
  borderRadius: UI.radius,
  background: UI.card,
  boxShadow: UI.shadow,
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 0.78fr) minmax(360px, 1.1fr) minmax(360px, 1.12fr)",
  gap: 12,
  marginTop: 10,
};

const formShell = {
  display: "grid",
  gap: 12,
};

const label = {
  display: "block",
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: 5,
};

const checkboxRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 700,
  fontSize: 13,
  marginBottom: 8,
};

const accordionBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "8px 10px",
  borderRadius: UI.radius,
  border: UI.border,
  background: "linear-gradient(180deg, var(--legacy-color-ffffff) 0%, var(--legacy-color-f8fbfe) 100%)",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 12.5,
  color: UI.text,
};

const input = {
  width: "100%",
  height: 36,
  border: UI.border,
  borderRadius: UI.radius,
  padding: "7px 9px",
  fontSize: 13,
  color: UI.text,
  background: "var(--legacy-color-fff)",
  boxSizing: "border-box",
};

const textarea = {
  ...input,
  minHeight: 112,
  height: "auto",
  resize: "vertical",
};

const btn = (kind = "ghost") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radius,
  border: kind === "primary" ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
  background: kind === "primary" ? UI.brand : "var(--legacy-color-fff)",
  color: kind === "primary" ? "var(--legacy-color-fff)" : UI.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: kind === "primary" ? "0 8px 18px rgba(31,75,122,0.16)" : UI.shadow,
});

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 32,
  height: 32,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const sectionTitleRow = { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 };
const cardTitle = { margin: 0, fontSize: 15, fontWeight: 900, color: UI.text };
const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 8px",
  fontSize: 12,
  borderRadius: 999,
  background: UI.brandSoft,
  border: `1px solid ${UI.brandBorder}`,
  color: UI.brand,
  fontWeight: 700,
};

const divider = { height: 1, background: "var(--legacy-color-e2e8f0)", margin: "12px 0" };
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

const focusCss = `
  input:focus, select:focus, textarea:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: var(--legacy-color-bfdbfe) !important;
  }
  @media (max-width: 1280px) {
    .create-booking-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 760px) {
    .create-enquiry-two { grid-template-columns: 1fr !important; }
  }
`;

const parseYMDUTC = (ymd) => {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};

const formatYMDUTC = (date) => date.toISOString().slice(0, 10);

const enumerateDays = (startYMD, endYMD) => {
  const start = parseYMDUTC(startYMD);
  const end = parseYMDUTC(endYMD);
  if (!start || !end || end < start) return [];
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatYMDUTC(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
};

const nextJobNumberFromSnapshot = (snap) => {
  const max = (snap?.docs || []).reduce((currentMax, docSnap) => {
    const raw = docSnap.data()?.jobNumber;
    const value = /^\d+$/.test(String(raw || "")) ? parseInt(raw, 10) : 0;
    return Math.max(currentMax, value);
  }, 0);
  return String(max + 1).padStart(4, "0");
};

export default function CreateEnquiryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillJobNumber = String(searchParams.get("jobNumber") || "").trim();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [production, setProduction] = useState("");
  const [location, setLocation] = useState("");
  const [showInvoicingDetails, setShowInvoicingDetails] = useState(false);
  const [po, setPo] = useState("");
  const [invoiceContactName, setInvoiceContactName] = useState("");
  const [invoiceContactEmail, setInvoiceContactEmail] = useState("");
  const [invoiceContactPhone, setInvoiceContactPhone] = useState("");
  const [shootType, setShootType] = useState("Day");
  const [dateKnown, setDateKnown] = useState(false);
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [additionalContacts, setAdditionalContacts] = useState([
    { department: "", departmentOther: "", name: "", email: "", phone: "" },
  ]);
  const [savedContacts, setSavedContacts] = useState([]);
  const [savedContactsLoaded, setSavedContactsLoaded] = useState(false);
  const [savedContactsLoading, setSavedContactsLoading] = useState(false);
  const [selectedSavedContactId, setSelectedSavedContactId] = useState("");
  const [savedContactSearch, setSavedContactSearch] = useState("");
  const [referenceDataLoading, setReferenceDataLoading] = useState(true);
  const [vehicleGroups, setVehicleGroups] = useState({});
  const [openGroups, setOpenGroups] = useState({});
  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [openEquipGroups, setOpenEquipGroups] = useState({});
  const [vehicles, setVehicles] = useState([]);
  const [vehicleStatus, setVehicleStatus] = useState({});
  const [equipment, setEquipment] = useState([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadNextNumber = async () => {
      if (prefillJobNumber) {
        setJobNumber(prefillJobNumber);
        return;
      }
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load next enquiry job number" });
        return;
      }
      const snap = await getDocs(tenantCollectionQuery(db, "bookings", dataAccessState));
      setJobNumber(nextJobNumberFromSnapshot(snap));
    };
    loadNextNumber().catch((err) => console.error("Failed loading next enquiry job number:", err));
  }, [accessKey, dataAccessState, prefillJobNumber]);

  useEffect(() => {
    const loadReferenceData = async () => {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load enquiry reference data" });
        setReferenceDataLoading(false);
        return;
      }

      setReferenceDataLoading(true);
      try {
        const referenceData = await loadBookingFormReferenceData(db, { accessState: dataAccessState });
        const nextVehicleGroups = referenceData.vehicleGroups || {};
        setVehicleGroups(nextVehicleGroups);
        setOpenGroups(Object.fromEntries(Object.keys(nextVehicleGroups).map((group) => [group, false])));
        setEquipmentGroups(referenceData.equipmentGroups || {});
        setOpenEquipGroups(referenceData.openEquipGroups || {});
      } catch (err) {
        if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "load enquiry reference data" })) {
          console.error("Failed loading enquiry reference data:", err);
        }
      } finally {
        setReferenceDataLoading(false);
      }
    };
    loadReferenceData();
  }, [accessKey, dataAccessState]);

  const bookingDates = useMemo(() => {
    if (!dateKnown || !startDate) return [];
    if (isRange) return enumerateDays(startDate, endDate || startDate);
    return [startDate];
  }, [dateKnown, endDate, isRange, startDate]);

  const canSave = Boolean(jobNumber.trim() && client.trim()) && !saving;

  const normalizedAssetSearch = assetSearch.trim().toLowerCase();

  const filteredVehicleGroups = useMemo(() => {
    const entries = Object.entries(vehicleGroups);
    if (!normalizedAssetSearch) return entries;
    return entries
      .map(([group, items]) => [
        group,
        items.filter((vehicle) =>
          [group, vehicle?.name, vehicle?.registration].filter(Boolean).join(" ").toLowerCase().includes(normalizedAssetSearch)
        ),
      ])
      .filter(([, items]) => items.length);
  }, [normalizedAssetSearch, vehicleGroups]);

  const filteredEquipmentGroups = useMemo(() => {
    const entries = Object.entries(equipmentGroups);
    if (!normalizedAssetSearch) return entries;
    return entries
      .map(([group, items]) => [
        group,
        items.filter((rawName) => `${group} ${String(rawName || "").trim()}`.toLowerCase().includes(normalizedAssetSearch)),
      ])
      .filter(([, items]) => items.length);
  }, [equipmentGroups, normalizedAssetSearch]);

  const sortedSavedContacts = useMemo(() => {
    return [...savedContacts].sort((a, b) => {
      const aLabel = `${String(a?.name || "").trim()} ${String(a?.department || "").trim()}`.trim().toLowerCase();
      const bLabel = `${String(b?.name || "").trim()} ${String(b?.department || "").trim()}`.trim().toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [savedContacts]);

  const filteredSavedContacts = useMemo(() => {
    const query = savedContactSearch.trim().toLowerCase();
    if (!query) return sortedSavedContacts;
    return sortedSavedContacts.filter((contact) =>
      [contact?.name, contact?.department, contact?.email, contact?.phone, contact?.number]
        .map((value) => String(value || "").trim().toLowerCase())
        .join(" ")
        .includes(query)
    );
  }, [savedContactSearch, sortedSavedContacts]);

  useEffect(() => {
    setOpenEquipGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(equipmentGroups).forEach(([group, items]) => {
        if (items?.some((name) => equipment.includes(name)) && !next[group]) {
          next[group] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [equipment, equipmentGroups]);

  const handleAddContactRow = () => {
    setAdditionalContacts((prev) => [
      ...prev,
      { department: "", departmentOther: "", name: "", email: "", phone: "" },
    ]);
  };

  const handleUpdateContactRow = (index, key, value) => {
    setAdditionalContacts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  };

  const handleRemoveContactRow = (index) => {
    setAdditionalContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const ensureSavedContactsLoaded = async () => {
    if (savedContactsLoaded || savedContactsLoading) return;
    setSavedContactsLoading(true);
    try {
      const contacts = await loadSavedContacts(db, { accessState: dataAccessState, force: true });
      setSavedContacts(contacts || []);
      setSavedContactsLoaded(true);
    } catch (err) {
      if (!handleFirestoreAccessError(err, { collectionName: "contacts", operation: "load saved contacts" })) {
        console.error("Failed loading saved contacts:", err);
      }
    } finally {
      setSavedContactsLoading(false);
    }
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

  const toggleVehicle = (vehicleId, checked) => {
    setVehicles((prev) => (checked ? Array.from(new Set([...prev, vehicleId])) : prev.filter((v) => v !== vehicleId)));
    setVehicleStatus((prev) => {
      const next = { ...prev };
      if (checked) next[vehicleId] = next[vehicleId] || "Enquiry";
      else delete next[vehicleId];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    if (dateKnown && isRange && endDate && endDate < startDate) {
      alert("End date must be after the start date.");
      return;
    }

    const gate = resolveDataAccess(dataAccessState);
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "create enquiry" });
      alert(gate.reason || "You do not have access to create enquiries.");
      return;
    }

    const user = auth.currentUser;
    const nowIso = new Date().toISOString();
    const status = "Enquiry";
    const additionalContactsToSave = (additionalContacts || [])
      .map((c) => ({
        department: c.department === "Other" && c.departmentOther ? c.departmentOther : c.department || "",
        name: (c.name || "").trim(),
        email: (c.email || "").trim(),
        phone: (c.phone || "").trim(),
      }))
      .filter((c) => c.department || c.name || c.email || c.phone);
    const primaryContact = additionalContactsToSave[0] || {};

    const derivedFields = buildBookingDerivedFields({
      status,
      bookingDates,
      createdAt: nowIso,
      vehicles,
      equipment,
      additionalContacts: additionalContactsToSave,
    });

    const payload = {
      jobNumber: jobNumber.trim(),
      client: client.trim(),
      production: production.trim(),
      location: location.trim(),
      po: po.trim(),
      invoiceContactName: invoiceContactName.trim(),
      invoiceContactEmail: invoiceContactEmail.trim(),
      invoiceContactPhone: invoiceContactPhone.trim(),
      status,
      shootType,
      bookingDates,
      date: bookingDates.length === 1 ? new Date(bookingDates[0]).toISOString() : null,
      startDate: bookingDates.length > 1 ? new Date(bookingDates[0]).toISOString() : null,
      endDate: bookingDates.length > 1 ? new Date(bookingDates[bookingDates.length - 1]).toISOString() : null,
      dateISO: bookingDates.length === 1 ? bookingDates[0] : "",
      startDateISO: bookingDates.length > 1 ? bookingDates[0] : "",
      endDateISO: bookingDates.length > 1 ? bookingDates[bookingDates.length - 1] : "",
      employees: [],
      employeesByDate: {},
      employeeCodes: [],
      employeeNames: [],
      vehicles,
      vehicleStatus,
      equipment,
      isSecondPencil: false,
      isCrewed: false,
      hasHS: false,
      hasRiskAssessment: false,
      offRoadTracking: false,
      requiredCrewCount: 0,
      allocatedCrewCount: 0,
      notes,
      notesByDate: {},
      dayNotes: {},
      additionalContacts: additionalContactsToSave,
      contactEmail: primaryContact.email || "",
      contactNumber: primaryContact.phone || "",
      createdBy: user?.email || "Unknown",
      createdByUid: user?.uid || "",
      lastEditedBy: user?.email || "Unknown",
      lastEditedByUid: user?.uid || "",
      createdAt: nowIso,
      updatedAt: nowIso,
      statusChangedAt: nowIso,
      statusHistory: buildInitialStatusHistory(status, nowIso, {
        email: user?.email || "Unknown",
        uid: user?.uid || "",
      }),
      lifecycle: buildInitialLifecycle(status, nowIso),
      ...derivedFields,
      history: [
        {
          action: "Created Enquiry",
          user: user?.email || "Unknown",
          timestamp: nowIso,
        },
      ],
    };

    setSaving(true);
    try {
      const created = await addDoc(collection(db, "bookings"), tenantPayload(dataAccessState, payload));
      for (const contact of additionalContactsToSave) {
        const id = contactIdFromEmail(contact.email);
        if (!id) continue;
        await setDoc(
          doc(db, "contacts", id),
          tenantPayload(dataAccessState, {
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            number: contact.phone,
            department: contact.department,
            updatedAt: nowIso,
          }),
          { merge: true }
        );
      }
      router.push(`/job-numbers/${created.id}`);
    } catch (err) {
      console.error("Failed saving enquiry:", err);
      alert(`Failed to save enquiry\n\n${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div style={pageWrap}>
        <div style={mainWrap}>
          <div style={pageHeader}>
            <div>
              <h1 style={h1Style}>Create Enquiry</h1>
              <div style={pageSub}>Capture the early job details now. Dates and crew can be added later if they are not known yet.</div>
            </div>
            <div style={{ ...pill, alignSelf: "flex-start", padding: "6px 10px" }}>
              <ClipboardList size={14} />
              Job {jobNumber || "Draft"}
            </div>
          </div>

          <div style={headerChecks}>
            <div style={headerChecksBox}>
              <span style={iconBox(dateKnown ? UI.green : UI.brand, dateKnown ? UI.greenSoft : UI.brandSoft, dateKnown ? UI.greenBorder : UI.brandBorder)}>
                <CalendarDays size={17} />
              </span>
              <div style={{ display: "grid", gap: 4, flex: 1 }}>
                <label style={{ ...checkboxRow, marginBottom: 0 }}>
                  <input type="checkbox" checked={dateKnown} onChange={(e) => setDateKnown(e.target.checked)} />
                  Dates available
                </label>
                <div style={{ fontSize: 12, color: UI.muted }}>
                  Leave unticked when production has not supplied dates yet.
                </div>
              </div>
            </div>

            <div style={headerChecksBox}>
              <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}>
                <CheckCircle2 size={17} />
              </span>
              <div style={{ display: "grid", gap: 4, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>Enquiry workflow</div>
                <div style={{ fontSize: 12, color: UI.muted }}>
                  Saved as an enquiry and excluded from asset availability checks.
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={formShell}>
              <div className="create-booking-grid" style={sectionGrid}>
                <div style={card}>
                  <div style={sectionTitleRow}>
                    <span style={iconBox()}><FileText size={17} /></span>
                    <h3 style={cardTitle}>Job Info</h3>
                  </div>

                  <label style={label}>Job Number</label>
                  <input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} required style={input} />

                  <label style={label}>Status</label>
                  <input value="Enquiry" readOnly style={{ ...input, background: "var(--legacy-color-f8fafc)", color: UI.muted }} />

                  <div style={divider} />

                  <label style={label}>Shoot Type</label>
                  <select value={shootType} onChange={(e) => setShootType(e.target.value)} style={input}>
                    <option>Day</option>
                    <option>Night</option>
                    <option>Travel</option>
                    <option>Prep</option>
                    <option>Other</option>
                  </select>

                  <label style={label}>Production Company</label>
                  <input value={client} onChange={(e) => setClient(e.target.value)} style={input} required />

                  <label style={label}>Production</label>
                  <input value={production} onChange={(e) => setProduction(e.target.value)} style={input} />

                  <label style={label}>Location</label>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} style={input} placeholder="Optional at enquiry stage" />

                  <div style={{ marginTop: 10, padding: 10, borderRadius: UI.radius, border: UI.border, background: "var(--legacy-color-f8fafc)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                      <input type="checkbox" checked={showInvoicingDetails} onChange={(e) => setShowInvoicingDetails(e.target.checked)} />
                      Add invoicing details
                    </label>
                    {showInvoicingDetails && (
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        <div>
                          <label style={{ ...label, marginTop: 0 }}>Purchase Order (PO)</label>
                          <input value={po} onChange={(e) => setPo(e.target.value)} style={{ ...input, background: "var(--legacy-color-fff)" }} placeholder="PO reference for invoicing" />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                          <div>
                            <label style={{ ...label, marginTop: 0 }}>Invoicing contact</label>
                            <input value={invoiceContactName} onChange={(e) => setInvoiceContactName(e.target.value)} style={{ ...input, background: "var(--legacy-color-fff)" }} placeholder="Name" />
                          </div>
                          <div>
                            <label style={{ ...label, marginTop: 0 }}>Email</label>
                            <input type="email" value={invoiceContactEmail} onChange={(e) => setInvoiceContactEmail(e.target.value)} style={{ ...input, background: "var(--legacy-color-fff)" }} placeholder="accounts@example.com" />
                          </div>
                        </div>
                        <div>
                          <label style={{ ...label, marginTop: 0 }}>Phone</label>
                          <input type="tel" value={invoiceContactPhone} onChange={(e) => setInvoiceContactPhone(e.target.value)} style={{ ...input, background: "var(--legacy-color-fff)" }} placeholder="Optional phone number" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={divider} />

                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      borderRadius: UI.radius,
                      border: UI.border,
                      background: "var(--legacy-color-f8fafc)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Contacts</span>
                      <button type="button" onClick={handleAddContactRow} style={{ ...btn(), padding: "4px 8px", fontSize: 12, borderRadius: 999 }}>
                        + Add contact
                      </button>
                    </div>

                    {additionalContacts.map((row, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: 8,
                          padding: 8,
                          borderRadius: UI.radius,
                          background: "var(--legacy-color-ffffff)",
                          border: "1px solid var(--legacy-color-e5e7eb)",
                        }}
                      >
                        <div className="create-enquiry-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div>
                            <label style={{ ...label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Department</label>
                            <select value={row.department} onChange={(e) => handleUpdateContactRow(idx, "department", e.target.value)} style={input}>
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
                                onChange={(e) => handleUpdateContactRow(idx, "departmentOther", e.target.value)}
                                style={{ ...input, marginTop: 6 }}
                              />
                            )}
                          </div>

                          <div>
                            <label style={{ ...label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Name</label>
                            <input type="text" value={row.name} onChange={(e) => handleUpdateContactRow(idx, "name", e.target.value)} style={input} placeholder="Contact name" />
                          </div>
                        </div>

                        <div className="create-enquiry-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={{ ...label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Email</label>
                            <input type="email" value={row.email} onChange={(e) => handleUpdateContactRow(idx, "email", e.target.value)} style={input} placeholder="Email" />
                          </div>
                          <div>
                            <label style={{ ...label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Number</label>
                            <input type="tel" value={row.phone} onChange={(e) => handleUpdateContactRow(idx, "phone", e.target.value)} style={input} placeholder="Phone number" />
                          </div>
                        </div>

                        <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveContactRow(idx)}
                            style={{
                              ...btn(),
                              padding: "4px 8px",
                              fontSize: 11,
                              borderRadius: 999,
                              border: "1px solid var(--legacy-color-dc2626)",
                              color: "var(--legacy-color-dc2626)",
                              background: "var(--legacy-color-fff)",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}

                    <div style={{ marginTop: 6 }}>
                      <label style={{ ...label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>
                        Quick add from saved contacts
                      </label>
                      {!savedContactsLoaded ? (
                        <button
                          type="button"
                          onClick={ensureSavedContactsLoaded}
                          disabled={savedContactsLoading}
                          style={{ ...btn(), width: "100%", justifyContent: "center" }}
                        >
                          {savedContactsLoading ? "Loading saved contacts..." : "Load saved contacts"}
                        </button>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={savedContactSearch}
                            onChange={(e) => setSavedContactSearch(e.target.value)}
                            placeholder="Search saved contacts..."
                            style={{ ...input, marginBottom: 6 }}
                          />
                          <select
                            value={selectedSavedContactId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedSavedContactId(val);
                              if (val) {
                                handleQuickAddSavedContact(val);
                                setSelectedSavedContactId("");
                              }
                            }}
                            style={input}
                          >
                            <option value="">{filteredSavedContacts.length ? "Select saved contact" : "No saved contacts match"}</option>
                            {filteredSavedContacts.map((c) => {
                              const labelBase = c.name || c.email || "Unnamed";
                              const deptLabel = c.department ? ` - ${c.department}` : "";
                              return (
                                <option key={c.id} value={c.id}>
                                  {labelBase}
                                  {deptLabel}
                                </option>
                              );
                            })}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={card}>
                  <div style={sectionTitleRow}>
                    <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}><CalendarDays size={17} /></span>
                    <h3 style={cardTitle}>Dates</h3>
                  </div>

                  <label style={{ ...checkboxRow, marginBottom: 10 }}>
                    <input type="checkbox" checked={dateKnown} onChange={(e) => setDateKnown(e.target.checked)} />
                    Date is available
                  </label>

                  {dateKnown ? (
                    <>
                      <label style={label}>Start Date</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={input} />

                      <label style={{ ...checkboxRow, marginTop: 10 }}>
                        <input type="checkbox" checked={isRange} onChange={(e) => setIsRange(e.target.checked)} />
                        Multi-day enquiry
                      </label>

                      <label style={label}>End Date</label>
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!isRange} style={{ ...input, opacity: isRange ? 1 : 0.55 }} />
                    </>
                  ) : (
                    <div style={{ border: UI.border, borderRadius: UI.radius, padding: 10, background: "var(--legacy-color-f8fafc)", color: UI.muted, fontSize: 13 }}>
                      No dates recorded yet.
                    </div>
                  )}

                  <div style={divider} />

                  <div style={{ ...sectionTitleRow, marginBottom: 8 }}>
                    <span style={iconBox()}><FileText size={17} /></span>
                    <h3 style={cardTitle}>Notes</h3>
                  </div>
                  <label style={{ ...label, marginTop: 0, marginBottom: 3 }}>Additional Notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...textarea, minHeight: 92 }} placeholder="Anything known at enquiry stage..." />
                </div>

                <div style={card}>
                  <div style={sectionTitleRow}>
                    <span style={iconBox(UI.brand, UI.brandSoft, UI.brandBorder)}><Truck size={17} /></span>
                    <h3 style={cardTitle}>Vehicles</h3>
                  </div>

                  {referenceDataLoading && (
                    <div style={{ border: UI.border, borderRadius: UI.radius, padding: 10, background: "var(--legacy-color-f8fafc)", color: UI.muted, fontSize: 13, marginBottom: 10 }}>
                      Loading vehicles and equipment...
                    </div>
                  )}

                  <div style={{ position: "relative", marginBottom: 12 }}>
                    <Search size={16} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} />
                    <input
                      type="text"
                      value={assetSearch}
                      onChange={(e) => setAssetSearch(e.target.value)}
                      placeholder="Search vehicles and equipment..."
                      style={{ ...input, paddingLeft: 34 }}
                    />
                  </div>

                  <div className="create-enquiry-two" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 12, rowGap: 10, alignItems: "start" }}>
                    {filteredVehicleGroups.map(([group, items]) => {
                      const isOpen = openGroups[group] || false;
                      return (
                        <div key={group}>
                          <button type="button" onClick={() => setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))} style={accordionBtn}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {group}
                            </span>
                            <span style={pill}>{items.length}</span>
                          </button>

                          {isOpen && (
                            <div style={{ padding: "10px 6px" }}>
                              {items.map((vehicle) => {
                                const key = vehicle.id;
                                const isSelected = vehicles.includes(key);
                                return (
                                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                    <input type="checkbox" checked={isSelected} onChange={(e) => toggleVehicle(key, e.target.checked)} />
                                    <span style={{ flex: 1 }}>
                                      {vehicle.name}
                                      {vehicle.registration ? ` - ${vehicle.registration}` : ""}
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

                  {filteredVehicleGroups.length === 0 && (
                    <div style={{ fontSize: 13, color: UI.muted, marginTop: 4 }}>No vehicles match that search.</div>
                  )}

                  <div style={divider} />

                  <div style={sectionTitleRow}>
                    <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}><Package size={17} /></span>
                    <h3 style={cardTitle}>Equipment</h3>
                  </div>

                  <div className="create-enquiry-two" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 12, rowGap: 10, alignItems: "start" }}>
                    {filteredEquipmentGroups.map(([group, items]) => {
                      const isOpen = openEquipGroups[group] || false;
                      return (
                        <div key={group}>
                          <button type="button" onClick={() => setOpenEquipGroups((prev) => ({ ...prev, [group]: !prev[group] }))} style={accordionBtn}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {group}
                            </span>
                            <span style={pill}>{items.length}</span>
                          </button>

                          {isOpen && (
                            <div style={{ padding: "10px 6px" }}>
                              {items.map((rawName) => {
                                const name = String(rawName || "").trim();
                                const isSelected = equipment.includes(name);
                                return (
                                  <label key={name} style={{ display: "block", marginBottom: 6 }}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) setEquipment((prev) => Array.from(new Set([...prev, name])));
                                        else setEquipment((prev) => prev.filter((item) => item !== name));
                                      }}
                                    />{" "}
                                    {name}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {filteredEquipmentGroups.length === 0 && (
                    <div style={{ fontSize: 13, color: UI.muted, marginTop: 4 }}>No equipment matches that search.</div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="submit" disabled={!canSave} style={{ ...btn("primary"), opacity: canSave ? 1 : 0.55, cursor: canSave ? "pointer" : "not-allowed" }}>
                  <Save size={14} />
                  {saving ? "Saving..." : "Save Enquiry"}
                </button>
                <button type="button" onClick={() => router.push("/job-home")} style={btn()}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
