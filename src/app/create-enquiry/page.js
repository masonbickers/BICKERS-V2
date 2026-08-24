"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, getDocs, setDoc } from "firebase/firestore";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Package,
  Save,
  Search,
  Truck,
  X,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import SavedContactPicker from "@/app/components/SavedContactPicker";
import { auth, db } from "@/app/utils/firebaseClient";
import {
  buildExistingJobDetailsLookup,
  contactIdFromEmail,
  mergeBookingContacts,
  normalizeJobNumberForLookup,
} from "@/app/utils/bookingFormShared";
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
import { UI_TOKENS } from "@/app/utils/uiTokens";

const UI = UI_TOKENS;

const pageWrap = {
  minHeight: "100%",
  boxSizing: "border-box",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: UI.page,
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

const label = {
  display: "block",
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: 5,
};

const accordionBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "8px 10px",
  borderRadius: UI.radius,
  border: UI.border,
  background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
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
  background: "var(--color-surface)",
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
  border: kind === "primary" ? "1px solid var(--button-primary-border)" : `1px solid ${UI.brandBorder}`,
  background: kind === "primary" ? "var(--button-primary-background)" : "var(--color-surface)",
  color: kind === "primary" ? "var(--button-primary-text)" : UI.text,
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
    border-color: var(--color-info-border) !important;
  }
  @media (max-width: 1280px) {
    .create-booking-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 760px) {
    .create-enquiry-two { grid-template-columns: 1fr !important; }
  }
`;

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
  const [additionalContacts, setAdditionalContacts] = useState([]);
  const [contactsExpanded, setContactsExpanded] = useState(false);
  const [savedContacts, setSavedContacts] = useState([]);
  const [savedContactsLoaded, setSavedContactsLoaded] = useState(false);
  const [savedContactsLoading, setSavedContactsLoading] = useState(false);
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
  const [resourceTab, setResourceTab] = useState("vehicles");
  const [notes, setNotes] = useState("");
  const [savingAction, setSavingAction] = useState("");
  const [existingJobDetailsByNumber, setExistingJobDetailsByNumber] = useState({});
  const [dismissedExistingJobNumber, setDismissedExistingJobNumber] = useState("");

  useEffect(() => {
    const loadNextNumber = async () => {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load next enquiry job number" });
        return;
      }
      const snap = await getDocs(tenantCollectionQuery(db, "bookings", dataAccessState));
      setExistingJobDetailsByNumber(
        buildExistingJobDetailsLookup((snap?.docs || []).map((docSnap) => docSnap.data()))
      );
      setJobNumber(prefillJobNumber || nextJobNumberFromSnapshot(snap));
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

  const bookingDates = useMemo(() => [], []);

  const saving = Boolean(savingAction);
  const canSave = Boolean(jobNumber.trim() && client.trim()) && !saving;
  const normalizedJobNumber = normalizeJobNumberForLookup(jobNumber);
  const existingJobDetails = existingJobDetailsByNumber[normalizedJobNumber] || null;
  const shouldOfferExistingJobDetails = Boolean(
    existingJobDetails &&
      dismissedExistingJobNumber !== normalizedJobNumber &&
      (client.trim() !== existingJobDetails.client ||
        production.trim() !== existingJobDetails.production ||
        (existingJobDetails.additionalContacts.length > 0 && additionalContacts.length === 0))
  );

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

  const selectedVehicleDetails = useMemo(() => {
    const byId = new Map(
      Object.values(vehicleGroups)
        .flat()
        .filter(Boolean)
        .map((vehicle) => [vehicle.id, vehicle])
    );
    return vehicles.map((vehicleId) => byId.get(vehicleId)).filter(Boolean);
  }, [vehicleGroups, vehicles]);

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

  const handleSubmit = async ({ openQuote = false } = {}) => {
    if (!canSave) return;

    const gate = resolveDataAccess(dataAccessState);
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "create enquiry" });
      systemDialogs.showSystemNotification(gate.reason || "You do not have access to create enquiries.");
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

    setSavingAction(openQuote ? "quote" : "enquiry");
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
      router.push(openQuote ? `/quote/${created.id}` : `/job-numbers/${created.id}`);
    } catch (err) {
      console.error("Failed saving enquiry:", err);
      systemDialogs.showSystemNotification(`Failed to save enquiry\n\n${err.message}`);
    } finally {
      setSavingAction("");
    }
  };

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div className={layoutStyles.pageShell} style={pageWrap}>
        <div className={layoutStyles.workspaceMain} style={mainWrap}>
          <div className={`${layoutStyles.extracted1} ${layoutStyles.compactPageHeader}`}>
            <div className={layoutStyles.compactTitleBlock}>
              <div className={layoutStyles.compactTitleLine}>
                <h1 style={h1Style}>Create Enquiry</h1>
                <span className={layoutStyles.jobReference}><ClipboardList size={13} /> Job {jobNumber || "Draft"}</span>
              </div>
              <div style={pageSub}>
                {client || "Production company"} · {production || "Production"} · Early-stage enquiry
              </div>
            </div>
            <button
              type="button"
              className={layoutStyles.primaryAction}
              disabled={!canSave}
              title="Save enquiry and open quote page"
              onClick={() => handleSubmit({ openQuote: true })}
              style={{
                ...btn("primary"),
                opacity: canSave ? 1 : 0.55,
                cursor: canSave ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              <FileText size={14} /> {savingAction === "quote" ? "Saving..." : "Create Quote"}
            </button>
          </div>

          <div className={layoutStyles.compactControlBar}>
            <span className={layoutStyles.compactControl}>
              <CalendarDays size={14} /> No dates required
            </span>
            <span className={layoutStyles.controlDivider} aria-hidden="true" />
            <span className={layoutStyles.compactControlHint}>
              Dates and crew are added later when the enquiry becomes a booking; selected assets are notes only and are not reserved.
            </span>
          </div>

          <form
            className={layoutStyles.workspaceForm}
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <div className={layoutStyles.extracted7}>
              <div className={`create-booking-grid ${layoutStyles.extracted8} ${layoutStyles.bookingColumns} ${layoutStyles.enquiryColumns}`} >
                <div style={card}>
                  <div className={layoutStyles.extracted9}>
                    <span style={iconBox()}><FileText size={17} /></span>
                    <h3 style={cardTitle}>Job Info</h3>
                  </div>

                  <div className={layoutStyles.jobFieldGrid}>
                    <div>
                      <label style={label}>Job Number</label>
                      <input
                        value={jobNumber}
                        onChange={(e) => {
                          setJobNumber(e.target.value);
                          setDismissedExistingJobNumber("");
                        }}
                        required
                        style={input}
                      />
                    </div>
                    <div>
                      <label style={label}>Status</label>
                      <input value="Enquiry" readOnly style={{ ...input, background: "var(--color-surface-subtle)", color: UI.muted }} />
                    </div>
                    <div>
                      <label style={label}>Shoot Type</label>
                      <select value={shootType} onChange={(e) => setShootType(e.target.value)} style={input}>
                        <option>Day</option>
                        <option>Night</option>
                      </select>
                    </div>
                    <div>
                      <label style={label}>Location</label>
                      <input value={location} onChange={(e) => setLocation(e.target.value)} style={input} placeholder="Optional at enquiry stage" />
                    </div>
                  </div>

                  {shouldOfferExistingJobDetails && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: UI.radius,
                        border: `1px solid ${UI.brandBorder}`,
                        background: UI.brandSoft,
                        color: UI.text,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800 }}>
                        Job {jobNumber.trim()} already has {existingJobDetails.bookingCount}{" "}
                        {existingJobDetails.bookingCount === 1 ? "booking" : "bookings"}.
                      </div>
                      <div style={{ marginTop: 4, color: UI.muted, fontSize: 12 }}>
                        Use Production Company: {existingJobDetails.client || "Not set"} · Production:{" "}
                        {existingJobDetails.production || "Not set"}
                        {existingJobDetails.additionalContacts.length > 0
                          ? ` · ${existingJobDetails.additionalContacts.length} ${
                              existingJobDetails.additionalContacts.length === 1 ? "contact" : "contacts"
                            }`
                          : ""}
                        ?
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (existingJobDetails.client) setClient(existingJobDetails.client);
                            if (existingJobDetails.production) setProduction(existingJobDetails.production);
                            if (existingJobDetails.additionalContacts.length) {
                              setAdditionalContacts((current) =>
                                mergeBookingContacts(existingJobDetails.additionalContacts, current)
                              );
                            }
                            setDismissedExistingJobNumber(normalizedJobNumber);
                          }}
                          style={{ ...btn("primary"), padding: "6px 10px", fontSize: 12 }}
                        >
                          Use details & contacts
                        </button>
                        <button
                          type="button"
                          onClick={() => setDismissedExistingJobNumber(normalizedJobNumber)}
                          style={{ ...btn(), padding: "6px 10px", fontSize: 12 }}
                        >
                          Keep my details
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={layoutStyles.extracted10} />

                  <div className={layoutStyles.jobFieldGrid}>
                    <div>
                      <label style={label}>Production Company</label>
                      <input value={client} onChange={(e) => setClient(e.target.value)} style={input} required />
                    </div>
                    <div>
                      <label style={label}>Production</label>
                      <input value={production} onChange={(e) => setProduction(e.target.value)} style={input} />
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      borderRadius: UI.radius,
                      border: UI.border,
                      background: "var(--color-surface-subtle)",
                    }}
                  >
                    <div className={layoutStyles.extracted15}>
                      <span className={layoutStyles.extracted16}>Contacts</span>
                      <div className={layoutStyles.contactActions}>
                        {contactsExpanded && (
                          <button type="button" onClick={handleAddContactRow} style={{ ...btn(), padding: "4px 8px", fontSize: 12, borderRadius: 999 }}>+ Add contact</button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!contactsExpanded) ensureSavedContactsLoaded();
                            setContactsExpanded((open) => !open);
                          }}
                          style={{ ...btn(), padding: "4px 8px", fontSize: 12, borderRadius: 999 }}
                        >
                          {contactsExpanded ? "Done" : additionalContacts.length ? "Edit" : "+ Add contact"}
                        </button>
                      </div>
                    </div>

                    {!contactsExpanded ? (
                      <button
                        type="button"
                        className={layoutStyles.contactSummary}
                        onClick={() => {
                          ensureSavedContactsLoaded();
                          setContactsExpanded(true);
                        }}
                      >
                        {additionalContacts.length ? (
                          additionalContacts.map((contact, index) => (
                            <span key={`${contact.name || contact.email || "contact"}-${index}`}>
                              <strong>{contact.name || contact.email || "Unnamed contact"}</strong>
                              <small>{contact.department === "Other" ? contact.departmentOther : contact.department || "No department"}</small>
                            </span>
                          ))
                        ) : (
                          <span><strong>No contacts added</strong><small>Add a production contact</small></span>
                        )}
                        <ChevronRight size={16} />
                      </button>
                    ) : (
                      <>
                    {additionalContacts.map((row, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: 8,
                          padding: 8,
                          borderRadius: UI.radius,
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        <div className={`create-enquiry-two ${layoutStyles.extracted17}`} >
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

                        <div className={`create-enquiry-two ${layoutStyles.extracted18}`} >
                          <div>
                            <label style={{ ...label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Email</label>
                            <input type="email" value={row.email} onChange={(e) => handleUpdateContactRow(idx, "email", e.target.value)} style={input} placeholder="Email" />
                          </div>
                          <div>
                            <label style={{ ...label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Number</label>
                            <input type="tel" value={row.phone} onChange={(e) => handleUpdateContactRow(idx, "phone", e.target.value)} style={input} placeholder="Phone number" />
                          </div>
                        </div>

                        <div className={layoutStyles.extracted19}>
                          <button
                            type="button"
                            onClick={() => handleRemoveContactRow(idx)}
                            style={{
                              ...btn(),
                              padding: "4px 8px",
                              fontSize: 11,
                              borderRadius: 999,
                              border: "1px solid var(--color-danger)",
                              color: "var(--color-danger)",
                              background: "var(--color-surface)",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}

                    <SavedContactPicker
                      contacts={filteredSavedContacts}
                      existingContacts={additionalContacts}
                      loaded={savedContactsLoaded}
                      loading={savedContactsLoading}
                      query={savedContactSearch}
                      onQueryChange={setSavedContactSearch}
                      onLoad={ensureSavedContactsLoaded}
                      onSelect={handleQuickAddSavedContact}
                    />
                      </>
                    )}
                  </div>

                  <div style={{ marginTop: 12, padding: 10, borderRadius: UI.radius, border: UI.border, background: "var(--color-surface-subtle)" }}>
                    <label className={layoutStyles.extracted11}>
                      <input type="checkbox" checked={showInvoicingDetails} onChange={(e) => setShowInvoicingDetails(e.target.checked)} />
                      Add invoicing details
                    </label>
                    {showInvoicingDetails && (
                      <div className={layoutStyles.extracted12}>
                        <div>
                          <label style={{ ...label, marginTop: 0 }}>Purchase Order (PO)</label>
                          <input value={po} onChange={(e) => setPo(e.target.value)} style={{ ...input, background: "var(--color-surface)" }} placeholder="PO reference for invoicing" />
                        </div>
                        <div className={layoutStyles.extracted13}>
                          <div>
                            <label style={{ ...label, marginTop: 0 }}>Invoicing contact</label>
                            <input value={invoiceContactName} onChange={(e) => setInvoiceContactName(e.target.value)} style={{ ...input, background: "var(--color-surface)" }} placeholder="Name" />
                          </div>
                          <div>
                            <label style={{ ...label, marginTop: 0 }}>Email</label>
                            <input type="email" value={invoiceContactEmail} onChange={(e) => setInvoiceContactEmail(e.target.value)} style={{ ...input, background: "var(--color-surface)" }} placeholder="accounts@example.com" />
                          </div>
                        </div>
                        <div>
                          <label style={{ ...label, marginTop: 0 }}>Phone</label>
                          <input type="tel" value={invoiceContactPhone} onChange={(e) => setInvoiceContactPhone(e.target.value)} style={{ ...input, background: "var(--color-surface)" }} placeholder="Optional phone number" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={layoutStyles.enquiryDetailsSection}>
                  <div className={layoutStyles.extracted25}>
                    <span style={iconBox()}><FileText size={17} /></span>
                    <h3 style={cardTitle}>Enquiry Details</h3>
                  </div>
                  <label style={{ ...label, marginTop: 0, marginBottom: 3 }}>Additional Notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...textarea, minHeight: 92 }} placeholder="Anything known at enquiry stage..." />
                  </div>
                </div>

                <div className={layoutStyles.resourceCard} style={card}>
                  <div className={layoutStyles.extracted26}>
                    <span style={iconBox(UI.brand, UI.brandSoft, UI.brandBorder)}><Truck size={17} /></span>
                    <h3 style={cardTitle}>Vehicles &amp; Resources</h3>
                  </div>

                  {referenceDataLoading && (
                    <div style={{ border: UI.border, borderRadius: UI.radius, padding: 10, background: "var(--color-surface-subtle)", color: UI.muted, fontSize: 13, marginBottom: 10 }}>
                      Loading vehicles and equipment...
                    </div>
                  )}

                  <div className={layoutStyles.resourceHeader}>
                    <div className={layoutStyles.resourceTabs} role="tablist" aria-label="Enquiry resources">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={resourceTab === "vehicles"}
                        className={resourceTab === "vehicles" ? layoutStyles.resourceTabActive : layoutStyles.resourceTab}
                        onClick={() => setResourceTab("vehicles")}
                      >
                        <Truck size={15} /> Vehicles <span>{vehicles.length}</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={resourceTab === "equipment"}
                        className={resourceTab === "equipment" ? layoutStyles.resourceTabActive : layoutStyles.resourceTab}
                        onClick={() => setResourceTab("equipment")}
                      >
                        <Package size={15} /> Equipment <span>{equipment.length}</span>
                      </button>
                    </div>
                    <small className={layoutStyles.resourceSelectionSummary}>{vehicles.length + equipment.length} selected</small>
                  </div>

                  {(selectedVehicleDetails.length > 0 || equipment.length > 0) && (
                    <div className={layoutStyles.selectedResources} aria-label="Selected resources">
                      {selectedVehicleDetails.map((vehicle) => (
                        <span className={layoutStyles.selectionChip} key={vehicle.id}>
                          <Truck size={13} /> {vehicle.name}{vehicle.registration ? ` · ${vehicle.registration}` : ""}
                          <button type="button" aria-label={`Remove ${vehicle.name}`} onClick={() => toggleVehicle(vehicle.id, false)}><X size={12} /></button>
                        </span>
                      ))}
                      {equipment.map((name) => (
                        <span className={layoutStyles.selectionChip} key={name}>
                          <Package size={13} /> {name}
                          <button type="button" aria-label={`Remove ${name}`} onClick={() => setEquipment((current) => current.filter((item) => item !== name))}><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={layoutStyles.extracted27}>
                    <Search size={16} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} />
                    <input
                      type="text"
                      value={assetSearch}
                      onChange={(e) => setAssetSearch(e.target.value)}
                      placeholder={resourceTab === "vehicles" ? "Search vehicles..." : "Search equipment..."}
                      style={{ ...input, paddingLeft: 34 }}
                    />
                  </div>

                  {resourceTab === "vehicles" && <>
                  <div className={`create-enquiry-two ${layoutStyles.extracted28}`} >
                    {filteredVehicleGroups.map(([group, items]) => {
                      const isOpen = openGroups[group] || false;
                      return (
                        <div key={group}>
                          <button type="button" onClick={() => setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))} style={accordionBtn}>
                            <span className={layoutStyles.extracted29}>
                              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {group}
                            </span>
                            <span style={pill}>{items.length}</span>
                          </button>

                          {isOpen && (
                            <div className={layoutStyles.extracted30}>
                              {items.map((vehicle) => {
                                const key = vehicle.id;
                                const isSelected = vehicles.includes(key);
                                return (
                                  <label key={key} className={layoutStyles.extracted31}>
                                    <input type="checkbox" checked={isSelected} onChange={(e) => toggleVehicle(key, e.target.checked)} />
                                    <span className={layoutStyles.extracted32}>
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
                  </>}

                  {resourceTab === "equipment" && <>
                  <div className={`create-enquiry-two ${layoutStyles.extracted35}`} >
                    {filteredEquipmentGroups.map(([group, items]) => {
                      const isOpen = openEquipGroups[group] || false;
                      return (
                        <div key={group}>
                          <button type="button" onClick={() => setOpenEquipGroups((prev) => ({ ...prev, [group]: !prev[group] }))} style={accordionBtn}>
                            <span className={layoutStyles.extracted36}>
                              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {group}
                            </span>
                            <span style={pill}>{items.length}</span>
                          </button>

                          {isOpen && (
                            <div className={layoutStyles.extracted37}>
                              {items.map((rawName) => {
                                const name = String(rawName || "").trim();
                                const isSelected = equipment.includes(name);
                                return (
                                  <label key={name} className={layoutStyles.extracted38}>
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
                  </>}
                </div>
              </div>

              <div className={layoutStyles.stickyActionBar}>
                <div className={layoutStyles.compactReview} aria-label="Enquiry review">
                  <span><strong>Job</strong> {jobNumber || "Draft"}</span>
                  <span className={layoutStyles.reviewStatus}>Enquiry</span>
                  <span>No dates required</span>
                  <span>{location || "No location"}</span>
                  <span>{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"} · {equipment.length} equipment</span>
                </div>
                <div className={layoutStyles.stickyActions}>
                  <button type="button" onClick={() => router.push("/job-home")} style={btn()}>Cancel</button>
                  <button
                    type="button"
                    disabled={!canSave}
                    title="Save enquiry and open quote page"
                    onClick={() => handleSubmit({ openQuote: true })}
                    style={{
                      ...btn("primary"),
                      background: UI.green,
                      opacity: canSave ? 1 : 0.55,
                      cursor: canSave ? "pointer" : "not-allowed",
                    }}
                  >
                    <FileText size={14} /> {savingAction === "quote" ? "Saving..." : "Save & Quote"}
                  </button>
                  <button type="submit" className={layoutStyles.primaryAction} disabled={!canSave} style={{ ...btn("primary"), opacity: canSave ? 1 : 0.55, cursor: canSave ? "pointer" : "not-allowed" }}>
                    <Save size={14} /> {savingAction === "enquiry" ? "Saving..." : "Save Enquiry"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
