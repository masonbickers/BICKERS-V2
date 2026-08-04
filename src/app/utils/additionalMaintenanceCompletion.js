import { normalizeMaintenanceDocumentList } from "./maintenanceDocuments.js";
import { getIsoWeekLabel } from "./maintenanceSchema.js";
import {
  buildComplianceReleasePatch,
  complianceVorReleaseBlocker,
  evaluateHgvCompliance,
  syncCanonicalPmiAliases,
} from "./hgvCompliance.js";
import { calculateNextMaintenanceDue } from "./maintenanceRecord.js";
import { buildReturnInspectionCompletionPatch } from "./vorPeriods.js";

const safeArr = (value) => (Array.isArray(value) ? value : []);

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dateOnly = (value) => {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed = toDate(value);
  if (!parsed) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const resolveMaintenanceFrequencyWeeks = (
  explicitFrequency,
  lastDate,
  nextDate
) => {
  const explicit = Number(explicitFrequency || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

  const last = toDate(lastDate);
  const next = toDate(nextDate);
  if (!last || !next) return 0;
  const days = Math.round((next.getTime() - last.getTime()) / 86400000);
  return days > 0 ? Math.max(1, Math.round(days / 7)) : 0;
};

export const addMaintenanceWeeks = (value, weeks) => {
  const start = toDate(value);
  const frequency = Number(weeks || 0);
  if (!start || !Number.isFinite(frequency) || frequency <= 0) return "";
  const result = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  result.setDate(result.getDate() + Math.round(frequency) * 7);
  return dateOnly(result);
};

export const buildAdditionalMaintenanceCompletionPatch = ({
  vehicle = {},
  workflows = [],
  completedDate,
  completedAt = new Date().toISOString(),
  documentsByKey = {},
  auditUser = {},
  bookingId = "",
  source = "system_appointment",
  provider = "",
  bookingRef = "",
  notes = "",
} = {}) => {
  const normalizedCompletedDate = dateOnly(completedDate);
  if (!normalizedCompletedDate || !workflows.length) return null;

  const patch = { updatedAt: completedAt };

  workflows.forEach((workflow) => {
    const document =
      documentsByKey[workflow.key] ||
      documentsByKey[workflow.maintenanceTypeId] ||
      null;
    const documents = document ? [document] : [];
    const frequencyWeeks = resolveMaintenanceFrequencyWeeks(
      vehicle[workflow.frequencyField],
      vehicle[workflow.lastField],
      vehicle[workflow.nextField]
    );
    const nextDueDate = ["pmi", "brake_test"].includes(workflow.maintenanceTypeId)
      ? calculateNextMaintenanceDue({
          maintenanceTypeId: workflow.maintenanceTypeId,
          completedDate: normalizedCompletedDate,
        })
      : addMaintenanceWeeks(normalizedCompletedDate, frequencyWeeks);
    const priorHistory = safeArr(vehicle[workflow.historyField]).map((entry) => ({
      ...entry,
      maintenanceTypeId: workflow.maintenanceTypeId,
      documents: normalizeMaintenanceDocumentList(entry?.documents, {
        maintenanceTypeId: workflow.maintenanceTypeId,
        sourceRecordId: entry?.completedDate || "",
      }),
    }));

    patch[workflow.lastField] = normalizedCompletedDate;
    if (nextDueDate) {
      patch[workflow.nextField] = nextDueDate;
      patch[workflow.isoWeekField] = getIsoWeekLabel(nextDueDate);
    }
    if (document) {
      patch[workflow.documentsField] = [
        ...normalizeMaintenanceDocumentList(vehicle[workflow.documentsField], {
          maintenanceTypeId: workflow.maintenanceTypeId,
        }),
        document,
      ];
    }
    const historyEntry = {
      maintenanceTypeId: workflow.maintenanceTypeId,
      label: workflow.label,
      completedDate: normalizedCompletedDate,
      nextDueDate,
      completedAt,
      completedBy: {
        uid: String(auditUser?.uid || "").trim(),
        name: String(auditUser?.name || auditUser?.email || "").trim(),
        email: String(auditUser?.email || "").trim(),
      },
      bookingId: String(bookingId || "").trim(),
      source,
      provider: String(provider || "").trim(),
      bookingRef: String(bookingRef || "").trim(),
      notes: String(notes || "").trim(),
      documents,
    };
    patch[workflow.historyField] = [
      ...priorHistory.filter((entry) => {
        if (historyEntry.bookingId) {
          return !(
            String(entry?.bookingId || "").trim() === historyEntry.bookingId &&
            entry?.maintenanceTypeId === historyEntry.maintenanceTypeId
          );
        }
        return !(
          entry?.maintenanceTypeId === historyEntry.maintenanceTypeId &&
          dateOnly(entry?.completedDate) === historyEntry.completedDate &&
          String(entry?.source || "") === historyEntry.source
        );
      }),
      historyEntry,
    ].sort((left, right) =>
      dateOnly(left?.completedDate).localeCompare(dateOnly(right?.completedDate))
    );
  });

  const selectedTypeIds = new Set(
    workflows.map((workflow) => String(workflow?.maintenanceTypeId || "").trim())
  );
  if (selectedTypeIds.has("pmi")) {
    Object.assign(
      patch,
      syncCanonicalPmiAliases(
        { ...vehicle, ...patch },
        { asOfDate: normalizedCompletedDate }
      )
    );
  }

  const compliance = evaluateHgvCompliance(
    { ...vehicle, ...patch },
    { asOfDate: normalizedCompletedDate, evaluatedAt: completedAt }
  );
  patch.complianceVor = compliance.complianceVor;

  const completesReturnInspection =
    selectedTypeIds.has("pmi") && selectedTypeIds.has("brake_test");
  if (completesReturnInspection) {
    const releaseCandidate = { ...vehicle, ...patch };
    const returnPatch = buildReturnInspectionCompletionPatch(
      releaseCandidate,
      { completedDate: normalizedCompletedDate, bookingId },
      { completedAt }
    );
    const releaseBlocker = returnPatch
      ? complianceVorReleaseBlocker(releaseCandidate, {
          asOfDate: normalizedCompletedDate,
        })
      : "";
    if (returnPatch && !releaseBlocker) {
      Object.assign(patch, returnPatch);
      Object.assign(
        patch,
        buildComplianceReleasePatch(
          { ...releaseCandidate, ...returnPatch },
          {
            releasedAt: completedAt,
            releasedBy: auditUser,
          }
        )
      );
    }
  }

  return patch;
};
