import { createHash } from "node:crypto";

import {
  adminCommitDocumentPatches,
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
  adminReadDocumentWithMetadata,
} from "@/app/api/_firebaseAdminRest";
import { filterDocsForAdminCompany, jsonError, requireAdminFromRequest } from "@/app/api/admin/_lib";
import {
  auditMaintenanceDataset,
  buildFuturePmiHistoryCleanupPatch,
  buildFuturePmiHistoryCleanupPreview,
  classifyFutureMaintenanceResetBooking,
  selectSafeMaintenanceReconciliationActions,
} from "@/app/utils/maintenanceDataAudit";
import { isVehicleOutOfUse } from "@/app/utils/maintenanceSchema";
import { isVorInspectionCancellationCandidate } from "@/app/utils/vorBookingPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTIONS = [
  "maintenanceBookings",
  "maintenanceJobs",
  "workBookings",
  "vehicleChecks",
  "vehicleIssues",
  "defectReports",
  "serviceRecords",
  "vehicles",
];

const FUTURE_RESET_ACTION = "apply_future_schedule_reset";
const FUTURE_RESET_CONFIRMATION = "ARCHIVE_LATER_AUTOMATIC_APPOINTMENTS";
const FUTURE_PMI_HISTORY_CLEANUP_ACTION = "apply_future_pmi_history_cleanup";
const FUTURE_PMI_HISTORY_CLEANUP_CONFIRMATION = "REMOVE_FALSE_FUTURE_PMI_HISTORY";

const text = (value) => String(value || "").trim();
const stableFingerprintValue = (value) => {
  if (Array.isArray(value)) return value.map(stableFingerprintValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = stableFingerprintValue(value[key]);
      return result;
    }, {});
};
const sha256Fingerprint = (value) =>
  createHash("sha256")
    .update(JSON.stringify(stableFingerprintValue(value)))
    .digest("hex");
const safeReconciliationFingerprint = (actions = []) =>
  sha256Fingerprint(
    actions.map((action) => ({
      collection: text(action.collection),
      documentId: text(action.documentId),
      action: text(action.action),
      idempotentKey: text(action.idempotentKey),
      automaticPatch: action.automaticPatch || null,
    }))
  );
const assetValue = (value, fields = []) => {
  if (Array.isArray(value)) return assetValue(value[0], fields);
  if (value && typeof value === "object") {
    return fields.map((field) => text(value[field])).find(Boolean) || "";
  }
  return text(value);
};

const reconciliationVehicleDetails = (booking = {}, vehicleById = new Map()) => {
  const vehicleId = text(booking.vehicleId);
  const embeddedVehicle = booking.vehicle && typeof booking.vehicle === "object"
    ? booking.vehicle
    : Array.isArray(booking.vehicles) && booking.vehicles[0] && typeof booking.vehicles[0] === "object"
      ? booking.vehicles[0]
      : {};
  const legacyVehicleValue = Array.isArray(booking.vehicles)
    ? booking.vehicles[0]
    : booking.vehicle;
  const legacyVehicleId = assetValue(legacyVehicleValue, ["id", "vehicleId"]);
  const linkedVehicle = vehicleById.get(vehicleId || legacyVehicleId) || {};
  const legacyVehicleLabel =
    typeof legacyVehicleValue === "string" && !vehicleById.has(text(legacyVehicleValue))
      ? text(legacyVehicleValue)
      : "";

  return {
    vehicleId,
    vehicleName:
      text(linkedVehicle.name || linkedVehicle.vehicleName) ||
      text(booking.vehicleName || booking.assetName) ||
      assetValue(embeddedVehicle, ["name", "vehicleName", "label"]) ||
      legacyVehicleLabel,
    registration:
      text(linkedVehicle.registration || linkedVehicle.reg) ||
      text(booking.registration || booking.reg) ||
      assetValue(embeddedVehicle, ["registration", "reg"]) ||
      assetValue(booking.vehicles, ["registration", "reg"]),
  };
};

const loadDataset = async (userData) => {
  const loaded = await Promise.all(COLLECTIONS.map((name) => adminListDocuments(name)));
  return Object.fromEntries(
    COLLECTIONS.map((name, index) => [
      name,
      filterDocsForAdminCompany(loaded[index], userData).map((document) => ({
        id: document.id,
        ...(document.data || {}),
      })),
    ])
  );
};

const futureResetFingerprint = (preview = {}) => {
  const candidateShape = (item) => ({
    documentId: text(item.documentId),
    appointmentDateISO: text(item.appointmentDateISO),
    maintenanceTypeIds: Array.isArray(item.maintenanceTypeIds)
      ? [...item.maintenanceTypeIds].map(text).sort()
      : [],
    status: text(item.status).toLowerCase(),
    protectionReason: text(item.protectionReason),
    requirementKey: text(item.requirementKey),
    archiveReasonCode: text(item.archiveReasonCode),
  });
  return sha256Fingerprint({
      asOfDate: preview.asOfDate,
      policy: preview.policy,
      forecastYears: preview.forecastYears,
      archiveCandidates: (preview.archiveCandidates || []).map(candidateShape),
      protectedRecords: (preview.protectedRecords || []).map(candidateShape),
      preservedCoreRecords: (preview.preservedCoreRecords || []).map(candidateShape),
      preservedInspectionRecords:
        (preview.preservedInspectionRecords || []).map(candidateShape),
      rebuildCandidates: (preview.rebuildCandidates || []).map(candidateShape),
    });
};

const futurePmiHistoryCandidateShape = (candidate = {}) => ({
  documentId: text(candidate.documentId),
  vehicleId: text(candidate.vehicleId),
  historyEntryCount: Number(candidate.historyEntryCount || 0),
  affectedHistoryFields: Array.isArray(candidate.affectedHistoryFields)
    ? [...candidate.affectedHistoryFields].map(text).sort()
    : [],
  futureMarkerFields: Array.isArray(candidate.futureMarkerFields)
    ? [...candidate.futureMarkerFields].map(text).sort()
    : [],
  latestValidCompletionDateISO: text(candidate.latestValidCompletionDateISO),
  entries: Array.isArray(candidate.entries) ? candidate.entries : [],
});

const futurePmiHistoryCandidateFingerprint = (candidate = {}) =>
  sha256Fingerprint(futurePmiHistoryCandidateShape(candidate));

const futurePmiHistoryCleanupFingerprint = (preview = {}) =>
  sha256Fingerprint({
      asOfDate: preview.asOfDate,
      policy: preview.policy,
      candidates: (preview.candidates || []).map(futurePmiHistoryCandidateShape),
      preservedNonPmiAnomalies: preview.preservedNonPmiAnomalies || [],
    });

const reportWithResetFingerprint = (report = {}) => ({
  ...report,
  futureScheduleReset: {
    ...report.futureScheduleReset,
    fingerprint: futureResetFingerprint(report.futureScheduleReset),
    confirmationPhrase: FUTURE_RESET_CONFIRMATION,
  },
  futurePmiHistoryCleanup: {
    ...report.futurePmiHistoryCleanup,
    fingerprint: futurePmiHistoryCleanupFingerprint(report.futurePmiHistoryCleanup),
    confirmationPhrase: FUTURE_PMI_HISTORY_CLEANUP_CONFIRMATION,
  },
});

const reportWithVehicleDetails = (report, dataset) => {
  const bookingById = new Map(dataset.maintenanceBookings.map((booking) => [booking.id, booking]));
  const vehicleById = new Map(dataset.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const withVehicleDetails = (item) => ({
    ...item,
    ...reconciliationVehicleDetails(
      bookingById.get(item.documentId) || { vehicleId: item.vehicleId },
      vehicleById
    ),
  });
  const decorated = reportWithResetFingerprint(report);
  return {
    ...decorated,
    reconciliationPreview: decorated.reconciliationPreview.map(withVehicleDetails),
    futureScheduleReset: {
      ...decorated.futureScheduleReset,
      archiveCandidates: decorated.futureScheduleReset.archiveCandidates.map(withVehicleDetails),
      protectedRecords: decorated.futureScheduleReset.protectedRecords.map(withVehicleDetails),
      preservedCoreRecords:
        decorated.futureScheduleReset.preservedCoreRecords.map(withVehicleDetails),
      preservedInspectionRecords:
        decorated.futureScheduleReset.preservedInspectionRecords.map(withVehicleDetails),
      rebuildCandidates: decorated.futureScheduleReset.rebuildCandidates.map(withVehicleDetails),
      futureCompletionAnomalies:
        decorated.futureScheduleReset.futureCompletionAnomalies.map(withVehicleDetails),
    },
    futurePmiHistoryCleanup: {
      ...decorated.futurePmiHistoryCleanup,
      candidates: decorated.futurePmiHistoryCleanup.candidates.map(withVehicleDetails),
      preservedNonPmiAnomalies:
        decorated.futurePmiHistoryCleanup.preservedNonPmiAnomalies.map(withVehicleDetails),
    },
  };
};

const buildReport = (dataset, requestedYear) =>
  auditMaintenanceDataset({
    ...dataset,
    forecastYear: Number.isInteger(requestedYear) && requestedYear > 2000
      ? requestedYear
      : new Date().getFullYear(),
  });

const sameTypeIds = (left = [], right = []) =>
  JSON.stringify([...left].map(text).sort()) === JSON.stringify([...right].map(text).sort());

const applyFutureScheduleReset = async ({
  admin,
  body,
  report,
  requestedYear,
}) => {
  const preview = report.futureScheduleReset;
  const fingerprint = futureResetFingerprint(preview);
  if (
    body?.exportConfirmed !== true ||
    body?.confirmation !== FUTURE_RESET_CONFIRMATION ||
    text(body?.expectedFingerprint) !== fingerprint
  ) {
    return jsonError(
      "The dry-run is stale or the export and confirmation safeguards are incomplete. Refresh and export the preview before applying it.",
      409
    );
  }

  const actor = text(admin.userData?.email) || "admin";
  const appliedArchives = [];
  const skippedArchives = [];
  const archiveWrites = [];
  for (const candidate of preview.archiveCandidates) {
    const snapshot = await adminReadDocumentWithMetadata(
      candidate.collection,
      candidate.documentId
    );
    if (!snapshot) {
      skippedArchives.push({ ...candidate, skipReason: "record_missing" });
      continue;
    }
    const existing = snapshot.data;
    const current = classifyFutureMaintenanceResetBooking(
      { id: candidate.documentId, ...existing },
      { asOfDate: preview.asOfDate }
    );
    const expectedClassification = candidate.archiveReasonCode === "later_automatic_inspection"
      ? "eligible_inspection"
      : "archive";
    const unchanged =
      current.classification === expectedClassification &&
      current.appointmentDateISO === candidate.appointmentDateISO &&
      current.canonical.status === candidate.status &&
      current.originSource === candidate.originSource &&
      sameTypeIds(current.maintenanceTypeIds, candidate.maintenanceTypeIds);
    if (!unchanged) {
      skippedArchives.push({ ...candidate, skipReason: "record_changed_or_protected" });
      continue;
    }

    const now = new Date().toISOString();
    const historyEntry = {
      action: "Archived by future schedule reset",
      user: actor,
      timestamp: now,
      source: "future_schedule_reset",
      changes: [
        candidate.archiveReasonCode === "later_automatic_inspection"
          ? `Archived later automatic ${candidate.maintenanceTypeIds.join(" + ")} appointment; the nearest upcoming Inspection remains active.`
          : `Archived automatic non-core ${candidate.maintenanceTypeIds.join(" + ")} appointment; this type is no longer generated in the diary.`,
      ],
    };
    archiveWrites.push({
      collection: candidate.collection,
      documentId: candidate.documentId,
      updateTime: snapshot.updateTime,
      patch: {
        status: "Archived",
        archiveReason: candidate.archiveReasonCode === "later_automatic_inspection"
          ? "Future schedule reset; later automatic appointment removed while the nearest upcoming Inspection was preserved."
          : "Future schedule reset; automatic non-core appointment removed from the active diary.",
        archivedAtISO: now,
        lastEditedBy: actor,
        updatedAt: now,
        history: [...(Array.isArray(existing.history) ? existing.history : []), historyEntry],
        audit: {
          ...(existing.audit && typeof existing.audit === "object" ? existing.audit : {}),
          updatedAt: now,
          updatedBy: actor,
          history: [
            ...(Array.isArray(existing.audit?.history) ? existing.audit.history : []),
            historyEntry,
          ],
        },
      },
    });
    appliedArchives.push(candidate);
  }

  if (skippedArchives.length) {
    const refreshedDataset = await loadDataset(admin.userData);
    const refreshedReport = buildReport(refreshedDataset, requestedYear);
    return Response.json({
      dryRun: false,
      partial: false,
      appliedArchives: [],
      skippedArchives,
      appliedCreates: [],
      skippedCreates: [],
      message: "No records were changed because an archive candidate changed after the dry-run. Refresh, export and review the new preview.",
      report: reportWithVehicleDetails(refreshedReport, refreshedDataset),
    }, { status: 409 });
  }

  // Rebuild the grouped keep-next decision immediately before the commit. A
  // candidate can become the nearest Inspection if another record changes,
  // even when the candidate document itself is unchanged.
  const precommitDataset = await loadDataset(admin.userData);
  const precommitReport = buildReport(precommitDataset, requestedYear);
  if (futureResetFingerprint(precommitReport.futureScheduleReset) !== fingerprint) {
    return Response.json({
      dryRun: false,
      partial: false,
      appliedArchives: [],
      skippedArchives: preview.archiveCandidates.map((candidate) => ({
        ...candidate,
        skipReason: "grouped_candidate_set_changed",
      })),
      appliedCreates: [],
      skippedCreates: [],
      message: "No records were changed because the nearest-Inspection selection changed after the dry-run. Refresh and export the new preview.",
      report: reportWithVehicleDetails(precommitReport, precommitDataset),
    }, { status: 409 });
  }

  if (archiveWrites.length) {
    await adminCommitDocumentPatches(archiveWrites);
  }

  const afterArchiveDataset = await loadDataset(admin.userData);
  const afterArchiveReport = buildReport(afterArchiveDataset, requestedYear);
  if (afterArchiveReport.futureScheduleReset.archiveCandidates.length > 0) {
    return Response.json({
      dryRun: false,
      partial: true,
      appliedArchives,
      skippedArchives,
      appliedCreates: [],
      skippedCreates: [],
      message: "Some archive candidates changed or appeared during the reset. Refresh, export and review the new dry-run.",
      report: reportWithVehicleDetails(afterArchiveReport, afterArchiveDataset),
    });
  }

  const finalDataset = await loadDataset(admin.userData);
  const finalReport = buildReport(finalDataset, requestedYear);
  return Response.json({
    dryRun: false,
    partial: false,
    appliedArchives,
    skippedArchives,
    appliedCreates: [],
    skippedCreates: [],
    message: "Later automatic appointments were archived. Each vehicle keeps its nearest upcoming Inspection; MOT, Service and protected records were unchanged.",
    report: reportWithVehicleDetails(finalReport, finalDataset),
  });
};

const applyFuturePmiHistoryCleanup = async ({
  admin,
  body,
  report,
  requestedYear,
}) => {
  const preview = report.futurePmiHistoryCleanup;
  const fingerprint = futurePmiHistoryCleanupFingerprint(preview);
  if (
    body?.exportConfirmed !== true ||
    body?.confirmation !== FUTURE_PMI_HISTORY_CLEANUP_CONFIRMATION ||
    text(body?.expectedFingerprint) !== fingerprint
  ) {
    return jsonError(
      "The future-PMI-history dry-run is stale or its export and confirmation safeguards are incomplete. Refresh and export the preview before applying it.",
      409
    );
  }

  const actor = text(admin.userData?.email) || "admin";
  const archivedAt = new Date().toISOString();
  const writes = [];
  const appliedCandidates = [];
  const skippedCandidates = [];

  for (const candidate of preview.candidates) {
    const snapshot = await adminReadDocumentWithMetadata(
      candidate.collection,
      candidate.documentId
    );
    if (!snapshot) {
      skippedCandidates.push({ ...candidate, skipReason: "vehicle_missing" });
      continue;
    }
    const currentPreview = buildFuturePmiHistoryCleanupPreview({
      vehicles: [{ id: candidate.documentId, ...snapshot.data }],
      asOfDate: preview.asOfDate,
    });
    const currentCandidate = currentPreview.candidates[0];
    if (
      !currentCandidate ||
      futurePmiHistoryCandidateFingerprint(currentCandidate) !==
        futurePmiHistoryCandidateFingerprint(candidate)
    ) {
      skippedCandidates.push({ ...candidate, skipReason: "vehicle_history_changed" });
      continue;
    }
    const cleanup = buildFuturePmiHistoryCleanupPatch(snapshot.data, {
      asOfDate: preview.asOfDate,
      archivedAt,
      actor,
    });
    if (!Object.keys(cleanup.patch).length) {
      skippedCandidates.push({ ...candidate, skipReason: "nothing_to_clean" });
      continue;
    }
    writes.push({
      collection: candidate.collection,
      documentId: candidate.documentId,
      updateTime: snapshot.updateTime,
      patch: cleanup.patch,
    });
    appliedCandidates.push({
      ...candidate,
      removedEntryCount: cleanup.removedEntries.length,
      repairedMarkerFields: cleanup.futureMarkerFields,
    });
  }

  if (skippedCandidates.length) {
    const refreshedDataset = await loadDataset(admin.userData);
    const refreshedReport = buildReport(refreshedDataset, requestedYear);
    return Response.json({
      dryRun: false,
      partial: false,
      appliedCandidates: [],
      skippedCandidates,
      message: "No vehicle history was changed because a cleanup candidate changed after the dry-run. Refresh, export and review the new preview.",
      report: reportWithVehicleDetails(refreshedReport, refreshedDataset),
    }, { status: 409 });
  }

  const precommitDataset = await loadDataset(admin.userData);
  const precommitReport = buildReport(precommitDataset, requestedYear);
  if (
    futurePmiHistoryCleanupFingerprint(precommitReport.futurePmiHistoryCleanup) !==
    fingerprint
  ) {
    return Response.json({
      dryRun: false,
      partial: false,
      appliedCandidates: [],
      skippedCandidates: preview.candidates.map((candidate) => ({
        ...candidate,
        skipReason: "candidate_set_changed",
      })),
      message: "No vehicle history was changed because the cleanup candidate set changed after the dry-run. Refresh and export the new preview.",
      report: reportWithVehicleDetails(precommitReport, precommitDataset),
    }, { status: 409 });
  }

  if (writes.length) await adminCommitDocumentPatches(writes);

  const finalDataset = await loadDataset(admin.userData);
  const finalReport = buildReport(finalDataset, requestedYear);
  const remaining = finalReport.futurePmiHistoryCleanup.candidates;
  return Response.json({
    dryRun: false,
    partial: remaining.length > 0,
    appliedCandidates,
    skippedCandidates,
    removedEntryCount: appliedCandidates.reduce(
      (total, candidate) => total + Number(candidate.removedEntryCount || 0),
      0
    ),
    repairedMarkerFieldCount: appliedCandidates.reduce(
      (total, candidate) => total + (candidate.repairedMarkerFields?.length || 0),
      0
    ),
    message: remaining.length
      ? "Some future PMI history remains. Refresh, export and review the new dry-run."
      : "False future PMI completion history was removed from the active planner and retained in each vehicle cleanup archive. MOT, Service, genuine past history and upcoming bookings were unchanged.",
    report: reportWithVehicleDetails(finalReport, finalDataset),
  });
};

export async function GET(request) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (admin.error) return admin.error;
    const dataset = await loadDataset(admin.userData);
    const requestedYear = Number(new URL(request.url).searchParams.get("year"));
    return Response.json(reportWithVehicleDetails(buildReport(dataset, requestedYear), dataset));
  } catch (error) {
    console.error("Maintenance reconciliation read failed:", error);
    return jsonError("Could not build the maintenance review.", 500);
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (admin.error) return admin.error;
    const body = await request.json().catch(() => ({}));
    const apply = body?.apply === true;
    const dataset = await loadDataset(admin.userData);
    const requestedYear = Number(body?.year);
    const report = buildReport(dataset, requestedYear);
    if (body?.action === FUTURE_RESET_ACTION) {
      return applyFutureScheduleReset({ admin, body, report, requestedYear });
    }
    if (body?.action === FUTURE_PMI_HISTORY_CLEANUP_ACTION) {
      return applyFuturePmiHistoryCleanup({ admin, body, report, requestedYear });
    }
    const safeActions = selectSafeMaintenanceReconciliationActions(report);
    const expectedFingerprint = safeReconciliationFingerprint(safeActions);
    if (!apply) {
      return Response.json({ dryRun: true, applied: [], safeActions, expectedFingerprint, report });
    }
    if (
      body?.exportConfirmed !== true ||
      body?.confirmation !== "APPLY_SAFE_MAINTENANCE_RECONCILIATION" ||
      text(body?.expectedFingerprint) !== expectedFingerprint
    ) {
      return jsonError(
        "The dry-run is stale or the export and confirmation safeguards are incomplete. Refresh and export the preview before applying it.",
        409
      );
    }

    const applied = [];
    const skipped = [];
    for (const action of safeActions) {
      if (["create_missing_booked_appointment", "create_missing_requested_due_item"].includes(action.action)) {
        const existing = await adminReadDocument(action.collection, action.documentId);
        if (existing) {
          skipped.push({ ...action, skipReason: "record_already_exists" });
          continue;
        }
        const now = new Date().toISOString();
        await adminPatchDocument(
          action.collection,
          action.documentId,
          {
            ...action.automaticPatch,
            createdAt: now,
            updatedAt: now,
            audit: {
              ...(action.automaticPatch.audit || {}),
              createdAt: now,
              createdBy: admin.userData?.email || "admin",
              updatedAt: now,
              updatedBy: admin.userData?.email || "admin",
              history: [{
                action: action.action === "create_missing_requested_due_item" ? "Due item created" : "Booked",
                timestamp: now,
                source: "safe_reconciliation",
              }],
            },
          },
          { mustNotExist: true }
        );
        applied.push(action);
        continue;
      }
      if (action.action === "supersede_untouched_automatic_appointment") {
        const existing = await adminReadDocument(action.collection, action.documentId);
        if (
          !existing ||
          existing.scheduleManuallyAdjusted === true ||
          ["completed", "cancelled", "archived"].includes(text(existing.status).toLowerCase())
        ) {
          skipped.push({
            ...action,
            skipReason: existing ? "record_changed_or_terminal" : "record_missing",
          });
          continue;
        }
        await adminPatchDocument(action.collection, action.documentId, {
          ...action.automaticPatch,
          archivedAtISO: new Date().toISOString().slice(0, 10),
          updatedAt: new Date().toISOString(),
        });
        applied.push(action);
        continue;
      }
      if (action.action === "cancel_invalid_vor_inspection_requirement") {
        const [existing, vehicle] = await Promise.all([
          adminReadDocument(action.collection, action.documentId),
          adminReadDocument("vehicles", action.vehicleId),
        ]);
        if (
          !existing ||
          !vehicle ||
          !isVehicleOutOfUse(vehicle) ||
          !isVorInspectionCancellationCandidate(
            { id: action.documentId, ...existing },
            { vehicle }
          )
        ) {
          skipped.push({
            ...action,
            skipReason: !existing
              ? "record_missing"
              : !vehicle || !isVehicleOutOfUse(vehicle)
                ? "vehicle_no_longer_vor"
                : "record_changed_or_return_inspection",
          });
          continue;
        }
        await adminPatchDocument(action.collection, action.documentId, {
          ...action.automaticPatch,
          updatedAt: new Date().toISOString(),
        });
        applied.push(action);
        continue;
      }
      const existing = await adminReadDocument(action.collection, action.documentId);
      if (!existing || existing.canonicalMaintenanceBookingId) {
        skipped.push({
          ...action,
          skipReason: existing ? "link_already_present" : "legacy_record_missing",
        });
        continue;
      }
      await adminPatchDocument(action.collection, action.documentId, action.automaticPatch);
      applied.push(action);
    }
    return Response.json({ dryRun: false, applied, skipped, report });
  } catch (error) {
    console.error("Maintenance reconciliation apply failed:", error);
    return jsonError("Could not apply the safe maintenance reconciliation.", 500);
  }
}
