"use client";

import { doc, updateDoc } from "firebase/firestore";
import { getIsoWeekLabel, ymd } from "./maintenanceSchema";
import {
  mergeInspectionHistory,
  mergeMaintenanceHistory,
} from "./inspectionHistory";

const parseLocalDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const ts = value.toDate();
    if (!(ts instanceof Date) || Number.isNaN(ts.getTime())) return null;
    ts.setHours(12, 0, 0, 0);
    return ts;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dt = new Date(value);
    dt.setHours(12, 0, 0, 0);
    return dt;
  }
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(12, 0, 0, 0);
  return dt;
};

const startOfLocalDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addWeeks = (date, weeks) => {
  const next = new Date(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
};

const resolveFreqWeeks = (explicitFreq, lastISO, nextISO) => {
  const explicit = Number(explicitFreq || 0);
  if (explicit > 0) return explicit;

  const last = parseLocalDate(lastISO);
  const next = parseLocalDate(nextISO);
  if (!last || !next) return 0;

  const diffDays = Math.round((next.getTime() - last.getTime()) / 86400000);
  if (diffDays <= 0) return 0;
  return Math.max(1, Math.round(diffDays / 7));
};

export async function syncEightWeekInspectionRollovers({
  db,
  vehicles = [],
  maintenanceBookings = [],
  loggerPrefix = "[inspection rollover]",
}) {
  if (!db || !Array.isArray(vehicles) || !vehicles.length) return;

  const today = startOfLocalDay(new Date());

  const tasks = vehicles
    .map((vehicle) => {
      const vehicleId = String(vehicle?.id || "").trim();
      if (!vehicleId) return null;
      const patch = { updatedAt: new Date().toISOString() };
      let changed = false;

      const motCompletedBookings = maintenanceBookings
        .filter((booking) => {
          const status = String(booking?.status || "").trim().toLowerCase();
          if (status !== "completed") return false;
          if (String(booking?.type || "").trim().toUpperCase() !== "MOT") return false;
          return String(booking?.vehicleId || "").trim() === vehicleId;
        })
        .map((booking) => {
          const completedDate = toIsoDateFromBooking(booking);
          return {
            booking,
            completedDate,
            completedDay: completedDate ? startOfLocalDay(parseLocalDate(completedDate)) : null,
          };
        })
        .filter((item) => item.completedDay && item.completedDay.getTime() <= today.getTime())
        .sort((a, b) => b.completedDay.getTime() - a.completedDay.getTime());

      const serviceCompletedBookings = maintenanceBookings
        .filter((booking) => {
          const status = String(booking?.status || "").trim().toLowerCase();
          if (status !== "completed") return false;
          if (String(booking?.type || "").trim().toUpperCase() !== "SERVICE") return false;
          return String(booking?.vehicleId || "").trim() === vehicleId;
        })
        .map((booking) => {
          const completedDate = toIsoDateFromBooking(booking);
          return {
            booking,
            completedDate,
            completedDay: completedDate ? startOfLocalDay(parseLocalDate(completedDate)) : null,
          };
        })
        .filter((item) => item.completedDay && item.completedDay.getTime() <= today.getTime())
        .sort((a, b) => b.completedDay.getTime() - a.completedDay.getTime());

      const motHistory = motCompletedBookings.reduce(
        (acc, item) =>
          mergeMaintenanceHistory(acc, {
            completedDate: item.completedDate,
            bookingId: String(item.booking?.id || "").trim(),
            provider: String(item.booking?.provider || "").trim(),
            bookingRef: String(item.booking?.bookingRef || "").trim(),
            notes: String(item.booking?.notes || "").trim(),
            recordedAt: String(item.booking?.updatedAt || item.booking?.createdAt || "").trim(),
          }),
        Array.isArray(vehicle?.motHistory) ? vehicle.motHistory : []
      );

      const serviceHistory = serviceCompletedBookings.reduce(
        (acc, item) =>
          mergeMaintenanceHistory(acc, {
            completedDate: item.completedDate,
            bookingId: String(item.booking?.id || "").trim(),
            provider: String(item.booking?.provider || "").trim(),
            bookingRef: String(item.booking?.bookingRef || "").trim(),
            notes: String(item.booking?.notes || "").trim(),
            recordedAt: String(item.booking?.updatedAt || item.booking?.createdAt || "").trim(),
          }),
        Array.isArray(vehicle?.serviceHistory) ? vehicle.serviceHistory : []
      );

      const latestMot = motCompletedBookings[0] || null;
      if (latestMot) {
        const motFreqWeeks = resolveFreqWeeks(vehicle?.motFreq, vehicle?.lastMOT, vehicle?.nextMOT);
        const nextMotIso = motFreqWeeks ? ymd(addWeeks(latestMot.completedDay, motFreqWeeks)) : String(vehicle?.nextMOT || "").trim();
        if (String(vehicle?.lastMOT || "").trim() !== latestMot.completedDate) {
          patch.lastMOT = latestMot.completedDate;
          changed = true;
        }
        if (nextMotIso && String(vehicle?.nextMOT || "").trim() !== nextMotIso) {
          patch.nextMOT = nextMotIso;
          patch.motISOWeek = getIsoWeekLabel(nextMotIso);
          changed = true;
        }
      }

      const latestService = serviceCompletedBookings[0] || null;
      if (latestService) {
        const serviceFreqWeeks = resolveFreqWeeks(
          vehicle?.serviceFreq,
          vehicle?.lastService,
          vehicle?.nextService
        );
        const nextServiceIso = serviceFreqWeeks
          ? ymd(addWeeks(latestService.completedDay, serviceFreqWeeks))
          : String(vehicle?.nextService || "").trim();
        if (String(vehicle?.lastService || "").trim() !== latestService.completedDate) {
          patch.lastService = latestService.completedDate;
          changed = true;
        }
        if (nextServiceIso && String(vehicle?.nextService || "").trim() !== nextServiceIso) {
          patch.nextService = nextServiceIso;
          patch.serviceISOWeek = getIsoWeekLabel(nextServiceIso);
          changed = true;
        }
      }

      if (
        JSON.stringify(vehicle?.motHistory || []) !== JSON.stringify(motHistory || [])
      ) {
        patch.motHistory = motHistory;
        changed = true;
      }
      if (
        JSON.stringify(vehicle?.serviceHistory || []) !== JSON.stringify(serviceHistory || [])
      ) {
        patch.serviceHistory = serviceHistory;
        changed = true;
      }

      const inspectionBookings = maintenanceBookings
        .filter((booking) => {
          const status = String(booking?.status || "").trim().toLowerCase();
          if (status.includes("cancel") || status.includes("declin")) return false;
          if (String(booking?.type || "").trim().toUpperCase() !== "INSPECTION") return false;
          return String(booking?.vehicleId || "").trim() === vehicleId;
        })
        .map((booking) => {
          const date =
            parseLocalDate(booking?.appointmentDateISO) ||
            parseLocalDate(booking?.startDateISO) ||
            parseLocalDate(booking?.appointmentDate) ||
            parseLocalDate(booking?.startDate);
          return date ? startOfLocalDay(date) : null;
        })
        .filter(Boolean)
        .filter((date) => date.getTime() <= today.getTime())
        .sort((a, b) => b.getTime() - a.getTime());

      const latestPastInspection = inspectionBookings[0] || null;
      const inspectionHistory = maintenanceBookings
        .filter((booking) => {
          const status = String(booking?.status || "").trim().toLowerCase();
          if (status.includes("cancel") || status.includes("declin")) return false;
          if (String(booking?.type || "").trim().toUpperCase() !== "INSPECTION") return false;
          return String(booking?.vehicleId || "").trim() === vehicleId;
        })
        .reduce((acc, booking) => {
          const completedDate =
            String(booking?.completedAtISO || "").trim() ||
            toIsoDateFromBooking(booking);
          if (!completedDate) return acc;
          return mergeInspectionHistory(acc, {
            completedDate,
            bookingId: String(booking?.id || "").trim(),
            provider: String(booking?.provider || "").trim(),
            bookingRef: String(booking?.bookingRef || "").trim(),
            notes: String(booking?.notes || "").trim(),
            recordedAt: String(booking?.updatedAt || booking?.createdAt || "").trim(),
          });
        }, Array.isArray(vehicle?.eightWeekInspectionHistory) ? vehicle.eightWeekInspectionHistory : []);

      if (latestPastInspection || inspectionHistory.length > 0) {
        const latestPastIso = latestPastInspection ? ymd(latestPastInspection) : "";
        const computedNext = latestPastInspection
          ? ymd(addWeeks(latestPastInspection, 8))
          : String(vehicle?.nextEightWeekInspection || "").trim();
        const computedWeek = latestPastInspection
          ? getIsoWeekLabel(addWeeks(latestPastInspection, 8))
          : String(vehicle?.eightWeekInspectionISOWeek || "").trim();

        patch.eightWeekInspectionHistory = inspectionHistory;
        if (
          JSON.stringify(vehicle?.eightWeekInspectionHistory || []) !==
          JSON.stringify(inspectionHistory || [])
        ) {
          changed = true;
        }
        if (latestPastInspection) {
          patch.eightWeekInspectionStart = latestPastIso;
          patch.nextEightWeekInspection = computedNext;
          patch.eightWeekInspectionISOWeek = computedWeek;
          if (
            String(vehicle?.eightWeekInspectionStart || "").trim() !== latestPastIso ||
            String(vehicle?.nextEightWeekInspection || "").trim() !== computedNext ||
            String(vehicle?.eightWeekInspectionISOWeek || "").trim() !== computedWeek
          ) {
            changed = true;
          }
        }
      }
      if (!changed) return null;

      return updateDoc(doc(db, "vehicles", vehicleId), patch).catch((error) => {
        console.error(`${loggerPrefix} sync failed:`, error);
      });
    })
    .filter(Boolean);

  if (!tasks.length) return;
  await Promise.all(tasks);
}

function toIsoDateFromBooking(booking) {
  return (
    String(booking?.appointmentDateISO || "").trim() ||
    String(booking?.startDateISO || "").trim() ||
    toIsoDateString(booking?.appointmentDate) ||
    toIsoDateString(booking?.startDate)
  );
}

function toIsoDateString(value) {
  const date = parseLocalDate(value);
  return date ? ymd(date) : "";
}
