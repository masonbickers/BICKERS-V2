import { NextResponse } from "next/server";
import {
  adminCommitDocumentPatches,
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import {
  buildMaintenanceVorAlert,
  buildMaintenanceWarningAlerts,
  normalizeAlertRecipients,
} from "@/app/utils/maintenanceAlerts";
import { sendServerEmail } from "@/app/utils/serverEmailTransport";
import {
  buildHgvComplianceMigrationPatch,
  evaluateHgvCompliance,
  isHgvComplianceVehicle,
  syncCanonicalPmiAliases,
} from "@/app/utils/hgvCompliance";
import {
  isVehicleOutOfUse,
} from "@/app/utils/maintenanceSchema";
import { startVehicleVorPeriod } from "@/app/utils/vorPeriods";
import {
  buildVorInspectionCancellationPatch,
  getVehicleVorStartDate,
  getVorInspectionCancellationCandidates,
} from "@/app/utils/vorBookingPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cronSecret = process.env.CRON_SECRET || "";
const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

const londonDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

const stableValue = (value) => {
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

const isAuthorised = (request) => {
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
};

export async function GET(request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const evaluatedAt = new Date().toISOString();
  const asOfDate = londonDate();
  const documents = await adminListDocuments("vehicles");
  const maintenanceBookingDocuments = await adminListDocuments("maintenanceBookings");
  const maintenanceBookings = maintenanceBookingDocuments.map((document) => ({
    id: document.id,
    ...(document.data || {}),
  }));
  const existingAlertDocuments = await adminListDocuments("maintenanceAlerts").catch(() => []);
  const notificationSettings = await adminReadDocument("settings", "maintenanceNotifications").catch(() => null);
  const envRecipients = String(process.env.MAINTENANCE_ALERT_EMAILS || "").split(",");
  const immediateVorRecipients = normalizeAlertRecipients(
    notificationSettings?.immediateVorRecipients,
    notificationSettings?.urgentRecipients,
    envRecipients
  );
  const alertsEnabled = notificationSettings?.enabled !== false;
  const currentWarningAlertIds = new Set();
  const report = {
    evaluatedAt,
    asOfDate,
    checked: 0,
    updated: 0,
    unchanged: 0,
    newlyVor: [],
    vorInspectionCancellations: [],
    migrationIssues: [],
    failures: [],
    alerts: { opened: 0, resolved: 0, immediateEmailsSent: 0, emailFailures: [] },
  };

  for (const document of documents) {
    const vehicle = { id: document.id, ...(document.data || {}) };
    if (!isHgvComplianceVehicle(vehicle)) continue;
    report.checked += 1;

    try {
      const migration = buildHgvComplianceMigrationPatch(vehicle, { migratedAt: evaluatedAt });
      const candidate = {
        ...vehicle,
        ...migration.patch,
      };
      Object.assign(candidate, syncCanonicalPmiAliases(candidate));
      const compliance = evaluateHgvCompliance(candidate, {
        asOfDate,
        evaluatedAt,
      });
      const aliasPatch = syncCanonicalPmiAliases(candidate);
      const currentCompliance = vehicle.complianceVor || {};
      const comparableCurrentCompliance = { ...currentCompliance, lastEvaluatedAt: "" };
      const comparableNextCompliance = { ...compliance.complianceVor, lastEvaluatedAt: "" };
      const complianceChanged = !sameValue(
        comparableCurrentCompliance,
        comparableNextCompliance
      );
      let patch = {
        ...migration.patch,
        ...aliasPatch,
        ...(complianceChanged ? { complianceVor: compliance.complianceVor } : {}),
      };

      const warningAlerts = buildMaintenanceWarningAlerts(candidate, { asOfDate, evaluatedAt });
      warningAlerts.forEach((alert) => currentWarningAlertIds.add(alert.id));
      if (!dryRun && alertsEnabled) {
        for (const alert of warningAlerts) {
          await adminPatchDocument("maintenanceAlerts", alert.id, alert);
          report.alerts.opened += 1;
        }
      }

      if (
        compliance.shouldStartVor &&
        compliance.complianceVor.state !== "clear" &&
        !isVehicleOutOfUse(candidate)
      ) {
        const started = startVehicleVorPeriod(
          { ...candidate, ...patch },
          {
            offRoadDate: compliance.complianceVor.startedDate || asOfDate,
            odometer: candidate.odometer,
            approvedBy: "HGV compliance system",
            approvedPosition: "Automated compliance control",
            reason: `Automatic compliance VOR: ${compliance.unresolvedTypes
              .map((item) => item.replace("_", " ").toUpperCase())
              .join(", ")}`,
            operatorLicenceNumber: candidate.operatorLicenceNumber || "OF0202656",
          },
          {
            recordId: `compliance-vor-${compliance.complianceVor.startedDate || asOfDate}`,
            startedAt: compliance.complianceVor.triggeredAt || evaluatedAt,
          }
        );
        patch = { ...patch, ...started, complianceVor: compliance.complianceVor };
        report.newlyVor.push({
          id: vehicle.id,
          registration: vehicle.registration || vehicle.reg || "",
          reasons: compliance.unresolvedTypes,
        });

        const vorAlert = buildMaintenanceVorAlert(candidate, compliance.complianceVor, { evaluatedAt });
        if (!dryRun && alertsEnabled && vorAlert) {
          const emailResults = [];
          for (const recipient of immediateVorRecipients) {
            try {
              const delivery = await sendServerEmail({
                to: recipient,
                subject: `URGENT: ${vorAlert.title}`,
                text: `${vorAlert.title}\n${vorAlert.message}\nStarted: ${vorAlert.startedDateISO}`,
                html: `<h2>${escapeHtml(vorAlert.title)}</h2><p>${escapeHtml(vorAlert.message)}</p><p><strong>Started:</strong> ${escapeHtml(vorAlert.startedDateISO)}</p>`,
                idempotencyKey: `${vorAlert.id}-${recipient}`,
              });
              emailResults.push({ recipient, status: "sent", ...delivery });
              report.alerts.immediateEmailsSent += 1;
            } catch (emailError) {
              const message = emailError instanceof Error ? emailError.message : String(emailError);
              emailResults.push({ recipient, status: "failed", error: message });
              report.alerts.emailFailures.push({ alertId: vorAlert.id, recipient, error: message });
            }
          }
          await adminPatchDocument("maintenanceAlerts", vorAlert.id, {
            ...vorAlert,
            immediateEmailAttemptedAt: evaluatedAt,
            immediateEmailResults: emailResults,
          });
          report.alerts.opened += 1;
        }
      }

      if (migration.issues.length) {
        report.migrationIssues.push({
          id: vehicle.id,
          registration: vehicle.registration || vehicle.reg || "",
          issues: migration.issues,
        });
      }

      patch = Object.fromEntries(
        Object.entries(patch).filter(([key, value]) => !sameValue(vehicle[key], value))
      );
      const effectiveVehicle = { ...vehicle, ...patch };
      const vorCancellationWrites = [];
      if (isVehicleOutOfUse(effectiveVehicle)) {
        const offRoadDate = getVehicleVorStartDate(effectiveVehicle);
        const invalidInspectionBookings = getVorInspectionCancellationCandidates(
          maintenanceBookings.filter(
            (booking) => String(booking.vehicleId || "").trim() === vehicle.id
          ),
          { vehicle: effectiveVehicle, offRoadDate }
        );
        for (const booking of invalidInspectionBookings) {
          const cancellationPatch = buildVorInspectionCancellationPatch(booking, {
            cancelledAt: evaluatedAt,
            cancelledBy: "HGV compliance system",
            cancellationSource: "automatic_compliance_vor",
            sourceRecordId: effectiveVehicle.activeVorRecordId || "",
          });
          report.vorInspectionCancellations.push({
            vehicleId: vehicle.id,
            bookingId: booking.id,
            registration: vehicle.registration || vehicle.reg || "",
          });
          vorCancellationWrites.push({
            collection: "maintenanceBookings",
            documentId: booking.id,
            patch: cancellationPatch,
          });
        }
      }
      const changed = Object.keys(patch).length > 0;
      if (!changed && !vorCancellationWrites.length) {
        report.unchanged += 1;
        continue;
      }
      if (!dryRun) {
        await adminCommitDocumentPatches([
          ...(changed
            ? [{ collection: "vehicles", documentId: vehicle.id, patch }]
            : []),
          ...vorCancellationWrites,
        ]);
      }
      if (changed) report.updated += 1;
      else report.unchanged += 1;
    } catch (error) {
      report.failures.push({
        id: vehicle.id,
        registration: vehicle.registration || vehicle.reg || "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!dryRun && alertsEnabled) {
    for (const document of existingAlertDocuments) {
      const alert = document.data || {};
      if (
        alert.alertType === "due_warning" &&
        alert.state === "open" &&
        !currentWarningAlertIds.has(document.id)
      ) {
        await adminPatchDocument("maintenanceAlerts", document.id, {
          state: "resolved",
          resolvedAt: evaluatedAt,
          resolutionReason: "The due date moved, the work was completed, or the warning window ended.",
        });
        report.alerts.resolved += 1;
      }
    }
  }

  return NextResponse.json({ ...report, dryRun });
}
