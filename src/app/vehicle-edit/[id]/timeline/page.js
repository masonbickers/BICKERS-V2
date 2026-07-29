"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { documentId, getDocs, where } from "firebase/firestore";
import { Activity, ArrowLeft, CalendarDays, ExternalLink, FileText } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../../../firebaseConfig";
import { normalizeServiceRecord } from "@/app/utils/serviceRecordCompat";
import { buildServiceHistoryItems } from "@/app/utils/serviceHistory";
import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  getMaintenanceTypeId,
  isVehicleOutOfUse,
} from "@/app/utils/maintenanceSchema";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { buildVorTimelineEvents } from "@/app/utils/vehicleTimelineEvents";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import styles from "./page.styles.module.css";

const UI = UI_TOKENS;
const safeArr = (value) => (Array.isArray(value) ? value : []);

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const result = value.toDate();
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
};

const dateOnly = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed = toDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
};

const displayDate = (value) => {
  const iso = dateOnly(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Date not recorded";
};

const bookingDate = (booking) =>
  dateOnly(
    booking.completedDate ||
      booking.completedAt ||
      booking.appointmentDateISO ||
      booking.appointmentDate ||
      booking.startDateISO ||
      booking.startDate ||
      booking.createdAt
  );

const eventType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized.includes("MOT")) return "mot";
  if (normalized.includes("SERVICE")) return "service";
  if (normalized.includes("INSPECTION") || normalized.includes("PMI")) return "inspection";
  if (normalized.includes("VOR") || normalized.includes("STATUS")) return "status";
  return "maintenance";
};

const typeLabels = {
  all: "All activity",
  status: "Status",
  inspection: "Inspections",
  service: "Services",
  mot: "MOT",
  maintenance: "Other maintenance",
  document: "Documents",
};

function pushEvent(events, event) {
  const date = dateOnly(event.date);
  if (!date) return;
  events.push({ ...event, date });
}

function collectDocuments(source, sourceLabel, fallbackDate = "", path = "", seen = new WeakSet()) {
  if (!source || typeof source !== "object") return [];
  if (seen.has(source)) return [];
  seen.add(source);

  if (Array.isArray(source)) {
    return source.flatMap((item, index) =>
      collectDocuments(item, sourceLabel, fallbackDate, `${path}[${index}]`, seen)
    );
  }

  const url =
    source.url ||
    source.downloadURL ||
    source.downloadUrl ||
    source.fileUrl ||
    source.documentUrl ||
    source.href ||
    "";
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    return [
      {
        url,
        name:
          source.name ||
          source.fileName ||
          source.filename ||
          source.label ||
          source.title ||
          "Vehicle document",
        source: source.label || sourceLabel,
        date: source.uploadedAt || source.createdAt || source.completedAt || fallbackDate,
        path,
      },
    ];
  }

  return Object.entries(source).flatMap(([key, value]) => {
    if (!value || typeof value !== "object") return [];
    const keyLower = key.toLowerCase();
    const documentLike =
      keyLower.includes("document") ||
      keyLower.includes("attachment") ||
      keyLower.includes("file") ||
      keyLower.includes("history");
    if (!documentLike && !Array.isArray(value)) return [];
    return collectDocuments(value, sourceLabel, fallbackDate, path ? `${path}.${key}` : key, seen);
  });
}

function buildTimeline(vehicle, bookings, serviceRecords) {
  if (!vehicle) return [];
  const events = [];

  events.push(...buildVorTimelineEvents(vehicle));

  safeArr(vehicle.dvsaMotTests).forEach((test, index) => {
    const result = String(test.testResult || "MOT").toUpperCase();
    pushEvent(events, {
      id: `mot-${test.motTestNumber || index}`,
      type: "mot",
      date: test.completedDate,
      title: `MOT ${result}`,
      description: test.expiryDate
        ? `Expiry ${displayDate(test.expiryDate)}`
        : "DVSA MOT test",
      details: [
        test.motTestNumber ? `Test ${test.motTestNumber}` : "",
        test.odometerValue
          ? `${test.odometerValue} ${String(test.odometerUnit || "mi").toLowerCase()}`
          : "",
      ].filter(Boolean),
      tone: result === "PASSED" ? "success" : result === "FAILED" ? "danger" : "neutral",
    });
  });

  const serviceItems = buildServiceHistoryItems({ vehicle, serviceRecords });
  serviceItems.forEach((item, index) => {
    pushEvent(events, {
      id: `service-${item.serviceRecordId || item.maintenanceBookingId || index}`,
      type: "service",
      date: item.completedDate,
      title: item.serviceType || "Vehicle service",
      description: item.notes || item.partsUsed || "Service completed.",
      details: [
        item.provider ? `Provider: ${item.provider}` : "",
        item.odometer ? `${item.odometer} mi` : "",
        item.bookingRef ? `Ref: ${item.bookingRef}` : "",
      ].filter(Boolean),
      tone: "brand",
    });
  });

  safeArr(vehicle.eightWeekInspectionHistory).forEach((inspection, index) => {
    pushEvent(events, {
      id: `inspection-history-${inspection.bookingId || index}`,
      type: "inspection",
      date: inspection.completedDate,
      title: "Safety inspection completed",
      description: inspection.notes || "Recorded inspection history.",
      details: [
        inspection.provider ? `Provider: ${inspection.provider}` : "",
        inspection.bookingRef ? `Ref: ${inspection.bookingRef}` : "",
      ].filter(Boolean),
      tone: "warning",
    });
  });

  ADDITIONAL_MAINTENANCE_WORKFLOWS.forEach((workflow) => {
    const history = safeArr(vehicle[workflow.historyField]);
    history.forEach((entry, index) => {
      pushEvent(events, {
        id: `${workflow.key}-history-${index}`,
        maintenanceTypeId: workflow.maintenanceTypeId,
        type: "inspection",
        date: entry.completedDate || entry.completedAt,
        title: workflow.label,
        description: entry.nextDueDate
          ? `Next due ${displayDate(entry.nextDueDate)}.`
          : `${workflow.label} completed.`,
        details: [
          entry.provider ? `Provider: ${entry.provider}` : "",
          entry.bookingRef ? `Ref: ${entry.bookingRef}` : "",
        ].filter(Boolean),
        tone: "warning",
      });
    });
    const latestDate = vehicle[workflow.lastField];
    if (
      latestDate &&
      !history.some((entry) => dateOnly(entry.completedDate || entry.completedAt) === dateOnly(latestDate))
    ) {
      pushEvent(events, {
        id: `recorded-${workflow.key}`,
        maintenanceTypeId: workflow.maintenanceTypeId,
        type: "inspection",
        date: latestDate,
        title: workflow.label,
        description: vehicle[workflow.nextField]
          ? `Next due ${displayDate(vehicle[workflow.nextField])}.`
          : `Latest recorded ${workflow.label.toLowerCase()}.`,
        details: vehicle[workflow.frequencyField]
          ? [`${vehicle[workflow.frequencyField]}-week cycle`]
          : [],
        tone: "warning",
      });
    }
  });

  bookings.forEach((booking, index) => {
    const type = eventType(booking.type);
    const maintenanceTypeId = getMaintenanceTypeId(booking);
    const status = String(booking.status || "").trim();
    const title = `${booking.type || "Maintenance"}${status ? ` · ${status}` : ""}`;
    pushEvent(events, {
      id: `booking-${booking.id || index}`,
      maintenanceTypeId,
      type,
      date: bookingDate(booking),
      title,
      description: booking.notes || booking.bookingNotes || "Maintenance booking activity.",
      details: [
        booking.provider ? `Provider: ${booking.provider}` : "",
        booking.bookingRef ? `Ref: ${booking.bookingRef}` : "",
        booking.location ? `Location: ${booking.location}` : "",
      ].filter(Boolean),
      tone: status.toLowerCase().includes("complete") ? "success" : "neutral",
    });
  });

  const documents = [
    ...collectDocuments(
      vehicle,
      "Vehicle record",
      vehicle.updatedAt || vehicle.createdAt || new Date().toISOString()
    ),
    ...bookings.flatMap((booking) =>
      collectDocuments(
        booking,
        `${booking.type || "Maintenance"} booking`,
        bookingDate(booking) || vehicle.updatedAt
      )
    ),
    ...serviceRecords.flatMap((record) =>
      collectDocuments(
        record,
        "Service record",
        record.serviceDateOnly || record.serviceDate || record.createdAt || vehicle.updatedAt
      )
    ),
  ];

  const seenDocuments = new Set();
  documents.forEach((document, index) => {
    if (!document.url || seenDocuments.has(document.url)) return;
    seenDocuments.add(document.url);
    pushEvent(events, {
      id: `document-${index}-${document.url}`,
      type: "document",
      date: document.date || vehicle.updatedAt || vehicle.createdAt,
      title: document.name,
      description: document.source,
      details: [],
      tone: "brand",
      documentUrl: document.url,
    });
  });

  if (vehicle.createdAt) {
    pushEvent(events, {
      id: "vehicle-created",
      type: "status",
      date: vehicle.createdAt,
      title: "Vehicle record created",
      description: "Vehicle added to the fleet register.",
      details: [],
      tone: "neutral",
    });
  }

  const seen = new Set();
  return events
    .filter((event) => {
      const key = `${event.type}|${event.date}|${event.title}|${event.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export default function VehicleTimelinePage() {
  const { id } = useParams();
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = dataAccessKey(dataAccessState);
  const [vehicle, setVehicle] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, {
        collectionName: "vehicles",
        operation: "Load vehicle timeline",
      });
      setError(gate.reason || "The vehicle timeline could not be loaded.");
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [vehicleSnap, bookingSnap, serviceSnap] = await Promise.all([
          getDocs(
            tenantCollectionQuery(db, "vehicles", dataAccessState, [
              where(documentId(), "==", id),
            ])
          ),
          getDocs(
            tenantCollectionQuery(db, "maintenanceBookings", dataAccessState, [
              where("vehicleId", "==", id),
            ])
          ),
          getDocs(
            tenantCollectionQuery(db, "serviceRecords", dataAccessState, [
              where("vehicleId", "==", id),
            ])
          ),
        ]);
        const vehicleDoc = vehicleSnap.docs[0];
        if (!vehicleDoc) {
          setError("Vehicle not found.");
          return;
        }
        setVehicle({ id: vehicleDoc.id, ...(vehicleDoc.data() || {}) });
        setBookings(bookingSnap.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })));
        setServiceRecords(
          serviceSnap.docs.map((item) =>
            normalizeServiceRecord({ id: item.id, ...(item.data() || {}) })
          )
        );
      } catch (loadError) {
        console.error("Failed to load vehicle timeline:", loadError);
        handleFirestoreAccessError(loadError, {
          collectionName: "vehicles",
          operation: "Load vehicle timeline",
        });
        setError("The vehicle timeline could not be loaded.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accessKey, dataAccessState, id]);

  const events = useMemo(
    () => buildTimeline(vehicle, bookings, serviceRecords),
    [bookings, serviceRecords, vehicle]
  );
  const visibleEvents = filter === "all" ? events : events.filter((event) => event.type === filter);
  const status = isVehicleOutOfUse(vehicle || {}) ? "VOR" : "Active";
  const vehicleLabel = vehicle?.name || vehicle?.registration || vehicle?.reg || "Vehicle";

  return (
    <HeaderSidebarLayout>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Vehicle activity</div>
            <h1>{vehicleLabel} Timeline</h1>
            <p>Chronological status, inspection, service, MOT and maintenance history.</p>
          </div>
          <button type="button" className={styles.backButton} onClick={() => router.push(`/vehicle-edit/${id}`)}>
            <ArrowLeft size={16} />
            Back to vehicle
          </button>
        </header>

        {loading ? (
          <div className={styles.statePanel}>Loading vehicle timeline…</div>
        ) : error ? (
          <div className={styles.statePanel}>{error}</div>
        ) : (
          <>
            <section className={styles.metrics} aria-label="Timeline summary">
              <div>
                <span>Current status</span>
                <strong className={status === "VOR" ? styles.statusVor : styles.statusActive}>
                  {status}
                </strong>
              </div>
              <div>
                <span>Registration</span>
                <strong>{vehicle.registration || vehicle.reg || "—"}</strong>
              </div>
              <div>
                <span>Recorded events</span>
                <strong>{events.length}</strong>
              </div>
              <div>
                <span>Latest activity</span>
                <strong>{events[0] ? displayDate(events[0].date) : "—"}</strong>
              </div>
            </section>

            <nav className={styles.filters} aria-label="Filter timeline">
              {Object.entries(typeLabels).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={filter === key ? styles.filterActive : ""}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span>
                    {key === "all" ? events.length : events.filter((event) => event.type === key).length}
                  </span>
                </button>
              ))}
            </nav>

            <section className={styles.timeline} aria-label="Vehicle timeline events">
              {visibleEvents.length === 0 ? (
                <div className={styles.statePanel}>No activity is recorded for this filter.</div>
              ) : (
                visibleEvents.map((event) => (
                  <article key={event.id} className={styles.event}>
                    <div className={`${styles.marker} ${styles[event.tone] || styles.neutral}`}>
                      {event.type === "status" ? (
                        <Activity size={16} />
                      ) : event.type === "document" ? (
                        <FileText size={16} />
                      ) : (
                        <CalendarDays size={16} />
                      )}
                    </div>
                    <div className={styles.eventCard}>
                      <div className={styles.eventHeader}>
                        <div>
                          <span className={styles.eventType}>{typeLabels[event.type]}</span>
                          <h2>{event.title}</h2>
                        </div>
                        <time dateTime={event.date}>{displayDate(event.date)}</time>
                      </div>
                      {event.description ? <p>{event.description}</p> : null}
                      {event.details.length ? (
                        <div className={styles.eventDetails}>
                          {event.details.map((detail) => (
                            <span key={detail}>{detail}</span>
                          ))}
                        </div>
                      ) : null}
                      {event.documentUrl ? (
                        <a
                          className={styles.documentLink}
                          href={event.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open document
                          <ExternalLink size={14} />
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </HeaderSidebarLayout>
  );
}
