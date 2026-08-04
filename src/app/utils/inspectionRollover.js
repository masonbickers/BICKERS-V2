"use client";

import { doc, updateDoc } from "firebase/firestore";
import { getIsoWeekLabel, isVehicleOutOfUse, ymd } from "./maintenanceSchema";
import {
  isCompletedMaintenanceBooking,
  mergeInspectionHistory,
  mergeMaintenanceHistory,
  reconcileBookingCompletionHistory,
} from "./inspectionHistory";
import { resolveCompletedMotExpiry } from "./motExpiry";
import { ensureServiceHistoryForLastService } from "./serviceHistory";
import {
  buildHgvComplianceMigrationPatch,
  evaluateHgvCompliance,
  isHgvComplianceVehicle,
  syncCanonicalPmiAliases,
} from "./hgvCompliance";
import { startVehicleVorPeriod } from "./vorPeriods";
import {
  commitVehicleVorTransition,
} from "./maintenanceBookingService";

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

const stableValue = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
};

const sameValue = (left, right) =>
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

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
      let automaticVorTransition = null;

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

      const serviceHistory = ensureServiceHistoryForLastService(
        serviceCompletedBookings.reduce(
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
        ),
        serviceCompletedBookings[0]?.completedDate || vehicle?.lastService
      );

      const latestMot = motCompletedBookings[0] || null;
      if (latestMot) {
        const motFreqWeeks = resolveFreqWeeks(vehicle?.motFreq, vehicle?.lastMOT, vehicle?.nextMOT);
        const calculatedMotExpiry = motFreqWeeks
          ? ymd(addWeeks(latestMot.completedDay, motFreqWeeks))
          : String(vehicle?.nextMOT || "").trim();
        const nextMotIso = resolveCompletedMotExpiry({
          vehicle,
          fallbackExpiry: calculatedMotExpiry,
        });
        if (String(vehicle?.lastMOT || "").trim() !== latestMot.completedDate) {
          patch.lastMOT = latestMot.completedDate;
          patch.lastMot = latestMot.completedDate;
          changed = true;
        }
        if (nextMotIso && String(vehicle?.nextMOT || "").trim() !== nextMotIso) {
          patch.nextMOT = nextMotIso;
          patch.nextMot = nextMotIso;
          patch.nextMotDate = nextMotIso;
          patch.motDueDate = nextMotIso;
          patch.motExpiryDate = nextMotIso;
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

      if (!sameValue(vehicle?.motHistory || [], motHistory || [])) {
        patch.motHistory = motHistory;
        changed = true;
      }
      if (!sameValue(vehicle?.serviceHistory || [], serviceHistory || [])) {
        patch.serviceHistory = serviceHistory;
        changed = true;
      }

      const inspectionBookings = maintenanceBookings
        .filter((booking) =>
          isCompletedMaintenanceBooking(booking, { type: "INSPECTION", vehicleId })
        )
        .map((booking) => {
          const date =
            parseLocalDate(booking?.completedAtISO) ||
            parseLocalDate(booking?.appointmentDateISO) ||
            parseLocalDate(booking?.startDateISO) ||
            parseLocalDate(booking?.appointmentDate) ||
            parseLocalDate(booking?.startDate);
          return date
            ? {
                booking,
                completedDate: startOfLocalDay(date),
              }
            : null;
        })
        .filter(Boolean)
        .filter((item) => item.completedDate.getTime() <= today.getTime())
        .sort((a, b) => b.completedDate.getTime() - a.completedDate.getTime());

      const latestPastInspection = inspectionBookings[0] || null;
      const reconciledLegacyInspection = reconcileBookingCompletionHistory(
        vehicle?.eightWeekInspectionHistory,
        maintenanceBookings
      );
      const reconciledPmi = reconcileBookingCompletionHistory(
        vehicle?.pmiHistory,
        maintenanceBookings
      );
      const reconciledBrake = reconcileBookingCompletionHistory(
        vehicle?.brakeTestHistory,
        maintenanceBookings
      );
      const inspectionHistory = maintenanceBookings
        .filter((booking) =>
          isCompletedMaintenanceBooking(booking, { type: "INSPECTION", vehicleId })
        )
        .reduce((acc, booking) => {
          const completedDate =
            String(booking?.completedAtISO || "").trim() ||
            toIsoDateFromBooking(booking);
          if (!completedDate || String(completedDate).slice(0, 10) > ymd(today)) return acc;
          return mergeInspectionHistory(acc, {
            completedDate,
            bookingId: String(booking?.id || "").trim(),
            provider: String(booking?.provider || "").trim(),
            bookingRef: String(booking?.bookingRef || "").trim(),
            notes: String(booking?.notes || "").trim(),
            recordedAt: String(booking?.updatedAt || booking?.createdAt || "").trim(),
          });
        }, reconciledLegacyInspection.history);

      if (reconciledPmi.removed.length || reconciledLegacyInspection.removed.length) {
        const validPmiHistory = reconciledPmi.history.length
          ? reconciledPmi.history
          : inspectionHistory;
        const latestValidPmi = validPmiHistory
          .map((entry) => String(entry?.completedDate || "").slice(0, 10))
          .filter(Boolean)
          .sort()
          .at(-1) || "";
        const invalidBookingIds = new Set(
          [...reconciledPmi.removed, ...reconciledLegacyInspection.removed]
            .map((entry) => String(entry?.bookingId || "").trim())
            .filter(Boolean)
        );
        const openDueDate = maintenanceBookings
          .filter((booking) => invalidBookingIds.has(String(booking?.id || "").trim()))
          .map((booking) => String(booking?.sourceDueDateISO || booking?.appointmentDateISO || "").slice(0, 10))
          .filter(Boolean)
          .sort()
          .at(0) || "";
        const nextPmi = latestValidPmi ? ymd(addWeeks(parseLocalDate(latestValidPmi), 8)) : openDueDate;
        patch.pmiHistory = validPmiHistory;
        patch.eightWeekInspectionHistory = inspectionHistory;
        patch.lastPMI = latestValidPmi;
        patch.eightWeekInspectionStart = latestValidPmi;
        patch.nextPMI = nextPmi;
        patch.nextEightWeekInspection = nextPmi;
        patch.pmiISOWeek = getIsoWeekLabel(nextPmi);
        patch.eightWeekInspectionISOWeek = getIsoWeekLabel(nextPmi);
        changed = true;
      }

      if (reconciledBrake.removed.length) {
        const latestValidBrake = reconciledBrake.history
          .map((entry) => String(entry?.completedDate || "").slice(0, 10))
          .filter(Boolean)
          .sort()
          .at(-1) || "";
        const invalidBookingIds = new Set(
          reconciledBrake.removed
            .map((entry) => String(entry?.bookingId || "").trim())
            .filter(Boolean)
        );
        const openDueDate = maintenanceBookings
          .filter((booking) => invalidBookingIds.has(String(booking?.id || "").trim()))
          .map((booking) => String(booking?.sourceDueDateISO || booking?.appointmentDateISO || "").slice(0, 10))
          .filter(Boolean)
          .sort()
          .at(0) || "";
        const nextBrake = latestValidBrake ? ymd(addWeeks(parseLocalDate(latestValidBrake), 8)) : openDueDate;
        patch.brakeTestHistory = reconciledBrake.history;
        patch.lastBrakeTest = latestValidBrake;
        patch.nextBrakeTest = nextBrake;
        patch.brakeISOWeek = getIsoWeekLabel(nextBrake);
        changed = true;
      }

      if (latestPastInspection || inspectionHistory.length > 0) {
        const latestPastIso = latestPastInspection
          ? ymd(latestPastInspection.completedDate)
          : "";
        const computedNext = latestPastInspection
          ? ymd(addWeeks(latestPastInspection.completedDate, 8))
          : String(vehicle?.nextEightWeekInspection || "").trim();
        const computedWeek = latestPastInspection
          ? getIsoWeekLabel(computedNext)
          : String(vehicle?.eightWeekInspectionISOWeek || "").trim();

        patch.eightWeekInspectionHistory = inspectionHistory;
        if (!sameValue(vehicle?.eightWeekInspectionHistory || [], inspectionHistory || [])) {
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

      if (isHgvComplianceVehicle(vehicle)) {
        const candidate = { ...vehicle, ...patch };
        const migration = buildHgvComplianceMigrationPatch(candidate);
        Object.assign(patch, migration.patch);
        Object.assign(patch, syncCanonicalPmiAliases({ ...candidate, ...migration.patch }));
        const compliance = evaluateHgvCompliance(
          { ...candidate, ...migration.patch, ...patch },
          { asOfDate: today, evaluatedAt: new Date().toISOString() }
        );
        const currentCompliance = vehicle?.complianceVor || {};
        const comparableCurrentCompliance = { ...currentCompliance, lastEvaluatedAt: "" };
        const comparableNextCompliance = { ...compliance.complianceVor, lastEvaluatedAt: "" };
        const complianceChanged = !sameValue(
          comparableCurrentCompliance,
          comparableNextCompliance
        );
        patch.complianceVor = complianceChanged
          ? compliance.complianceVor
          : currentCompliance;
        changed =
          changed ||
          Object.keys(migration.patch).length > 0 ||
          complianceChanged;

        if (
          compliance.shouldStartVor &&
          compliance.complianceVor.state !== "clear" &&
          !isVehicleOutOfUse(vehicle)
        ) {
          const started = startVehicleVorPeriod(
            { ...vehicle, ...patch },
            {
              offRoadDate: compliance.complianceVor.startedDate || ymd(today),
              odometer: vehicle?.odometer,
              approvedBy: "HGV compliance system",
              approvedPosition: "Automated compliance control",
              reason: `Automatic compliance VOR: ${compliance.unresolvedTypes
                .map((item) => item.replace("_", " ").toUpperCase())
                .join(", ")}`,
              operatorLicenceNumber: vehicle?.operatorLicenceNumber || "OF0202656",
            },
            {
              recordId: `compliance-vor-${compliance.complianceVor.startedDate || ymd(today)}`,
              startedAt: compliance.complianceVor.triggeredAt || new Date().toISOString(),
            }
          );
          Object.assign(patch, started, { complianceVor: compliance.complianceVor });
          automaticVorTransition = {
            offRoadDate: compliance.complianceVor.startedDate || ymd(today),
            recordId: started.activeVorRecordId || "",
          };
          changed = true;
        }
      }

      if (!changed) return null;

      const persist = automaticVorTransition
        ? commitVehicleVorTransition({
            bookings: maintenanceBookings.filter(
              (booking) => String(booking?.vehicleId || "").trim() === vehicleId
            ),
            vehicleId,
            vehicle: { ...vehicle, ...patch },
            vehiclePayload: patch,
            offRoadDate: automaticVorTransition.offRoadDate,
            cancellationSource: "automatic_compliance_vor",
            sourceRecordId: automaticVorTransition.recordId,
          })
        : updateDoc(doc(db, "vehicles", vehicleId), patch);
      return persist.catch((error) => {
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
