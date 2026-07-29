import {
  isMotNotApplicable,
  isServiceNotApplicable,
  isVehicleOutOfUse,
} from "./maintenanceSchema.js";
import { isRetentionPlateRecord } from "./vehicleRegisterPresentation.js";

const DAY_MS = 86400000;
const text = (value) => String(value ?? "").trim();

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sourceFor = (vehicle, { lastField, frequencyField, dvsa = false } = {}) => {
  if (dvsa && vehicle?.motHistorySyncedAt) return "DVSA";
  if (lastField && frequencyField && vehicle?.[lastField] && Number(vehicle?.[frequencyField]) > 0) {
    return "Calculated";
  }
  return "Manual";
};

const ADDITIONAL = {
  tachoInspection: {
    label: "Tacho inspection",
    dueField: "nextTacho",
    lastField: "lastTacho",
    frequencyField: "tachoFreq",
  },
  brakeTest: {
    label: "Brake test",
    dueField: "nextBrakeTest",
    lastField: "lastBrakeTest",
    frequencyField: "brakeTestFreq",
  },
  pmiInspection: {
    label: "PMI inspection",
    dueField: "nextPMI",
    lastField: "lastPMI",
    frequencyField: "pmiFreq",
  },
  tachoDownload: {
    label: "Tacho download",
    dueField: "nextTachoDownload",
    lastField: "lastTachoDownload",
    frequencyField: "tachoDownloadFreq",
  },
  tailLift: {
    label: "Tail-lift inspection",
    dueField: "nextTailLift",
    lastField: "lastTailLift",
    frequencyField: "tailLiftFreq",
  },
  loler: {
    label: "LOLER",
    dueField: "nextLoler",
    lastField: "lastLoler",
    frequencyField: "lolerFreq",
  },
};

const statusRank = {
  overdue: 0,
  missing: 1,
  "due-soon": 2,
  "in-date": 3,
};

export const buildVehicleComplianceAttention = (
  vehicle = {},
  {
    now = new Date(),
    settings = {},
    requireEightWeekInspection = false,
    enabledAdditional = [],
  } = {}
) => {
  if (isRetentionPlateRecord(vehicle) || isVehicleOutOfUse(vehicle)) return [];

  const candidates = [];
  const push = ({
    key,
    label,
    dueField,
    warningDays = 21,
    actionType = "edit-schedule",
    source,
  }) => {
    const dueDate = text(vehicle?.[dueField]);
    const date = toDate(dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = date
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
      : null;
    const daysRemaining = dueDay ? Math.floor((dueDay - today) / DAY_MS) : null;
    const status = !dueDay
      ? "missing"
      : daysRemaining < 0
        ? "overdue"
        : daysRemaining <= warningDays
          ? "due-soon"
          : "in-date";

    candidates.push({
      key,
      label,
      status,
      dueDate: dueDate || "",
      daysRemaining,
      source: status === "missing" ? "Not recorded" : source,
      actionType,
    });
  };

  if (!isMotNotApplicable(vehicle)) {
    push({
      key: "mot",
      label: "MOT",
      dueField: "nextMOT",
      actionType: "book-mot",
      source: sourceFor(vehicle, {
        lastField: "lastMOT",
        frequencyField: "motFreq",
        dvsa: true,
      }),
    });
  }

  if (!isServiceNotApplicable(vehicle)) {
    push({
      key: "service",
      label: "Service",
      dueField: "nextService",
      actionType: "book-service",
      source: sourceFor(vehicle, {
        lastField: "lastService",
        frequencyField: "serviceFreq",
      }),
    });
  }

  if (requireEightWeekInspection) {
    push({
      key: "eight-week-inspection",
      label: "8 week inspection",
      dueField: "nextEightWeekInspection",
      actionType: "book-inspection",
      source: vehicle?.eightWeekInspectionStart ? "Calculated" : "Manual",
    });
  }

  push({
    key: "tax",
    label: "Road tax",
    dueField: "nextRFL",
    warningDays: Number(settings.taxRflWarningDays ?? 21),
    source: "Manual",
  });
  push({
    key: "insurance",
    label: "Insurance",
    dueField: "insuredUntil",
    warningDays: Number(settings.insuranceWarningDays ?? 7),
    source: "Manual",
  });

  for (const key of Array.isArray(enabledAdditional) ? enabledAdditional : []) {
    const config = ADDITIONAL[key];
    if (!config) continue;
    push({
      key,
      label: config.label,
      dueField: config.dueField,
      source: sourceFor(vehicle, config),
    });
  }

  return candidates.sort((a, b) => {
    const rank = statusRank[a.status] - statusRank[b.status];
    if (rank !== 0) return rank;
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });
};
