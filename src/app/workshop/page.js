"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { collection, onSnapshot } from "firebase/firestore";
import DashboardMaintenanceModal from "@/app/components/DashboardMaintenanceModal";
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

const parseDateSafe = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toYmd = (value) => {
  const date = parseDateSafe(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (ymd, amount) => {
  const date = parseDateSafe(ymd);
  if (!date) return "";
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return toYmd(next);
};

const formatDate = (value) => {
  const date = parseDateSafe(value);
  return date
    ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "No date";
};

const isInactiveMaintenanceBooking = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  return [
    "cancelled",
    "canceled",
    "completed",
    "complete",
    "closed",
    "deleted",
    "declined",
  ].includes(normalized);
};

const getMaintenanceType = (booking) => {
  const raw = String(
    booking?.type ||
      booking?.maintenanceTypeLabel ||
      booking?.maintenanceType ||
      booking?.kind ||
      "MAINTENANCE"
  )
    .trim()
    .toUpperCase();

  if (raw.includes("MOT")) return "MOT";
  if (raw.includes("SERVICE")) return "SERVICE";
  return "MAINTENANCE";
};

const getMaintenanceColor = (type) => {
  if (type === "MOT") return UI.mot;
  if (type === "SERVICE") return UI.service;
  return UI.maintenance;
};

const buildMaintenanceEvents = (maintenanceBookings) => {
  return (maintenanceBookings || [])
    .flatMap((booking) => {
      if (isInactiveMaintenanceBooking(booking.status)) return [];

      const type = getMaintenanceType(booking);
      const vehicleLabel =
        booking.vehicleLabel ||
        booking.vehicleName ||
        booking.title ||
        booking.jobNumber ||
        "Vehicle";
      const provider = String(booking.provider || "").trim();
      const title = provider ? `${vehicleLabel} - ${type} - ${provider}` : `${vehicleLabel} - ${type}`;

      const bookingDates = Array.isArray(booking.bookingDates)
        ? booking.bookingDates.map((value) => String(value || "").trim()).filter(Boolean).sort()
        : [];

      if (bookingDates.length) {
        return bookingDates.map((ymd) => ({
          id: `${booking.id}__${ymd}`,
          title,
          start: ymd,
          end: addDays(ymd, 1),
          allDay: true,
          backgroundColor: getMaintenanceColor(type),
          borderColor: getMaintenanceColor(type),
          textColor: "#0f172a",
          extendedProps: {
            ...booking,
            id: `${booking.id}__${ymd}`,
            __collection: "maintenanceBookings",
            __parentId: booking.id,
            __occurrence: ymd,
            kind: type,
            maintenanceTypeLabel: type,
            vehicleLabel,
          },
        }));
      }

      const startYmd = toYmd(
        booking.startDate || booking.date || booking.start || booking.startDay || booking.appointmentDate
      );
      const endYmd = toYmd(
        booking.endDate ||
          booking.end ||
          booking.date ||
          booking.startDate ||
          booking.start ||
          booking.startDay ||
          booking.appointmentDate
      );
      if (!startYmd) return [];

      const safeEnd = endYmd && endYmd >= startYmd ? endYmd : startYmd;

      return [{
        id: booking.id,
        title,
        start: startYmd,
        end: addDays(safeEnd, 1),
        allDay: true,
        backgroundColor: getMaintenanceColor(type),
        borderColor: getMaintenanceColor(type),
        textColor: "#0f172a",
        extendedProps: {
          ...booking,
          __collection: "maintenanceBookings",
          __parentId: booking.id,
          kind: type,
          maintenanceTypeLabel: type,
          vehicleLabel,
        },
      }];
    })
    .filter(Boolean);
};

const buildDueEvents = (vehicles, maintenanceBookings) => {
  const activeBookedTypes = new Set(
    (maintenanceBookings || [])
      .filter((booking) => !isInactiveMaintenanceBooking(booking.status))
      .map((booking) => {
        const vehicleId = String(booking.vehicleId || "").trim();
        const type = getMaintenanceType(booking);
        return vehicleId && (type === "MOT" || type === "SERVICE") ? `${vehicleId}:${type}` : "";
      })
      .filter(Boolean)
  );

  return (vehicles || []).flatMap((vehicle) => {
    const vehicleId = String(vehicle.id || "").trim();
    const vehicleLabel =
      [String(vehicle.name || "").trim(), String(vehicle.registration || vehicle.reg || "").trim().toUpperCase()]
        .filter(Boolean)
        .join(" ")
        .trim() || vehicleId || "Vehicle";

    const items = [
      {
        kind: "SERVICE",
        date: vehicle.nextService,
        color: UI.dueService,
        title: `${vehicleLabel} - Service Due`,
      },
      {
        kind: "MOT",
        date: vehicle.nextMOT,
        color: UI.dueMot,
        title: `${vehicleLabel} - MOT Due`,
      },
    ];

    return items
      .filter((item) => {
        const ymd = toYmd(item.date);
        if (!ymd) return false;
        return !activeBookedTypes.has(`${vehicleId}:${item.kind}`);
      })
      .map((item) => {
        const ymd = toYmd(item.date);
        return {
          id: `due:${vehicleId}:${item.kind}:${ymd}`,
          title: item.title,
          start: ymd,
          end: addDays(ymd, 1),
          allDay: true,
          backgroundColor: item.color,
          borderColor: item.color,
          textColor: "#0f172a",
          extendedProps: {
            id: `due:${vehicleId}:${item.kind}:${ymd}`,
            __collection: "vehicleDueDates",
            vehicleId,
            kind: item.kind,
            status: "Due",
            appointmentDateISO: ymd,
            title: item.title,
          },
        };
      });
  });
};

export default function WorkshopPage() {
  const router = useRouter();
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    const unsubMaintenance = onSnapshot(collection(db, "maintenanceBookings"), (snapshot) => {
      setMaintenanceBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snapshot) => {
      setVehicles(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubMaintenance();
      unsubVehicles();
    };
  }, []);

  const maintenanceEvents = useMemo(
    () => buildMaintenanceEvents(maintenanceBookings),
    [maintenanceBookings]
  );

  const dueEvents = useMemo(
    () => buildDueEvents(vehicles, maintenanceBookings),
    [vehicles, maintenanceBookings]
  );

  const calendarEvents = useMemo(
    () => [...maintenanceEvents, ...dueEvents],
    [maintenanceEvents, dueEvents]
  );

  const counts = useMemo(() => {
    const service = maintenanceEvents.filter((event) => event.extendedProps?.kind === "SERVICE").length;
    const mot = maintenanceEvents.filter((event) => event.extendedProps?.kind === "MOT").length;
    const maintenance = maintenanceEvents.filter((event) => event.extendedProps?.kind === "MAINTENANCE").length;
    return {
      total: calendarEvents.length,
      service,
      mot,
      maintenance,
      due: dueEvents.length,
    };
  }, [calendarEvents.length, dueEvents.length, maintenanceEvents]);

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
                View all active maintenance bookings plus upcoming service and MOT due dates.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={legendPill("#fff7ed", UI.maintenance)}>Maintenance: {counts.maintenance}</span>
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
