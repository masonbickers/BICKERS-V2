"use client";

import { getCanonicalDueDate } from "./maintenanceSchema";

const INACTIVE_MAINTENANCE_BOOKING_STATUSES = new Set([
  "cancelled",
  "canceled",
  "completed",
  "complete",
  "closed",
  "deleted",
  "declined",
]);

const INACTIVE_MAINTENANCE_JOB_STATUSES = new Set([
  "complete",
  "completed",
  "closed",
  "cancelled",
  "canceled",
  "deleted",
]);

export const toDateLike = (value) => {
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

export const startOfLocalDay = (value) => {
  const date = toDateLike(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
};

export const addDaysToDate = (value, amount) => {
  const date = startOfLocalDay(value);
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const toYmdDate = (value) => {
  const date = toDateLike(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isInactiveMaintenanceBooking = (status) =>
  INACTIVE_MAINTENANCE_BOOKING_STATUSES.has(String(status || "").trim().toLowerCase());

export const isActiveMaintenanceJob = (status) =>
  !INACTIVE_MAINTENANCE_JOB_STATUSES.has(String(status || "").trim().toLowerCase());

export const getMaintenanceBookingKind = (booking = {}) => {
  const type = String(booking.type || booking.maintenanceType || "").trim().toUpperCase();
  if (type === "MOT") return "MOT_BOOKING";
  if (type === "SERVICE") return "SERVICE_BOOKING";
  if (type === "INSPECTION") return "INSPECTION_BOOKING";
  return "MAINTENANCE_BOOKING";
};

export const getMaintenanceDisplayType = (booking = {}) => {
  const explicit = String(booking.maintenanceTypeLabel || "").trim();
  if (explicit) return explicit.toUpperCase();

  const other = String(booking.maintenanceTypeOther || "").trim();
  if (other) return other.toUpperCase();

  const rawType = String(booking.type || booking.maintenanceType || "").trim().toUpperCase();
  if (rawType === "MOT") return "MOT";
  if (rawType === "SERVICE") return "SERVICE";
  if (rawType === "WORK") return "WORK";
  if (rawType) return rawType;

  return "MAINTENANCE";
};

export const buildMaintenanceBookingEvents = (maintenanceBookings, options = {}) => {
  const {
    getVehicleLabel,
    titleSeparator = " - ",
    includeStatus = true,
    statusLabel = "Maintenance",
  } = options;

  return (maintenanceBookings || []).flatMap((booking) => {
    if (isInactiveMaintenanceBooking(booking.status)) return [];

    const dates = Array.isArray(booking.bookingDates)
      ? booking.bookingDates.map((value) => String(value || "").trim()).filter(Boolean).sort()
      : [];
    const kind = getMaintenanceBookingKind(booking);
    const typeLabel = getMaintenanceDisplayType(booking);
    const vehicleId = booking.vehicleId || null;
    const label = getVehicleLabel
      ? getVehicleLabel(booking)
      : booking.vehicleLabel || booking.vehicleName || booking.title || booking.jobNumber || "Vehicle";
    const provider = String(booking.provider || "").trim();
    const baseTitle = `${label}${titleSeparator}${typeLabel}` + (provider ? `${titleSeparator}${provider}` : "");

    if (dates.length) {
      return dates
        .map((ymd) => {
          const start = startOfLocalDay(ymd);
          if (!start) return null;
          return {
            ...booking,
            __collection: "maintenanceBookings",
            __parentId: booking.id,
            __occurrence: ymd,
            id: `${booking.id}__${ymd}`,
            title: baseTitle,
            kind,
            vehicleId,
            bookingStatus: booking.status || "Booked",
            maintenanceType: booking.maintenanceType || "",
            maintenanceTypeOther: booking.maintenanceTypeOther || "",
            maintenanceTypeLabel: typeLabel,
            start,
            end: addDaysToDate(start, 1),
            allDay: true,
            ...(includeStatus ? { status: statusLabel } : {}),
          };
        })
        .filter(Boolean);
    }

    const start =
      startOfLocalDay(booking.startDateISO) ||
      startOfLocalDay(booking.startDate) ||
      startOfLocalDay(booking.date) ||
      startOfLocalDay(booking.start) ||
      startOfLocalDay(booking.startDay) ||
      startOfLocalDay(booking.appointmentDateISO) ||
      startOfLocalDay(booking.appointmentDate);
    if (!start) return [];

    const end =
      startOfLocalDay(booking.endDateISO) ||
      startOfLocalDay(booking.endDate) ||
      startOfLocalDay(booking.end) ||
      start;
    const safeEnd = end && end >= start ? end : start;

    return [
      {
        ...booking,
        __collection: "maintenanceBookings",
        __parentId: booking.id,
        id: booking.id,
        title: baseTitle,
        kind,
        vehicleId,
        bookingStatus: booking.status || "Booked",
        maintenanceType: booking.maintenanceType || "",
        maintenanceTypeOther: booking.maintenanceTypeOther || "",
        maintenanceTypeLabel: typeLabel,
        start,
        end: addDaysToDate(safeEnd, 1),
        allDay: true,
        ...(includeStatus ? { status: statusLabel } : {}),
      },
    ];
  });
};

export const buildMaintenanceJobEvents = (maintenanceJobs, options = {}) => {
  const {
    includeStatus = true,
    statusLabel = "Maintenance",
  } = options;

  return (maintenanceJobs || [])
    .filter((job) => isActiveMaintenanceJob(job.status))
    .map((job) => {
      const when = startOfLocalDay(job.plannedDate || job.dueDate);
      if (!when) return null;

      const statusText = String(job.status || "planned")
        .replaceAll("_", " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());

      return {
        ...job,
        id: `maintenanceJob__${job.id}`,
        __parentId: job.id,
        __collection: "maintenanceJobs",
        title: job.assetLabel || job.title || "Maintenance Job",
        kind: "MAINTENANCE",
        vehicleId: String(job.assetId || "").trim(),
        maintenanceType: job.type || "maintenance",
        maintenanceTypeLabel: `Job Card (${statusText})`,
        start: when,
        end: addDaysToDate(when, 1),
        allDay: true,
        ...(includeStatus ? { status: statusLabel } : {}),
      };
    })
    .filter(Boolean);
};

export const buildBookedMetaByVehicle = (maintenanceBookings) => {
  const map = {};

  for (const booking of maintenanceBookings || []) {
    const vehicleId = String(booking?.vehicleId || "").trim();
    if (!vehicleId || isInactiveMaintenanceBooking(booking.status)) continue;

    const typeRaw = String(booking.type || "").toUpperCase();
    const type = typeRaw === "SERVICE" ? "service" : typeRaw === "MOT" ? "mot" : "";
    if (!type) continue;

    const appt =
      toDateLike(booking.appointmentDate) ||
      toDateLike(booking.appointmentDateISO) ||
      toDateLike(booking.startDate) ||
      toDateLike(booking.startDateISO) ||
      null;
    if (!appt) continue;

    if (!map[vehicleId]) {
      map[vehicleId] = { mot: { has: false, earliestAppt: null }, service: { has: false, earliestAppt: null } };
    }

    map[vehicleId][type].has = true;
    const current = map[vehicleId][type].earliestAppt;
    if (!current || appt.getTime() < current.getTime()) {
      map[vehicleId][type].earliestAppt = appt;
    }
  }

  return map;
};

export const buildVehicleDueEvents = (vehicles, options = {}) => {
  const {
    bookedMetaByVehicle = {},
    getVehicleLabel,
    isApptAfterExpiry = () => false,
  } = options;

  return (vehicles || []).flatMap((vehicle) => {
    const vehicleId = String(vehicle.id || "").trim();
    const label = getVehicleLabel ? getVehicleLabel(vehicle) : vehicleId || "Vehicle";
    const bookedMeta = bookedMetaByVehicle[vehicleId] || null;
    const motDue = getCanonicalDueDate(vehicle, "mot");
    const serviceDue = getCanonicalDueDate(vehicle, "service");

    const items = [
      {
        kind: "MOT",
        due: motDue,
        booked: !!bookedMeta?.mot?.has,
        bookingStatus:
          bookedMeta?.mot?.has && isApptAfterExpiry(bookedMeta?.mot?.earliestAppt, motDue)
            ? "Booked (After Expiry)"
            : bookedMeta?.mot?.has
            ? "Booked"
            : "",
      },
      {
        kind: "SERVICE",
        due: serviceDue,
        booked: !!bookedMeta?.service?.has,
        bookingStatus: bookedMeta?.service?.has ? "Booked" : "",
      },
    ];

    return items
      .map((item) => {
        const start = startOfLocalDay(item.due);
        if (!start) return null;

        return {
          id: `due:${vehicleId}:${item.kind}:${toYmdDate(start)}`,
          __collection: "vehicleDueDates",
          vehicleId,
          title: `${label} - ${item.kind === "MOT" ? "MOT Due" : "Service Due"}`,
          kind: item.kind,
          dueDate: start,
          appointmentDateISO: toYmdDate(start),
          booked: item.booked,
          bookingStatus: item.bookingStatus,
          start,
          end: addDaysToDate(start, 1),
          allDay: true,
          status: "Due",
        };
      })
      .filter(Boolean)
      .filter((item) => {
        if (!item.booked) return true;
        return item.kind === "MOT" && item.bookingStatus.includes("After Expiry");
      });
  });
};
