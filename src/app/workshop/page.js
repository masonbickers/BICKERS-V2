"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { collection, onSnapshot } from "firebase/firestore";
import DashboardMaintenanceModal from "@/app/components/DashboardMaintenanceModal";
import {
  buildBookedMetaByVehicle,
  buildMaintenanceBookingEvents,
  buildMaintenanceJobEvents,
  buildVehicleDueEvents,
} from "@/app/utils/maintenanceCalendar";
import { db } from "../../../firebaseConfig";

const UI = {
  bg: "#f4f7fb",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  border: "1px solid #e5e7eb",
  shadow: "0 10px 30px rgba(15,23,42,0.06)",
  maintenance: "#f97316",
  service: "#2563eb",
  mot: "#dc2626",
  dueService: "#93c5fd",
  dueMot: "#fca5a5",
};

const pageWrap = {
  background: UI.bg,
  minHeight: "100vh",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: 16,
  boxShadow: UI.shadow,
};

const getMaintenanceColor = (type) => {
  if (type === "MOT") return UI.mot;
  if (type === "SERVICE") return UI.service;
  return UI.maintenance;
};

export default function WorkshopPage() {
  const router = useRouter();
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    const unsubMaintenance = onSnapshot(collection(db, "maintenanceBookings"), (snapshot) => {
      setMaintenanceBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const unsubJobs = onSnapshot(collection(db, "maintenanceJobs"), (snapshot) => {
      setMaintenanceJobs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snapshot) => {
      setVehicles(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubMaintenance();
      unsubJobs();
      unsubVehicles();
    };
  }, []);

  const bookedMetaByVehicle = useMemo(
    () => buildBookedMetaByVehicle(maintenanceBookings),
    [maintenanceBookings]
  );

  const maintenanceEvents = useMemo(
    () =>
      buildMaintenanceBookingEvents(maintenanceBookings, {
        getVehicleLabel: (booking) =>
          booking.vehicleLabel || booking.vehicleName || booking.title || booking.jobNumber || "Vehicle",
      }).map((event) => {
        const type = String(event.maintenanceTypeLabel || "").toUpperCase();
        const color = getMaintenanceColor(type.includes("MOT") ? "MOT" : type.includes("SERVICE") ? "SERVICE" : "MAINTENANCE");
        return {
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: true,
          backgroundColor: color,
          borderColor: color,
          textColor: "#0f172a",
          extendedProps: event,
        };
      }),
    [maintenanceBookings]
  );

  const dueEvents = useMemo(
    () =>
      buildVehicleDueEvents(vehicles, {
        bookedMetaByVehicle,
        getVehicleLabel: (vehicle) =>
          [String(vehicle.name || "").trim(), String(vehicle.registration || vehicle.reg || "").trim().toUpperCase()]
            .filter(Boolean)
            .join(" ")
            .trim() || String(vehicle.id || "").trim() || "Vehicle",
      }).map((event) => {
        const color = event.kind === "MOT" ? UI.dueMot : UI.dueService;
        return {
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: true,
          backgroundColor: color,
          borderColor: color,
          textColor: "#0f172a",
          extendedProps: event,
        };
      }),
    [vehicles, bookedMetaByVehicle]
  );

  const maintenanceJobEvents = useMemo(
    () =>
      buildMaintenanceJobEvents(maintenanceJobs).map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: true,
        backgroundColor: UI.maintenance,
        borderColor: UI.maintenance,
        textColor: "#0f172a",
        extendedProps: event,
      })),
    [maintenanceJobs]
  );

  const calendarEvents = useMemo(
    () => [...maintenanceEvents, ...maintenanceJobEvents, ...dueEvents],
    [maintenanceEvents, maintenanceJobEvents, dueEvents]
  );

  const counts = useMemo(() => {
    const service = maintenanceEvents.filter((event) => event.extendedProps?.kind === "SERVICE_BOOKING").length;
    const mot = maintenanceEvents.filter((event) => event.extendedProps?.kind === "MOT_BOOKING").length;
    const maintenance = maintenanceEvents.filter(
      (event) =>
        !["SERVICE_BOOKING", "MOT_BOOKING"].includes(String(event.extendedProps?.kind || ""))
    ).length;
    const jobs = maintenanceJobEvents.length;
    return {
      total: calendarEvents.length,
      service,
      mot,
      maintenance,
      jobs,
      due: dueEvents.length,
    };
  }, [calendarEvents.length, dueEvents.length, maintenanceEvents, maintenanceJobEvents.length]);

  return (
    <div style={pageWrap}>
      <div
        style={{
          ...card,
          borderRadius: 0,
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
          boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
          padding: "16px 18px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: UI.text,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: UI.text }}>
                Workshop Calendar
              </h1>
              <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                View active maintenance bookings, workshop job cards, and upcoming service and MOT due dates.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={legendPill("#fff7ed", UI.maintenance)}>Maintenance: {counts.maintenance}</span>
            <span style={legendPill("#fff7ed", UI.maintenance)}>Job cards: {counts.jobs}</span>
            <span style={legendPill("#eff6ff", UI.service)}>Service booked: {counts.service}</span>
            <span style={legendPill("#fef2f2", UI.mot)}>MOT booked: {counts.mot}</span>
            <span style={legendPill("#f8fafc", UI.text)}>Due dates: {counts.due}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 18px 18px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ ...card, padding: 16, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
            }}
          >
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,dayGridWeek",
            }}
            height="100%"
            events={calendarEvents}
            eventClick={(info) => {
              setSelectedEvent({
                ...info.event.extendedProps,
                id: info.event.id,
                title: info.event.title,
                start: info.event.start,
                end: info.event.end,
              });
            }}
            eventDidMount={(info) => {
              info.el.style.cursor = "pointer";
              const titleEl = info.el.querySelector(".fc-event-title");
              if (titleEl) titleEl.style.fontWeight = "700";
            }}
          />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
            <LegendSwatch color={UI.maintenance} label="General maintenance booking" />
            <LegendSwatch color={UI.maintenance} label="Workshop job card" />
            <LegendSwatch color={UI.service} label="Booked service" />
            <LegendSwatch color={UI.mot} label="Booked MOT" />
            <LegendSwatch color={UI.dueService} label="Service due date" />
            <LegendSwatch color={UI.dueMot} label="MOT due date" />
          </div>

          <div style={{ marginTop: 14, color: UI.muted, fontSize: 12.5 }}>
            {counts.total
              ? `Showing ${counts.total} calendar item${counts.total === 1 ? "" : "s"}. Click any item to open details.`
              : "No workshop calendar items found yet."}
          </div>
        </div>
      </div>

      </div>

      {selectedEvent && (
        <DashboardMaintenanceModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          background: color,
          border: "1px solid rgba(15,23,42,0.14)",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: UI.text }}>{label}</span>
    </div>
  );
}

function legendPill(bg, fg) {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: bg,
    color: fg,
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
}
