"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot } from "firebase/firestore";
import { AlertTriangle, LayoutDashboard, Plus, Search, FileText, PencilLine, RotateCcw } from "lucide-react";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { OperationsHeaderActions, OperationsPage, OperationsPageHeader } from "@/app/components/OperationsPage";
import { Button, Input, Modal, Select } from "@/app/components/ui";
import ViewBookingModal from "../components/ViewBookingModal";
import { loadBookingFormReferenceData } from "@/app/utils/bookingFormReferenceData";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { useSessionScroll, useSessionState } from "@/app/utils/useSessionState";

const UI = UI_TOKENS;

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadow,
  padding: 12,
};

const filterToolbar = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 12,
  display: "grid",
  gridTemplateColumns: "minmax(250px, 1.2fr) minmax(170px, 1fr) 140px 140px 132px 132px auto",
  gap: 8,
  alignItems: "center",
  marginBottom: 16,
};

const btn = (kind = "ghost") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radius,
  border: kind === "primary" ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
  background: kind === "primary" ? UI.brand : "var(--color-surface)",
  color: kind === "primary" ? "var(--color-white)" : UI.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: kind === "primary" ? "0 8px 18px rgba(31,75,122,0.16)" : UI.shadow,
});

const quoteOverlayBackdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 140,
  background: "rgba(2,6,23,0.66)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
};

const quoteOverlayPanel = {
  width: "min(900px, 99vw)",
  height: "min(760px, calc(100vh - 8px))",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 10,
  boxShadow: "0 24px 70px rgba(2,6,23,0.38)",
  overflow: "hidden",
};

const quoteOverlayHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "7px 10px",
  borderBottom: "1px solid var(--color-border)",
  background: "var(--color-surface-subtle)",
};

const quoteOverlayEyebrow = {
  color: UI.muted,
  fontSize: 10.5,
  fontWeight: 900,
  textTransform: "uppercase",
};

const quoteOverlayTitle = {
  color: UI.text,
  fontSize: 15,
  lineHeight: 1.2,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const quoteOverlayMeta = {
  marginTop: 2,
  color: UI.muted,
  fontSize: 12,
  fontWeight: 800,
};

const quoteOverlayCloseButton = {
  width: 34,
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 8,
  background: "var(--color-surface)",
  color: UI.text,
  padding: 0,
  cursor: "pointer",
};

const quoteOverlayFrame = {
  width: "100%",
  height: "100%",
  border: 0,
  background: "var(--color-surface)",
};

const queueChip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "3px 8px",
    borderRadius: 999,
    border: `1px solid ${UI.brandBorder}`,
    background: UI.brandSoft,
    color: UI.text,
    fontSize: 11.5,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  if (kind === "green") return { ...base, border: `1px solid ${UI.greenBorder}`, background: UI.greenSoft, color: UI.green };
  if (kind === "amber") return { ...base, border: `1px solid ${UI.amberBorder}`, background: UI.amberSoft, color: UI.amber };
  if (kind === "red") return { ...base, border: `1px solid ${UI.redBorder}`, background: UI.redSoft, color: "var(--color-danger)" };
  return base;
};

const tableWrap = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadow, overflow: "auto" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5, tableLayout: "fixed" };
const th = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid var(--color-border)",
  position: "sticky",
  top: 0,
  background: "var(--color-surface-subtle)",
  zIndex: 1,
  color: UI.muted,
  fontSize: 10.5,
  fontWeight: 900,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const td = {
  padding: "7px 8px",
  borderBottom: "1px solid var(--color-surface-hover)",
  verticalAlign: "middle",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const nowrap = { whiteSpace: "nowrap" };

const toDate = (value) => {
  if (!value) return null;
  const date = value?.toDate
    ? value.toDate()
    : typeof value?.seconds === "number"
      ? new Date(value.seconds * 1000)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const fmtDate = (value) => {
  const d = toDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const formatAddedTimestamp = (booking) => {
  const value = booking.createdAt || booking.addedAt || booking.updatedAt;
  if (!value) return "Added date unknown";
  const d = toDate(value);
  if (!d) return "Added date unknown";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `Added ${date}, ${time}`;
};

const enquiryNeedsChase = (booking) => {
  const createdAt = toDate(booking.createdAt || booking.addedAt);
  if (!createdAt) return false;
  const updatedAt = toDate(booking.updatedAt);
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const meaningfulUpdateMs = 5 * 60 * 1000;
  const isAWeekOld = Date.now() - createdAt.getTime() >= oneWeekMs;
  const hasLaterUpdate = updatedAt && updatedAt.getTime() - createdAt.getTime() > meaningfulUpdateMs;
  return isAWeekOld && !hasLaterUpdate;
};

const enquiryAddedDate = (booking) => toDate(booking.createdAt || booking.addedAt || booking.updatedAt);

const startOfDay = (raw) => {
  const date = new Date(raw);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (raw) => {
  const date = new Date(raw);
  date.setHours(23, 59, 59, 999);
  return date;
};

const hasQuote = (booking) => {
  if (String(booking.quoteNumber || "").trim()) return true;
  if (Array.isArray(booking.quoteNumbers) && booking.quoteNumbers.some((number) => String(number || "").trim())) return true;
  if (Array.isArray(booking.quoteVersions) && booking.quoteVersions.length > 0) return true;
  if (booking.quote && typeof booking.quote === "object") return true;
  return Boolean(String(booking.pdfUrl || booking.pdfURL || booking.quoteUrl || "").trim());
};

const quoteLabel = (booking) => {
  if (String(booking.quoteNumber || "").trim()) return String(booking.quoteNumber).trim();
  if (Array.isArray(booking.quoteNumbers)) {
    const first = booking.quoteNumbers.find((number) => String(number || "").trim());
    if (first) return String(first).trim();
  }
  const latestVersion = Array.isArray(booking.quoteVersions) ? booking.quoteVersions[0] : null;
  return String(latestVersion?.quoteNumber || "Quote").trim();
};

const quoteNumberForView = (booking) => {
  const label = quoteLabel(booking);
  return label === "Quote" ? "" : label;
};

const vehicleLabel = (vehicle, lookup = {}) => {
  if (!vehicle) return "";
  if (typeof vehicle === "string") {
    const key = vehicle.trim();
    if (!key) return "";
    const match = lookup.byId?.[key] || lookup.byReg?.[key.toUpperCase()] || lookup.byName?.[key.toLowerCase()];
    return match ? vehicleLabel(match, lookup) : "";
  }
  if (typeof vehicle !== "object") return String(vehicle || "").trim();
  return [vehicle.name || vehicle.vehicleName, vehicle.registration || vehicle.reg]
    .filter(Boolean)
    .join(" - ")
    .trim() || String(vehicle.id || vehicle.vehicleId || "").trim();
};

const enquiryVehicleText = (booking, lookup = {}) => {
  const vehicles = Array.isArray(booking.vehicles) ? booking.vehicles : [];
  const labels = vehicles.map((vehicle) => vehicleLabel(vehicle, lookup)).filter(Boolean);
  if (labels.length) return labels.join(", ");
  return vehicleLabel(booking.vehicle || booking.vehicleName || booking.registration || booking.reg, lookup) || "-";
};

const enquiryDateText = (booking) => {
  if (Array.isArray(booking.bookingDates) && booking.bookingDates.length) {
    return booking.bookingDates.map(fmtDate).join(", ");
  }
  if (booking.startDate && booking.endDate) return `${fmtDate(booking.startDate)} to ${fmtDate(booking.endDate)}`;
  const dateText = fmtDate(booking.startDate || booking.date);
  return dateText === "-" ? "TBC" : dateText;
};

function EnquiryQuoteOverlay({ viewer, onClose }) {
  if (!viewer?.bookingId) return null;

  const params = new URLSearchParams({ embed: "1", returnTo: "/enquiry" });
  if (viewer.quoteNumber) params.set("quote", viewer.quoteNumber);
  const src = `/quote-view/${encodeURIComponent(viewer.bookingId)}?${params.toString()}`;

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Quote view"
      title={`#${viewer.jobNumber || "No Job #"} - ${viewer.client || "No production"}`}
      description={viewer.quoteNumber || "Quote"}
      size="full"
      density="compact"
    >
      <iframe title="Quote view" src={src} className={layoutStyles.extracted5} />
    </Modal>
  );
}

export default function EnquiryPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useSessionState("enquiry:search", "");
  const [companyFilter, setCompanyFilter] = useSessionState("enquiry:company", "all");
  const [chaseFilter, setChaseFilter] = useSessionState("enquiry:chase", "all");
  const [quoteFilter, setQuoteFilter] = useSessionState("enquiry:quote", "all");
  const [fromDate, setFromDate] = useSessionState("enquiry:from", "");
  const [toDateFilter, setToDateFilter] = useSessionState("enquiry:to", "");
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [quoteViewer, setQuoteViewer] = useState(null);
  const [vehicleLookup, setVehicleLookup] = useState({ byId: {}, byReg: {}, byName: {} });
  const searchRef = useRef(null);
  useSessionScroll("enquiry");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load enquiry bookings" });
      setBookings([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState), (snap) => {
      setBookings(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const loadVehicles = async () => {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "load enquiry vehicle names" });
        setVehicleLookup({ byId: {}, byReg: {}, byName: {} });
        return;
      }

      try {
        const referenceData = await loadBookingFormReferenceData(db, { accessState: dataAccessState });
        setVehicleLookup(referenceData.vehicleLookup || { byId: {}, byReg: {}, byName: {} });
      } catch (error) {
        if (!handleFirestoreAccessError(error, { collectionName: "vehicles", operation: "load enquiry vehicle names" })) {
          console.error("Failed loading enquiry vehicle names:", error);
        }
        setVehicleLookup({ byId: {}, byReg: {}, byName: {} });
      }
    };

    loadVehicles();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const handleQuoteViewMessage = (event) => {
      if (event.data?.type !== "bickers:quote-edit") return;
      const href = event.data?.href;
      if (!href) return;
      setQuoteViewer(null);
      router.push(href);
    };

    window.addEventListener("message", handleQuoteViewMessage);
    return () => window.removeEventListener("message", handleQuoteViewMessage);
  }, [router]);

  const baseEnquiries = useMemo(() => {
    return bookings
      .filter((booking) => String(booking.status || "").trim().toLowerCase() === "enquiry");
  }, [bookings]);

  const companies = useMemo(
    () => ["all", ...Array.from(new Set(baseEnquiries.map((booking) => booking.client).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [baseEnquiries]
  );

  const enquiries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = fromDate ? startOfDay(fromDate) : null;
    const until = toDateFilter ? endOfDay(toDateFilter) : null;
    return baseEnquiries
      .filter((booking) => {
        if (companyFilter !== "all" && booking.client !== companyFilter) return false;
        const needsChase = enquiryNeedsChase(booking);
        if (chaseFilter === "needs-chase" && !needsChase) return false;
        if (chaseFilter === "ok" && needsChase) return false;
        const quoted = hasQuote(booking);
        if (quoteFilter === "has-quote" && !quoted) return false;
        if (quoteFilter === "no-quote" && quoted) return false;
        const addedDate = enquiryAddedDate(booking);
        if (from && (!addedDate || addedDate < from)) return false;
        if (until && (!addedDate || addedDate > until)) return false;
        if (!q) return true;
        return [booking.jobNumber, booking.production, booking.client, booking.location, booking.contactEmail, booking.contactNumber]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        return (enquiryAddedDate(b)?.getTime() || 0) - (enquiryAddedDate(a)?.getTime() || 0);
      });
  }, [baseEnquiries, chaseFilter, companyFilter, fromDate, quoteFilter, search, toDateFilter]);

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) || null,
    [bookings, selectedBookingId]
  );

  const openQuoteViewer = (booking) => {
    if (!hasQuote(booking)) return;
    setQuoteViewer({
      bookingId: booking.id,
      jobNumber: booking.jobNumber,
      client: booking.client,
      quoteNumber: quoteNumberForView(booking),
    });
  };

  const resetFilters = () => {
    setSearch("");
    setCompanyFilter("all");
    setChaseFilter("all");
    setQuoteFilter("all");
    setFromDate("");
    setToDateFilter("");
    searchRef.current?.focus();
  };

  const EnquiryTable = ({ rows }) => (
      <div style={tableWrap}>
        <table className={layoutStyles.extracted8} aria-label="Enquiries">
          <colgroup>
            <col className={layoutStyles.extracted9} />
            <col className={layoutStyles.extracted10} />
            <col />
            <col className={layoutStyles.extracted11} />
            <col className={layoutStyles.extracted12} />
            <col className={layoutStyles.extracted13} />
            <col className={layoutStyles.extracted14} />
            <col className={layoutStyles.extracted15} />
            <col className={layoutStyles.extracted16} />
          </colgroup>
          <thead>
            <tr>
              <th style={th}>Job #</th><th style={th}>Production</th><th style={th}>Location</th><th style={th}>Vehicle</th>
              <th style={th}>Dates</th><th style={th}>Added</th><th style={th}>Quote</th><th style={th}>Chase</th><th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((booking) => {
              const needsChase = enquiryNeedsChase(booking);
              return (
                <tr key={booking.id} style={{ background: needsChase ? UI.amberSoft : "var(--color-surface)" }}>
                  <td className={layoutStyles.extracted17}>{booking.jobNumber || "No Job #"}</td>
                  <td className={layoutStyles.extracted18} title={booking.client || ""}>
                    <div className={layoutStyles.extracted19}>
                      <span className={layoutStyles.productionIcon}><FileText size={15} /></span>
                      <span className={layoutStyles.extracted20}>{booking.client || "No production"}</span>
                    </div>
                  </td>
                  <td className={layoutStyles.extracted21} title={booking.location || ""}>{booking.location || "No location"}</td>
                  <td className={layoutStyles.extracted22} title={enquiryVehicleText(booking, vehicleLookup)}>{enquiryVehicleText(booking, vehicleLookup)}</td>
                  <td className={layoutStyles.extracted23}>{enquiryDateText(booking)}</td>
                  <td className={layoutStyles.extracted24}>{formatAddedTimestamp(booking).replace(/^Added /, "")}</td>
                  <td className={layoutStyles.extracted25}>
                    {hasQuote(booking) ? (
                      <button type="button" style={{ ...queueChip("green"), cursor: "pointer" }} title={`View ${quoteLabel(booking)}`} onClick={() => openQuoteViewer(booking)}>
                        <FileText size={13} /> Quote
                      </button>
                    ) : <span style={{ color: UI.muted }}>-</span>}
                  </td>
                  <td className={layoutStyles.extracted26}>
                    {needsChase ? <span style={queueChip("amber")}><AlertTriangle size={13} /> Needs chase</span> : <span style={queueChip()}>OK</span>}
                  </td>
                  <td className={layoutStyles.extracted27}>
                    <div className={layoutStyles.extracted28}>
                      <button type="button" style={{ ...btn(), minHeight: 24, padding: "3px 7px", fontSize: 11, boxShadow: "none" }} onClick={() => setSelectedBookingId(booking.id)}>
                        <FileText size={13} /> View
                      </button>
                      <button type="button" style={{ ...btn("primary"), minHeight: 24, padding: "3px 7px", fontSize: 11, boxShadow: "none" }} onClick={() => router.push(`/edit-booking/${booking.id}?returnTo=${encodeURIComponent("/enquiry")}`)}>
                        <PencilLine size={13} /> Edit
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
  );

  return (
    <HeaderSidebarLayout>
      <OperationsPage>
        <OperationsPageHeader
          title="Enquiries"
          subtitle="Saved enquiry jobs that are not shown on the calendar."
          actions={<OperationsHeaderActions>
            <Button type="button" onClick={() => router.push("/create-enquiry")}>
              <Plus size={14} />
              New Enquiry
            </Button>
            <Button variant="secondary" type="button" onClick={() => router.push("/dashboard")}>
              <LayoutDashboard size={14} />
              Diary
            </Button>
          </OperationsHeaderActions>}
        />

        <div className={layoutStyles.filterToolbar} style={filterToolbar}>
          <div className={layoutStyles.searchWrap}>
            <Search size={14} className={layoutStyles.searchIcon} aria-hidden />
            <Input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by job #, production, company, location or contact..." style={{ paddingLeft: 29 }} />
          </div>
          <Select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} aria-label="Filter by production company">
            {companies.map((company) => <option key={company} value={company}>{company === "all" ? "Production Company: All" : company}</option>)}
          </Select>
          <Select value={chaseFilter} onChange={(event) => setChaseFilter(event.target.value)} aria-label="Filter by chase state">
            <option value="all">Chase: All</option><option value="needs-chase">Needs chase</option><option value="ok">OK</option>
          </Select>
          <Select value={quoteFilter} onChange={(event) => setQuoteFilter(event.target.value)} aria-label="Filter by quote state">
            <option value="all">Quote: All</option><option value="has-quote">Has quote</option><option value="no-quote">No quote</option>
          </Select>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Added from date" />
          <Input type="date" value={toDateFilter} onChange={(event) => setToDateFilter(event.target.value)} aria-label="Added to date" />
          <Button variant="secondary" type="button" onClick={resetFilters}><RotateCcw size={13} /> Reset</Button>
        </div>

        <div className={layoutStyles.resultSummary}>{enquiries.length} of {baseEnquiries.length} enquiries shown</div>

        {enquiries.length === 0 ? (
          <div style={card}><div style={{ color: UI.muted, fontSize: 13.5 }}>No enquiries match these filters.</div></div>
        ) : <EnquiryTable rows={enquiries} />}

        {selectedBookingId && (
          <ViewBookingModal
            id={selectedBookingId}
            initialBooking={selectedBooking}
            initialVehicles={[]}
            onClose={() => setSelectedBookingId(null)}
          />
        )}
        {quoteViewer && <EnquiryQuoteOverlay viewer={quoteViewer} onClose={() => setQuoteViewer(null)} />}
      </OperationsPage>
    </HeaderSidebarLayout>
  );
}
